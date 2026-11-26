// The demo company: "FCYBERL", 23 members of the Future Cybersecurity Lab team
// (real GitHub names and photos, fictional roles) + Maricruz + 1 service account,
// 11 groups, strictly using the configured services:
//   Firebase, Confluence, SharePoint, Jira,
//   VPN (General, DEMO, Laboratorio, Full),
//   Azure, Móvil Trabajo, Descodificador DEMO.
//
// Org chart: Iván (Ingeniería: 7 reports), José Miguel (IA: 2 reports), Pablo (Innovación: 5 reports,
// with Diego under Jose Torres and David under Sergio de los Santos) and Maricruz (TI: Sergio Jaramillo,
// Felipe, Patricia, Gonzalo). The four heads hang from the company.
//
// Four planted cases (all fictional; titles are deliberately gender-neutral):
//   1. Patricia Román    — moved Marketing → Diseño in March, still holds Marketing Firebase & VPN DEMO access
//   2. Daniel Nieto      — toxic combination: holds both Firebase AND Azure (expired "temporary" cover)
//   3. Carlos Nieto      — Móvil Trabajo check-in in Madrid while VPN General logs in from Lagos, 19 minutes apart
//   4. Marcos Barba      — DECOY: Descodificador DEMO access none of the IA peers have, backed by a
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

// ---------------------------------------------------------------- groups (11)

const groups: Group[] = [
  { id: "g-all-staff", name: "Toda la plantilla", source: "Active Directory", entitlementIds: ["ent-confluence", "ent-sharepoint", "ent-vpn-general", "ent-movil-trabajo"] },

  { id: "g-inn-staff", name: "Jira de Innovación", source: "SaaS", department: "Innovación", entitlementIds: ["ent-jira"] },
  { id: "g-inn-firebase", name: "Firebase de Innovación", source: "SaaS", department: "Innovación", entitlementIds: ["ent-firebase"] },
  { id: "g-inn-cloud", name: "Azure de Innovación", source: "SaaS", department: "Innovación", entitlementIds: ["ent-azure"] },

  { id: "g-ai-staff", name: "Plataforma de IA", source: "SaaS", department: "IA", entitlementIds: ["ent-jira", "ent-vpn-demo"] },

  { id: "g-mkt-staff", name: "Marketing DEMO", source: "SaaS", department: "Marketing", entitlementIds: ["ent-vpn-demo"] },
  { id: "g-mkt-firebase", name: "Firebase de Marketing", source: "SaaS", department: "Marketing", entitlementIds: ["ent-firebase"] },

  { id: "g-it-admins", name: "Administradores de TI", source: "Active Directory", department: "TI", entitlementIds: ["ent-azure", "ent-vpn-full", "ent-vpn-lab"] },
  { id: "g-demo-lab", name: "Descodificador DEMO", source: "Devices", entitlementIds: ["ent-descodificador-demo"] },

  { id: "g-eng-staff", name: "Plataforma de Ingeniería", source: "SaaS", department: "Ingeniería", entitlementIds: ["ent-jira", "ent-firebase", "ent-vpn-demo"] },
  { id: "g-eng-cloud", name: "Azure de Ingeniería", source: "SaaS", department: "Ingeniería", entitlementIds: ["ent-azure"] },
];

const departmentGroup: Partial<Record<Department, string>> = {
  Innovación: "g-inn-staff",
  IA: "g-ai-staff",
  Marketing: "g-mkt-staff",
  Ingeniería: "g-eng-staff",
};

// ---------------------------------------------------------------- people (24)

// `gh` is the person's public GitHub login: it gives the photo and a reserved-domain email.
// Roles, departments and dates are invented. People without `gh` are fictional.
type Seed = Omit<Person, "email" | "status" | "homeOffice" | "avatarUrl"> & Partial<Pick<Person, "status" | "homeOffice">> & { gh?: string };

