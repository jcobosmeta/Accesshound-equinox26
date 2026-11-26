// Principal Inspector: opened when clicking any user or service account in the
// Organization Risk Graph. Shows their profile & risk breakdown, then their
// Access Map, and directly underneath it the Investigation (finding facts,
// live AI agent trace & human decision — or clean security check + activity).

import {
  Avatar,
  Box,
  Boxed,
  ButtonLink,
  ButtonPrimary,
  Divider,
  Inline,
  ListItem,
  SkeletonRectangle,
  Spinner,
  Stack,
  Tag,
  Text1,
  Text2,
  Title2,
  Title3,
  UnorderedList,
  skinVars,
  useScreenSize,
} from "@telefonica/mistica";
import IconAiRegular from "@telefonica/mistica-icons/icon-ai-regular";
import IconCheckRegular from "@telefonica/mistica-icons/icon-check-regular";
import IconRobotRegular from "@telefonica/mistica-icons/icon-robot-regular";
import * as React from "react";
import type { AgentEvent, AuditEntry, Finding, PrincipalDetail, RiskLevel } from "../api";
import { findingTypes, formatDate, formatTime, initials, scorePalette, SeverityTag, StatusTag } from "../present";
import { usePrincipal } from "../usePrincipal";
import { AccessGraph } from "./AccessGraph";
import { AgentTrace } from "./AgentTrace";
import { ErrorBoundary } from "./ErrorBoundary";
import { ProposalCard } from "./ProposalCard";

function LargeRiskRing({ score, level }: { score: number; level: RiskLevel }) {
  const pal = scorePalette[level];
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circ;
  return (
    <Inline space={12} alignItems="center">
      <svg width={70} height={70} viewBox="0 0 70 70" aria-label={`Risk score ${score}%`}>
        <circle cx={35} cy={35} r={r} fill={pal.bg} stroke="#1E293B" strokeWidth={5.5} />
        <circle
          cx={35}
          cy={35}
          r={r}
          fill="none"
          stroke={pal.stroke}
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          transform="rotate(-90 35 35)"
        />
        <text
          x={35}
          y={40}
          textAnchor="middle"
          fontSize={16}
          fontWeight={800}
          fill={pal.stroke}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {score}%
        </text>
      </svg>
      <Stack space={2}>
        <Text2 medium color={pal.text}>
          {pal.label}
        </Text2>
        <Text1 regular color={skinVars.colors.textSecondary}>
          Live risk score
        </Text1>
      </Stack>
    </Inline>
  );
}

function principalSubtitle(detail: PrincipalDetail) {
  if (detail.kind === "service") {
    return `Service account · ${detail.profile.description} · created ${formatDate(detail.profile.createdDate)}`;
  }
  const p = detail.profile;
  return `${p.title} · ${p.department} · ${p.homeOffice} · since ${formatDate(p.startDate)}`;
}

function InvestigatePrompt({ onInvestigate }: { onInvestigate: () => void }) {
  const { isMobile } = useScreenSize();
  const intro = (
    <Inline space={16} alignItems="center" expand={1}>
      <IconAiRegular size={32} color={skinVars.colors.brand} />
      <Stack space={4}>
        <Text2 medium>Let the agent investigate this finding</Text2>
        <Text1 regular color={skinVars.colors.textSecondary}>
          It verifies HR records, group memberships, tickets, peers and access logs, then recommends revoke, keep or escalate.
          Every lookup is read-only until you approve.
        </Text1>
      </Stack>
    </Inline>
  );
  const button = (
    <ButtonPrimary small onPress={onInvestigate}>
      Investigate
    </ButtonPrimary>
  );
  return (
    <Boxed variant="alternative">
      <Box padding={isMobile ? 16 : 24}>
        {isMobile ? (
          <Stack space={16}>
            {intro}
            {button}
          </Stack>
        ) : (
          <Inline space={16} alignItems="center" expand={0}>
            {intro}
            {button}
          </Inline>
        )}
      </Box>
    </Boxed>
  );
}

