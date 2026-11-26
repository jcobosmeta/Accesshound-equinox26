// The demo company: "Brisa Networks", ~40 people, with six planted cases.
//
//   1. Marta Ruiz       — moved Finance → Marketing in March, still approves SAP payments
//   2. Javier Ortega    — left in September; badge still opens the server room (and was used)
//   3. svc-backup-legacy — owner left in 2025; still Domain Admin, still logging in
//   4. Lucía Fernández  — can create suppliers AND approve payments (expired "temporary" cover)
//   5. Carlos Méndez    — badge swipe in Madrid while VPN logs in from Lagos, 19 minutes apart
//   6. Elena Navarro    — DECOY: server-room access none of her peers have, but backed by a
//                          valid CISO-approved ticket. The agent should propose KEEP.
//
// Everything is deterministic so the demo plays the same way every time.

import type {
  AccessTicket,
  BadgeEvent,
  Company,
  Department,
  Entitlement,
  Group,
  HrEvent,
  LoginEvent,
  Membership,
  Person,
  ServiceAccount,
  SodRule,
} from "./types.js";

const AS_OF = "2026-11-26";

// ---------------------------------------------------------------- entitlements

const entitlements: Entitlement[] = [
  { id: "ent-email", system: "Microsoft 365", name: "Email & Teams", description: "Corporate mailbox and chat", risk: "low", physical: false },
  { id: "ent-intranet", system: "Intranet", name: "Intranet", description: "Employee portal", risk: "low", physical: false },
  { id: "ent-badge-main", system: "Badge", name: "Madrid HQ — main entrance", description: "Lobby turnstiles", risk: "low", physical: true },
  { id: "ent-vpn", system: "VPN", name: "Remote access VPN", description: "Connect to the corporate network from outside", risk: "medium", physical: false },

  { id: "ent-sap-view", system: "SAP", name: "Finance reporting (read-only)", description: "View ledgers and reports", risk: "low", physical: false },
  { id: "ent-sap-create-supplier", system: "SAP", name: "Create / modify suppliers", description: "Add suppliers and change their bank details", risk: "high", physical: false, duties: ["create_supplier"] },
  { id: "ent-sap-approve-payment", system: "SAP", name: "Approve payments", description: "Release outgoing payments to suppliers", risk: "high", physical: false, duties: ["approve_payment"] },
  { id: "ent-badge-finance", system: "Badge", name: "Floor 4 — Finance", description: "Finance floor", risk: "low", physical: true },

  { id: "ent-hubspot", system: "HubSpot", name: "HubSpot marketing", description: "Campaigns and contacts", risk: "low", physical: false },
  { id: "ent-badge-marketing", system: "Badge", name: "Floor 3 — Marketing", description: "Marketing floor", risk: "low", physical: true },

  { id: "ent-servicenow", system: "ServiceNow", name: "ServiceNow agent", description: "Work tickets", risk: "medium", physical: false },
  { id: "ent-ad-domain-admin", system: "Active Directory", name: "Domain Admin", description: "Full control of every account and machine in the domain", risk: "high", physical: false },
  { id: "ent-backup-admin", system: "Veeam", name: "Backup console admin", description: "Restore, delete and export any backup", risk: "high", physical: false },
  { id: "ent-badge-it", system: "Badge", name: "Floor 2 — IT", description: "IT floor", risk: "low", physical: true },
  { id: "ent-badge-server-room", system: "Badge", name: "Basement B1 — Server room", description: "Data centre cage with production hardware", risk: "high", physical: true },

  { id: "ent-github", system: "GitHub", name: "GitHub org member", description: "Source code", risk: "medium", physical: false },
  { id: "ent-aws-dev", system: "AWS", name: "AWS dev account", description: "Non-production cloud", risk: "medium", physical: false },
  { id: "ent-badge-eng", system: "Badge", name: "Floor 5 — Engineering", description: "Engineering floor", risk: "low", physical: true },

  { id: "ent-workday-admin", system: "Workday", name: "HR admin", description: "Edit employee records and salaries", risk: "high", physical: false },
  { id: "ent-badge-hr", system: "Badge", name: "Floor 6 — HR", description: "HR floor", risk: "low", physical: true },

  { id: "ent-salesforce", system: "Salesforce", name: "Salesforce user", description: "Accounts and deals", risk: "medium", physical: false },
  { id: "ent-badge-sales", system: "Badge", name: "Floor 1 — Sales", description: "Sales floor", risk: "low", physical: true },

  { id: "ent-badge-warehouse", system: "Badge", name: "Warehouse — loading dock", description: "Logistics warehouse", risk: "medium", physical: true },
];

