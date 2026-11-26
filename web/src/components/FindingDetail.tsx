import {
  Boxed,
  Box,
  ButtonLink,
  ButtonPrimary,
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
import * as React from "react";
import { api, type AccessPath, type AgentEvent, type AuditEntry, type Finding, type PrincipalDetail } from "../api";
import { findingTypes, formatDate, SeverityTag, StatusTag } from "../present";
import { AccessGraph } from "./AccessGraph";
import { AgentTrace } from "./AgentTrace";
import { ErrorBoundary } from "./ErrorBoundary";
import { ProposalCard } from "./ProposalCard";

const pathKey = (a: AccessPath) => `${a.group.id}|${a.entitlement.id}`;

// Access we've seen per principal, so that after an approved revoke the map can still show what was removed.
const lastSeen = new Map<string, AccessPath[]>();
const revoked = new Map<string, Map<string, AccessPath>>();

/** Forget remembered revocations (after the demo is reset). */
export function forgetRevocations() {
  lastSeen.clear();
  revoked.clear();
}

function usePrincipal(principalId: string, dataVersion: number) {
  const [detail, setDetail] = React.useState<PrincipalDetail>();
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    let current = true;
    api.principal(principalId).then(
      (d) => {
        if (!current) return;
        const now = new Set(d.access.map(pathKey));
        const gone = revoked.get(principalId) ?? new Map<string, AccessPath>();
        for (const a of lastSeen.get(principalId) ?? []) if (!now.has(pathKey(a))) gone.set(pathKey(a), a);
        for (const k of now) gone.delete(k); // restored, e.g. after a reset
        revoked.set(principalId, gone);
        lastSeen.set(principalId, d.access);
        setDetail(d);
        setError(undefined);
      },
      (err) => current && setError(err instanceof Error ? err.message : String(err))
    );
    return () => {
      current = false;
    };
  }, [principalId, dataVersion]);
  return { detail, error, removed: [...(revoked.get(principalId)?.values() ?? [])] };
}

function principalLine(detail: PrincipalDetail) {
  if (detail.kind === "service")
    return `Service account · ${detail.profile.description} · created ${formatDate(detail.profile.createdDate)}`;
  const p = detail.profile;
  return `${p.title}, ${p.department} · ${p.homeOffice} · since ${formatDate(p.startDate)}`;
}

/** Call to action before the agent has run. On phones the button goes below the text instead of squeezing it. */
function InvestigatePrompt({ onInvestigate }: { onInvestigate: () => void }) {
  const { isMobile } = useScreenSize();
  const intro = (
    <Inline space={16} alignItems="center" expand={1}>
      <IconAiRegular size={32} color={skinVars.colors.brand} />
      <Stack space={4}>
        <Text2 medium>Let the agent check this finding</Text2>
        <Text1 regular color={skinVars.colors.textSecondary}>
          It looks up HR records, group memberships, tickets and logs, then recommends revoke, keep or escalate. Its tools are
          read-only: nothing changes until you approve.
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

interface Props {
  finding: Finding;
  trace?: AgentEvent[];
  auditEntry?: AuditEntry;
  dataVersion: number;
  onInvestigate: () => void;
  onDecide: (decision: "approved" | "rejected", reviewer: string, note?: string) => Promise<void>;
}

export function FindingDetail({ finding, trace, auditEntry, dataVersion, onInvestigate, onDecide }: Props) {
  const { detail, error, removed } = usePrincipal(finding.principalId, dataVersion);
  const type = findingTypes[finding.type];
  const groupNames = React.useMemo(
    () => new Map([...(detail?.access ?? []), ...removed].map((a) => [a.group.id, a.group.name])),
    [detail, removed]
  );
  const running = finding.status === "investigating" || (trace !== undefined && !trace.some((e) => e.type === "done"));
  const canInvestigate = !running && !auditEntry && finding.status !== "resolved";

  return (
    <Stack space={32}>
      {/* What and who */}
      <Stack space={12}>
        <Inline space={8} alignItems="center" wrap verticalSpace={8}>
          <SeverityTag severity={finding.severity} />
          <Tag type="inactive" Icon={type.Icon}>
            {type.label}
          </Tag>
          <StatusTag status={finding.status} />
        </Inline>
        <Title3 as="h2">{finding.title}</Title3>
        {detail ? (
          <Inline space={8} alignItems="center" wrap>
            <Text2 medium>{finding.principalName}</Text2>
            <Text2 regular color={skinVars.colors.textSecondary}>
              {principalLine(detail)}
            </Text2>
            {detail.kind === "person" && detail.profile.status === "left" && detail.profile.endDate && (
              <Tag type="error">{`Left ${formatDate(detail.profile.endDate)}`}</Tag>
            )}
          </Inline>
        ) : (
          <Text2 medium>{finding.principalName}</Text2>
        )}
      </Stack>

      <Stack space={12}>
        <Title2 as="h3">What the rules found</Title2>
        <UnorderedList>
          {finding.facts.map((fact, i) => (
            <ListItem key={i}>
              <Text2 regular>{fact}</Text2>
            </ListItem>
          ))}
        </UnorderedList>
      </Stack>

      <Stack space={12}>
        <Title2 as="h3">Access map</Title2>
        {detail ? (
          // The map is the most custom code on the page; if it breaks, the investigation below still works.
          <ErrorBoundary title="Couldn't draw the access map">
            <AccessGraph detail={detail} removed={removed} flagged={finding.entitlementIds} />
          </ErrorBoundary>
        ) : error ? (
          <Text2 regular color={skinVars.colors.error}>
            Couldn't load {finding.principalName}'s access: {error}
          </Text2>
        ) : (
          <SkeletonRectangle height={240} />
        )}
      </Stack>

      <Stack space={16}>
        <Title2
          as="h3"
          right={
            canInvestigate && (trace || finding.proposal) ? (
              <ButtonLink small onPress={onInvestigate}>
                Run again
              </ButtonLink>
            ) : undefined
          }
        >
          Agent investigation
        </Title2>

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
  );
}