function FindingInvestigationSection({
  finding,
  trace,
  auditEntry,
  groupNames,
  onInvestigate,
  onDecide,
}: {
  finding: Finding;
  trace?: AgentEvent[];
  auditEntry?: AuditEntry;
  groupNames: Map<string, string>;
  onInvestigate: () => void;
  onDecide: (decision: "approved" | "rejected", reviewer: string, note?: string) => Promise<void>;
}) {
  const type = findingTypes[finding.type];
  const running = finding.status === "investigating" || (trace !== undefined && !trace.some((e) => e.type === "done"));
  const canInvestigate = !running && !auditEntry && finding.status !== "resolved";

  return (
    <Boxed>
      <Box padding={24}>
        <Stack space={24}>
          <Stack space={12}>
            <Inline space="between" alignItems="center" wrap verticalSpace={8}>
              <Inline space={8} alignItems="center" wrap verticalSpace={8}>
                <SeverityTag severity={finding.severity} />
                <Tag type="inactive" Icon={type.Icon}>
                  {type.label}
                </Tag>
                <StatusTag status={finding.status} />
              </Inline>
              {canInvestigate && (trace || finding.proposal) && (
                <ButtonLink small onPress={onInvestigate}>
                  Run again
                </ButtonLink>
              )}
            </Inline>
            <Title3 as="h3">{finding.title}</Title3>
          </Stack>

          <Stack space={8}>
            <Text2 medium>What the rules found</Text2>
            <UnorderedList>
              {finding.facts.map((fact, i) => (
                <ListItem key={i}>
                  <Text2 regular>{fact}</Text2>
                </ListItem>
              ))}
            </UnorderedList>
          </Stack>

          <Divider />

          <Stack space={16}>
            <Text2 medium>Agent investigation</Text2>
            {trace ? (
              <ErrorBoundary title="Couldn't show the agent's steps">
                <AgentTrace events={trace} />
              </ErrorBoundary>
            ) : running ? (
              <Inline space={8} alignItems="center">
                <Spinner size={16} />
                <Text2 regular>The agent is investigating…</Text2>
              </Inline>
            ) : !finding.proposal ? (
              <InvestigatePrompt onInvestigate={onInvestigate} />
            ) : null}

            {finding.proposal && !running && (
              <ProposalCard
                finding={finding}
                proposal={finding.proposal}
                groupNames={groupNames}
                auditEntry={auditEntry}
                onDecide={onDecide}
              />
            )}
          </Stack>
        </Stack>
      </Box>
    </Boxed>
  );
}

function CleanInvestigationSummary({ detail }: { detail: PrincipalDetail }) {
  return (
    <Boxed>
      <Box padding={24}>
        <Stack space={24}>
          <Inline space={12} alignItems="center">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#0D241C",
                border: "1px solid #10B981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <IconCheckRegular size={20} color="#34D399" />
            </div>
            <Stack space={2}>
              <Text2 medium>No active policy violations detected</Text2>
              <Text1 regular color={skinVars.colors.textSecondary}>
                All six automated detectors (leaver access, orphaned accounts, role-change leftovers, separation of duties,
                impossible travel, peer outliers) cleared {detail.profile.name}. Their {detail.risk.score}% risk score reflects
                baseline privilege exposure only.
              </Text1>
            </Stack>
          </Inline>

          <Divider />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {/* HR & tickets */}
            <Stack space={8}>
              <Text2 medium>{detail.kind === "person" ? "HR & ticket history" : "Account governance"}</Text2>
              {detail.hrHistory.length > 0 ? (
                <UnorderedList>
                  {detail.hrHistory.map((e, i) => (
                    <ListItem key={i}>
                      <Text1 regular>
                        {`${formatDate(e.date)} · ${e.type.toUpperCase()}`}
                        {e.fromDepartment && e.toDepartment
                          ? ` (${e.fromDepartment} → ${e.toDepartment})`
                          : e.toDepartment
                            ? ` (${e.toDepartment})`
                            : ""}
                        {e.note ? ` — ${e.note}` : ""}
                      </Text1>
                    </ListItem>
                  ))}
                </UnorderedList>
              ) : (
                <Text1 regular color={skinVars.colors.textSecondary}>
                  Created {detail.kind === "service" ? formatDate(detail.profile.createdDate) : "on record"}
                </Text1>
              )}
              {detail.tickets.length > 0 && (
                <Stack space={4}>
                  <Text1 medium color={skinVars.colors.textSecondary}>
                    Access tickets
                  </Text1>
                  <UnorderedList>
                    {detail.tickets.map((t) => (
                      <ListItem key={t.id}>
                        <Text1 regular>
                          {`${t.id}: ${t.entitlementName} (approved by ${t.approvedByName}${t.expiresDate ? `, expires ${formatDate(t.expiresDate)}` : ""})`}
                        </Text1>
                      </ListItem>
                    ))}
                  </UnorderedList>
                </Stack>
              )}
            </Stack>

            {/* Recent activity */}
            <Stack space={8}>
              <Text2 medium>Recent device &amp; login activity</Text2>
              {detail.recentBadges.length === 0 && detail.recentLogins.length === 0 ? (
                <Text1 regular color={skinVars.colors.textSecondary}>
                  No recent device events or logins in the current snapshot window.
                </Text1>
              ) : (
                <UnorderedList>
                  {detail.recentLogins.slice(0, 3).map((l, i) => (
                    <ListItem key={`l-${i}`}>
                      <Text1 regular>{`${formatTime(l.time)} · ${l.system} login from ${l.city}, ${l.country} (${l.ip})`}</Text1>
                    </ListItem>
                  ))}
                  {detail.recentBadges.slice(0, 3).map((b, i) => (
                    <ListItem key={`b-${i}`}>
                      <Text1 regular>{`${formatTime(b.time)} · Device ${b.result}: ${b.doorName} (${b.city})`}</Text1>
                    </ListItem>
                  ))}
                </UnorderedList>
              )}
            </Stack>
          </div>
        </Stack>
      </Box>
    </Boxed>
  );
}