// ---------------------------------------------------------------- groups

const groups: Group[] = [
  { id: "g-all-staff", name: "All staff", source: "Active Directory", entitlementIds: ["ent-email", "ent-intranet", "ent-badge-main"] },
  { id: "g-vpn", name: "VPN users", source: "Active Directory", entitlementIds: ["ent-vpn"] },

  { id: "g-fin-staff", name: "Finance staff", source: "Active Directory", department: "Finance", entitlementIds: ["ent-sap-view", "ent-badge-finance"] },
  { id: "g-fin-ap-clerks", name: "SAP AP clerks", source: "SaaS", department: "Finance", entitlementIds: ["ent-sap-create-supplier"] },
  { id: "g-fin-payment-approvers", name: "SAP payment approvers", source: "SaaS", department: "Finance", entitlementIds: ["ent-sap-approve-payment"] },

  { id: "g-mkt-staff", name: "Marketing staff", source: "Active Directory", department: "Marketing", entitlementIds: ["ent-hubspot", "ent-badge-marketing"] },

  { id: "g-it-staff", name: "IT staff", source: "Active Directory", department: "IT", entitlementIds: ["ent-servicenow", "ent-badge-it"] },
  { id: "g-it-admins", name: "IT domain admins", source: "Active Directory", department: "IT", entitlementIds: ["ent-ad-domain-admin", "ent-backup-admin"] },
  { id: "g-dc-access", name: "Server room access", source: "Physical access", entitlementIds: ["ent-badge-server-room"] },

  { id: "g-eng-staff", name: "Engineering staff", source: "Active Directory", department: "Engineering", entitlementIds: ["ent-github", "ent-aws-dev", "ent-badge-eng"] },

  { id: "g-hr-staff", name: "HR staff", source: "Active Directory", department: "HR", entitlementIds: ["ent-workday-admin", "ent-badge-hr"] },

  { id: "g-sales-staff", name: "Sales staff", source: "Active Directory", department: "Sales", entitlementIds: ["ent-salesforce", "ent-badge-sales"] },

  { id: "g-ops-staff", name: "Operations staff", source: "Active Directory", department: "Operations", entitlementIds: ["ent-servicenow", "ent-badge-warehouse"] },
];

const departmentGroup: Record<Department, string> = {
  Finance: "g-fin-staff",
  Marketing: "g-mkt-staff",
  IT: "g-it-staff",
  Engineering: "g-eng-staff",
  HR: "g-hr-staff",
  Sales: "g-sales-staff",
  Operations: "g-ops-staff",
};

// ---------------------------------------------------------------- people

type Seed = Omit<Person, "email" | "status" | "homeOffice"> & Partial<Pick<Person, "status" | "homeOffice">>;