const seeds: Seed[] = [
  // Heads (3) — Ingeniería, IA and Innovación
  { id: "p-001", gh: "ivmos", name: "Iván Mosquera Paulo", department: "Ingeniería", title: "Responsable de Ingeniería", startDate: "2018-02-01" },
  { id: "p-002", gh: "josemih-tef", name: "José Miguel Hernández Izquierdo", department: "IA", title: "Responsable de IA", startDate: "2019-05-13" },
  { id: "p-003", gh: "pablogonzalezperez", name: "Pablo González", department: "Innovación", title: "Responsable de Innovación", startDate: "2017-09-04" },

  // Ingeniería (7 reports of Iván)
  { id: "p-010", gh: "dnieto-r", name: "Daniel Nieto Rodríguez", department: "Ingeniería", title: "Ingeniería de plataforma", managerId: "p-001", startDate: "2021-02-01" },
  { id: "p-011", gh: "jcobosmeta", name: "Javier Cobos del Álamo", department: "Ingeniería", title: "Ingeniería frontend", managerId: "p-001", startDate: "2022-01-10" },
  { id: "p-040", gh: "fkyros", name: "Gabriel de Oliveira Trindade", department: "Ingeniería", title: "SRE", managerId: "p-001", startDate: "2021-11-08" },
  { id: "p-012", gh: "chebasic", name: "Carlos J. García Santos", department: "Ingeniería", title: "Ingeniería backend", managerId: "p-001", startDate: "2020-10-19" },
  { id: "p-060", gh: "cnietoc", name: "Carlos Nieto", department: "Ingeniería", title: "Ingeniería de seguridad", managerId: "p-001", startDate: "2021-05-17" },
  { id: "p-013", gh: "franjjs1975", name: "Francisco Javier Juan Sánchez", department: "Ingeniería", title: "Ingeniería de datos", managerId: "p-001", startDate: "2019-03-11" },
  { id: "p-014", gh: "selenaschz", name: "Selena Sánchez de Vicente", department: "Ingeniería", title: "Ingeniería de calidad", managerId: "p-001", startDate: "2022-09-05" },

  // IA (2 reports of José Miguel)
  { id: "p-020", gh: "marcos-barba-tid", name: "Marcos Barba Ballarín", department: "IA", title: "Ingeniería de ML", managerId: "p-002", startDate: "2023-06-05" },
  { id: "p-021", gh: "inigosenciso-code", name: "Iñigo Sánchez Enciso", department: "IA", title: "Ingeniería de IA", managerId: "p-002", startDate: "2023-09-11" },

  // Innovación (5 reports of Pablo; Diego reports to Jose, David to Sergio de los Santos)
  { id: "p-030", gh: "0VictoriaRubio", name: "Victoria Rubio Muñoz", department: "Innovación", title: "Controller cloud", managerId: "p-003", startDate: "2019-11-18" },
  { id: "p-031", gh: "lauralacarraarcos", name: "Laura Lacarra Arcos", department: "Innovación", title: "Analista de facturación", managerId: "p-003", startDate: "2021-04-12" },
  { id: "p-032", gh: "fjramirezvicente", name: "Francisco José Ramírez Vicente", department: "Innovación", title: "Analista de innovación", managerId: "p-003", startDate: "2022-05-23" },
  { id: "p-033", gh: "Torvel", name: "Jose Torres Velasco", department: "Innovación", title: "Líder de laboratorio", managerId: "p-003", startDate: "2020-04-20" },
  { id: "p-034", gh: "ssantosv", name: "Sergio de los Santos", department: "Innovación", title: "Líder de cloud", managerId: "p-003", startDate: "2018-06-01" },
  { id: "p-035", gh: "DiegoFeSa", name: "Diego Fernández Santos", department: "Innovación", title: "Ingeniería de laboratorio", managerId: "p-033", startDate: "2022-10-03" },
  { id: "p-036", gh: "d31b1t", name: "David García Núñez", department: "Innovación", title: "Ingeniería cloud", managerId: "p-034", startDate: "2024-01-15" },

  // TI: Maricruz heads it; her team is Sergio Jaramillo, Felipe, Patricia (transferred Marketing → Diseño) and Gonzalo.
  { id: "p-050", gh: "sjaram93", name: "Sergio Jaramillo", department: "TI", title: "Administración de sistemas", managerId: "p-051", startDate: "2019-07-15" },
  { id: "p-051", name: "Maricruz", department: "TI", title: "Responsable de TI", startDate: "2021-03-08" },
  { id: "p-052", gh: "felipesotoca", name: "Felipe Sotoca Barroso", department: "Marketing", title: "Responsable de contenidos", managerId: "p-051", startDate: "2021-08-23" },
  { id: "p-053", gh: "PatriRoman", name: "Patricia Román Castro", department: "Diseño", title: "Diseño de marca", managerId: "p-051", startDate: "2020-06-01" },
  { id: "p-054", gh: "gonsalcedo", name: "Gonzalo Salcedo", department: "Diseño", title: "Diseño de producto", managerId: "p-051", startDate: "2023-02-13" },
];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const people: Person[] = seeds.map(({ gh, ...s }) => ({
  ...s,
  email: `${gh?.toLowerCase() ?? plain(s.name).replace(/\s+/g, ".")}@telefonica.example`,
  ...(gh ? { avatarUrl: `https://github.com/${gh}.png?size=96` } : {}),
  status: s.status ?? "active",
  homeOffice: s.homeOffice ?? "Sede de Madrid",
}));

// ---------------------------------------------------------------- service accounts (1)

const serviceAccounts: ServiceAccount[] = [
  { id: "svc-ci-runner", name: "svc-ci-runner", description: "Ejecutor de CI para Firebase y Jira", ownerId: "p-040", createdDate: "2022-05-10" },
];

// ---------------------------------------------------------------- memberships

const memberships: Membership[] = [];
const grant = (principalId: string, groupId: string, grantedDate: string, ticketId?: string) =>
  memberships.push({ principalId, groupId, grantedDate, ...(ticketId ? { ticketId } : {}) });

