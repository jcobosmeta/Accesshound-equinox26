import {
  Box,
  ButtonSecondary,
  Inline,
  MainNavigationBar,
  NavigationBarAction,
  NavigationBarActionGroup,
  ResponsiveLayout,
  Stack,
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
import { AnalysesView, type Analysis } from "./components/AnalysesView";
import { AuditTrail } from "./components/AuditTrail";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FindingDetail } from "./components/FindingDetail";
import { OrgRiskGraph } from "./components/OrgRiskGraph";
import { PrincipalInspector } from "./components/PrincipalInspector";
import { SummaryBand } from "./components/SummaryBand";
import { ModeTag } from "./present";
import { forgetRevocations } from "./usePrincipal";

/** Investigations that stream at once; the rest wait in a queue. */
const MAX_PARALLEL = 4;
const QUEUED = "En cola: empezará cuando termine otra investigación.";

const ANALYSES_KEY = "accesshound.analyses";
const loadAnalyses = (): Analysis[] => {
  try {
    return JSON.parse(localStorage.getItem(ANALYSES_KEY) ?? "[]") as Analysis[];
  } catch {
    return [];
  }
};
const saveAnalyses = (analyses: Analysis[]) => {
  try {
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(analyses));
  } catch {
    // Storage unavailable (private window): analyses just last for this page load.
  }
};

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
  /** Analyses started from the Findings tab; nothing shows there until the first one. */
  const [analyses, setAnalyses] = React.useState<Analysis[]>(loadAnalyses);
  const [openAnalysisId, setOpenAnalysisId] = React.useState<string | undefined>(() => loadAnalyses().at(-1)?.id);
  React.useEffect(() => saveAnalyses(analyses), [analyses]);
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

  const openAnalysis = analyses.find((a) => a.id === openAnalysisId);
  const analysisFindings = React.useMemo(() => {
    if (!openAnalysis) return [];
    const ids = new Set(openAnalysis.findingIds);
    return findings?.filter((f) => ids.has(f.id)) ?? [];
  }, [findings, openAnalysis]);

  // Close the open finding when it isn't part of the expanded analysis.
  React.useEffect(() => {
    if (selectedFindingId && !analysisFindings.some((f) => f.id === selectedFindingId)) setSelectedFindingId(undefined);
  }, [analysisFindings, selectedFindingId]);

  const startAnalysis = () => {
    if (!findings) return;
    const analysis: Analysis = {
      id: `AN-${Date.now()}`,
      number: (analyses.at(-1)?.number ?? 0) + 1,
      startedAt: new Date().toISOString(),
      findingIds: findings.map((f) => f.id),
    };
    setAnalyses((list) => [...list, analysis]);
    setOpenAnalysisId(analysis.id);
    setSelectedFindingId(undefined);
  };

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

  const investigateAll = (findingIds: string[]) => {
    runAgent(findingIds);
    openSnackbar({
      message: `Investigando ${findingIds.length} hallazgos, hasta ${MAX_PARALLEL} a la vez.`,
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
              ? `Aprobado. ${
                  changes
                    ? `${changes} ${changes > 1 ? "cambios aplicados" : "cambio aplicado"}.`
                    : "No ha cambiado ningún acceso."
                } Registrado como ${entry.id}.`
              : `Rechazado. No ha cambiado nada. Registrado como ${entry.id}.`,
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
      title: "¿Restablecer la demo?",
      message:
        "Se restauran los datos de acceso originales y se borran todas las propuestas, los análisis y el registro de auditoría.",
      acceptText: "Restablecer",
      cancelText: "Cancelar",
      destructive: true,
      onAccept: async () => {
        await api.reset();
        forgetRevocations();
        queue.current = [];
        setQueued(new Set());
        setTraces({});
        setAnalyses([]);
        setOpenAnalysisId(undefined);
        setDataVersion((v) => v + 1);
        await refresh();
        openSnackbar({ message: "Datos de la demo restaurados.", type: "INFORMATIVE" });
      },
    });

  const openFindingsCount = findings?.filter((f) => f.status !== "approved" && f.status !== "resolved").length ?? 0;

  const renderDetail = (finding: Finding) => (
    <ErrorBoundary key={finding.id} title={`No se puede mostrar el hallazgo de ${finding.principalName}`}>
      <FindingDetail
        compact
        finding={finding}
        trace={traces[finding.id]}
        auditEntry={audit.filter((e) => e.findingId === finding.id).at(-1)}
        dataVersion={dataVersion}
        onInvestigate={() => runAgent([finding.id])}
        onDecide={(decision, reviewer, note) => decide(finding.id, decision, reviewer, note)}
      />
    </ErrorBoundary>
  );

  return (
    <>
      <MainNavigationBar
        logo={<Brand />}
        selectedIndex={view}
        sections={[
          { title: "Mapa de riesgo", onPress: () => setView(0) },
          {
            title: `Hallazgos${analyses.length && openFindingsCount ? ` (${openFindingsCount})` : ""}`,
            onPress: () => setView(1),
          },
          { title: `Auditoría${audit.length ? ` (${audit.length})` : ""}`, onPress: () => setView(2) },
        ]}
        right={
          isTabletOrSmaller ? (
            <NavigationBarActionGroup>
              <NavigationBarAction aria-label="Restablecer la demo" onPress={reset}>
                <IconRefreshRegular color="currentColor" />
              </NavigationBarAction>
            </NavigationBarActionGroup>
          ) : (
            <Inline space={16} alignItems="center">
              {summary && <ModeTag mode={summary.agentMode} />}
              <ButtonSecondary small StartIcon={IconRefreshRegular} onPress={reset}>
                Restablecer
              </ButtonSecondary>
            </Inline>
          )
        }
      />
      {(view === 2 || (view === 1 && analyses.length > 0)) && <SummaryBand summary={summary} findings={findings} graph={graph} />}

      {view === 0 ? (
        <div style={{ maxWidth: 1520, margin: "0 auto", padding: isTabletOrSmaller ? "12px 12px 40px" : "16px 24px 48px" }}>
          <Stack space={32}>
            <div ref={graphSectionRef}>
              <ErrorBoundary title="No se puede dibujar el mapa de riesgo de la organización">
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
                <ErrorBoundary key={selectedPrincipalId} title="No se pueden cargar los datos del usuario seleccionado">
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
            ) : (
              <AnalysesView
                analyses={analyses}
                findings={findings}
                audit={audit}
                onStart={startAnalysis}
                error={loadError}
                onRetry={refresh}
                openId={openAnalysisId}
                onOpen={setOpenAnalysisId}
                selectedFindingId={selectedFindingId}
                onSelectFinding={setSelectedFindingId}
                queued={queued}
                traces={traces}
                onInvestigateAll={investigateAll}
                renderDetail={renderDetail}
              />
            )}
          </Box>
        </ResponsiveLayout>
      )}
    </>
  );
}
