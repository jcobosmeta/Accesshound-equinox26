import {
  Boxed,
  Box,
  ButtonLink,
  Inline,
  Spinner,
  Stack,
  Text,
  Text1,
  Text2,
  Timeline,
  TimelineItem,
  skinVars,
} from "@telefonica/mistica";
import IconAiRegular from "@telefonica/mistica-icons/icon-ai-regular";
import IconCheckRegular from "@telefonica/mistica-icons/icon-check-regular";
import IconErrorRegular from "@telefonica/mistica-icons/icon-error-regular";
import IconSearchDatabaseRegular from "@telefonica/mistica-icons/icon-search-database-regular";
import * as React from "react";
import type { AgentEvent } from "../api";

/** Plain-language names for the agent's read-only tools (server/src/agent/tools.ts). */
const toolLabels: Record<string, string> = {
  get_person: "Consultó el perfil de RR. HH.",
  get_hr_history: "Revisó el historial de RR. HH.",
  get_service_account: "Consultó la cuenta de servicio",
  list_access: "Listó los accesos actuales",
  compare_with_peers: "Comparó con sus compañeros",
  get_access_tickets: "Revisó los tickets de acceso",
  get_badge_events: "Leyó el registro de dispositivos",
  get_login_events: "Leyó el registro de inicios de sesión",
};

/** Spanish names for the tools' parameters. */
const inputLabels: Record<string, string> = {
  person_id: "persona",
  account_id: "cuenta",
  principal_id: "usuario",
  entitlement_id: "permiso",
  since: "desde",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const describeInput = (input: unknown) =>
  input && typeof input === "object"
    ? Object.entries(input as Record<string, unknown>)
        .map(([k, v]) => `${inputLabels[k] ?? k.replace(/_/g, " ")}: ${String(v)}`)
        .join(" · ")
    : "";

/** One line saying what came back, so the trace reads without opening the raw data. */
function describeOutput(tool: string, output: unknown): string {
  if (Array.isArray(output)) {
    const n = output.length;
    switch (tool) {
      case "list_access":
        return plural(n, "permiso");
      case "get_hr_history":
        return plural(n, "evento de RR. HH.", "eventos de RR. HH.");
      case "get_access_tickets":
        return n ? plural(n, "ticket") : "Sin tickets";
      case "get_badge_events":
        return plural(n, "evento de dispositivo", "eventos de dispositivo");
      case "get_login_events":
        return plural(n, "inicio de sesión", "inicios de sesión");
      default:
        return plural(n, "registro");
    }
  }
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (tool === "compare_with_peers" && Array.isArray(o.holders))
      return `Lo tienen ${o.holders.length} de ${o.peers} compañeros de ${o.department}`;
    if (typeof o.error === "string") return o.error;
    if (typeof o.name === "string") return [o.name, o.title, o.department, o.status].filter(Boolean).join(", ");
  }
  return "Hecho";
}

function ToolStep({ why, name, input, output }: { why?: string; name: string; input: unknown; output?: unknown }) {
  const [open, setOpen] = React.useState(false);
  const done = output !== undefined;
  return (
    <Stack space={4}>
      {why && (
        <Text2 regular color={skinVars.colors.textSecondary}>
          {why}
        </Text2>
      )}
      <Inline space={8} alignItems="baseline" wrap>
        <Text2 medium>{toolLabels[name] ?? name}</Text2>
        <Text1 regular color={skinVars.colors.textSecondary}>
          {describeInput(input)}
        </Text1>
      </Inline>
      {done ? (
        <Inline space={8} alignItems="center">
          <Text2 regular>{describeOutput(name, output)}</Text2>
          <ButtonLink small onPress={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Ocultar datos" : "Ver datos"}
          </ButtonLink>
        </Inline>
      ) : (
        <Text1 regular color={skinVars.colors.textSecondary}>
          Esperando el resultado…
        </Text1>
      )}
      {open && (
        <Boxed variant="alternative">
          <Box padding={12}>
            <Text as="pre" size={12} lineHeight={18} wordBreak>
              {JSON.stringify(output, null, 2)}
            </Text>
          </Box>
        </Boxed>
      )}
    </Stack>
  );
}

type Step =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; output?: unknown; why?: string }
  | { kind: "proposal" }
  | { kind: "error"; message: string };

/** Group the event stream into steps. The agent's text right before a tool call is its reason for that call. */
function toSteps(events: AgentEvent[]): Step[] {
  const steps: Step[] = [];
  for (const e of events) {
    const last = steps.at(-1);
    if (e.type === "text") steps.push({ kind: "text", text: e.text });
    else if (e.type === "tool_call") {
      const why = last?.kind === "text" ? (steps.pop() as Extract<Step, { kind: "text" }>).text : undefined;
      steps.push({ kind: "tool", id: e.id, name: e.name, input: e.input, why });
    } else if (e.type === "tool_result") {
      const call = steps.find((s): s is Extract<Step, { kind: "tool" }> => s.kind === "tool" && s.id === e.id);
      if (call) call.output = e.output;
      else steps.push({ kind: "tool", id: e.id, name: e.name, input: undefined, output: e.output });
    } else if (e.type === "proposal") steps.push({ kind: "proposal" });
    else if (e.type === "error") steps.push({ kind: "error", message: e.message });
  }
  return steps;
}

/** The agent's investigation as it happens: its reasoning, each tool it calls and what came back. */
export function AgentTrace({ events }: { events: AgentEvent[] }) {
  const running = !events.some((e) => e.type === "done");
  const steps = toSteps(events);
  const status = [...events].reverse().find((e) => e.type === "status");
  const toolCalls = steps.filter((s) => s.kind === "tool").length;

  return (
    <Stack space={16}>
      <Inline space={8} alignItems="center">
        {running && <Spinner size={16} />}
        <Text1 regular color={skinVars.colors.textSecondary}>
          {running
            ? (status?.type === "status" && status.message) || "Iniciando el agente…"
            : `Terminado tras ${plural(toolCalls, "consulta")}. Todas las consultas son de solo lectura.`}
        </Text1>
      </Inline>
      <Timeline aria-label="Pasos del agente">
        {/* Mística draws every "completed" item as a check, so finished lookups use "active" to keep
            their icon, a lookup still waiting for its result is "inactive", and only the proposal gets the check. */}
        {steps.map((step, i) => {
          switch (step.kind) {
            case "text":
              return (
                <TimelineItem key={i} state="active" asset={{ kind: "icon", Icon: IconAiRegular }}>
                  <Text2 regular color={skinVars.colors.textSecondary}>
                    {step.text}
                  </Text2>
                </TimelineItem>
              );
            case "tool":
              return (
                <TimelineItem
                  key={i}
                  state={step.output === undefined ? "inactive" : "active"}
                  asset={{ kind: "circled-icon", Icon: IconSearchDatabaseRegular }}
                >
                  <ToolStep why={step.why} name={step.name} input={step.input} output={step.output} />
                </TimelineItem>
              );
            case "proposal":
              return (
                <TimelineItem key={i} state="completed" asset={{ kind: "circled-icon", Icon: IconCheckRegular }}>
                  <Text2 medium>Envió una propuesta para que la revise una persona</Text2>
                </TimelineItem>
              );
            case "error":
              return (
                <TimelineItem key={i} state="active" asset={{ kind: "icon", Icon: IconErrorRegular }}>
                  <Text2 regular color={skinVars.colors.error}>
                    {step.message}
                  </Text2>
                </TimelineItem>
              );
          }
        })}
      </Timeline>
    </Stack>
  );
}