const seeds: Seed[] = [
  // Department heads
  { id: "p-001", name: "Isabel Moreno", department: "Finance", title: "Head of Finance", startDate: "2018-02-01" },
  { id: "p-002", name: "Daniel Vega", department: "Marketing", title: "Head of Marketing", startDate: "2019-05-13" },
  { id: "p-003", name: "Raúl Castillo", department: "IT", title: "IT Manager", startDate: "2017-09-04" },
  { id: "p-004", name: "Sofía Romero", department: "Engineering", title: "VP Engineering", startDate: "2020-01-07" },
  { id: "p-005", name: "Ana Gil", department: "HR", title: "HR Director", startDate: "2016-03-14" },
  { id: "p-006", name: "Miguel Herrera", department: "Sales", title: "Sales Director", startDate: "2019-10-01" },
  { id: "p-007", name: "Teresa Ibáñez", department: "Operations", title: "Operations Manager", startDate: "2018-06-18" },

  // Finance
  { id: "p-010", name: "Lucía Fernández", department: "Finance", title: "Accounts Payable Clerk", managerId: "p-001", startDate: "2021-04-12" },
  { id: "p-011", name: "Jorge Blanco", department: "Finance", title: "Accounts Payable Clerk", managerId: "p-001", startDate: "2022-09-05" },
  { id: "p-012", name: "Carmen Ortiz", department: "Finance", title: "Financial Controller", managerId: "p-001", startDate: "2019-11-18" },
  { id: "p-013", name: "Alberto Sanz", department: "Finance", title: "Financial Analyst", managerId: "p-001", startDate: "2023-02-20" },
  { id: "p-014", name: "Rocío Prieto", department: "Finance", title: "Accounts Payable Clerk", managerId: "p-001", startDate: "2024-01-15" },

  // Marketing (Marta moved here from Finance)
  { id: "p-020", name: "Marta Ruiz", department: "Marketing", title: "Brand Manager", managerId: "p-002", startDate: "2020-06-01" },
  { id: "p-021", name: "Hugo Delgado", department: "Marketing", title: "Content Lead", managerId: "p-002", startDate: "2021-08-23" },
  { id: "p-022", name: "Paula Serrano", department: "Marketing", title: "Digital Marketing Specialist", managerId: "p-002", startDate: "2022-03-07" },
  { id: "p-023", name: "Iván Molina", department: "Marketing", title: "Designer", managerId: "p-002", startDate: "2023-10-02" },
  { id: "p-024", name: "Nuria Cano", department: "Marketing", title: "Events Coordinator", managerId: "p-002", startDate: "2024-05-20" },

  // IT
  { id: "p-030", name: "Javier Ortega", department: "IT", title: "Systems Administrator", managerId: "p-003", startDate: "2018-01-08", status: "left", endDate: "2026-09-30" },
  { id: "p-031", name: "Óscar Núñez", department: "IT", title: "Systems Administrator", managerId: "p-003", startDate: "2019-07-15" },
  { id: "p-032", name: "Beatriz León", department: "IT", title: "Systems Administrator", managerId: "p-003", startDate: "2021-02-01" },
  { id: "p-033", name: "Adrián Rubio", department: "IT", title: "Helpdesk Technician", managerId: "p-003", startDate: "2023-06-12" },
  { id: "p-034", name: "Silvia Marín", department: "IT", title: "Helpdesk Technician", managerId: "p-003", startDate: "2024-09-02" },
  { id: "p-035", name: "Pablo Díaz", department: "IT", title: "Backup Engineer", managerId: "p-003", startDate: "2017-03-01", status: "left", endDate: "2025-06-30" },

  // Engineering
  { id: "p-040", name: "Elena Navarro", department: "Engineering", title: "Site Reliability Engineer", managerId: "p-004", startDate: "2021-11-08" },
  { id: "p-041", name: "David Torres", department: "Engineering", title: "Backend Engineer", managerId: "p-004", startDate: "2020-04-20" },
  { id: "p-042", name: "Laura Jiménez", department: "Engineering", title: "Frontend Engineer", managerId: "p-004", startDate: "2022-01-10" },
  { id: "p-043", name: "Sergio Ramos", department: "Engineering", title: "Backend Engineer", managerId: "p-004", startDate: "2022-07-04" },
  { id: "p-044", name: "Cristina Vidal", department: "Engineering", title: "QA Engineer", managerId: "p-004", startDate: "2023-03-27" },
  { id: "p-045", name: "Mario Pascual", department: "Engineering", title: "Data Engineer", managerId: "p-004", startDate: "2024-02-12" },

  // HR
  { id: "p-050", name: "Eva Santos", department: "HR", title: "HR Business Partner", managerId: "p-005", startDate: "2020-09-14" },
  { id: "p-051", name: "Rubén Calvo", department: "HR", title: "Recruiter", managerId: "p-005", startDate: "2023-01-09" },
  { id: "p-052", name: "Natalia Pérez", department: "HR", title: "Payroll Specialist", managerId: "p-005", startDate: "2022-11-14" },

  // Sales
  { id: "p-060", name: "Carlos Méndez", department: "Sales", title: "Account Executive", managerId: "p-006", startDate: "2021-05-17" },
  { id: "p-061", name: "Patricia Lozano", department: "Sales", title: "Account Executive", managerId: "p-006", startDate: "2022-02-28" },
  { id: "p-062", name: "Fernando Gallego", department: "Sales", title: "Sales Engineer", managerId: "p-006", startDate: "2020-10-05" },
  { id: "p-063", name: "Marina Esteban", department: "Sales", title: "Account Executive", managerId: "p-006", startDate: "2024-04-08" },

  // Operations
  { id: "p-070", name: "Luis Cabrera", department: "Operations", title: "Logistics Coordinator", managerId: "p-007", startDate: "2019-03-11" },
  { id: "p-071", name: "Alicia Méndez", department: "Operations", title: "Warehouse Lead", managerId: "p-007", startDate: "2020-12-01" },
  { id: "p-072", name: "Tomás Reyes", department: "Operations", title: "Procurement Specialist", managerId: "p-007", startDate: "2022-06-20" },
  { id: "p-073", name: "Irene Fuentes", department: "Operations", title: "Logistics Coordinator", managerId: "p-007", startDate: "2023-09-18" },
];

