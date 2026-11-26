import { Box, Inline, ResponsiveLayout, SkeletonLine, Stack, Text1, Text2, Text5, Title3, skinVars } from "@telefonica/mistica";
import type { Finding, OrgGraph, Summary } from "../api";
import { formatDate, scorePalette } from "../present";

const Stat = ({ value, label, color }: { value: number | string; label: string; color?: string }) => (
  <Stack space={2}>
    <Text5 color={color}>{value}</Text5>
    <Text1 regular color={skinVars.colors.textSecondary}>
      {label}
    </Text1>
  </Stack>
);

/** Company snapshot on the left, live risk and finding counts on the right. */
export function SummaryBand({ summary, findings, graph }: { summary?: Summary; findings?: Finding[]; graph?: OrgGraph }) {
  const count = (pred: (f: Finding) => boolean) => findings?.filter(pred).length ?? 0;
  const toReview = count((f) => f.status === "open" || f.status === "investigating");
  const needsDecision = count((f) => f.status === "proposed");
  const decided = count((f) => f.status === "approved" || f.status === "rejected" || f.status === "resolved");
  const maxRiskColor =
    graph && graph.maxRisk >= 80
      ? scorePalette.critical.stroke
      : graph && graph.maxRisk >= 60
        ? scorePalette.high.stroke
        : graph && graph.maxRisk >= 35
          ? scorePalette.medium.stroke
          : scorePalette.low.stroke;

  return (
    <ResponsiveLayout variant="alternative" fullWidth>
      <ResponsiveLayout>
        <Box paddingY={20}>
          <Inline space="between" alignItems="center" wrap verticalSpace={16}>
            {summary ? (
              <Stack space={4}>
                <Title3 as="h1">{summary.company}</Title3>
                <Text2 regular color={skinVars.colors.textSecondary}>
                  Instantánea de accesos del {formatDate(summary.asOf)} · {summary.activePeople} personas activas,{" "}
                  {summary.serviceAccounts} cuentas de servicio, {summary.groups} grupos, {summary.entitlements} permisos
                </Text2>
              </Stack>
            ) : (
              <Stack space={8}>
                <SkeletonLine width={200} />
                <SkeletonLine width={420} />
              </Stack>
            )}
            <Inline space={32} wrap verticalSpace={12}>
              <Stat value={graph ? `${graph.avgRisk}%` : "–"} label="Riesgo medio" />
              <Stat value={graph ? `${graph.maxRisk}%` : "–"} label="Riesgo máximo" color={maxRiskColor} />
              <Stat value={toReview} label="Por investigar" />
              <Stat value={needsDecision} label="Pendientes de decisión" color={needsDecision ? skinVars.colors.warning : undefined} />
              <Stat value={decided} label="Decididos" color={decided ? skinVars.colors.success : undefined} />
            </Inline>
          </Inline>
        </Box>
      </ResponsiveLayout>
    </ResponsiveLayout>
  );
}
