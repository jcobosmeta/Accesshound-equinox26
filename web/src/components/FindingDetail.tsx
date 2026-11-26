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
import type { AgentEvent, AuditEntry, Finding, PrincipalDetail } from "../api";
import { findingTypes, formatDate, SeverityTag, StatusTag } from "../present";
import { forgetRevocations, usePrincipal } from "../usePrincipal";
import { AccessGraph } from "./AccessGraph";
import { AgentTrace } from "./AgentTrace";
import { ErrorBoundary } from "./ErrorBoundary";
import { ProposalCard } from "./ProposalCard";

export { forgetRevocations };

function principalLine(detail: PrincipalDetail) {
  if (detail.kind === "service")
    return `Cuenta de servicio · ${detail.profile.description} · creada el ${formatDate(detail.profile.createdDate)}`;
  const p = detail.profile;
  return `${p.title}, ${p.department} · ${p.homeOffice} · desde ${formatDate(p.startDate)}`;
}

/** Call to action before the agent has run. On phones the button goes below the text instead of squeezing it. */
function InvestigatePrompt({ onInvestigate }: { onInvestigate: () => void }) {
  const { isMobile } = useScreenSize();
  const intro = (
    <Inline space={16} alignItems="center" expand={1}>
      <IconAiRegular size={32} color={skinVars.colors.brand} />
      <Stack space={4}>
        <Text2 medium>Deja que el agente revise este hallazgo</Text2>
        <Text1 regular color={skinVars.colors.textSecondary}>
          Consulta los registros de RR. HH., la pertenencia a grupos, los tickets y los registros de acceso, y recomienda revocar,
          mantener o escalar. Sus herramientas solo leen datos: nada cambia hasta que lo apruebes.
        </Text1>
      </Stack>
    </Inline>
  );
  const button = (
    <ButtonPrimary small onPress={onInvestigate}>
      Investigar
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
  /** Inside an analysis row, which already names the finding: only access map, investigation and decision. */
  compact?: boolean;
}

export function FindingDetail({ finding, trace, auditEntry, dataVersion, onInvestigate, onDecide, compact }: Props) {
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
      {!compact && (
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
                <Tag type="error">{`Baja el ${formatDate(detail.profile.endDate)}`}</Tag>
              )}
            </Inline>
          ) : (
            <Text2 medium>{finding.principalName}</Text2>
          )}
        </Stack>
      )}

      {!compact && (
        <Stack space={12}>
          <Title2 as="h3">Qué han encontrado las reglas</Title2>
          <UnorderedList>
            {finding.facts.map((fact, i) => (
              <ListItem key={i}>
                <Text2 regular>{fact}</Text2>
              </ListItem>
            ))}
          </UnorderedList>
        </Stack>
      )}

      <Stack space={12}>
        <Title2 as="h3">Mapa de accesos</Title2>
        {detail ? (
          // The map is the most custom code on the page; if it breaks, the investigation below still works.
          <ErrorBoundary title="No se puede dibujar el mapa de accesos">
            <AccessGraph detail={detail} removed={removed} flagged={finding.entitlementIds} />
          </ErrorBoundary>
        ) : error ? (
          <Text2 regular color={skinVars.colors.error}>
            No se pueden cargar los accesos de {finding.principalName}: {error}
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
                Volver a ejecutar
              </ButtonLink>
            ) : undefined
          }
        >
          Investigación del agente
        </Title2>

        {trace ? (
          <ErrorBoundary title="No se pueden mostrar los pasos del agente">
            <AgentTrace events={trace} />
          </ErrorBoundary>
        ) : running ? (
          <Inline space={8} alignItems="center">
            <Spinner size={16} />
            <Text2 regular>El agente está investigando…</Text2>
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