function emailFor(name: string): string {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const [first, ...rest] = plain.split(" ");
  return `${first}.${rest.join("")}@brisanetworks.example`;
}

const people: Person[] = seeds.map((s) => ({
  ...s,
  email: emailFor(s.name),
  status: s.status ?? "active",
  homeOffice: s.homeOffice ?? "Madrid HQ",
}));

// ---------------------------------------------------------------- service accounts

const serviceAccounts: ServiceAccount[] = [
  { id: "svc-backup-legacy", name: "svc-backup-legacy", description: "Nightly backup job for the old file servers", ownerId: "p-035", createdDate: "2019-04-02" },
  { id: "svc-ci-runner", name: "svc-ci-runner", description: "CI pipeline runner", ownerId: "p-040", createdDate: "2022-05-10" },
  { id: "svc-hr-sync", name: "svc-hr-sync", description: "Syncs Workday → Active Directory", ownerId: "p-032", createdDate: "2021-09-01" },
];

// ---------------------------------------------------------------- memberships

const memberships: Membership[] = [];
const grant = (principalId: string, groupId: string, grantedDate: string, ticketId?: string) =>
  memberships.push({ principalId, groupId, grantedDate, ...(ticketId ? { ticketId } : {}) });

// Baseline: everyone gets all-staff, VPN and their department group from their start date.
// Leavers who were offboarded properly have no memberships (Pablo). Javier was not.
for (const p of people) {
  if (p.id === "p-035") continue; // Pablo Díaz: properly offboarded
  grant(p.id, "g-all-staff", p.startDate);
  grant(p.id, "g-vpn", p.startDate);
  // Marta's department group is handled below (she transferred).
  if (p.id !== "p-020") grant(p.id, departmentGroup[p.department], p.startDate);
}