// Baseline: everyone gets All staff (Confluence, SharePoint, VPN General, Móvil Trabajo) + department group.
for (const p of people) {
  grant(p.id, "g-all-staff", p.startDate);
  const deptGroup = departmentGroup[p.department];
  if (deptGroup) grant(p.id, deptGroup, p.startDate);
}

// Innovación roles: Laura and Francisco José use Firebase; Sergio de los Santos and Victoria administer Azure.
for (const id of ["p-031", "p-032"]) grant(id, "g-inn-firebase", people.find((p) => p.id === id)!.startDate);
grant("p-034", "g-inn-cloud", "2018-06-01");
grant("p-030", "g-inn-cloud", "2019-11-18");

// IT roles: sysadmins hold Azure + VPN Full + VPN Laboratorio + Descodificador DEMO.
for (const id of ["p-050", "p-051"]) {
  const start = people.find((p) => p.id === id)!.startDate;
  grant(id, "g-it-admins", start);
  grant(id, "g-demo-lab", start);
}

// Case 1 — Patricia Román: moved Marketing → Diseño on 2026-03-02, kept Marketing VPN DEMO & Marketing Firebase.
grant("p-053", "g-mkt-staff", "2020-06-01");
grant("p-053", "g-mkt-firebase", "2021-01-11", "TCK-2021-0007");

// Case 2 — Daniel Nieto: holds Firebase (via Plataforma de Ingeniería) AND Azure (temporary cover expired).
grant("p-010", "g-eng-cloud", "2025-08-01", "TCK-2025-0318");

// Case 4 (decoy) — Marcos Barba: IA engineer with Descodificador DEMO access approved by CISO.
grant("p-020", "g-demo-lab", "2026-04-15", "TCK-2026-0412");

grant("svc-ci-runner", "g-eng-staff", "2022-05-10");

// ---------------------------------------------------------------- HR events

const hrEvents: HrEvent[] = [
  ...people.map((p) => ({ personId: p.id, date: p.startDate, type: "hire" as const, toDepartment: p.id === "p-053" ? ("Marketing" as const) : p.department })),
  { personId: "p-053", date: "2026-03-02", type: "transfer", fromDepartment: "Marketing", toDepartment: "Diseño", note: "Cambio interno: Brand manager → Diseño de marca" },
];

// ---------------------------------------------------------------- tickets

const tickets: AccessTicket[] = [
  {
    id: "TCK-2021-0007",
    principalId: "p-053",
    entitlementId: "ent-firebase",
    requestedBy: "p-051",
    approvedBy: "p-051",
    justification: "Analítica de campañas: necesita Firebase para medir las conversiones de Marketing.",
    approvedDate: "2021-01-11",
  },
  {
    id: "TCK-2025-0318",
    principalId: "p-010",
    entitlementId: "ent-azure",
    requestedBy: "p-001",
    approvedBy: "p-001",
    justification: "Temporal: cubrir la administración de Azure de Ingeniería mientras la persona responsable está ausente durante un periodo prolongado.",
    approvedDate: "2025-08-01",
    expiresDate: "2025-09-30",
  },
  {
    id: "TCK-2026-0412",
    principalId: "p-020",
    entitlementId: "ent-descodificador-demo",
    requestedBy: "p-002",
    approvedBy: "CISO",
    justification: "Participa en las pruebas de modelos sobre dispositivos DEMO; necesita un Descodificador DEMO para validar en directo.",
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
    if (p.id === "p-060" && day === "2026-11-24") continue; // Case 3 sets this morning explicitly
    const h = 8 + Math.floor(rand() * 2);
    const m = Math.floor(rand() * 60);
    badgeEvents.push({ personId: p.id, doorEntitlementId: "ent-movil-trabajo", time: `${day}T${pad(h)}:${pad(m)}:00+01:00`, ...MADRID, result: "granted" });
  }
  if (rand() < 0.5) {
    loginEvents.push({ principalId: p.id, system: "VPN General", time: `2026-11-2${Math.floor(rand() * 5)}T2${Math.floor(rand() * 2)}:${pad(Math.floor(rand() * 60))}:00+01:00`, city: "Madrid", country: "España", ip: `83.44.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}` });
  }
}

// Sysadmins and the decoy access Descodificador DEMO from time to time.
badgeEvents.push({ personId: "p-050", doorEntitlementId: "ent-descodificador-demo", time: "2026-11-19T11:05:00+01:00", ...MADRID, result: "granted" });
badgeEvents.push({ personId: "p-020", doorEntitlementId: "ent-descodificador-demo", time: "2026-11-21T03:12:00+01:00", ...MADRID, result: "granted" });

// Case 3 — Carlos Nieto: Móvil Trabajo check-in in Madrid at 09:12, VPN General login from Lagos at 09:31.
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
  name: "FCYBERL",
  displayRisk: 12,
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
