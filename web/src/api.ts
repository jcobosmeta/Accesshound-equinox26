// Types mirror the server's API responses (server/src/index.ts, store.ts, agent/types.ts).

export type Risk = "low" | "medium" | "high";
export type AgentMode = "live" | "replay";

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
  group: { id: string; name: string; source: "Active Directory" | "SaaS" | "Physical access" };
  granted: string;
  ticketId: string | null;
}

export type PrincipalDetail =
  | { kind: "person"; profile: Person; access: AccessPath[] }
  | { kind: "service"; profile: ServiceAccount; access: AccessPath[] };

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
  principal: (id: string) => request<PrincipalDetail>(`/api/principals/${encodeURIComponent(id)}`),
  audit: () => request<AuditEntry[]>("/api/audit"),
  reset: () => post<{ ok: true }>("/api/reset"),
  decide: (findingId: string, decision: "approved" | "rejected", reviewer: string, note?: string) =>
    post<AuditEntry>(`/api/findings/${encodeURIComponent(findingId)}/decision`, { decision, reviewer, note }),
};

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
    onEvent({ type: "error", message: "Lost the connection to the agent." });
    onEvent({ type: "done" });
  };
  return finish;
}
