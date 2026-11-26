// Replay agent: a scripted stand-in for the live agent, used when there is no
// API key (or AGENT_MODE=replay). It calls the SAME tools against the same
// data, so the tool results on screen are real; only the reasoning and the
// final wording are pre-written. It's the demo's safety net if the wifi dies.

import type { Repo } from "../data/repo.js";
import type { Finding } from "../detectors/index.js";
import { lookupTools } from "./tools.js";
import type { Emit, Proposal } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = Number(process.env.REPLAY_STEP_MS ?? 700);

type Step = { say?: string; call?: [name: string, input: Record<string, unknown>] };

export async function investigateReplay(repo: Repo, finding: Finding, emit: Emit): Promise<Proposal> {
  const tools = new Map(lookupTools(repo).map((t) => [t.name, t]));
  let seq = 0;
  const pid = finding.principalId;

  const run = async (steps: Step[]) => {
    for (const s of steps) {
      await sleep(STEP_MS);
      if (s.say) emit({ type: "text", text: s.say });
      if (s.call) {
        const [name, input] = s.call;
        const id = `call-${++seq}`;
        emit({ type: "tool_call", id, name, input });
        await sleep(STEP_MS / 2);
        emit({ type: "tool_result", id, name, output: tools.get(name)!.run(input as never) });
      }
    }
  };

  const proposal = await script(repo, finding, run, pid);
  await sleep(STEP_MS);
  emit({ type: "proposal", proposal });
  return proposal;
}

