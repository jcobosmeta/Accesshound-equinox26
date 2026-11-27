import {
  Box,
  Boxed,
  ButtonLink,
  ButtonPrimary,
  EmptyStateCard,
  Inline,
  Stack,
  Tag,
  Text1,
  Text2,
  Text3,
  Title2,
  skinVars,
  useScreenSize,
} from "@telefonica/mistica";
import IconChevronDownRegular from "@telefonica/mistica-icons/icon-chevron-down-regular";
import IconChevronRightRegular from "@telefonica/mistica-icons/icon-chevron-right-regular";
import IconErrorRegular from "@telefonica/mistica-icons/icon-error-regular";
import IconPlayRegular from "@telefonica/mistica-icons/icon-play-regular";
import IconSearchRegular from "@telefonica/mistica-icons/icon-search-regular";
import * as React from "react";
import type { AgentEvent, AuditEntry, Finding, FindingStatus, Risk } from "../api";
import { DecisionTag, SeverityTag, StatusTag, findingTypes, formatTime } from "../present";

export interface Analysis {
  id: string;
  /** Sequential number shown to people: "Analysis #3". */
  number: number;
  startedAt: string;
  /** Findings that existed when the analysis started. */
  findingIds: string[];
}

/** Decisions logged while this analysis was the latest one, on its own findings. */
export const auditForAnalysis = (analysis: Analysis, next: Analysis | undefined, audit: AuditEntry[]) => {
  const ids = new Set(analysis.findingIds);
  return audit.filter((e) => ids.has(e.findingId) && e.time >= analysis.startedAt && (!next || e.time < next.startedAt));
};

const isDecided = (s: FindingStatus) => s === "approved" || s === "rejected" || s === "resolved";

const statusOrder: Record<FindingStatus, number> = {
  proposed: 0,
  investigating: 1,
  open: 2,
  approved: 3,
  rejected: 3,
  resolved: 3,
};
const severityOrder: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
/** Work still to do first, highest severity first; decided ones sink to the bottom. */
const byPriority = (a: Finding, b: Finding) =>
  statusOrder[a.status] - statusOrder[b.status] || severityOrder[a.severity] - severityOrder[b.severity];

const ANALYSIS_COLUMNS = "40px 200px minmax(0, 1fr) 110px 110px 130px";
const FINDING_COLUMNS = "minmax(0, 1fr) 110px 130px 240px 24px";

const HeaderCell = ({ children, end }: { children?: string; end?: boolean }) => (
  <span style={{ justifySelf: end ? "end" : undefined }}>
    <Text1 medium color={skinVars.colors.textSecondary} transform="uppercase">
      {children ?? ""}
    </Text1>
  </span>
);

/** Row-wide button: resets native button styling so the grid inside lays out like a table row. */
const rowButton: React.CSSProperties = {
  all: "unset",
  boxSizing: "border-box",
  width: "100%",
  cursor: "pointer",
  display: "grid",
  alignItems: "center",
  gap: 20,
};

function ProgressBar({ decided, total }: { decided: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={decided}
        aria-label={`${decided} de ${total} hallazgos decididos`}
        style={{
          flex: 1,
          display: "flex",
          gap: 2,
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          background: skinVars.colors.neutralLow,
        }}
      >
        {decided > 0 && <div style={{ flex: decided, background: skinVars.colors.success }} />}
        {total - decided > 0 && <div style={{ flex: total - decided, background: skinVars.colors.warning }} />}
      </div>
      <Text1 regular color={skinVars.colors.textSecondary}>{`${decided}/${total}`}</Text1>
    </div>
  );
}

/** "Your decision" column: the audit entry when there is one, otherwise where the finding stands. */
function DecisionCell({
  finding,
  entry,
  queued,
  running,
}: {
  finding: Finding;
  entry?: AuditEntry;
  queued: boolean;
  running: boolean;
}) {
  if (entry) {
    const changes = entry.applied.length;
    return (
      <Stack space={4}>
        <Inline space={8}>
          <Tag type={entry.humanDecision === "approved" ? "success" : "info"} small>
            {`${entry.humanDecision === "approved" ? "Aprobado" : "Rechazado"} · ${entry.id}`}
          </Tag>
        </Inline>
        <Text1 regular color={skinVars.colors.textSecondary}>
          {`por ${entry.reviewer} · ${
            changes ? `${changes} ${changes > 1 ? "cambios aplicados" : "cambio aplicado"}` : "sin cambios de acceso"
          }`}
        </Text1>
      </Stack>
    );
  }
  if (finding.status === "open" && queued)
    return (
      <Tag type="inactive" small>
        En cola
      </Tag>
    );
  if (finding.status === "open" && !running)
    return (
      <Text2 regular color={skinVars.colors.textSecondary}>
        Sin investigar
      </Text2>
    );
  return <StatusTag status={running && finding.status === "open" ? "investigating" : finding.status} small />;
}

