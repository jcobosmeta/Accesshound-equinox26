// The demo company: "Brisa Networks", 18 people + 2 service accounts, 8 groups,
// strictly using the configured services:
//   Firebase, Confluence, SharePoint, Jira,
//   VPN (General, DEMO, Laboratorio, Full),
//   Azure, Móvil Trabajo, Descodificador DEMO.
//
// Six planted cases:
//   1. Marta Ruiz        — moved Finance → Marketing in March, still holds Finance Azure & Jira access
//   2. Javier Ortega     — left in September; still has Azure, VPN Full, VPN Laboratorio & Descodificador DEMO (used at night)
//   3. svc-backup-legacy — owner left in 2025; still holds Azure, VPN Full & VPN Laboratorio, still logging in
//   4. Lucía Fernández   — toxic combination: holds both Firebase AND Azure (expired "temporary" cover)
//   5. Carlos Méndez     — Móvil Trabajo check-in in Madrid while VPN General logs in from Lagos, 19 minutes apart
//   6. Elena Navarro     — DECOY: Descodificador DEMO access none of her peers have, backed by a
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

// ---------------------------------------------------------------- entitlements (strictly the 11 configured services)

const entitlements: Entitlement[] = [
  { id: "ent-confluence", system: "Confluence", name: "Confluence", description: "Documentación corporativa y base de conocimiento", risk: "low", physical: false },
  { id: "ent-sharepoint", system: "SharePoint", name: "SharePoint", description: "Archivos compartidos y sitios de la intranet corporativa", risk: "low", physical: false },
  { id: "ent-jira", system: "Jira", name: "Jira", description: "Seguimiento de proyectos, sprints y tickets de cambio", risk: "low", physical: false },
  { id: "ent-movil-trabajo", system: "Dispositivo", name: "Móvil Trabajo", description: "Móvil corporativo gestionado con MDM y registro en la sede", risk: "low", physical: true },

  { id: "ent-vpn-general", system: "VPN", name: "VPN General", description: "VPN corporativa estándar de acceso remoto", risk: "medium", physical: false },
  { id: "ent-vpn-demo", system: "VPN", name: "VPN DEMO", description: "Túnel VPN remoto a los entornos DEMO de clientes", risk: "medium", physical: false },
  { id: "ent-vpn-lab", system: "VPN", name: "VPN Laboratorio", description: "Túnel VPN privilegiado a las redes del laboratorio de I+D", risk: "high", physical: false },
  { id: "ent-vpn-full", system: "VPN", name: "VPN Full", description: "Túnel VPN de administración sin restricciones a toda la red", risk: "high", physical: false },

  { id: "ent-firebase", system: "Firebase", name: "Firebase", description: "Consola de Firebase y control de la base de datos de producción", risk: "high", physical: false, duties: ["prod_data_admin"] },
  { id: "ent-azure", system: "Azure", name: "Azure", description: "Suscripciones de Azure, facturación y administración de IAM", risk: "high", physical: false, duties: ["cloud_iam_admin"] },
  { id: "ent-descodificador-demo", system: "Dispositivo", name: "Descodificador DEMO", description: "Descodificador DEMO para entornos de pruebas", risk: "high", physical: true },
];

// ---------------------------------------------------------------- groups (8)

const groups: Group[] = [
  { id: "g-all-staff", name: "Toda la plantilla", source: "Active Directory", entitlementIds: ["ent-confluence", "ent-sharepoint", "ent-vpn-general", "ent-movil-trabajo"] },

  { id: "g-fin-staff", name: "Jira de Finanzas", source: "SaaS", department: "Finanzas", entitlementIds: ["ent-jira"] },
  { id: "g-fin-firebase", name: "Firebase de Finanzas", source: "SaaS", department: "Finanzas", entitlementIds: ["ent-firebase"] },
  { id: "g-fin-cloud", name: "Azure de Finanzas", source: "SaaS", department: "Finanzas", entitlementIds: ["ent-azure"] },

  { id: "g-mkt-staff", name: "Marketing DEMO", source: "SaaS", department: "Marketing", entitlementIds: ["ent-vpn-demo"] },

  { id: "g-it-admins", name: "Administradores de TI", source: "Active Directory", department: "TI", entitlementIds: ["ent-azure", "ent-vpn-full", "ent-vpn-lab"] },
  { id: "g-demo-lab", name: "Descodificador DEMO", source: "Devices", entitlementIds: ["ent-descodificador-demo"] },

  { id: "g-eng-staff", name: "Plataforma de Ingeniería", source: "SaaS", department: "Ingeniería", entitlementIds: ["ent-jira", "ent-firebase", "ent-vpn-demo"] },
];

