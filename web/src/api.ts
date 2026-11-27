// Types mirror the server's API responses (server/src/index.ts, store.ts, agent/types.ts).

export type Risk = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AgentMode = "live" | "replay";

export interface RiskFactor {
  label: string;
  points: number;
  severity: Risk;
}

export interface PrincipalRisk {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

export interface GraphNode {
  id: string;
  kind: "org" | "person" | "service";
  name: string;
  avatarUrl?: string;
  subtitle: string;
  department: string;
  status: "active" | "left" | "service" | "org";
  managerId?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  entitlementCount: number;
  highRiskEntitlementCount: number;
  findingIds: string[];
  topFindingSeverity?: Risk;
  topFindingStatus?: FindingStatus;
}

export type GraphEdgeKind =
  | "hierarchy"
  | "owns"
  | "cross_dept_access"
  | "shared_privilege"
  | "ticket_approval"
  | "peer_mesh";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  label?: string;
  risk?: Risk;
  dashed?: boolean;
}

export interface OrgGraph {
  company: string;
  asOf: string;
  avgRisk: number;
  maxRisk: number;
  atRiskCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type FindingType =
  | "leaver_access"
  | "orphaned_service_account"
  | "role_change_leftover"
  | "toxic_combination"
  | "impossible_travel"
  | "peer_outlier";

export type FindingStatus = "open" | "investigating" | "proposed" | "approved" | "rejected" | "resolved";

export type ActionKind = "remove_from_group" | "disable_account" | "disable_badge" | "reset_credentials" | "open_incident";

export interface Proposal {
  decision: "revoke" | "keep" | "escalate";
  headline: string;
  explanation: string;
  evidence: string[];
  actions: { kind: ActionKind; target: string; reason: string }[];
  confidence: "low" | "medium" | "high";
}

export interface Finding {
  id: string;
  type: FindingType;
  severity: Risk;
  principalId: string;
  principalName: string;
  principalKind: "person" | "service";
  title: string;
  facts: string[];
  entitlementIds: string[];
  status: FindingStatus;
  proposal?: Proposal;
  agentMode?: AgentMode;
}

export interface Summary {
  company: string;
  asOf: string;
  people: number;
  activePeople: number;
  serviceAccounts: number;
  groups: number;
  entitlements: number;
  memberships: number;
  badgeEvents: number;
  loginEvents: number;
  agentMode: AgentMode;
}

export interface Entitlement {
  id: string;
  system: string;
  name: string;
  description: string;
  risk: Risk;
  physical: boolean;
  duties?: string[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  managerId?: string;
  status: "active" | "left";
  startDate: string;
  endDate?: string;
  homeOffice: string;
  avatarUrl?: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdDate: string;
}

export interface AccessPath {
  entitlement: Entitlement;
  group: { id: string; name: string; source: "Active Directory" | "SaaS" | "Devices" };
  granted: string;
  ticketId: string | null;
}

export interface PrincipalRelations {
  manager: { id: string; name: string; title: string; department: string } | null;
  directReports: { id: string; name: string; title: string; status: "active" | "left" }[];
  owner: { id: string; name: string; title: string; department: string; status: "active" | "left" } | null;
  ownedServiceAccounts: { id: string; name: string; description: string }[];
}

export interface HrEventItem {
  personId: string;
  date: string;
  type: "hire" | "transfer" | "leave";
  fromDepartment?: string;
  toDepartment?: string;
  note?: string;
}

export interface AccessTicketItem {
  id: string;
  principalId: string;
  entitlementId: string;
  entitlementName: string;
  requestedBy: string;
  requestedByName: string;
  approvedBy: string;
  approvedByName: string;
  justification: string;
  approvedDate: string;
  expiresDate?: string;
}

export interface BadgeEventItem {
  personId: string;
  doorEntitlementId: string;
  doorName: string;
  time: string;
  site: string;
  city: string;
  country: string;
  result: "granted" | "denied";
}

export interface LoginEventItem {
  principalId: string;
  system: string;
  time: string;
  city: string;
  country: string;
  ip: string;
}

interface PrincipalExtras {
  risk: PrincipalRisk;
  access: AccessPath[];
  relations: PrincipalRelations;
  hrHistory: HrEventItem[];
  tickets: AccessTicketItem[];
  recentBadges: BadgeEventItem[];
  recentLogins: LoginEventItem[];
}

export type PrincipalDetail =
  | ({ kind: "person"; profile: Person } & PrincipalExtras)
  | ({ kind: "service"; profile: ServiceAccount } & PrincipalExtras);

export interface AuditEntry {
  id: string;
  time: string;
  findingId: string;
  findingTitle: string;
  principalId: string;
  principalName: string;
  agentDecision: Proposal["decision"];
  agentHeadline: string;
  humanDecision: "approved" | "rejected";
  reviewer: string;
  note?: string;
  applied: string[];
  agentMode: AgentMode;
}

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: unknown }
  | { type: "proposal"; proposal: Proposal }
  | { type: "error"; message: string }
  | { type: "done" };

// ---- Real-time monitoring (server/src/monitor.ts) ----

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertKind =
  | "impossible_travel"
  | "mass_download"
  | "mfa_fatigue"
  | "malware"
  | "credential_leak"
  | "off_hours_badge"
  | "privilege_escalation"
  | "tor_login"
  | "new_device";
export type MonitorEngine = "script" | "ia";
export type MonitorAction = "block" | "watch" | "ignore";

export interface SecurityAlert {
  id: string;
  time: string;
  principalId: string;
  principalName: string;
  kind: AlertKind;
  source: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface MonitorDecision {
  action: MonitorAction;
  reason: string;
  engine: MonitorEngine;
  confidence: "low" | "medium" | "high";
  fallback?: string;
}

export interface MonitorEvent {
  alert: SecurityAlert;
  status: "analyzing" | "decided" | "pending_block" | "dismissed";
  decision?: MonitorDecision;
  applied: string[];
  decidedAt?: string;
}

export interface MonitorConfig {
  running: boolean;
  engine: MonitorEngine;
  autoBlock: boolean;
  firstDelaySec: number;
  intervalSec: number;
  nextAlertAt?: string;
}

export interface BlockedPrincipal {
  principalId: string;
  principalName: string;
  at: string;
  alertId: string;
  reason: string;
}

export interface WatchedPrincipal {
  id: string;
  name: string;
  kind: "person" | "service";
  subtitle: string;
  riskScore: number;
  riskLevel: RiskLevel;
  openFindings: number;
  blocked: boolean;
}

export interface AlertType {
  kind: AlertKind;
  title: string;
  source: string;
  severity: AlertSeverity;
  people: boolean;
  services: boolean;
}

export type MonitorStreamEvent =
  | { type: "snapshot"; config: MonitorConfig; events: MonitorEvent[]; blocked: BlockedPrincipal[]; iaAvailable: boolean }
  | { type: "event"; event: MonitorEvent }
  | { type: "config"; config: MonitorConfig }
  | { type: "blocked"; blocked: BlockedPrincipal[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  summary: () => request<Summary>("/api/summary"),
  findings: () => request<Finding[]>("/api/findings"),
  graph: () => request<OrgGraph>("/api/graph"),
  principal: (id: string) => request<PrincipalDetail>(`/api/principals/${encodeURIComponent(id)}`),
  audit: () => request<AuditEntry[]>("/api/audit"),
  auditExportUrl: (format: "csv" | "json") => `/api/audit/export?format=${format}`,
  reset: () => post<{ ok: true }>("/api/reset"),
  decide: (findingId: string, decision: "approved" | "rejected", reviewer: string, note?: string) =>
    post<AuditEntry>(`/api/findings/${encodeURIComponent(findingId)}/decision`, { decision, reviewer, note }),
  monitor: {
    watchlist: () => request<WatchedPrincipal[]>("/api/monitor/watchlist"),
    alertTypes: () => request<AlertType[]>("/api/monitor/alert-types"),
    configure: (patch: Partial<MonitorConfig>) => post<MonitorConfig>("/api/monitor/config", patch),
    sendAlert: (principalId: string, kind: AlertKind) => post<MonitorEvent>("/api/monitor/alerts", { principalId, kind }),
    confirm: (alertId: string, accept: boolean) => post<MonitorEvent>(`/api/monitor/alerts/${encodeURIComponent(alertId)}/confirm`, { accept }),
    unblock: (principalId: string) => post<BlockedPrincipal>(`/api/monitor/unblock/${encodeURIComponent(principalId)}`),
  },
};

/** Follow the monitor's live feed. EventSource reconnects by itself; each reconnect starts with a fresh snapshot. */
export function monitorStream(onEvent: (e: MonitorStreamEvent) => void, onConnection?: (connected: boolean) => void): () => void {
  const source = new EventSource("/api/monitor/stream");
  source.onopen = () => onConnection?.(true);
  source.onmessage = (msg) => onEvent(JSON.parse(msg.data) as MonitorStreamEvent);
  source.onerror = () => onConnection?.(false);
  return () => source.close();
}

/**
 * Run the agent on a finding and stream its steps. Returns a function that stops listening.
 * The stream is closed as soon as `done` arrives, so EventSource never reconnects and re-runs it.
 */
export function investigate(findingId: string, mode: AgentMode | undefined, onEvent: (e: AgentEvent) => void): () => void {
  const qs = mode ? `?mode=${mode}` : "";
  const source = new EventSource(`/api/findings/${encodeURIComponent(findingId)}/investigate${qs}`);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    source.close();
  };
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data) as AgentEvent;
    onEvent(event);
    if (event.type === "done") finish();
  };
  source.onerror = () => {
    if (finished) return;
    finish();
    onEvent({ type: "error", message: "Se ha perdido la conexión con el agente." });
    onEvent({ type: "done" });
  };
  return finish;
}
