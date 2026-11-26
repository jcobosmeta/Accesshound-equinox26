import {
  BoxedRow,
  BoxedRowList,
  ButtonPrimary,
  Circle,
  EmptyStateCard,
  Inline,
  SkeletonRow,
  Stack,
  Text1,
  Title2,
  skinVars,
} from "@telefonica/mistica";
import IconErrorRegular from "@telefonica/mistica-icons/icon-error-regular";
import type { Finding, FindingStatus, Risk } from "../api";
import { findingTypes, riskColors, StatusTag } from "../present";

const statusOrder: Record<FindingStatus, number> = {
  proposed: 0,
  investigating: 1,
  open: 2,
  approved: 3,
  rejected: 3,
  resolved: 3,
};
const severityOrder: Record<Risk, number> = { high: 0, medium: 1, low: 2 };

/** Work still to do first (needs a decision, then open), highest severity first; decided ones sink to the bottom. */
const byPriority = (a: Finding, b: Finding) =>
  statusOrder[a.status] - statusOrder[b.status] || severityOrder[a.severity] - severityOrder[b.severity];

interface Props {
  findings?: Finding[];
  selectedId?: string;
  onSelect: (id: string) => void;
  error?: string;
  onRetry: () => void;
}

export function FindingsList({ findings, selectedId, onSelect, error, onRetry }: Props) {
  if (error && !findings) {
    return (
      <EmptyStateCard
        asset={<IconErrorRegular size="100%" color={skinVars.colors.error} />}
        title="Can't reach the AccessHound API"
        description={`${error}. Is the server running on port 8787?`}
        button={
          <ButtonPrimary small onPress={onRetry}>
            Try again
          </ButtonPrimary>
        }
      />
    );
  }

  return (
    <Stack space={16}>
      <Title2 as="h2">Findings</Title2>
      {!findings ? (
        <Stack space={16}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </Stack>
      ) : (
        <BoxedRowList aria-label="Findings">
          {[...findings].sort(byPriority).map((f) => {
            const { Icon, label } = findingTypes[f.type];
            const colors = riskColors[f.severity];
            return (
              <BoxedRow
                key={f.id}
                selected={f.id === selectedId}
                onPress={() => onSelect(f.id)}
                asset={
                  <Circle size={40} backgroundColor={colors.low}>
                    <Icon size={24} color={colors.strong} />
                  </Circle>
                }
                headline={
                  // "Open" is the default; only show a status once something has happened.
                  <Inline space={8} alignItems="center" wrap verticalSpace={4}>
                    <Text1 regular color={skinVars.colors.textSecondary}>
                      {label}
                    </Text1>
                    {f.status !== "open" && <StatusTag status={f.status} small />}
                  </Inline>
                }
                title={f.principalName}
                description={f.title}
                descriptionLinesMax={2}
                withChevron={false}
              />
            );
          })}
        </BoxedRowList>
      )}
    </Stack>
  );
}
