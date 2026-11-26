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
import { api, investigate, type AgentEvent, type AuditEntry, type Finding, type Summary } from "./api";
import { AuditTrail } from "./components/AuditTrail";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FindingDetail, forgetRevocations } from "./components/FindingDetail";
import { FindingsList } from "./components/FindingsList";
import { SummaryBand } from "./components/SummaryBand";
import { ModeTag } from "./present";

const Brand = () => (
  <Inline space={8} alignItems="center">
    <IconShieldLockRegular size={28} color={skinVars.colors.brand} />
    <Text3 medium truncate>
      AccessHound
    </Text3>
  </Inline>
);

export function App() {
  const [view, setView] = React.useState<0 | 1>(0);
  const [summary, setSummary] = React.useState<Summary>();
  const [findings, setFindings] = React.useState<Finding[]>();
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>();
  /** Agent steps per finding, kept for the session so switching findings doesn't lose them. */
  const [traces, setTraces] = React.useState<Record<string, AgentEvent[]>>({});
  /** Bumped whenever access may have changed, so the access map refetches. */
  const [dataVersion, setDataVersion] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string>();
  const { openSnackbar } = useSnackbar();
  const { confirm } = useDialog();
  const { isTabletOrSmaller } = useScreenSize();

  const refresh = React.useCallback(async () => {
    try {
      const [f, a] = await Promise.all([api.findings(), api.audit()]);
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

  // Keep a valid selection: default to the first finding.
  React.useEffect(() => {
    if (findings?.length && !findings.some((f) => f.id === selectedId)) setSelectedId(findings[0]!.id);
  }, [findings, selectedId]);

  const runAgent = React.useCallback(
    (findingId: string) => {
      setTraces((t) => ({ ...t, [findingId]: [] }));
      investigate(findingId, undefined, (event) => {
        setTraces((t) => ({ ...t, [findingId]: [...(t[findingId] ?? []), event] }));
        // The first event means the server has marked it as investigating.
        if (event.type === "status" || event.type === "proposal" || event.type === "done") refresh();
      });
    },
    [refresh]
  );

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
        setTraces({});
        setDataVersion((v) => v + 1);
        await refresh();
        openSnackbar({ message: "Demo data restored.", type: "INFORMATIVE" });
      },
    });

  const selected = findings?.find((f) => f.id === selectedId);
  const auditFor = selected ? audit.filter((e) => e.findingId === selected.id).at(-1) : undefined;

  const list = (
    <FindingsList findings={findings} selectedId={selectedId} onSelect={setSelectedId} error={loadError} onRetry={refresh} />
  );
  // Keyed by finding, so picking another finding also clears an error from the previous one.
  const detail = selected && (
    <ErrorBoundary key={selected.id} title={`Couldn't show the finding for ${selected.principalName}`}>
      <FindingDetail
        finding={selected}
        trace={traces[selected.id]}
        auditEntry={auditFor}
        dataVersion={dataVersion}
        onInvestigate={() => runAgent(selected.id)}
        onDecide={(decision, reviewer, note) => decide(selected.id, decision, reviewer, note)}
      />
    </ErrorBoundary>
  );

  return (
    <>
      <MainNavigationBar
        logo={<Brand />}
        selectedIndex={view}
        sections={[
          { title: "Findings", onPress: () => setView(0) },
          { title: `Audit trail${audit.length ? ` (${audit.length})` : ""}`, onPress: () => setView(1) },
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
      <SummaryBand summary={summary} findings={findings} />
      <ResponsiveLayout>
        <Box paddingY={24}>
          {view === 1 ? (
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
    </>
  );
}
