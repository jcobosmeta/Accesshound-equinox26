import { ButtonSecondary, EmptyStateCard, Inline, Stack, Table, Tag, Text1, Text2, Title2, skinVars } from "@telefonica/mistica";
import IconDownloadRegular from "@telefonica/mistica-icons/icon-download-regular";
import IconListDocumentRegular from "@telefonica/mistica-icons/icon-list-document-regular";
import { api, type AuditEntry } from "../api";
import { DecisionTag, ModeTag, formatTime } from "../present";

const Secondary = ({ children }: { children: string }) => (
  <Text1 regular color={skinVars.colors.textSecondary}>
    {children}
  </Text1>
);

/** Every human decision on an agent proposal, newest first. Mirrors data/audit.jsonl on the server. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <Stack space={16}>
      <Inline space="between" alignItems="flex-end" wrap verticalSpace={16}>
        <Stack space={4}>
          <Title2 as="h2">Audit trail</Title2>
          <Text2 regular color={skinVars.colors.textSecondary}>
            What the agent proposed, what a person decided and what actually changed. The server also appends each entry to
            data/audit.jsonl.
          </Text2>
        </Stack>
        {/* The server sends these as attachments, so the browser downloads them and stays on the page. */}
        <Inline space={8}>
          <ButtonSecondary small StartIcon={IconDownloadRegular} href={api.auditExportUrl("csv")} disabled={!entries.length}>
            Download CSV
          </ButtonSecondary>
          <ButtonSecondary small StartIcon={IconDownloadRegular} href={api.auditExportUrl("json")} disabled={!entries.length}>
            Download JSON
          </ButtonSecondary>
        </Inline>
      </Inline>
      {entries.length === 0 ? (
        <EmptyStateCard
          asset={<IconListDocumentRegular size="100%" color={skinVars.colors.brand} />}
          title="No decisions yet"
          description="Approve or reject an agent proposal and it will be recorded here."
        />
      ) : (
        <Table
          boxed
          responsive="collapse-rows"
          rowVerticalAlign="top"
          columnWidth={[96, 220, "auto", 160, "auto"]}
          heading={["Entry", "Finding", "Agent proposed", "Decision", "Changes applied"]}
          content={[...entries].reverse().map((e) => [
            <Stack space={2} key="id">
              <Text2 medium>{e.id}</Text2>
              <Secondary>{formatTime(e.time)}</Secondary>
            </Stack>,
            <Stack space={2} key="finding">
              <Text2 medium>{e.principalName}</Text2>
              <Secondary>{e.findingTitle}</Secondary>
            </Stack>,
            <Stack space={8} key="agent">
              <Inline space={8}>
                <DecisionTag decision={e.agentDecision} />
                <ModeTag mode={e.agentMode} />
              </Inline>
              <Text2 regular>{e.agentHeadline}</Text2>
            </Stack>,
            <Stack space={8} key="human">
              <Tag type={e.humanDecision === "approved" ? "success" : "info"}>
                {e.humanDecision === "approved" ? "Approved" : "Rejected"}
              </Tag>
              <Secondary>{`by ${e.reviewer}`}</Secondary>
              {e.note ? <Secondary>{`“${e.note}”`}</Secondary> : null}
            </Stack>,
            <Stack space={4} key="applied">
              {e.applied.length ? (
                e.applied.map((a, i) => (
                  <Text2 regular key={i}>
                    {a}
                  </Text2>
                ))
              ) : (
                <Secondary>No access changed</Secondary>
              )}
            </Stack>,
          ])}
        />
      )}
    </Stack>
  );
}
