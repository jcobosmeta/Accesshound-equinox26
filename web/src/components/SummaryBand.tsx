import { Box, Inline, ResponsiveLayout, SkeletonLine, Stack, Text1, Text2, Text5, Title3, skinVars } from "@telefonica/mistica";
import type { Finding, Summary } from "../api";
import { formatDate } from "../present";

const Stat = ({ value, label, color }: { value: number | string; label: string; color?: string }) => (
  <Stack space={2}>
    <Text5 color={color}>{value}</Text5>
    <Text1 regular color={skinVars.colors.textSecondary}>
      {label}
    </Text1>
  </Stack>
);

/** Company snapshot on the left, live finding counts on the right. */
export function SummaryBand({ summary, findings }: { summary?: Summary; findings?: Finding[] }) {
  const count = (pred: (f: Finding) => boolean) => findings?.filter(pred).length ?? 0;
  const toReview = count((f) => f.status === "open" || f.status === "investigating");
  const needsDecision = count((f) => f.status === "proposed");
  const decided = count((f) => f.status === "approved" || f.status === "rejected" || f.status === "resolved");

  return (
    <ResponsiveLayout variant="alternative" fullWidth>
      <ResponsiveLayout>
        <Box paddingY={24}>
          <Inline space="between" alignItems="center" wrap verticalSpace={16}>
            {summary ? (
              <Stack space={4}>
                <Title3 as="h1">{summary.company}</Title3>
                <Text2 regular color={skinVars.colors.textSecondary}>
                  Access snapshot of {formatDate(summary.asOf)} · {summary.activePeople} active people, {summary.serviceAccounts}{" "}
                  service accounts, {summary.groups} groups, {summary.entitlements} entitlements
                </Text2>
              </Stack>
            ) : (
              <Stack space={8}>
                <SkeletonLine width={200} />
                <SkeletonLine width={420} />
              </Stack>
            )}
            <Inline space={32}>
              <Stat value={findings?.length ?? "–"} label="Findings" />
              <Stat value={toReview} label="To investigate" />
              <Stat value={needsDecision} label="Need a decision" color={needsDecision ? skinVars.colors.warning : undefined} />
              <Stat value={decided} label="Decided" color={decided ? skinVars.colors.success : undefined} />
            </Inline>
          </Inline>
        </Box>
      </ResponsiveLayout>
    </ResponsiveLayout>
  );
}
