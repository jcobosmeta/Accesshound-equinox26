import {
  Boxed,
  Box,
  ButtonLayout,
  ButtonPrimary,
  ButtonSecondary,
  Divider,
  Inline,
  ListItem,
  Stack,
  Tag,
  Text1,
  Text2,
  TextField,
  Title2,
  UnorderedList,
  skinVars,
} from "@telefonica/mistica";
import * as React from "react";
import type { AuditEntry, Finding, Proposal } from "../api";
import { DecisionTag, ModeTag, formatTime } from "../present";

const REVIEWER_KEY = "mi-portero.reviewer";

function describeAction(action: Proposal["actions"][number], principalName: string, groupNames: Map<string, string>) {
  switch (action.kind) {
    case "remove_from_group":
      return `Quitar a ${principalName} de ${groupNames.get(action.target) ?? action.target}`;
    case "disable_account":
      return `Desactivar la cuenta de ${principalName} y quitarla de todos sus grupos`;
    case "disable_badge":
      return `Desactivar los dispositivos de ${principalName}`;
    case "reset_credentials":
      return `Restablecer las credenciales de ${principalName}`;
    case "open_incident":
      return "Abrir un incidente de seguridad";
  }
}

const confidenceLabel: Record<Proposal["confidence"], string> = {
  low: "Confianza baja",
  medium: "Confianza media",
  high: "Confianza alta",
};

const approveLabel: Record<Proposal["decision"], string> = {
  revoke: "Aprobar y revocar",
  escalate: "Aprobar y escalar",
  keep: "Aprobar: mantener el acceso",
};

interface Props {
  finding: Finding;
  proposal: Proposal;
  groupNames: Map<string, string>;
  auditEntry?: AuditEntry;
  onDecide: (decision: "approved" | "rejected", reviewer: string, note?: string) => Promise<void>;
}

/** The agent's recommendation, and the human decision on it. */
export function ProposalCard({ finding, proposal, groupNames, auditEntry, onDecide }: Props) {
  const [reviewer, setReviewer] = React.useState(() => localStorage.getItem(REVIEWER_KEY) ?? "");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"approved" | "rejected">();

  const submit = async (decision: "approved" | "rejected") => {
    const name = reviewer.trim() || "Revisor";
    localStorage.setItem(REVIEWER_KEY, name);
    setBusy(decision);
    try {
      await onDecide(decision, name, note.trim() || undefined);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Boxed>
      <Box padding={24}>
        <Stack space={24}>
          <Stack space={12}>
            <Inline space={8} alignItems="center" wrap verticalSpace={8}>
              <Text1 medium color={skinVars.colors.textSecondary}>
                El agente recomienda
              </Text1>
              <DecisionTag decision={proposal.decision} />
              <Tag type="inactive">{confidenceLabel[proposal.confidence]}</Tag>
              {finding.agentMode && <ModeTag mode={finding.agentMode} />}
            </Inline>
            <Title2 as="h3">{proposal.headline}</Title2>
            <Text2 regular>{proposal.explanation}</Text2>
          </Stack>

          <Stack space={8}>
            <Text2 medium>Pruebas que ha revisado el agente</Text2>
            <UnorderedList>
              {proposal.evidence.map((e, i) => (
                <ListItem key={i}>
                  <Text2 regular>{e}</Text2>
                </ListItem>
              ))}
            </UnorderedList>
          </Stack>

          <Stack space={8}>
            <Text2 medium>{auditEntry?.humanDecision === "approved" ? "Qué ha cambiado" : "Si apruebas"}</Text2>
            {auditEntry?.humanDecision === "approved" ? (
              auditEntry.applied.length ? (
                <UnorderedList>
                  {auditEntry.applied.map((a, i) => (
                    <ListItem key={i}>
                      <Text2 regular>{a}</Text2>
                    </ListItem>
                  ))}
                </UnorderedList>
              ) : (
                <Text2 regular>Nada. El acceso se queda como está.</Text2>
              )
            ) : proposal.actions.length ? (
              <UnorderedList>
                {proposal.actions.map((a, i) => (
                  <ListItem key={i}>
                    <Text2 regular>{describeAction(a, finding.principalName, groupNames)}</Text2>
                  </ListItem>
                ))}
              </UnorderedList>
            ) : (
              <Text2 regular>No cambia nada. El acceso se mantiene y la decisión queda registrada.</Text2>
            )}
          </Stack>

          <Divider />

          {auditEntry ? (
            <Stack space={8}>
              <Inline space={8} alignItems="center">
                <Tag type={auditEntry.humanDecision === "approved" ? "success" : "info"}>
                  {auditEntry.humanDecision === "approved" ? "Aprobado" : "Rechazado"}
                </Tag>
                <Text2 regular>
                  por {auditEntry.reviewer} el {formatTime(auditEntry.time)} · entrada de auditoría {auditEntry.id}
                </Text2>
              </Inline>
              {auditEntry.note && (
                <Text2 regular color={skinVars.colors.textSecondary}>
                  “{auditEntry.note}”
                </Text2>
              )}
            </Stack>
          ) : (
            <Stack space={16}>
              <Text2 medium>Tu decisión</Text2>
              <TextField
                name="reviewer"
                label="Revisor"
                value={reviewer}
                onChangeValue={setReviewer}
                autoComplete="name"
                fullWidth
              />
              <TextField
                name="note"
                label="Nota para el registro de auditoría"
                optional
                maxLength={280}
                value={note}
                onChangeValue={setNote}
                fullWidth
              />
              <ButtonLayout
                align="left"
                primaryButton={
                  <ButtonPrimary onPress={() => submit("approved")} showSpinner={busy === "approved"} disabled={!!busy}>
                    {approveLabel[proposal.decision]}
                  </ButtonPrimary>
                }
                secondaryButton={
                  <ButtonSecondary onPress={() => submit("rejected")} showSpinner={busy === "rejected"} disabled={!!busy}>
                    Rechazar
                  </ButtonSecondary>
                }
              />
            </Stack>
          )}
        </Stack>
      </Box>
    </Boxed>
  );
}
