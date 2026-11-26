// In-memory app state: a mutable copy of the demo company, the agent's
// proposals, and the append-only audit trail (also written to disk as JSONL).

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Proposal } from "./agent/types.js";
import { company as pristine } from "./data/company.js";
import { Repo } from "./data/repo.js";
import type { Company } from "./data/types.js";
import { detect, type Finding } from "./detectors/index.js";

const AUDIT_FILE = process.env.AUDIT_FILE ?? "data/audit.jsonl";

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
  applied: string[]; // human-readable list of changes actually made
  agentMode: "live" | "replay";
}

export type FindingStatus = "open" | "investigating" | "proposed" | "approved" | "rejected" | "resolved";

export interface FindingView extends Finding {
  status: FindingStatus;
  proposal?: Proposal;
  agentMode?: "live" | "replay";
}

class Store {
  company!: Company;
  repo!: Repo;
  proposals = new Map<string, { proposal: Proposal; mode: "live" | "replay" }>();
  investigating = new Set<string>();
  decided = new Map<string, AuditEntry>();
  /** Findings that disappeared after an approved revoke, kept so the UI can show them as resolved. */
  resolved = new Map<string, Finding>();
  audit: AuditEntry[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.company = structuredClone(pristine);
    this.repo = new Repo(this.company);
    this.proposals.clear();
    this.investigating.clear();
    this.decided.clear();
    this.resolved.clear();
    this.audit = [];
    mkdirSync(dirname(AUDIT_FILE), { recursive: true });
    writeFileSync(AUDIT_FILE, "");
  }

  findings(): FindingView[] {
    const live = detect(this.repo);
    const liveIds = new Set(live.map((f) => f.id));
    const view = (f: Finding, fallback: FindingStatus): FindingView => {
      const p = this.proposals.get(f.id);
      const d = this.decided.get(f.id);
      const status: FindingStatus = d ? d.humanDecision : this.investigating.has(f.id) ? "investigating" : p ? "proposed" : fallback;
      return { ...f, status, ...(p ? { proposal: p.proposal, agentMode: p.mode } : {}) };
    };
    return [
      ...live.map((f) => view(f, "open")),
      ...[...this.resolved.values()].filter((f) => !liveIds.has(f.id)).map((f) => view(f, "resolved")),
    ];
  }

  finding(id: string): Finding | undefined {
    return detect(this.repo).find((f) => f.id === id);
  }

  /** Apply a human decision. Approving a revoke/escalate actually changes the data. */
  decide(findingId: string, humanDecision: "approved" | "rejected", reviewer: string, note?: string): AuditEntry {
    const finding = this.finding(findingId);
    const stored = this.proposals.get(findingId);
    if (!finding || !stored) throw new Error("No proposal to decide on for this finding.");
    const { proposal, mode } = stored;
    const applied: string[] = [];

    if (humanDecision === "approved") {
      for (const action of proposal.actions) applied.push(this.apply(finding.principalId, action));
    }

    const entry: AuditEntry = {
      id: `A-${String(this.audit.length + 1).padStart(4, "0")}`,
      time: new Date().toISOString(),
      findingId,
      findingTitle: finding.title,
      principalId: finding.principalId,
      principalName: finding.principalName,
      agentDecision: proposal.decision,
      agentHeadline: proposal.headline,
      humanDecision,
      reviewer,
      ...(note ? { note } : {}),
      applied,
      agentMode: mode,
    };
    this.audit.push(entry);
    this.decided.set(findingId, entry);
    if (!detect(this.repo).some((f) => f.id === findingId)) this.resolved.set(findingId, finding);
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
    return entry;
  }

  private apply(principalId: string, action: Proposal["actions"][number]): string {
    const c = this.company;
    switch (action.kind) {
      case "remove_from_group": {
        const before = c.memberships.length;
        c.memberships = c.memberships.filter((m) => !(m.principalId === principalId && m.groupId === action.target));
        const g = this.repo.group(action.target)?.name ?? action.target;
        return before !== c.memberships.length ? `Removed ${this.repo.principalName(principalId)} from ${g}` : `Not a member of ${g} (nothing to do)`;
      }
      case "disable_account": {
        // Offboarding: drop every membership.
        const n = c.memberships.filter((m) => m.principalId === principalId).length;
        c.memberships = c.memberships.filter((m) => m.principalId !== principalId);
        return `Disabled account ${this.repo.principalName(principalId)} (${n} group memberships removed)`;
      }
      case "disable_badge": {
        const deviceGroups = new Set(c.groups.filter((g) => g.source === "Devices").map((g) => g.id));
        c.memberships = c.memberships.filter((m) => !(m.principalId === principalId && deviceGroups.has(m.groupId)));
        return `Disabled device access for ${this.repo.principalName(principalId)}`;
      }
      case "reset_credentials":
        return `Credentials reset requested for ${this.repo.principalName(principalId)}`;
      case "open_incident":
        return `Security incident opened: ${action.reason}`;
    }
  }
}

export const store = new Store();