const departmentGroup: Partial<Record<Department, string>> = {
  Finanzas: "g-fin-staff",
  Marketing: "g-mkt-staff",
  Ingeniería: "g-eng-staff",
};

// ---------------------------------------------------------------- people (18)

type Seed = Omit<Person, "email" | "status" | "homeOffice"> & Partial<Pick<Person, "status" | "homeOffice">>;

const seeds: Seed[] = [
  // Department heads (4)
  { id: "p-001", name: "Isabel Moreno", department: "Finanzas", title: "Directora de Finanzas", startDate: "2018-02-01" },
  { id: "p-002", name: "Daniel Vega", department: "Marketing", title: "Director de Marketing", startDate: "2019-05-13" },
  { id: "p-003", name: "Raúl Castillo", department: "TI", title: "Responsable de TI", startDate: "2017-09-04" },
  { id: "p-004", name: "Sofía Romero", department: "Ingeniería", title: "VP de Ingeniería", startDate: "2020-01-07" },

  // Finance (3 reports)
  { id: "p-010", name: "Lucía Fernández", department: "Finanzas", title: "Analista de facturación", managerId: "p-001", startDate: "2021-04-12" },
  { id: "p-011", name: "Jorge Blanco", department: "Finanzas", title: "Analista de facturación", managerId: "p-001", startDate: "2022-09-05" },
  { id: "p-012", name: "Carmen Ortiz", department: "Finanzas", title: "Controller cloud", managerId: "p-001", startDate: "2019-11-18" },

  // Marketing (4 reports — Marta transferred from Finance; Carlos has impossible travel)
  { id: "p-020", name: "Marta Ruiz", department: "Marketing", title: "Brand manager", managerId: "p-002", startDate: "2020-06-01" },
  { id: "p-060", name: "Carlos Méndez", department: "Marketing", title: "Responsable de growth", managerId: "p-002", startDate: "2021-05-17" },
  { id: "p-021", name: "Hugo Delgado", department: "Marketing", title: "Responsable de contenidos", managerId: "p-002", startDate: "2021-08-23" },
  { id: "p-022", name: "Paula Serrano", department: "Marketing", title: "Especialista digital", managerId: "p-002", startDate: "2022-03-07" },

  // IT (4 reports — 2 active sysadmins + 2 leavers)
  { id: "p-030", name: "Javier Ortega", department: "TI", title: "Administrador de sistemas", managerId: "p-003", startDate: "2018-01-08", status: "left", endDate: "2026-09-30" },
  { id: "p-031", name: "Óscar Núñez", department: "TI", title: "Administrador de sistemas", managerId: "p-003", startDate: "2019-07-15" },
  { id: "p-032", name: "Beatriz León", department: "TI", title: "Administrador de sistemas", managerId: "p-003", startDate: "2021-02-01" },
  { id: "p-035", name: "Pablo Díaz", department: "TI", title: "Ingeniero de backup cloud", managerId: "p-003", startDate: "2017-03-01", status: "left", endDate: "2025-06-30" },

  // Engineering (3 reports — Elena + 3 active peers including VP Engineering)
  { id: "p-040", name: "Elena Navarro", department: "Ingeniería", title: "Ingeniera SRE", managerId: "p-004", startDate: "2021-11-08" },
  { id: "p-041", name: "David Torres", department: "Ingeniería", title: "Ingeniero backend", managerId: "p-004", startDate: "2020-04-20" },
  { id: "p-042", name: "Laura Jiménez", department: "Ingeniería", title: "Ingeniera frontend", managerId: "p-004", startDate: "2022-01-10" },
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
  homeOffice: s.homeOffice ?? "Sede de Madrid",
}));

// ---------------------------------------------------------------- service accounts (2)

