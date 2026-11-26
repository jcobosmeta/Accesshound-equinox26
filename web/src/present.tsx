// Labels, icons and colours for domain values, so every view describes things the same way.

import { skinVars, Tag } from "@telefonica/mistica";
import IconBuildingTreeRegular from "@telefonica/mistica-icons/icon-building-tree-regular";
import IconCloudRegular from "@telefonica/mistica-icons/icon-cloud-regular";
import IconDeviceSignalRegular from "@telefonica/mistica-icons/icon-device-signal-regular";
import IconExchangeRegular from "@telefonica/mistica-icons/icon-exchange-regular";
import IconGroupRegular from "@telefonica/mistica-icons/icon-group-regular";
import IconKeyRegular from "@telefonica/mistica-icons/icon-key-regular";
import IconLinkRegular from "@telefonica/mistica-icons/icon-link-regular";
import IconLogoutRegular from "@telefonica/mistica-icons/icon-logout-regular";
import IconPlaneRegular from "@telefonica/mistica-icons/icon-plane-regular";
import IconRobotRegular from "@telefonica/mistica-icons/icon-robot-regular";
import type { AccessPath, AgentMode, FindingStatus, FindingType, Proposal, Risk, RiskLevel } from "./api";

type IconComponent = typeof IconKeyRegular;

export const findingTypes: Record<FindingType, { label: string; Icon: IconComponent }> = {
  leaver_access: { label: "Baja con accesos", Icon: IconLogoutRegular },
  orphaned_service_account: { label: "Cuenta de servicio huérfana", Icon: IconRobotRegular },
  role_change_leftover: { label: "Restos de un cambio de puesto", Icon: IconExchangeRegular },
  toxic_combination: { label: "Combinación tóxica", Icon: IconLinkRegular },
  impossible_travel: { label: "Viaje imposible", Icon: IconPlaneRegular },
  peer_outlier: { label: "Anomalía frente a compañeros", Icon: IconGroupRegular },
};

/** Strong colour for a risk level, plus a pale one for backgrounds. */
export const riskColors: Record<Risk, { strong: string; low: string }> = {
  high: { strong: skinVars.colors.error, low: skinVars.colors.errorLow },
  medium: { strong: skinVars.colors.warning, low: skinVars.colors.warningLow },
  low: { strong: skinVars.colors.neutralMedium, low: skinVars.colors.neutralLow },
};

/** Luminous dark-mode palette for 0–100% risk score rings, badges, and map highlights. */
export const scorePalette: Record<RiskLevel, { stroke: string; bg: string; border: string; text: string; label: string }> = {
  critical: { stroke: "#FF4D5E", bg: "#2B1118", border: "#EF4444", text: "#FF8592", label: "Riesgo crítico" },
  high: { stroke: "#FF7A33", bg: "#2B170D", border: "#F97316", text: "#FFA370", label: "Riesgo alto" },
  medium: { stroke: "#FBBF24", bg: "#291F09", border: "#F59E0B", text: "#FCD34D", label: "Riesgo elevado" },
  low: { stroke: "#34D399", bg: "#0D241C", border: "#10B981", text: "#6EE7B7", label: "Riesgo bajo" },
};

/** Dark-mode accent per department so map quadrants and hierarchy columns stay scannable. */
export const departmentAccent: Record<string, { bg: string; border: string; text: string }> = {
  Finanzas: { bg: "#10213D", border: "#1D4ED8", text: "#60A5FA" },
  Marketing: { bg: "#2E1226", border: "#BE185D", text: "#F472B6" },
  TI: { bg: "#1E1638", border: "#6D28D9", text: "#A78BFA" },
  Ingeniería: { bg: "#0D2632", border: "#0E7490", text: "#22D3EE" },
  Dirección: { bg: "#0E1F3D", border: "#2563EB", text: "#38BDF8" },
};

const severityTag: Record<Risk, { type: "error" | "warning" | "inactive"; text: string }> = {
  high: { type: "error", text: "Alta" },
  medium: { type: "warning", text: "Media" },
  low: { type: "inactive", text: "Baja" },
};

export const SeverityTag = ({ severity }: { severity: Risk }) => (
  <Tag type={severityTag[severity].type}>{severityTag[severity].text}</Tag>
);

const statusTag: Record<FindingStatus, { type: "inactive" | "active" | "warning" | "success" | "info"; text: string }> = {
  open: { type: "inactive", text: "Abierto" },
  investigating: { type: "active", text: "Investigando" },
  proposed: { type: "warning", text: "Pendiente de decisión" },
  approved: { type: "success", text: "Aprobado" },
  rejected: { type: "info", text: "Rechazado" },
  resolved: { type: "success", text: "Resuelto" },
};

export const StatusTag = ({ status, small }: { status: FindingStatus; small?: boolean }) => (
  <Tag type={statusTag[status].type} small={small}>
    {statusTag[status].text}
  </Tag>
);

const decisionTag: Record<Proposal["decision"], { type: "error" | "success" | "warning"; text: string }> = {
  revoke: { type: "error", text: "Revocar" },
  keep: { type: "success", text: "Mantener" },
  escalate: { type: "warning", text: "Escalar" },
};

export const DecisionTag = ({ decision }: { decision: Proposal["decision"] }) => (
  <Tag type={decisionTag[decision].type}>{decisionTag[decision].text}</Tag>
);

export const ModeTag = ({ mode }: { mode: AgentMode }) =>
  mode === "live" ? <Tag type="active">Agente en vivo</Tag> : <Tag type="promo">Agente en reproducción</Tag>;

export const groupSourceIcon: Record<AccessPath["group"]["source"], IconComponent> = {
  "Active Directory": IconBuildingTreeRegular,
  SaaS: IconCloudRegular,
  Devices: IconDeviceSignalRegular,
};

export const entitlementIcon = (physical: boolean): IconComponent => (physical ? IconDeviceSignalRegular : IconKeyRegular);

/** "Lucía Fernández" → "LF" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** HR event types as people say them. */
export const hrEventLabel: Record<"hire" | "transfer" | "leave", string> = {
  hire: "Alta",
  transfer: "Traslado",
  leave: "Baja",
};

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