interface Props {
  analyses: Analysis[];
  findings?: Finding[];
  audit: AuditEntry[];
  error?: string;
  onRetry: () => void;
  onStart: () => void;
  /** Which analysis is expanded (only one at a time). */
  openId?: string;
  onOpen: (id: string | undefined) => void;
  /** Which finding's detail is open inside the expanded analysis. */
  selectedFindingId?: string;
  onSelectFinding: (id: string | undefined) => void;
  queued: ReadonlySet<string>;
  traces: Record<string, AgentEvent[]>;
  onInvestigateAll: (findingIds: string[]) => void;
  /** Access map, agent investigation and decision for one finding. */
  renderDetail: (finding: Finding) => React.ReactNode;
}

export function AnalysesView({
  analyses,
  findings,
  audit,
  error,
  onRetry,
  onStart,
  openId,
  onOpen,
  selectedFindingId,
  onSelectFinding,
  queued,
  traces,
  onInvestigateAll,
  renderDetail,
}: Props) {
  const { isTabletOrSmaller } = useScreenSize();
  const startButton = (
    <ButtonPrimary small StartIcon={IconPlayRegular} onPress={onStart} disabled={!findings}>
      Empezar análisis
    </ButtonPrimary>
  );

  if (error && !findings) {
    return (
      <EmptyStateCard
        asset={<IconErrorRegular size="100%" color={skinVars.colors.error} />}
        title="No se puede conectar con la API de Mi Portero"
        description={`${error}. ¿Está el servidor en marcha en el puerto 8787?`}
        button={
          <ButtonPrimary small onPress={onRetry}>
            Reintentar
          </ButtonPrimary>
        }
      />
    );
  }

  if (analyses.length === 0) {
    return (
      <EmptyStateCard
        asset={<IconSearchRegular size="100%" color={skinVars.colors.brand} />}
        title="Todavía no hay análisis"
        description="Empieza un análisis para revisar los hallazgos actuales, investigarlos con el agente y registrar cada decisión."
        button={startButton}
      />
    );
  }

  const isRunning = (id: string) => !!traces[id] && !traces[id].some((e) => e.type === "done");
  // Newest first.
  const ordered = [...analyses].sort((a, b) => b.number - a.number);
  const border = `1px solid ${skinVars.colors.border}`;

  return (
    <Stack space={16}>
      <Inline space="between" alignItems="center" wrap verticalSpace={16}>
        <Title2 as="h2">Análisis</Title2>
        {startButton}
      </Inline>

      <Boxed>
        {!isTabletOrSmaller && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: ANALYSIS_COLUMNS,
              gap: 20,
              padding: "14px 24px",
              borderBottom: border,
            }}
          >
            <HeaderCell />
            <HeaderCell>Análisis</HeaderCell>
            <HeaderCell>Progreso</HeaderCell>
            <HeaderCell>Pendientes</HeaderCell>
            <HeaderCell>Decisiones</HeaderCell>
            <HeaderCell end>Estado</HeaderCell>
          </div>
        )}

        {ordered.map((a, index) => {
          const next = analyses.find((n) => n.number === a.number + 1);
          const entries = auditForAnalysis(a, next, audit);
          const entryFor = (findingId: string) => entries.filter((e) => e.findingId === findingId).at(-1);
          const ids = new Set(a.findingIds);
          const own = (findings?.filter((f) => ids.has(f.id)) ?? []).sort(byPriority);
          const decided = own.filter((f) => isDecided(f.status)).length;
          const pending = own.length - decided;
          const notStarted = own.filter((f) => f.status === "open" && !isRunning(f.id) && !queued.has(f.id));
          const isOpen = a.id === openId;
          const Chevron = isOpen ? IconChevronDownRegular : IconChevronRightRegular;
          const statusTag = pending ? (
            <Tag type="warning" small>
              En curso
            </Tag>
          ) : (
            <Tag type="success" small>
              Completado
            </Tag>
          );

          return (
            <div key={a.id} style={{ borderTop: index ? border : undefined }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => onOpen(isOpen ? undefined : a.id)}
                style={{
                  ...rowButton,
                  gridTemplateColumns: isTabletOrSmaller ? "24px minmax(0, 1fr) auto" : ANALYSIS_COLUMNS,
                  padding: isTabletOrSmaller ? "16px" : "18px 24px",
                  background: isOpen ? skinVars.colors.backgroundContainerHover : undefined,
                }}
              >
                <Chevron size={20} color={skinVars.colors.textLink} />
                <Stack space={2}>
                  <Text3 medium>{`Análisis n.º ${a.number}`}</Text3>
                  <Text1 regular color={skinVars.colors.textSecondary}>
                    {isTabletOrSmaller
                      ? `${formatTime(a.startedAt)} · ${decided}/${own.length} decididos · ${pending} pendientes`
                      : formatTime(a.startedAt)}
                  </Text1>
                </Stack>
                {isTabletOrSmaller ? (
                  statusTag
                ) : (
                  <>
                    <ProgressBar decided={decided} total={own.length} />
                    <Text3 medium color={pending ? skinVars.colors.warning : skinVars.colors.textSecondary}>
                      {String(pending)}
                    </Text3>
                    <Text3 medium>{String(entries.length)}</Text3>
                    <span style={{ justifySelf: "end" }}>{statusTag}</span>
                  </>
                )}
              </button>

              {isOpen && (
                <div
                  style={{
                    background: skinVars.colors.backgroundContainerHover,
                    padding: isTabletOrSmaller ? "0 16px 16px" : "0 24px 24px 84px",
                  }}
                >
                  <Stack space={8}>
                    <Inline space="between" alignItems="center">
                      <Text1 regular color={skinVars.colors.textSecondary}>
                        Haz clic en un hallazgo para ver su mapa de accesos, la investigación del agente y tu decisión.
                      </Text1>
                      {notStarted.length > 0 && (
                        <ButtonLink small onPress={() => onInvestigateAll(notStarted.map((f) => f.id))}>
                          {`Investigar todos (${notStarted.length})`}
                        </ButtonLink>
                      )}
                    </Inline>

                    {!isTabletOrSmaller && (
                      <div style={{ display: "grid", gridTemplateColumns: FINDING_COLUMNS, gap: 16, padding: "8px 16px" }}>
                        <HeaderCell>Hallazgo</HeaderCell>
                        <HeaderCell>Gravedad</HeaderCell>
                        <HeaderCell>Propuesta del agente</HeaderCell>
                        <HeaderCell>Tu decisión</HeaderCell>
                        <HeaderCell />
                      </div>
                    )}

                    {own.map((f) => {
                      const selected = f.id === selectedFindingId;
                      const { label } = findingTypes[f.type];
                      const FindingChevron = selected ? IconChevronDownRegular : IconChevronRightRegular;
                      const decision = (
                        <DecisionCell finding={f} entry={entryFor(f.id)} queued={queued.has(f.id)} running={isRunning(f.id)} />
                      );
                      const proposed = f.proposal ? (
                        <DecisionTag decision={f.proposal.decision} />
                      ) : (
                        <Text2 regular color={skinVars.colors.textSecondary}>
                          –
                        </Text2>
                      );
                      return (
                        <div
                          key={f.id}
                          style={{
                            background: skinVars.colors.backgroundContainer,
                            border: `1px solid ${selected ? skinVars.colors.controlActivated : skinVars.colors.border}`,
                            borderRadius: 12,
                          }}
                        >
                          <button
                            type="button"
                            aria-expanded={selected}
                            onClick={() => onSelectFinding(selected ? undefined : f.id)}
                            style={{
                              ...rowButton,
                              gap: 16,
                              gridTemplateColumns: isTabletOrSmaller ? "minmax(0, 1fr) 24px" : FINDING_COLUMNS,
                              padding: "12px 16px",
                            }}
                          >
                            <Stack space={2}>
                              <Text2 medium truncate>
                                {f.principalName}
                              </Text2>
                              <Text1 regular color={skinVars.colors.textSecondary} truncate>
                                {`${label} · ${f.title}`}
                              </Text1>
                              {isTabletOrSmaller && (
                                <Box paddingTop={8}>
                                  <Inline space={8} alignItems="center" wrap verticalSpace={8}>
                                    <SeverityTag severity={f.severity} />
                                    {f.proposal && <DecisionTag decision={f.proposal.decision} />}
                                    {decision}
                                  </Inline>
                                </Box>
                              )}
                            </Stack>
                            {!isTabletOrSmaller && (
                              <>
                                <span>
                                  <SeverityTag severity={f.severity} />
                                </span>
                                <span>{proposed}</span>
                                <div style={{ justifySelf: "start" }}>{decision}</div>
                              </>
                            )}
                            <FindingChevron size={20} color={skinVars.colors.textLink} />
                          </button>
                          {selected && (
                            <div
                              style={{ borderTop: `1px solid ${skinVars.colors.border}`, padding: isTabletOrSmaller ? 16 : 24 }}
                            >
                              {renderDetail(f)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Stack>
                </div>
              )}
            </div>
          );
        })}
      </Boxed>
    </Stack>
  );
}
