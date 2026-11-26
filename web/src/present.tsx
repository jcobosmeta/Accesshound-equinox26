// Labels, icons and colours for domain values, so every view describes things the same way.

import { skinVars, Tag } from "@telefonica/mistica";
import IconBuildingTreeRegular from "@telefonica/mistica-icons/icon-building-tree-regular";
import IconCloudRegular from "@telefonica/mistica-icons/icon-cloud-regular";
import IconDoorLockRegular from "@telefonica/mistica-icons/icon-door-lock-regular";
import IconExchangeRegular from "@telefonica/mistica-icons/icon-exchange-regular";
import IconGroupRegular from "@telefonica/mistica-icons/icon-group-regular";
import IconIdCardRegular from "@telefonica/mistica-icons/icon-id-card-regular";
import IconKeyRegular from "@telefonica/mistica-icons/icon-key-regular";
import IconLinkRegular from "@telefonica/mistica-icons/icon-link-regular";
import IconLogoutRegular from "@telefonica/mistica-icons/icon-logout-regular";
import IconPlaneRegular from "@telefonica/mistica-icons/icon-plane-regular";
import IconRobotRegular from "@telefonica/mistica-icons/icon-robot-regular";
import type { AccessPath, AgentMode, FindingStatus, FindingType, Proposal, Risk } from "./api";

type IconComponent = typeof IconKeyRegular;

export const findingTypes: Record<FindingType, { label: string; Icon: IconComponent }> = {
  leaver_access: { label: "Leaver with access", Icon: IconLogoutRegular },
  orphaned_service_account: { label: "Orphaned service account", Icon: IconRobotRegular },
  role_change_leftover: { label: "Role-change leftover", Icon: IconExchangeRegular },
  toxic_combination: { label: "Toxic combination", Icon: IconLinkRegular },
  impossible_travel: { label: "Impossible travel", Icon: IconPlaneRegular },
  peer_outlier: { label: "Peer outlier", Icon: IconGroupRegular },
};

/** Strong colour for a risk level, plus a pale one for backgrounds. */
export const riskColors: Record<Risk, { strong: string; low: string }> = {
  high: { strong: skinVars.colors.error, low: skinVars.colors.errorLow },
  medium: { strong: skinVars.colors.warning, low: skinVars.colors.warningLow },
  low: { strong: skinVars.colors.neutralMedium, low: skinVars.colors.neutralLow },
};

const severityTag: Record<Risk, { type: "error" | "warning" | "inactive"; text: string }> = {
  high: { type: "error", text: "High" },
  medium: { type: "warning", text: "Medium" },
  low: { type: "inactive", text: "Low" },
};

export const SeverityTag = ({ severity }: { severity: Risk }) => (
  <Tag type={severityTag[severity].type}>{severityTag[severity].text}</Tag>
);

const statusTag: Record<FindingStatus, { type: "inactive" | "active" | "warning" | "success" | "info"; text: string }> = {
  open: { type: "inactive", text: "Open" },
  investigating: { type: "active", text: "Investigating" },
  proposed: { type: "warning", text: "Needs decision" },
  approved: { type: "success", text: "Approved" },
  rejected: { type: "info", text: "Rejected" },
  resolved: { type: "success", text: "Resolved" },
};

export const StatusTag = ({ status, small }: { status: FindingStatus; small?: boolean }) => (
  <Tag type={statusTag[status].type} small={small}>
    {statusTag[status].text}
  </Tag>
);

const decisionTag: Record<Proposal["decision"], { type: "error" | "success" | "warning"; text: string }> = {
  revoke: { type: "error", text: "Revoke" },
  keep: { type: "success", text: "Keep" },
  escalate: { type: "warning", text: "Escalate" },
};

export const DecisionTag = ({ decision }: { decision: Proposal["decision"] }) => (
  <Tag type={decisionTag[decision].type}>{decisionTag[decision].text}</Tag>
);

export const ModeTag = ({ mode }: { mode: AgentMode }) =>
  mode === "live" ? <Tag type="active">Live agent</Tag> : <Tag type="promo">Replay agent</Tag>;

export const groupSourceIcon: Record<AccessPath["group"]["source"], IconComponent> = {
  "Active Directory": IconBuildingTreeRegular,
  SaaS: IconCloudRegular,
  "Physical access": IconIdCardRegular,
};

export const entitlementIcon = (physical: boolean): IconComponent => (physical ? IconDoorLockRegular : IconKeyRegular);

/** "Lucía Fernández" → "LF" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
