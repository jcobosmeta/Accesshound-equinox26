// Labels, icons and colours for domain values, so every view describes things the same way.

import { skinVars, Tag } from "@telefonica/mistica";
import IconBuildingTreeRegular from "@telefonica/mistica-icons/icon-building-tree-regular";
import IconCloudRegular from "@telefonica/mistica-icons/icon-cloud-regular";
import IconDeviceSignalRegular from "@telefonica/mistica-icons/icon-device-signal-regular";
import IconExchangeRegular from "@telefonica/mistica-icons/icon-exchange-regular";
import IconGroupRegular from "@telefonica/mistica-icons/icon-group-regular";
import IconKeyRegular from "@telefonica/mistica-icons/icon-key-regular";
import IconLogoutRegular from "@telefonica/mistica-icons/icon-logout-regular";
import IconPlaneRegular from "@telefonica/mistica-icons/icon-plane-regular";
import IconRobotRegular from "@telefonica/mistica-icons/icon-robot-regular";
import type { AccessPath, AgentMode, FindingStatus, FindingType, Proposal, Risk, RiskLevel } from "./api";

type IconComponent = typeof IconKeyRegular;

export const findingTypes: Record<FindingType, { label: string; Icon: IconComponent }> = {
  leaver_access: { label: "Baja con accesos", Icon: IconLogoutRegular },
  orphaned_service_account: { label: "Cuenta de servicio huérfana", Icon: IconRobotRegular },
  role_change_leftover: { label: "Restos de un cambio de puesto", Icon: IconExchangeRegular },
  impossible_travel: { label: "Viaje imposible", Icon: IconPlaneRegular },
  peer_outlier: { label: "Anomalía frente a compañeros", Icon: IconGroupRegular },
};

/** Strong colour for a risk level, plus a pale one for backgrounds. */
export const riskColors: Record<Risk, { strong: string; low: string }> = {
  high: { strong: skinVars.colors.error, low: skinVars.colors.errorLow },
  medium: { strong: skinVars.colors.warning, low: skinVars.colors.warningLow },
  low: { strong: skinVars.colors.neutralMedium, low: skinVars.colors.neutralLow },
};

export type ScorePalette = Record<RiskLevel, { stroke: string; bg: string; border: string; text: string; label: string }>;
export type DepartmentAccentMap = Record<string, { bg: string; border: string; text: string }>;

/** Luminous dark-mode palette for 0–100% risk score rings, badges, and map highlights. */
export const scorePalette: ScorePalette = {
  critical: { stroke: "#FF4D5E", bg: "#2B1118", border: "#EF4444", text: "#FF8592", label: "Riesgo crítico" },
  high: { stroke: "#FF7A33", bg: "#2B170D", border: "#F97316", text: "#FFA370", label: "Riesgo alto" },
  medium: { stroke: "#FBBF24", bg: "#291F09", border: "#F59E0B", text: "#FCD34D", label: "Riesgo elevado" },
  low: { stroke: "#34D399", bg: "#0D241C", border: "#10B981", text: "#6EE7B7", label: "Riesgo bajo" },
};

const scorePaletteLight: ScorePalette = {
  critical: { stroke: "#DC2626", bg: "#FEF2F2", border: "#EF4444", text: "#B91C1C", label: "Riesgo crítico" },
  high: { stroke: "#EA580C", bg: "#FFF7ED", border: "#F97316", text: "#C2410C", label: "Riesgo alto" },
  medium: { stroke: "#D97706", bg: "#FFFBEB", border: "#F59E0B", text: "#B45309", label: "Riesgo elevado" },
  low: { stroke: "#059669", bg: "#ECFDF5", border: "#10B981", text: "#047857", label: "Riesgo bajo" },
};

export const getScorePalette = (isDarkMode: boolean): ScorePalette => (isDarkMode ? scorePalette : scorePaletteLight);

/** Dark-mode accent per department so map quadrants and hierarchy columns stay scannable. */
export const departmentAccent: DepartmentAccentMap = {
  Innovación: { bg: "#10213D", border: "#1D4ED8", text: "#60A5FA" },
  Diseño: { bg: "#1F1A33", border: "#7C3AED", text: "#C4B5FD" },
  IA: { bg: "#22150A", border: "#C2410C", text: "#FB923C" },
  Transversal: { bg: "#162033", border: "#475569", text: "#CBD5E1" },
  Marketing: { bg: "#2E1226", border: "#BE185D", text: "#F472B6" },
  TI: { bg: "#1E1638", border: "#6D28D9", text: "#A78BFA" },
  Ingeniería: { bg: "#0D2632", border: "#0E7490", text: "#22D3EE" },
  Dirección: { bg: "#0E1F3D", border: "#2563EB", text: "#38BDF8" },
};

const departmentAccentLight: DepartmentAccentMap = {
  Innovación: { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  Diseño: { bg: "#F5F3FF", border: "#8B5CF6", text: "#6D28D9" },
  IA: { bg: "#FFF7ED", border: "#EA580C", text: "#C2410C" },
  Transversal: { bg: "#F1F5F9", border: "#64748B", text: "#334155" },
  Marketing: { bg: "#FDF2F8", border: "#DB2777", text: "#BE185D" },
  TI: { bg: "#F5F3FF", border: "#7C3AED", text: "#5B21B6" },
  Ingeniería: { bg: "#ECFEFF", border: "#0891B2", text: "#0E7490" },
  Dirección: { bg: "#EFF6FF", border: "#2563EB", text: "#1E40AF" },
};

export const getDepartmentAccent = (isDarkMode: boolean): DepartmentAccentMap =>
  isDarkMode ? departmentAccent : departmentAccentLight;

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
  mode === "live" ? <Tag type="active">Agente en vivo</Tag> : (
    <span
      style={{
        display: "inline-flex",
        borderRadius: skinVars.borderRadii.tag,
        border: `1px solid ${skinVars.colors.successHigh}`,
      }}
    >
      <Tag type="success">Agente en ejecución</Tag>
    </span>
  );

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
