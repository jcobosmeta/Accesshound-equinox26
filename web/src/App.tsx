import {
  Box,
  ButtonSecondary,
  Grid,
  GridItem,
  Inline,
  MainNavigationBar,
  NavigationBarAction,
  NavigationBarActionGroup,
  ResponsiveLayout,
  Stack,
  Text2,
  Text3,
  skinVars,
  useDialog,
  useScreenSize,
  useSnackbar,
} from "@telefonica/mistica";
import IconRefreshRegular from "@telefonica/mistica-icons/icon-refresh-regular";
import IconShieldLockRegular from "@telefonica/mistica-icons/icon-shield-lock-regular";
import * as React from "react";
import { api, investigate, type AgentEvent, type AuditEntry, type Finding, type OrgGraph, type Summary } from "./api";
import { AuditTrail } from "./components/AuditTrail";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FindingDetail } from "./components/FindingDetail";
import { FindingsList } from "./components/FindingsList";
import { OrgRiskGraph } from "./components/OrgRiskGraph";
import { PrincipalInspector } from "./components/PrincipalInspector";
import { SummaryBand } from "./components/SummaryBand";
import { ModeTag } from "./present";
import { forgetRevocations } from "./usePrincipal";

/** Investigations that stream at once; the rest wait in a queue. */
const MAX_PARALLEL = 4;
const QUEUED = "Queued: starts when another investigation finishes.";

const Brand = () => (
  <Inline space={8} alignItems="center">
    <IconShieldLockRegular size={28} color={skinVars.colors.brand} />
    <Text3 medium truncate>
      AccessHound
    </Text3>
  </Inline>
);

