// The agent's tools. All read-only lookups over the Repo, plus submit_proposal,
// which ends the investigation. The agent can never change access itself:
// only a human approving the proposal does that.

import { z } from "zod";
import type { Repo } from "../data/repo.js";

/** A plain tool definition, so the live agent and the replay agent share the same code. */
export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  run: (input: z.infer<S>) => unknown;
}

const tool = <S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> => def;

export function lookupTools(repo: Repo) {
  return [
    tool({
      name: "get_person",
      description: "Get a person's HR profile: department, title, manager, employment status and dates.",
      inputSchema: z.object({ person_id: z.string() }),
      run: ({ person_id }) => {
        const p = repo.person(person_id);
        if (!p) return { error: `No existe la persona ${person_id}` };
        return { ...p, manager: p.managerId ? repo.principalName(p.managerId) : null };
      },
    }),
    tool({
      name: "get_hr_history",
      description: "Get a person's HR events in date order: hire, transfers between departments, leaving.",
      inputSchema: z.object({ person_id: z.string() }),
      run: ({ person_id }) => repo.hrHistory(person_id),
    }),
    tool({
      name: "get_service_account",
      description: "Get a service account's description, creation date and owner (with the owner's employment status).",
      inputSchema: z.object({ account_id: z.string() }),
      run: ({ account_id }) => {
        const s = repo.serviceAccount(account_id);
        if (!s) return { error: `No existe la cuenta de servicio ${account_id}` };
        const owner = repo.person(s.ownerId);
        return { ...s, owner: owner ? { id: owner.id, name: owner.name, status: owner.status, endDate: owner.endDate ?? null } : null };
      },
    }),
    tool({
      name: "list_access",
      description:
        "List everything a person or service account can access: each entitlement with its risk, the group that grants it, when it was granted and the justifying ticket id if any.",
      inputSchema: z.object({ principal_id: z.string() }),
      run: ({ principal_id }) =>
        repo.accessOf(principal_id).map((a) => ({
          entitlement_id: a.entitlement.id,
          system: a.entitlement.system,
          name: a.entitlement.name,
          risk: a.entitlement.risk,
          physical: a.entitlement.physical,
          via_group: a.group.id,
          group_name: a.group.name,
          group_department: a.group.department ?? null,
          granted: a.membership.grantedDate,
          ticket_id: a.membership.ticketId ?? null,
        })),
    }),
    tool({
      name: "compare_with_peers",
      description: "Check how many active people in the same department hold a given entitlement.",
      inputSchema: z.object({ person_id: z.string(), entitlement_id: z.string() }),
      run: ({ person_id, entitlement_id }) => {
        const p = repo.person(person_id);
        if (!p) return { error: `No existe la persona ${person_id}` };
        const peers = repo.activePeers(p);
        const holders = peers.filter((x) => repo.holds(x.id, entitlement_id));
        return { department: p.department, peers: peers.length, holders: holders.map((h) => `${h.name} (${h.title})`) };
      },
    }),
    tool({
      name: "get_access_tickets",
      description: "Get the access-request tickets for a principal (optionally for one entitlement): who approved it, why, and when it expires.",
      inputSchema: z.object({ principal_id: z.string(), entitlement_id: z.string().optional() }),
      run: ({ principal_id, entitlement_id }) =>
        repo.ticketsFor(principal_id, entitlement_id).map((t) => ({
          ...t,
          expired: t.expiresDate ? t.expiresDate < repo.c.asOf : false,
        })),
    }),
    tool({
      name: "get_badge_events",
      description: "Get a person's device check-in events (Móvil Trabajo / Descodificador DEMO: device, time, site, granted/denied), optionally since an ISO date.",
      inputSchema: z.object({ person_id: z.string(), since: z.string().optional() }),
      run: ({ person_id, since }) =>
        repo.badgeEvents(person_id, since).map((e) => ({ ...e, door: repo.entitlement(e.doorEntitlementId)?.name })),
    }),
    tool({
      name: "get_login_events",
      description: "Get logins (VPN, Active Directory, ...) for a person or service account, with city, country and IP, optionally since an ISO date.",
      inputSchema: z.object({ principal_id: z.string(), since: z.string().optional() }),
      run: ({ principal_id, since }) => repo.loginEvents(principal_id, since),
    }),
  ];
}