interface Props {
  principalId: string;
  findings: Finding[];
  traces: Record<string, AgentEvent[]>;
  audit: AuditEntry[];
  dataVersion: number;
  onSelectPrincipal: (id: string) => void;
  onClose: () => void;
  onBackToGraph: () => void;
  onInvestigate: (findingId: string) => void;
  onDecide: (findingId: string, decision: "approved" | "rejected", reviewer: string, note?: string) => Promise<void>;
}

export function PrincipalInspector({
  principalId,
  findings,
  traces,
  audit,
  dataVersion,
  onSelectPrincipal,
  onClose,
  onBackToGraph,
  onInvestigate,
  onDecide,
}: Props) {
  const { detail, error, removed } = usePrincipal(principalId, dataVersion);

  const principalFindings = React.useMemo(
    () => findings.filter((f) => f.principalId === principalId),
    [findings, principalId]
  );

  const flaggedEntitlementIds = React.useMemo(
    () => [
      ...new Set(
        principalFindings
          .filter((f) => f.status !== "resolved" && !(f.status === "approved" && f.proposal?.decision === "keep"))
          .flatMap((f) => f.entitlementIds)
      ),
    ],
    [principalFindings]
  );

  const groupNames = React.useMemo(
    () => new Map([...(detail?.access ?? []), ...removed].map((a) => [a.group.id, a.group.name])),
    [detail, removed]
  );

  if (error) {
    return (
      <Boxed>
        <Box padding={24}>
          <Text2 regular color={skinVars.colors.error}>
            Couldn&apos;t load user profile: {error}
          </Text2>
        </Box>
      </Boxed>
    );
  }

  if (!detail) {
    return (
      <Stack space={24}>
        <SkeletonRectangle height={120} />
        <SkeletonRectangle height={260} />
      </Stack>
    );
  }

  const isLeft = detail.kind === "person" && detail.profile.status === "left";

  return (
    <Stack space={32}>
      {/* Principal Header + Risk Score Breakdown */}
      <Boxed>
        <Box padding={24}>
          <Stack space={16}>
            <Inline space="between" alignItems="center" wrap verticalSpace={16}>
              <Inline space={16} alignItems="center" wrap verticalSpace={8}>
                {detail.kind === "person" ? (
                  <Avatar size={48} initials={initials(detail.profile.name)} />
                ) : (
                  <Avatar size={48} Icon={IconRobotRegular} />
                )}
                <Stack space={4}>
                  <Inline space={8} alignItems="center" wrap>
                    <Title3 as="h2">{detail.profile.name}</Title3>
                    {isLeft && detail.profile.endDate && <Tag type="error">{`Left ${formatDate(detail.profile.endDate)}`}</Tag>}
                    {detail.kind === "service" && <Tag type="promo">Service account</Tag>}
                  </Inline>
                  <Text2 regular color={skinVars.colors.textSecondary}>
                    {principalSubtitle(detail)}
                  </Text2>
                </Stack>
              </Inline>

              <Inline space={24} alignItems="center" wrap verticalSpace={12}>
                <LargeRiskRing score={detail.risk.score} level={detail.risk.level} />
                <Inline space={12} alignItems="center">
                  <ButtonLink small onPress={onBackToGraph}>
                    ↑ Back to graph
                  </ButtonLink>
                  <ButtonLink small onPress={onClose}>
                    Close
                  </ButtonLink>
                </Inline>
              </Inline>
            </Inline>

            {/* Hierarchy quick links */}
            {(detail.relations.manager ||
              detail.relations.owner ||
              detail.relations.directReports.length > 0 ||
              detail.relations.ownedServiceAccounts.length > 0) && (
              <Inline space={16} alignItems="center" wrap verticalSpace={8}>
                {detail.relations.manager && (
                  <Inline space={4} alignItems="center">
                    <Text1 regular color={skinVars.colors.textSecondary}>
                      Manager:
                    </Text1>
                    <ButtonLink small onPress={() => onSelectPrincipal(detail.relations.manager!.id)}>
                      {detail.relations.manager.name}
                    </ButtonLink>
                  </Inline>
                )}
                {detail.relations.owner && (
                  <Inline space={4} alignItems="center">
                    <Text1 regular color={skinVars.colors.textSecondary}>
                      Owner:
                    </Text1>
                    <ButtonLink small onPress={() => onSelectPrincipal(detail.relations.owner!.id)}>
                      {`${detail.relations.owner.name}${detail.relations.owner.status === "left" ? " (left)" : ""}`}
                    </ButtonLink>
                  </Inline>
                )}
                {detail.relations.directReports.length > 0 && (
                  <Inline space={8} alignItems="center" wrap>
                    <Text1 regular color={skinVars.colors.textSecondary}>
                      {`Direct reports (${detail.relations.directReports.length}):`}
                    </Text1>
                    {detail.relations.directReports.map((r) => (
                      <ButtonLink key={r.id} small onPress={() => onSelectPrincipal(r.id)}>
                        {r.name}
                      </ButtonLink>
                    ))}
                  </Inline>
                )}
                {detail.relations.ownedServiceAccounts.length > 0 && (
                  <Inline space={8} alignItems="center" wrap>
                    <Text1 regular color={skinVars.colors.textSecondary}>
                      Owns:
                    </Text1>
                    {detail.relations.ownedServiceAccounts.map((s) => (
                      <ButtonLink key={s.id} small onPress={() => onSelectPrincipal(s.id)}>
                        {s.name}
                      </ButtonLink>
                    ))}
                  </Inline>
                )}
              </Inline>
            )}

            {/* Risk score factors breakdown */}
            {detail.risk.factors.length > 0 && (
              <>
                <Divider />
                <Stack space={8}>
                  <Text1 medium color={skinVars.colors.textSecondary}>
                    Risk score breakdown
                  </Text1>
                  <Inline space={8} wrap verticalSpace={8}>
                    {detail.risk.factors.map((f, i) => (
                      <Tag
                        key={i}
                        small
                        type={f.severity === "high" ? "error" : f.severity === "medium" ? "warning" : "inactive"}
                      >
                        {`+${f.points}% ${f.label}`}
                      </Tag>
                    ))}
                  </Inline>
                </Stack>
              </>
            )}
          </Stack>
        </Box>
      </Boxed>

      {/* 1. ACCESS MAP (first!) */}
      <Stack space={12}>
        <Title2 as="h3">Access map</Title2>
        <ErrorBoundary title="Couldn't draw the access map">
          <AccessGraph detail={detail} removed={removed} flagged={flaggedEntitlementIds} />
        </ErrorBoundary>
      </Stack>

      {/* 2. INVESTIGATION (directly below the Access Map!) */}
      <Stack space={12}>
        <Title2 as="h3">Investigation</Title2>
        {principalFindings.length > 0 ? (
          <Stack space={24}>
            {principalFindings.map((finding) => (
              <FindingInvestigationSection
                key={finding.id}
                finding={finding}
                trace={traces[finding.id]}
                auditEntry={audit.filter((e) => e.findingId === finding.id).at(-1)}
                groupNames={groupNames}
                onInvestigate={() => onInvestigate(finding.id)}
                onDecide={(decision, reviewer, note) => onDecide(finding.id, decision, reviewer, note)}
              />
            ))}
          </Stack>
        ) : (
          <CleanInvestigationSummary detail={detail} />
        )}
      </Stack>
    </Stack>
  );
}