const serviceAccounts: ServiceAccount[] = [
  { id: "svc-backup-legacy", name: "svc-backup-legacy", description: "Copia de seguridad nocturna de Azure por VPN Full", ownerId: "p-035", createdDate: "2019-04-02" },
  { id: "svc-ci-runner", name: "svc-ci-runner", description: "Ejecutor de CI para Firebase y Jira", ownerId: "p-040", createdDate: "2022-05-10" },
];

// ---------------------------------------------------------------- memberships

const memberships: Membership[] = [];
const grant = (principalId: string, groupId: string, grantedDate: string, ticketId?: string) =>
  memberships.push({ principalId, groupId, grantedDate, ...(ticketId ? { ticketId } : {}) });

// Baseline: everyone gets All staff (Confluence, SharePoint, VPN General, Móvil Trabajo) + department group.
// Properly offboarded leavers have no memberships (Pablo). Javier was not offboarded.
for (const p of people) {
  if (p.id === "p-035") continue; // Pablo Díaz: properly offboarded
  grant(p.id, "g-all-staff", p.startDate);
  const deptGroup = departmentGroup[p.department];
  if (deptGroup && p.id !== "p-020") grant(p.id, deptGroup, p.startDate);
}

// Finance roles
for (const id of ["p-010", "p-011"]) grant(id, "g-fin-firebase", people.find((p) => p.id === id)!.startDate);
grant("p-001", "g-fin-cloud", "2018-02-01");
grant("p-012", "g-fin-cloud", "2019-11-18");

// IT roles: sysadmins hold Azure + VPN Full + VPN Laboratorio + Descodificador DEMO.
for (const id of ["p-030", "p-031", "p-032"]) {
  const start = people.find((p) => p.id === id)!.startDate;
  grant(id, "g-it-admins", start);
  grant(id, "g-demo-lab", start);
}
grant("p-003", "g-demo-lab", "2017-09-04");

// Case 1 — Marta Ruiz: moved Finance → Marketing on 2026-03-02, kept Finance Jira & Finance Azure.
grant("p-020", "g-fin-staff", "2020-06-01");
grant("p-020", "g-fin-cloud", "2021-01-11", "TCK-2021-0007");
grant("p-020", "g-mkt-staff", "2026-03-02");

// Case 4 — Lucía Fernández: holds Firebase (normal) AND Azure (temporary cover expired).
grant("p-010", "g-fin-cloud", "2025-08-01", "TCK-2025-0318");

// Case 6 (decoy) — Elena Navarro: SRE with Descodificador DEMO access approved by CISO.
grant("p-040", "g-demo-lab", "2026-04-15", "TCK-2026-0412");

// Case 3 — svc-backup-legacy: Azure + VPN Full + VPN Laboratorio since 2019, owner left in 2025.
grant("svc-backup-legacy", "g-it-admins", "2019-04-02");
grant("svc-ci-runner", "g-eng-staff", "2022-05-10");

// ---------------------------------------------------------------- HR events

const hrEvents: HrEvent[] = [
  ...people.map((p) => ({ personId: p.id, date: p.startDate, type: "hire" as const, toDepartment: p.id === "p-020" ? ("Finanzas" as const) : p.department })),
  { personId: "p-020", date: "2026-03-02", type: "transfer", fromDepartment: "Finanzas", toDepartment: "Marketing", note: "Cambio interno: Controller cloud → Brand manager" },
  { personId: "p-035", date: "2025-06-30", type: "leave", fromDepartment: "TI", note: "Baja voluntaria" },
  { personId: "p-030", date: "2026-09-30", type: "leave", fromDepartment: "TI", note: "Baja voluntaria: se ha ido a la competencia" },
];

// ---------------------------------------------------------------- tickets