async function script(repo: Repo, f: Finding, run: (s: Step[]) => Promise<void>, pid: string): Promise<Proposal> {
  const name = f.principalName;
  const first = name.split(" ")[0];
  const access = repo.accessOf(pid);
  const groupsFor = (pred: (a: (typeof access)[number]) => boolean) => [...new Set(access.filter(pred).map((a) => a.group.id))];

  switch (f.type) {
    case "role_change_leftover": {
      const transfer = repo.hrHistory(pid).find((e) => e.type === "transfer")!;
      const leftover = groupsFor((a) => a.group.department === transfer.fromDepartment);
      const sensitive = access.find((a) => leftover.includes(a.group.id) && a.entitlement.risk === "high")!;
      await run([
        { say: `Checking ${first}'s HR history to confirm the department move.`, call: ["get_hr_history", { person_id: pid }] },
        { say: "Now what access is still attached to the old role.", call: ["list_access", { principal_id: pid }] },
        { say: `Do any of ${first}'s new peers have ${sensitive.entitlement.name}?`, call: ["compare_with_peers", { person_id: pid, entitlement_id: sensitive.entitlement.id }] },
        { say: "Is there a ticket that still justifies it?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: sensitive.entitlement.id }] },
      ]);
      return {
        decision: "revoke",
        headline: `${first} moved to ${transfer.toDepartment} on ${transfer.date} and can still ${sensitive.entitlement.name.toLowerCase()} in ${sensitive.entitlement.system}.`,
        explanation: `${name} was a Financial Controller and transferred to ${transfer.toDepartment} as ${repo.person(pid)!.title}. The ${transfer.fromDepartment} groups were never removed, so ${first} can still release supplier payments. None of the ${transfer.toDepartment} team has this, and the only ticket for it was for the old Finance role. Removing the old ${transfer.fromDepartment} groups closes the gap without touching ${first}'s ${transfer.toDepartment} access.`,
        evidence: [
          `HR: transferred ${transfer.fromDepartment} → ${transfer.toDepartment} on ${transfer.date}.`,
          `Still a member of ${leftover.map((g) => repo.group(g)!.name).join(" and ")}.`,
          `0 of ${repo.activePeers(repo.person(pid)!).length} ${transfer.toDepartment} peers can approve payments.`,
          `Ticket TCK-2021-0007 granted payment approval for the Financial Controller role, which ${first} no longer holds.`,
        ],
        actions: leftover.map((g) => ({ kind: "remove_from_group" as const, target: g, reason: `Belongs to ${first}'s previous ${transfer.fromDepartment} role.` })),
        confidence: "high",
      };
    }

    case "leaver_access": {
      const p = repo.person(pid)!;
      const after = repo.badgeEvents(pid, p.endDate);
      await run([
        { say: `Confirming ${first}'s employment status.`, call: ["get_person", { person_id: pid }] },
        { say: "Listing what is still active.", call: ["list_access", { principal_id: pid }] },
        { say: `Has the badge been used since ${p.endDate}?`, call: ["get_badge_events", { person_id: pid, since: p.endDate }] },
        { say: "And any remote logins?", call: ["get_login_events", { principal_id: pid, since: p.endDate }] },
      ]);
      const room = after.find((e) => e.doorEntitlementId === "ent-badge-server-room");
      return {
        decision: "escalate",
        headline: room
          ? `${first} left on ${p.endDate}, and the badge opened the server room on ${room.time.slice(0, 10)} at ${room.time.slice(11, 16)}.`
          : `${first} left on ${p.endDate} and still has admin and building access.`,
        explanation: `${name} resigned on ${p.endDate} but was never offboarded: the account is still a Domain Admin and the badge still works. ${room ? `That badge was used ${after.length} times after leaving, including the server room late at night. ` : ""}This is more than leftover access; it should be treated as a possible incident. Disable the badge and account now and ask security to review what happened in the server room.`,
        evidence: [
          `HR: left on ${p.endDate}.`,
          `Still in IT domain admins (Domain Admin, Backup console admin) and Server room access.`,
          ...after.map((e) => `Badge granted: ${repo.entitlement(e.doorEntitlementId)!.name} at ${e.time}.`),
        ],
        actions: [
          { kind: "disable_badge", target: pid, reason: "Badge belongs to someone who no longer works here." },
          { kind: "disable_account", target: pid, reason: "Account should have been disabled at offboarding." },
          { kind: "open_incident", target: pid, reason: "Badge used to enter the server room after leaving." },
        ],
        confidence: "high",
      };
    }

    case "orphaned_service_account": {
      const sa = repo.serviceAccount(pid)!;
      const owner = repo.person(sa.ownerId)!;
      await run([
        { say: "Looking up the service account and its owner.", call: ["get_service_account", { account_id: pid }] },
        { say: "What can it do?", call: ["list_access", { principal_id: pid }] },
        { say: "Is it still in use?", call: ["get_login_events", { principal_id: pid }] },
      ]);
      const logins = repo.loginEvents(pid);
      return {
        decision: "revoke",
        headline: `${sa.name} is a Domain Admin with no owner since ${owner.name} left on ${owner.endDate}.`,
        explanation: `This account runs "${sa.description.toLowerCase()}". Its owner left ${owner.endDate}, so nobody is responsible for it, yet it still has full control of the domain and logs in every few nights from ${logins.at(-1)?.ip}. An unowned admin account is a favourite target for attackers. Remove the admin rights now and have IT confirm whether the job is still needed before deleting it.`,
        evidence: [
          `Owner ${owner.name} left on ${owner.endDate}.`,
          `Member of IT domain admins (Domain Admin, Backup console admin) since ${sa.createdDate}.`,
          ...logins.map((l) => `Login: ${l.system} at ${l.time} from ${l.ip}.`),
        ],
        actions: [{ kind: "remove_from_group", target: "g-it-admins", reason: "No owner; admin rights unjustified." }],
        confidence: "high",
      };
    }

    case "toxic_combination": {
      await run([
        { say: `Checking how ${first} got both permissions.`, call: ["list_access", { principal_id: pid }] },
        { say: "Is there a ticket for the payment approval?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: "ent-sap-approve-payment" }] },
        { say: "Who else in Finance approves payments?", call: ["compare_with_peers", { person_id: pid, entitlement_id: "ent-sap-approve-payment" }] },
      ]);
      const ticket = repo.ticketsFor(pid, "ent-sap-approve-payment")[0];
      return {
        decision: "revoke",
        headline: `${first} can create a supplier and then approve paying it — the "temporary" cover ended on ${ticket?.expiresDate}.`,
        explanation: `${name} is an Accounts Payable clerk, so creating suppliers is part of the job. Payment approval was added on ${ticket?.approvedDate} to cover a colleague's leave and was meant to end on ${ticket?.expiresDate}, but nobody removed it. Holding both lets one person add a fake supplier and pay it. Remove the payment approval; the controllers already cover it.`,
        evidence: [
          "SAP: Create / modify suppliers via SAP AP clerks (normal for the role).",
          `SAP: Approve payments via SAP payment approvers since ${ticket?.approvedDate}.`,
          `Ticket ${ticket?.id}: "${ticket?.justification}" — expired ${ticket?.expiresDate}.`,
        ],
        actions: [{ kind: "remove_from_group", target: "g-fin-payment-approvers", reason: "Temporary cover expired; breaks separation of duties." }],
        confidence: "high",
      };
    }

    case "impossible_travel": {
      const login = repo.loginEvents(pid).find((l) => l.country !== "Spain")!;
      await run([
        { say: `Pulling ${first}'s badge swipes for that morning.`, call: ["get_badge_events", { person_id: pid, since: login.time.slice(0, 10) }] },
        { say: "And the VPN logins around the same time.", call: ["get_login_events", { principal_id: pid, since: login.time.slice(0, 10) }] },
        { say: `Any travel on record for ${first}?`, call: ["get_person", { person_id: pid }] },
      ]);
      const gap = (t: string) => Math.abs(Date.parse(t) - Date.parse(login.time));
      const badge = repo.badgeEvents(pid, login.time.slice(0, 10)).sort((a, b) => gap(a.time) - gap(b.time))[0]!;
      return {
        decision: "escalate",
        headline: `${first} was in the Madrid office at ${badge.time.slice(11, 16)}, but someone logged in to the VPN as ${first} from ${login.city} at ${login.time.slice(11, 16)}.`,
        explanation: `${first}'s badge opened the Madrid HQ entrance, and minutes later a VPN session started from ${login.city}, ${login.country}. One person cannot be in both places, so ${first}'s password is most likely in someone else's hands. This isn't an access-rights problem to revoke; it's a probable account compromise. Reset the credentials, end the VPN session and open an incident.`,
        evidence: [`Badge: ${badge.time} at ${badge.site}.`, `VPN: ${login.time} from ${login.city}, ${login.country} (IP ${login.ip}).`, "No travel on record; home office Madrid HQ."],
        actions: [
          { kind: "reset_credentials", target: pid, reason: "Password likely compromised." },
          { kind: "open_incident", target: pid, reason: "Impossible travel between badge and VPN." },
        ],
        confidence: "medium",
      };
    }

    case "peer_outlier": {
      const ent = f.entitlementIds[0]!;
      await run([
        { say: `${first} has access the rest of the team doesn't. Checking why.`, call: ["list_access", { principal_id: pid }] },
        { call: ["compare_with_peers", { person_id: pid, entitlement_id: ent }] },
        { say: "Is there an approved ticket?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: ent }] },
        { say: "Has the access actually been used, and when?", call: ["get_badge_events", { person_id: pid, since: "2026-11-01" }] },
      ]);
      const t = repo.ticketsFor(pid, ent)[0];
      const valid = t && (!t.expiresDate || t.expiresDate >= repo.c.asOf);
      const e = repo.entitlement(ent)!;
      if (valid) {
        return {
          decision: "keep",
          headline: `${first}'s ${e.name} access is unusual for ${repo.person(pid)!.department} but approved until ${t.expiresDate}.`,
          explanation: `None of ${first}'s peers have this, which is why it was flagged. But ticket ${t.id} shows it was requested by ${repo.principalName(t.requestedBy)} and approved by ${t.approvedBy} because "${t.justification.toLowerCase()}" The approval is still valid, and the one recent use (${repo.badgeEvents(pid, "2026-11-01").find((b) => b.doorEntitlementId === ent)?.time ?? "none"}) fits an on-call call-out. Keep it, and review again when the ticket expires.`,
          evidence: [`Ticket ${t.id}: approved by ${t.approvedBy} on ${t.approvedDate}, expires ${t.expiresDate}.`, `Justification: ${t.justification}`],
          actions: [],
          confidence: "high",
        };
      }
      return {
        decision: "revoke",
        headline: `${first} has ${e.name} access nobody else in the team has, with no valid approval.`,
        explanation: `No peer holds this and there is no current ticket for it.`,
        evidence: f.facts,
        actions: groupsFor((a) => a.entitlement.id === ent).map((g) => ({ kind: "remove_from_group" as const, target: g, reason: "Unjustified outlier access." })),
        confidence: "medium",
      };
    }
  }
}
