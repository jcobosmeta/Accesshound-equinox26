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
        { say: "Now checking what services are still attached to the old role.", call: ["list_access", { principal_id: pid }] },
        { say: `Do any of ${first}'s new peers have ${sensitive.entitlement.name}?`, call: ["compare_with_peers", { person_id: pid, entitlement_id: sensitive.entitlement.id }] },
        { say: "Is there a ticket that still justifies it?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: sensitive.entitlement.id }] },
      ]);
      return {
        decision: "revoke",
        headline: `${first} moved to ${transfer.toDepartment} on ${transfer.date} and still has ${sensitive.entitlement.name} access from ${transfer.fromDepartment}.`,
        explanation: `${name} was a Cloud Controller in ${transfer.fromDepartment} and transferred to ${transfer.toDepartment} as ${repo.person(pid)!.title}. The old ${transfer.fromDepartment} groups were never removed, so ${first} still holds ${sensitive.entitlement.name} and Jira access from Finance. None of the ${transfer.toDepartment} team holds ${sensitive.entitlement.name}, and the original ticket was only for the old Finance role. Removing those groups closes the gap without touching ${first}'s Marketing VPN DEMO access.`,
        evidence: [
          `HR: transferred ${transfer.fromDepartment} → ${transfer.toDepartment} on ${transfer.date}.`,
          `Still a member of ${leftover.map((g) => repo.group(g)!.name).join(" and ")}.`,
          `0 of ${repo.activePeers(repo.person(pid)!).length} ${transfer.toDepartment} peers have ${sensitive.entitlement.name}.`,
          `Ticket TCK-2021-0007 granted ${sensitive.entitlement.name} for the Cloud Controller role, which ${first} no longer holds.`,
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
        { say: "Listing every service and device still active.", call: ["list_access", { principal_id: pid }] },
        { say: `Has ${first}'s Móvil Trabajo or Descodificador DEMO been used since ${p.endDate}?`, call: ["get_badge_events", { person_id: pid, since: p.endDate }] },
        { say: "And any remote VPN or Azure logins?", call: ["get_login_events", { principal_id: pid, since: p.endDate }] },
      ]);
      const deco = after.find((e) => e.doorEntitlementId === "ent-descodificador-demo");
      return {
        decision: "escalate",
        headline: deco
          ? `${first} left on ${p.endDate}, yet Descodificador DEMO was accessed on ${deco.time.slice(0, 10)} at ${deco.time.slice(11, 16)}.`
          : `${first} left on ${p.endDate} and still holds Azure, VPN Full and Descodificador DEMO.`,
        explanation: `${name} resigned on ${p.endDate} but was never offboarded: the account still holds Azure, VPN Full, VPN Laboratorio, Móvil Trabajo and Descodificador DEMO. ${deco ? `Those devices were used ${after.length} times after departure, including Descodificador DEMO late at night. ` : ""}This goes beyond routine cleanup and should be handled as a possible security incident. Disable the account and devices immediately and open an incident.`,
        evidence: [
          `HR: left on ${p.endDate}.`,
          `Still in IT Core Admins (Azure, VPN Full, VPN Laboratorio) and Descodificador DEMO.`,
          ...after.map((e) => `Device check-in granted: ${repo.entitlement(e.doorEntitlementId)!.name} at ${e.time}.`),
        ],
        actions: [
          { kind: "disable_badge", target: pid, reason: "Devices (Descodificador DEMO / Móvil Trabajo) belong to a former employee." },
          { kind: "disable_account", target: pid, reason: "Account should have been disabled at offboarding." },
          { kind: "open_incident", target: pid, reason: "Descodificador DEMO device accessed after departure date." },
        ],
        confidence: "high",
      };
    }

    case "orphaned_service_account": {
      const sa = repo.serviceAccount(pid)!;
      const owner = repo.person(sa.ownerId)!;
      await run([
        { say: "Looking up the service account and its owner.", call: ["get_service_account", { account_id: pid }] },
        { say: "Checking which services it can access.", call: ["list_access", { principal_id: pid }] },
        { say: "Checking recent Azure and VPN Full logins.", call: ["get_login_events", { principal_id: pid }] },
      ]);
      const logins = repo.loginEvents(pid);
      return {
        decision: "revoke",
        headline: `${sa.name} holds Azure, VPN Full and VPN Laboratorio with no owner since ${owner.name} left on ${owner.endDate}.`,
        explanation: `This account runs "${sa.description.toLowerCase()}". Its owner left on ${owner.endDate}, leaving nobody responsible for it, yet it still holds Azure, VPN Full and VPN Laboratorio and keeps authenticating at night from ${logins.at(-1)?.ip}. An unowned privileged account is a prime target for attackers. Remove IT Core Admins now and have IT confirm whether the job is still needed.`,
        evidence: [
          `Owner ${owner.name} left on ${owner.endDate}.`,
          `Member of IT Core Admins (Azure, VPN Full, VPN Laboratorio) since ${sa.createdDate}.`,
          ...logins.map((l) => `Login: ${l.system} at ${l.time} from ${l.ip}.`),
        ],
        actions: [{ kind: "remove_from_group", target: "g-it-admins", reason: "No active owner; Azure & VPN Full rights unjustified." }],
        confidence: "high",
      };
    }

    case "toxic_combination": {
      await run([
        { say: `Checking how ${first} got both Firebase and Azure access.`, call: ["list_access", { principal_id: pid }] },
        { say: "Is there a valid ticket for the Azure access?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: "ent-azure" }] },
        { say: "Who else in Finance has Azure access?", call: ["compare_with_peers", { person_id: pid, entitlement_id: "ent-azure" }] },
      ]);
      const ticket = repo.ticketsFor(pid, "ent-azure")[0];
      return {
        decision: "revoke",
        headline: `${first} holds both Firebase and Azure admin access — the temporary cover expired on ${ticket?.expiresDate}.`,
        explanation: `${name} is a Billing Analyst who uses Firebase as part of the role. Azure access was added on ${ticket?.approvedDate} to cover a colleague's leave and was meant to end on ${ticket?.expiresDate}, but it was never revoked. Holding both Firebase and Azure violates separation of duties. Remove Finance Azure while keeping ${first}'s regular Firebase access.`,
        evidence: [
          "Firebase via Finance Firebase (normal for the role).",
          `Azure via Finance Azure since ${ticket?.approvedDate}.`,
          `Ticket ${ticket?.id}: "${ticket?.justification}" — expired ${ticket?.expiresDate}.`,
        ],
        actions: [{ kind: "remove_from_group", target: "g-fin-cloud", reason: "Temporary Azure cover expired; breaks separation of duties with Firebase." }],
        confidence: "high",
      };
    }

    case "impossible_travel": {
      const login = repo.loginEvents(pid).find((l) => l.country !== "Spain")!;
      await run([
        { say: `Checking ${first}'s Móvil Trabajo check-ins for that morning.`, call: ["get_badge_events", { person_id: pid, since: login.time.slice(0, 10) }] },
        { say: "Checking VPN General logins around the same time.", call: ["get_login_events", { principal_id: pid, since: login.time.slice(0, 10) }] },
        { say: `Any travel on record for ${first}?`, call: ["get_person", { person_id: pid }] },
      ]);
      const gap = (t: string) => Math.abs(Date.parse(t) - Date.parse(login.time));
      const badge = repo.badgeEvents(pid, login.time.slice(0, 10)).sort((a, b) => gap(a.time) - gap(b.time))[0]!;
      return {
        decision: "escalate",
        headline: `${first}'s Móvil Trabajo checked in at Madrid HQ at ${badge.time.slice(11, 16)}, while ${login.system} logged in from ${login.city} at ${login.time.slice(11, 16)}.`,
        explanation: `${first}'s corporate Móvil Trabajo registered in Madrid HQ, and 19 minutes later a ${login.system} session opened from ${login.city}, ${login.country}. One person cannot be in both places, pointing to compromised VPN credentials rather than an access-rights misconfiguration. Reset credentials immediately and open a security incident.`,
        evidence: [`Móvil Trabajo: ${badge.time} at ${badge.site}.`, `${login.system}: ${login.time} from ${login.city}, ${login.country} (IP ${login.ip}).`, "No travel on record; home office Madrid HQ."],
        actions: [
          { kind: "reset_credentials", target: pid, reason: "VPN General credentials likely compromised." },
          { kind: "open_incident", target: pid, reason: "Impossible travel between Madrid Móvil Trabajo check-in and Lagos VPN General login." },
        ],
        confidence: "medium",
      };
    }

    case "peer_outlier": {
      const ent = f.entitlementIds[0]!;
      await run([
        { say: `${first} has access none of the Engineering peers hold. Checking why.`, call: ["list_access", { principal_id: pid }] },
        { call: ["compare_with_peers", { person_id: pid, entitlement_id: ent }] },
        { say: "Is there an approved ticket?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: ent }] },
        { say: "Has Descodificador DEMO actually been used recently?", call: ["get_badge_events", { person_id: pid, since: "2026-11-01" }] },
      ]);
      const t = repo.ticketsFor(pid, ent)[0];
      const valid = t && (!t.expiresDate || t.expiresDate >= repo.c.asOf);
      const e = repo.entitlement(ent)!;
      if (valid) {
        return {
          decision: "keep",
          headline: `${first}'s ${e.name} access is unusual for ${repo.person(pid)!.department} but approved until ${t.expiresDate}.`,
          explanation: `None of ${first}'s Engineering peers hold ${e.name}, which is why it was flagged. However, ticket ${t.id} shows it was requested by ${repo.principalName(t.requestedBy)} and approved by ${t.approvedBy} because "${t.justification.toLowerCase()}" The approval is valid until ${t.expiresDate}, and the recent on-call usage matches the rotation. Keep it and review when the ticket expires.`,
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