// Finance roles
for (const id of ["p-010", "p-011", "p-014"]) grant(id, "g-fin-ap-clerks", people.find((p) => p.id === id)!.startDate);
grant("p-001", "g-fin-payment-approvers", "2018-02-01");
grant("p-012", "g-fin-payment-approvers", "2019-11-18");

// IT roles: sysadmins are domain admins and can enter the server room.
for (const id of ["p-030", "p-031", "p-032"]) {
  const start = people.find((p) => p.id === id)!.startDate;
  grant(id, "g-it-admins", start);
  grant(id, "g-dc-access", start);
}
grant("p-003", "g-dc-access", "2017-09-04");

// Case 1 — Marta Ruiz: was a Finance controller, moved to Marketing on 2026-03-02.
// She got Marketing access but kept her Finance groups.
grant("p-020", "g-fin-staff", "2020-06-01");
grant("p-020", "g-fin-payment-approvers", "2021-01-11", "TCK-2021-0007");
grant("p-020", "g-mkt-staff", "2026-03-02");

// Case 4 — Lucía Fernández: AP clerk given payment approval to cover a colleague's leave.
grant("p-010", "g-fin-payment-approvers", "2025-08-01", "TCK-2025-0318");

// Case 6 (decoy) — Elena Navarro: SRE on the datacentre on-call rotation, approved by the CISO.
grant("p-040", "g-dc-access", "2026-04-15", "TCK-2026-0412");

// Case 3 — svc-backup-legacy: Domain Admin since 2019, owner left in 2025.
grant("svc-backup-legacy", "g-it-admins", "2019-04-02");
grant("svc-ci-runner", "g-eng-staff", "2022-05-10");
grant("svc-hr-sync", "g-hr-staff", "2021-09-01");

// ---------------------------------------------------------------- HR events

const hrEvents: HrEvent[] = [
  ...people.map((p) => ({ personId: p.id, date: p.startDate, type: "hire" as const, toDepartment: p.id === "p-020" ? ("Finance" as const) : p.department })),
  { personId: "p-020", date: "2026-03-02", type: "transfer", fromDepartment: "Finance", toDepartment: "Marketing", note: "Internal move: Financial Controller → Brand Manager" },
  { personId: "p-035", date: "2025-06-30", type: "leave", fromDepartment: "IT", note: "Resigned" },
  { personId: "p-030", date: "2026-09-30", type: "leave", fromDepartment: "IT", note: "Resigned — joined a competitor" },
];

// ---------------------------------------------------------------- tickets

const tickets: AccessTicket[] = [
  {
    id: "TCK-2021-0007",
    principalId: "p-020",
    entitlementId: "ent-sap-approve-payment",
    requestedBy: "p-001",
    approvedBy: "p-001",
    justification: "Promoted to Financial Controller — needs to release supplier payments.",
    approvedDate: "2021-01-11",
  },
  {
    id: "TCK-2025-0318",
    principalId: "p-010",
    entitlementId: "ent-sap-approve-payment",
    requestedBy: "p-001",
    approvedBy: "p-001",
    justification: "Temporary: cover payment approvals while Carmen Ortiz is on parental leave.",
    approvedDate: "2025-08-01",
    expiresDate: "2025-09-30",
  },
  {
    id: "TCK-2026-0412",
    principalId: "p-040",
    entitlementId: "ent-badge-server-room",
    requestedBy: "p-004",
    approvedBy: "CISO (Gonzalo Martín)",
    justification: "Joins the datacentre on-call rotation; needs physical access for hardware incidents.",
    approvedDate: "2026-04-15",
    expiresDate: "2027-03-31",
  },
];

// ---------------------------------------------------------------- badge + login activity

const badgeEvents: BadgeEvent[] = [];
const loginEvents: LoginEvent[] = [];

const MADRID = { site: "Madrid HQ", city: "Madrid", country: "Spain" };
const workdays = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"];
const floorBadge: Record<Department, string> = {
  Finance: "ent-badge-finance",
  Marketing: "ent-badge-marketing",
  IT: "ent-badge-it",
  Engineering: "ent-badge-eng",
  HR: "ent-badge-hr",
  Sales: "ent-badge-sales",
  Operations: "ent-badge-warehouse",
};