export function App() {
  // 0 = Organization Risk Graph (main screen), 1 = Findings queue, 2 = Audit trail
  const [view, setView] = React.useState<0 | 1 | 2>(0);
  const [summary, setSummary] = React.useState<Summary>();
  const [graph, setGraph] = React.useState<OrgGraph>();
  const [findings, setFindings] = React.useState<Finding[]>();
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  /** Principal selected in the main Organization Risk Graph. */
  const [selectedPrincipalId, setSelectedPrincipalId] = React.useState<string>();
  /** Finding selected in the secondary Findings list view. */
  const [selectedFindingId, setSelectedFindingId] = React.useState<string>();
  /** Agent steps per finding, kept for the session so switching users/findings doesn't lose them. */
  const [traces, setTraces] = React.useState<Record<string, AgentEvent[]>>({});
  /** Bumped whenever access may have changed, so the access map & risk graph refetch. */
  const [dataVersion, setDataVersion] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string>();
  const { openSnackbar } = useSnackbar();
  const { confirm } = useDialog();
  const { isTabletOrSmaller } = useScreenSize();

  const graphSectionRef = React.useRef<HTMLDivElement>(null);
  const inspectorRef = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async () => {
    try {
      const [g, f, a] = await Promise.all([api.graph(), api.findings(), api.audit()]);
      setGraph(g);
      setFindings(f);
      setAudit(a);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  React.useEffect(() => {
    api.summary().then(setSummary, () => {});
    refresh();
  }, [refresh]);

  // Keep a valid finding selection for the Findings tab.
  React.useEffect(() => {
    if (findings?.length && !findings.some((f) => f.id === selectedFindingId)) setSelectedFindingId(findings[0]!.id);
  }, [findings, selectedFindingId]);

  const handleSelectPrincipal = React.useCallback((principalId: string | undefined) => {
    setSelectedPrincipalId(principalId);
    if (principalId && inspectorRef.current) {
      inspectorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  React.useEffect(() => {
    if (!selectedPrincipalId) return;
    const timer = window.setTimeout(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [selectedPrincipalId]);

  const scrollToGraph = React.useCallback(() => {
    graphSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Investigations go through a queue. Each one holds an open connection while the agent works, and
  // browsers allow about six per server, so more than MAX_PARALLEL at once would stall the app's own requests.
  const queue = React.useRef<string[]>([]);
  const active = React.useRef(0);
  const [queued, setQueued] = React.useState<ReadonlySet<string>>(new Set());
  const startQueued = React.useRef(() => {});
  startQueued.current = () => {
    while (active.current < MAX_PARALLEL && queue.current.length) {
      const findingId = queue.current.shift()!;
      active.current++;
      setQueued((q) => new Set([...q].filter((id) => id !== findingId)));
      setTraces((t) => ({ ...t, [findingId]: [] }));
      investigate(findingId, undefined, (event) => {
        setTraces((t) => ({ ...t, [findingId]: [...(t[findingId] ?? []), event] }));
        if (event.type === "status" || event.type === "proposal" || event.type === "done") refresh();
        if (event.type === "done") {
          active.current--;
          startQueued.current();
        }
      });
    }
  };

  const runAgent = React.useCallback((findingIds: string[]) => {
    const fresh = findingIds.filter((id) => !queue.current.includes(id));
    queue.current.push(...fresh);
    setQueued((q) => new Set([...q, ...fresh]));
    setTraces((t) => ({
      ...t,
      ...Object.fromEntries(fresh.map((id) => [id, [{ type: "status", message: QUEUED } as AgentEvent]])),
    }));
    startQueued.current();
  }, []);

  const isRunning = (id: string) => !!traces[id] && !traces[id].some((e) => e.type === "done");
  const notStarted = findings?.filter((f) => f.status === "open" && !isRunning(f.id)) ?? [];
  const investigateAll = () => {
    runAgent(notStarted.map((f) => f.id));
    openSnackbar({
      message: `Investigating ${notStarted.length} findings, up to ${MAX_PARALLEL} at a time.`,
      type: "INFORMATIVE",
    });
  };

  const decide = React.useCallback(
    async (findingId: string, decision: "approved" | "rejected", reviewer: string, note?: string) => {
      try {
        const entry = await api.decide(findingId, decision, reviewer, note);
        const changes = entry.applied.length;
        openSnackbar({
          message:
            decision === "approved"
              ? `Approved. ${changes ? `${changes} change${changes > 1 ? "s" : ""} applied.` : "No access changed."} Logged as ${
                  entry.id
                }.`
              : `Rejected. Nothing changed. Logged as ${entry.id}.`,
          type: "INFORMATIVE",
        });
        setDataVersion((v) => v + 1);
        await refresh();
      } catch (err) {
        openSnackbar({ message: err instanceof Error ? err.message : String(err), type: "CRITICAL" });
      }
    },
    [openSnackbar, refresh]
  );

  const reset = () =>
    confirm({
      title: "Reset the demo?",
      message: "This restores the original access data and clears every proposal and the audit trail.",
      acceptText: "Reset",
      cancelText: "Cancel",
      destructive: true,
      onAccept: async () => {
        await api.reset();
        forgetRevocations();
        queue.current = [];
        setQueued(new Set());
        setTraces({});
        setDataVersion((v) => v + 1);
        await refresh();
        openSnackbar({ message: "Demo data restored.", type: "INFORMATIVE" });
      },
    });

  const selectedFinding = findings?.find((f) => f.id === selectedFindingId);
  const auditForSelected = selectedFinding ? audit.filter((e) => e.findingId === selectedFinding.id).at(-1) : undefined;
  const openFindingsCount = findings?.filter((f) => f.status !== "approved" && f.status !== "resolved").length ?? 0;

  const list = (
    <FindingsList
      findings={findings}
      selectedId={selectedFindingId}
      onSelect={setSelectedFindingId}
      queued={queued}
      notStartedCount={notStarted.length}
      onInvestigateAll={investigateAll}
      error={loadError}
      onRetry={refresh}
    />
  );

  const detail = selectedFinding && (
    <ErrorBoundary key={selectedFinding.id} title={`Couldn't show the finding for ${selectedFinding.principalName}`}>
      <FindingDetail
        finding={selectedFinding}
        trace={traces[selectedFinding.id]}
        auditEntry={auditForSelected}
        dataVersion={dataVersion}
        onInvestigate={() => runAgent([selectedFinding.id])}
        onDecide={(decision, reviewer, note) => decide(selectedFinding.id, decision, reviewer, note)}
      />
    </ErrorBoundary>
  );

  return (
    <>
      <MainNavigationBar
        logo={<Brand />}
        selectedIndex={view}
        sections={[
          { title: "Risk graph", onPress: () => setView(0) },
          { title: `Findings${openFindingsCount ? ` (${openFindingsCount})` : ""}`, onPress: () => setView(1) },
          { title: `Audit trail${audit.length ? ` (${audit.length})` : ""}`, onPress: () => setView(2) },
        ]}
        right={
          isTabletOrSmaller ? (
            <NavigationBarActionGroup>
              <NavigationBarAction aria-label="Reset demo" onPress={reset}>
                <IconRefreshRegular color="currentColor" />
              </NavigationBarAction>
            </NavigationBarActionGroup>
          ) : (
            <Inline space={16} alignItems="center">
              {summary && <ModeTag mode={summary.agentMode} />}
              <ButtonSecondary small StartIcon={IconRefreshRegular} onPress={reset}>
                Reset demo
              </ButtonSecondary>
            </Inline>
          )
        }
      />
      {view !== 0 && <SummaryBand summary={summary} findings={findings} graph={graph} />}

      {view === 0 ? (
        <div style={{ maxWidth: 1520, margin: "0 auto", padding: isTabletOrSmaller ? "12px 12px 40px" : "16px 24px 48px" }}>
          <Stack space={32}>
            <div ref={graphSectionRef}>
              <ErrorBoundary title="Couldn't draw the organization risk map">
                <OrgRiskGraph
                  graph={graph}
                  summary={summary}
                  findings={findings}
                  selectedPrincipalId={selectedPrincipalId}
                  onSelectPrincipal={handleSelectPrincipal}
                  error={loadError}
                  onRetry={refresh}
                />
              </ErrorBoundary>
            </div>

            {selectedPrincipalId && (
              <div ref={inspectorRef} style={{ scrollMarginTop: 16 }}>
                <ErrorBoundary key={selectedPrincipalId} title="Couldn't load the selected user's details">
                  <PrincipalInspector
                    principalId={selectedPrincipalId}
                    findings={findings ?? []}
                    traces={traces}
                    audit={audit}
                    dataVersion={dataVersion}
                    onSelectPrincipal={handleSelectPrincipal}
                    onClose={() => setSelectedPrincipalId(undefined)}
                    onBackToGraph={scrollToGraph}
                    onInvestigate={(findingId) => runAgent([findingId])}
                    onDecide={decide}
                  />
                </ErrorBoundary>
              </div>
            )}
          </Stack>
        </div>
      ) : (
        <ResponsiveLayout>
          <Box paddingY={24}>
            {view === 2 ? (
              <AuditTrail entries={audit} />
            ) : isTabletOrSmaller ? (
              <Stack space={32}>
                {list}
                {detail}
              </Stack>
            ) : (
              <Grid columns={12} gap={32}>
                <GridItem columnSpan={4}>{list}</GridItem>
                <GridItem columnSpan={8}>{detail ?? <Text2 regular>Select a finding.</Text2>}</GridItem>
              </Grid>
            )}
          </Box>
        </ResponsiveLayout>
      )}
    </>
  );
}
