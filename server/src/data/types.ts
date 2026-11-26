// Domain model for AccessHound. Everything the detectors and the agent see
// comes from a `Company` snapshot built from these types.

export type Department = "Marketing" | "Diseño" | "TI" | "Ingeniería" | "IA" | "Innovación";

export type Risk = "low" | "medium" | "high";

export interface Person {
  id: string;
  name: string;
  email: string;
  department: Department;
  title: string;
  managerId?: string;
  status: "active" | "left";
  startDate: string; // ISO date
  endDate?: string; // ISO date, set when status === "left"
  homeOffice: string; // e.g. "Sede de Madrid"
  avatarUrl?: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  description: string;
  ownerId: string; // a Person id
  createdDate: string;
}

export type Principal = { kind: "person"; id: string } | { kind: "service"; id: string };

/** A thing someone can do or reach: an app permission, an admin role, a door. */
export interface Entitlement {
  id: string;
  system: string; // "SAP", "VPN", "Active Directory", "Badge", ...
  name: string;
  description: string;
  risk: Risk;
  physical: boolean; // true for doors / badge zones
  /** Tags used by separation-of-duties rules, e.g. "create_supplier". */
  duties?: string[];
}

/** Groups grant entitlements. Principals get access by being members. */
export interface Group {
  id: string;
  name: string;
  source: "Active Directory" | "SaaS" | "Devices";
  /** Set when the group is meant for one department (e.g. Finance AP clerks). */
  department?: Department;
  entitlementIds: string[];
}

export interface Membership {
  principalId: string;
  groupId: string;
  grantedDate: string;
  /** Ticket that justified the grant, if any. */
  ticketId?: string;
}

export interface HrEvent {
  personId: string;
  date: string;
  type: "hire" | "transfer" | "leave";
  fromDepartment?: Department;
  toDepartment?: Department;
  note?: string;
}

export interface AccessTicket {
  id: string;
  principalId: string;
  entitlementId: string;
  requestedBy: string;
  approvedBy: string;
  justification: string;
  approvedDate: string;
  expiresDate?: string;
}

export interface BadgeEvent {
  personId: string;
  doorEntitlementId: string;
  time: string; // ISO datetime
  site: string;
  city: string;
  country: string;
  result: "granted" | "denied";
}

export interface LoginEvent {
  principalId: string;
  system: string; // "VPN", "SAP", ...
  time: string; // ISO datetime
  city: string;
  country: string;
  ip: string;
}

export interface SodRule {
  id: string;
  name: string;
  duties: [string, string];
  why: string;
}

export interface Company {
  name: string;
  /** Demo only: fixed value shown as the company-wide average risk instead of the computed one. */
  displayRisk?: number;
  asOf: string; // ISO date the snapshot represents
  people: Person[];
  serviceAccounts: ServiceAccount[];
  entitlements: Entitlement[];
  groups: Group[];
  memberships: Membership[];
  hrEvents: HrEvent[];
  tickets: AccessTicket[];
  badgeEvents: BadgeEvent[];
  loginEvents: LoginEvent[];
  sodRules: SodRule[];
}