// Tiny deterministic PRNG so the noise is the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pad = (n: number) => String(n).padStart(2, "0");

for (const p of people.filter((x) => x.status === "active")) {
  for (const day of workdays) {
    if (rand() < 0.2) continue; // remote day or holiday
    if (p.id === "p-060" && day === "2026-11-24") continue; // Case 5 sets this morning explicitly
    const h = 8 + Math.floor(rand() * 2);
    const m = Math.floor(rand() * 60);
    badgeEvents.push({ personId: p.id, doorEntitlementId: "ent-badge-main", time: `${day}T${pad(h)}:${pad(m)}:00+01:00`, ...MADRID, result: "granted" });
    badgeEvents.push({ personId: p.id, doorEntitlementId: floorBadge[p.department], time: `${day}T${pad(h)}:${pad(Math.min(59, m + 3))}:00+01:00`, ...MADRID, result: "granted" });
  }
  // Occasional VPN from home in the evening.
  if (rand() < 0.5) {
    loginEvents.push({ principalId: p.id, system: "VPN", time: `2026-11-2${Math.floor(rand() * 5)}T2${Math.floor(rand() * 2)}:${pad(Math.floor(rand() * 60))}:00+01:00`, city: "Madrid", country: "Spain", ip: `83.44.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}` });
  }
}

// Sysadmins and the decoy visit the server room from time to time.
badgeEvents.push({ personId: "p-031", doorEntitlementId: "ent-badge-server-room", time: "2026-11-19T11:05:00+01:00", ...MADRID, result: "granted" });
badgeEvents.push({ personId: "p-040", doorEntitlementId: "ent-badge-server-room", time: "2026-11-21T03:12:00+01:00", ...MADRID, result: "granted" });

// Case 2 — Javier Ortega left on 2026-09-30, but his badge opened the server room at night.
badgeEvents.push({ personId: "p-030", doorEntitlementId: "ent-badge-main", time: "2026-11-14T22:41:00+01:00", ...MADRID, result: "granted" });
badgeEvents.push({ personId: "p-030", doorEntitlementId: "ent-badge-server-room", time: "2026-11-14T22:47:00+01:00", ...MADRID, result: "granted" });

// Case 3 — svc-backup-legacy still logs in, from a host nobody owns.
loginEvents.push({ principalId: "svc-backup-legacy", system: "Active Directory", time: "2026-11-20T02:00:00+01:00", city: "Madrid", country: "Spain", ip: "10.20.4.17" });
loginEvents.push({ principalId: "svc-backup-legacy", system: "Active Directory", time: "2026-11-25T02:00:00+01:00", city: "Madrid", country: "Spain", ip: "10.20.4.17" });

// Case 5 — Carlos Méndez: in the Madrid office at 09:12, VPN login from Lagos at 09:31.
badgeEvents.push({ personId: "p-060", doorEntitlementId: "ent-badge-main", time: "2026-11-24T09:12:00+01:00", ...MADRID, result: "granted" });
loginEvents.push({ principalId: "p-060", system: "VPN", time: "2026-11-24T09:31:00+01:00", city: "Lagos", country: "Nigeria", ip: "102.89.34.120" });

// ---------------------------------------------------------------- separation of duties

const sodRules: SodRule[] = [
  {
    id: "sod-p2p",
    name: "Create supplier + approve payment",
    duties: ["create_supplier", "approve_payment"],
    why: "One person could add a fake supplier with their own bank details and then pay it.",
  },
];

export const company: Company = {
  name: "Brisa Networks",
  asOf: AS_OF,
  people,
  serviceAccounts,
  entitlements,
  groups,
  memberships,
  hrEvents,
  tickets,
  badgeEvents,
  loginEvents,
  sodRules,
};
