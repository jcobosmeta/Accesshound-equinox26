// Read-only queries over a Company snapshot. Shared by the detectors, the
// agent's tools and the API, so they all see the same facts.

import type { Company, Entitlement, Group, Membership, Person, ServiceAccount } from "./types.js";

export interface AccessPath {
  entitlement: Entitlement;
  group: Group;
  membership: Membership;
}

export class Repo {
  constructor(readonly c: Company) {}

  person(id: string): Person | undefined {
    return this.c.people.find((p) => p.id === id);
  }

  serviceAccount(id: string): ServiceAccount | undefined {
    return this.c.serviceAccounts.find((s) => s.id === id);
  }

  principalName(id: string): string {
    return this.person(id)?.name ?? this.serviceAccount(id)?.name ?? id;
  }

  principalKind(id: string): "person" | "service" | undefined {
    if (this.person(id)) return "person";
    if (this.serviceAccount(id)) return "service";
    return undefined;
  }

  entitlement(id: string): Entitlement | undefined {
    return this.c.entitlements.find((e) => e.id === id);
  }

  group(id: string): Group | undefined {
    return this.c.groups.find((g) => g.id === id);
  }

  membershipsOf(principalId: string): Membership[] {
    return this.c.memberships.filter((m) => m.principalId === principalId);
  }

  /** Every entitlement a principal holds, with the group and membership that grant it. */
  accessOf(principalId: string): AccessPath[] {
    const out: AccessPath[] = [];
    for (const membership of this.membershipsOf(principalId)) {
      const group = this.group(membership.groupId);
      if (!group) continue;
      for (const entId of group.entitlementIds) {
        const entitlement = this.entitlement(entId);
        if (entitlement) out.push({ entitlement, group, membership });
      }
    }
    return out;
  }

  holds(principalId: string, entitlementId: string): boolean {
    return this.accessOf(principalId).some((a) => a.entitlement.id === entitlementId);
  }

  activePeers(person: Person): Person[] {
    return this.c.people.filter((p) => p.department === person.department && p.status === "active" && p.id !== person.id);
  }

  hrHistory(personId: string) {
    return this.c.hrEvents.filter((e) => e.personId === personId).sort((a, b) => a.date.localeCompare(b.date));
  }

  ticketsFor(principalId: string, entitlementId?: string) {
    return this.c.tickets.filter((t) => t.principalId === principalId && (!entitlementId || t.entitlementId === entitlementId));
  }

  badgeEvents(personId: string, since?: string) {
    return this.c.badgeEvents
      .filter((e) => e.personId === personId && (!since || e.time >= since))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  loginEvents(principalId: string, since?: string) {
    return this.c.loginEvents
      .filter((e) => e.principalId === principalId && (!since || e.time >= since))
      .sort((a, b) => a.time.localeCompare(b.time));
  }
}