const tickets: AccessTicket[] = [
  {
    id: "TCK-2021-0007",
    principalId: "p-020",
    entitlementId: "ent-azure",
    requestedBy: "p-001",
    approvedBy: "p-001",
    justification: "Ascendida a Controller cloud: necesita administrar la facturación y las suscripciones de Azure.",
    approvedDate: "2021-01-11",
  },
  {
    id: "TCK-2025-0318",
    principalId: "p-010",
    entitlementId: "ent-azure",
    requestedBy: "p-001",
    approvedBy: "p-001",
    justification: "Temporal: cubrir la administración de Azure mientras Carmen Ortiz está de baja parental.",
    approvedDate: "2025-08-01",
    expiresDate: "2025-09-30",
  },
  {
    id: "TCK-2026-0412",
    principalId: "p-040",
    entitlementId: "ent-descodificador-demo",
    requestedBy: "p-004",
    approvedBy: "CISO (Gonzalo Martín)",
    justification: "Entra en la guardia de dispositivos DEMO; necesita un Descodificador DEMO para incidencias en directo.",
    approvedDate: "2026-04-15",
    expiresDate: "2027-03-31",
  },
];

// ---------------------------------------------------------------- physical device + VPN/cloud activity

const badgeEvents: BadgeEvent[] = [];
const loginEvents: LoginEvent[] = [];

const MADRID = { site: "la sede de Madrid", city: "Madrid", country: "España" };
const workdays = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"];

// Tiny deterministic PRNG so the noise is the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pad = (n: number) => String(n).padStart(2, "0");

for (const p of people.filter((x) => x.status === "active")) {
  for (const day of workdays) {
    if (rand() < 0.2) continue;
    if (p.id === "p-060" && day === "2026-11-24") continue; // Case 5 sets this morning explicitly
    const h = 8 + Math.floor(rand() * 2);
    const m = Math.floor(rand() * 60);
    badgeEvents.push({ personId: p.id, doorEntitlementId: "ent-movil-trabajo", time: `${day}T${pad(h)}:${pad(m)}:00+01:00`, ...MADRID, result: "granted" });
  }
  if (rand() < 0.5) {
    loginEvents.push({ principalId: p.id, system: "VPN General", time: `2026-11-2${Math.floor(rand() * 5)}T2${Math.floor(rand() * 2)}:${pad(Math.floor(rand() * 60))}:00+01:00`, city: "Madrid", country: "España", ip: `83.44.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}` });
  }
}

// Sysadmins and the decoy access Descodificador DEMO from time to time.
badgeEvents.push({ personId: "p-031", doorEntitlementId: "ent-descodificador-demo", time: "2026-11-19T11:05:00+01:00", ...MADRID, result: "granted" });
badgeEvents.push({ personId: "p-040", doorEntitlementId: "ent-descodificador-demo", time: "2026-11-21T03:12:00+01:00", ...MADRID, result: "granted" });

// Case 2 — Javier Ortega left on 2026-09-30, but his Móvil Trabajo & Descodificador DEMO were used at night.
badgeEvents.push({ personId: "p-030", doorEntitlementId: "ent-movil-trabajo", time: "2026-11-14T22:41:00+01:00", ...MADRID, result: "granted" });
badgeEvents.push({ personId: "p-030", doorEntitlementId: "ent-descodificador-demo", time: "2026-11-14T22:47:00+01:00", ...MADRID, result: "granted" });

// Case 3 — svc-backup-legacy still logs in over VPN Full / Azure from an unowned host.
loginEvents.push({ principalId: "svc-backup-legacy", system: "Azure", time: "2026-11-20T02:00:00+01:00", city: "Madrid", country: "España", ip: "10.20.4.17" });
loginEvents.push({ principalId: "svc-backup-legacy", system: "VPN Full", time: "2026-11-25T02:00:00+01:00", city: "Madrid", country: "España", ip: "10.20.4.17" });

// Case 5 — Carlos Méndez: Móvil Trabajo check-in in Madrid at 09:12, VPN General login from Lagos at 09:31.
badgeEvents.push({ personId: "p-060", doorEntitlementId: "ent-movil-trabajo", time: "2026-11-24T09:12:00+01:00", ...MADRID, result: "granted" });
loginEvents.push({ principalId: "p-060", system: "VPN General", time: "2026-11-24T09:31:00+01:00", city: "Lagos", country: "Nigeria", ip: "102.89.34.120" });

// ---------------------------------------------------------------- separation of duties

const sodRules: SodRule[] = [
  {
    id: "sod-firebase-azure",
    name: "Administración de Firebase + Azure",
    duties: ["prod_data_admin", "cloud_iam_admin"],
    why: "Una persona con control de Firebase en producción y administración de IAM en Azure podría alterar datos reales y ocultar los registros de auditoría de la nube.",
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
