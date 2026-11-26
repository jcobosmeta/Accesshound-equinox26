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
        { say: `Reviso el historial de RR. HH. de ${first} para confirmar el cambio de departamento.`, call: ["get_hr_history", { person_id: pid }] },
        { say: "Ahora compruebo qué servicios siguen ligados al puesto anterior.", call: ["list_access", { principal_id: pid }] },
        { say: `¿Alguno de los nuevos compañeros de ${first} tiene ${sensitive.entitlement.name}?`, call: ["compare_with_peers", { person_id: pid, entitlement_id: sensitive.entitlement.id }] },
        { say: "¿Hay algún ticket que todavía lo justifique?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: sensitive.entitlement.id }] },
      ]);
      return {
        decision: "revoke",
        headline: `${first} pasó a ${transfer.toDepartment} el ${transfer.date} y aún tiene acceso a ${sensitive.entitlement.name} de ${transfer.fromDepartment}.`,
        explanation: `${name} era Controller cloud en ${transfer.fromDepartment} y se trasladó a ${transfer.toDepartment} como ${repo.person(pid)!.title}. Nunca se le quitaron los grupos de ${transfer.fromDepartment}, así que ${first} sigue teniendo acceso a ${sensitive.entitlement.name} y a Jira de Finanzas. Nadie del equipo de ${transfer.toDepartment} tiene ${sensitive.entitlement.name}, y el ticket original solo cubría el antiguo puesto en Finanzas. Quitar esos grupos cierra el hueco sin tocar el acceso de ${first} a la VPN DEMO de Marketing.`,
        evidence: [
          `RR. HH.: traslado ${transfer.fromDepartment} → ${transfer.toDepartment} el ${transfer.date}.`,
          `Sigue en ${leftover.map((g) => repo.group(g)!.name).join(" y ")}.`,
          `0 de ${repo.activePeers(repo.person(pid)!).length} compañeros de ${transfer.toDepartment} tienen ${sensitive.entitlement.name}.`,
          `El ticket TCK-2021-0007 concedió ${sensitive.entitlement.name} para el puesto de Controller cloud, que ${first} ya no ocupa.`,
        ],
        actions: leftover.map((g) => ({ kind: "remove_from_group" as const, target: g, reason: `Pertenece al puesto anterior de ${first} en ${transfer.fromDepartment}.` })),
        confidence: "high",
      };
    }

    case "leaver_access": {
      const p = repo.person(pid)!;
      const after = repo.badgeEvents(pid, p.endDate);
      await run([
        { say: `Confirmo la situación laboral de ${first}.`, call: ["get_person", { person_id: pid }] },
        { say: "Listo todos los servicios y dispositivos que siguen activos.", call: ["list_access", { principal_id: pid }] },
        { say: `¿Se ha usado el Móvil Trabajo o el Descodificador de ${first} desde el ${p.endDate}?`, call: ["get_badge_events", { person_id: pid, since: p.endDate }] },
        { say: "¿Y algún inicio de sesión remoto por VPN o en Azure?", call: ["get_login_events", { principal_id: pid, since: p.endDate }] },
      ]);
      const deco = after.find((e) => e.doorEntitlementId === "ent-descodificador-demo");
      return {
        decision: "escalate",
        headline: deco
          ? `${first} causó baja el ${p.endDate}, pero el Descodificador se usó el ${deco.time.slice(0, 10)} a las ${deco.time.slice(11, 16)}.`
          : `${first} causó baja el ${p.endDate} y aún tiene Azure, VPN Full y Descodificador.`,
        explanation: `${name} causó baja el ${p.endDate}, pero nunca se cerraron sus accesos: la cuenta sigue teniendo Azure, VPN Full, VPN Laboratorio, Móvil Trabajo y Descodificador. ${deco ? `Esos dispositivos se usaron ${after.length} veces después de su salida, incluido el Descodificador a altas horas de la noche. ` : ""}Esto va más allá de una limpieza rutinaria y debe tratarse como un posible incidente de seguridad. Desactiva ya la cuenta y los dispositivos y abre un incidente.`,
        evidence: [
          `RR. HH.: baja el ${p.endDate}.`,
          "Sigue en Administradores de TI (Azure, VPN Full, VPN Laboratorio) y Descodificadores.",
          ...after.map((e) => `Registro de dispositivo permitido: ${repo.entitlement(e.doorEntitlementId)!.name} el ${e.time}.`),
        ],
        actions: [
          { kind: "disable_badge", target: pid, reason: "Los dispositivos (Descodificador / Móvil Trabajo) pertenecen a un ex empleado." },
          { kind: "disable_account", target: pid, reason: "La cuenta debió desactivarse al tramitar la baja." },
          { kind: "open_incident", target: pid, reason: "Se usó el Descodificador después de la fecha de baja." },
        ],
        confidence: "high",
      };
    }

    case "orphaned_service_account": {
      const sa = repo.serviceAccount(pid)!;
      const owner = repo.person(sa.ownerId)!;
      await run([
        { say: "Consulto la cuenta de servicio y su propietario.", call: ["get_service_account", { account_id: pid }] },
        { say: "Compruebo a qué servicios tiene acceso.", call: ["list_access", { principal_id: pid }] },
        { say: "Reviso los inicios de sesión recientes en Azure y VPN Full.", call: ["get_login_events", { principal_id: pid }] },
      ]);
      const logins = repo.loginEvents(pid);
      return {
        decision: "revoke",
        headline: `${sa.name} tiene Azure, VPN Full y VPN Laboratorio sin propietario desde que ${owner.name} causó baja el ${owner.endDate}.`,
        explanation: `Esta cuenta ejecuta «${sa.description}». Su propietario causó baja el ${owner.endDate} y nadie se hace responsable de ella, pero sigue teniendo Azure, VPN Full y VPN Laboratorio y sigue autenticándose de noche desde ${logins.at(-1)?.ip}. Una cuenta privilegiada sin propietario es un objetivo ideal para un atacante. Quítala ya de Administradores de TI y pide a TI que confirme si el proceso sigue haciendo falta.`,
        evidence: [
          `Su propietario, ${owner.name}, causó baja el ${owner.endDate}.`,
          `Miembro de Administradores de TI (Azure, VPN Full, VPN Laboratorio) desde el ${sa.createdDate}.`,
          ...logins.map((l) => `Inicio de sesión: ${l.system} el ${l.time} desde ${l.ip}.`),
        ],
        actions: [{ kind: "remove_from_group", target: "g-it-admins", reason: "Sin propietario activo; los permisos de Azure y VPN Full no están justificados." }],
        confidence: "high",
      };
    }

    case "toxic_combination": {
      await run([
        { say: `Compruebo cómo consiguió ${first} acceso a Firebase y a Azure a la vez.`, call: ["list_access", { principal_id: pid }] },
        { say: "¿Hay un ticket válido para el acceso a Azure?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: "ent-azure" }] },
        { say: "¿Quién más en Finanzas tiene acceso a Azure?", call: ["compare_with_peers", { person_id: pid, entitlement_id: "ent-azure" }] },
      ]);
      const ticket = repo.ticketsFor(pid, "ent-azure")[0];
      return {
        decision: "revoke",
        headline: `${first} tiene acceso de administración a Firebase y a Azure: la cobertura temporal caducó el ${ticket?.expiresDate}.`,
        explanation: `${name} es analista de facturación y usa Firebase en su trabajo. El acceso a Azure se añadió el ${ticket?.approvedDate} para cubrir la baja de una compañera y debía terminar el ${ticket?.expiresDate}, pero nunca se revocó. Tener Firebase y Azure a la vez incumple la segregación de funciones. Quita Azure de Finanzas y mantén el acceso habitual de ${first} a Firebase.`,
        evidence: [
          "Firebase a través de Firebase de Finanzas (normal para su puesto).",
          `Azure a través de Azure de Finanzas desde el ${ticket?.approvedDate}.`,
          `Ticket ${ticket?.id}: «${ticket?.justification}». Caducó el ${ticket?.expiresDate}.`,
        ],
        actions: [{ kind: "remove_from_group", target: "g-fin-cloud", reason: "La cobertura temporal de Azure ha caducado; incumple la segregación de funciones con Firebase." }],
        confidence: "high",
      };
    }

    case "impossible_travel": {
      const login = repo.loginEvents(pid).find((l) => l.country !== "España")!;
      await run([
        { say: `Reviso los registros del Móvil Trabajo de ${first} de esa mañana.`, call: ["get_badge_events", { person_id: pid, since: login.time.slice(0, 10) }] },
        { say: "Reviso los inicios de sesión en VPN General a la misma hora.", call: ["get_login_events", { principal_id: pid, since: login.time.slice(0, 10) }] },
        { say: `¿Consta algún viaje de ${first}?`, call: ["get_person", { person_id: pid }] },
      ]);
      const gap = (t: string) => Math.abs(Date.parse(t) - Date.parse(login.time));
      const badge = repo.badgeEvents(pid, login.time.slice(0, 10)).sort((a, b) => gap(a.time) - gap(b.time))[0]!;
      return {
        decision: "escalate",
        headline: `El Móvil Trabajo de ${first} se registró en la sede de Madrid a las ${badge.time.slice(11, 16)}, mientras ${login.system} abría sesión desde ${login.city} a las ${login.time.slice(11, 16)}.`,
        explanation: `El Móvil Trabajo corporativo de ${first} se registró en la sede de Madrid y 19 minutos después se abrió una sesión de ${login.system} desde ${login.city}, ${login.country}. Una persona no puede estar en los dos sitios, así que apunta a credenciales de VPN comprometidas más que a un error de permisos. Restablece ya las credenciales y abre un incidente de seguridad.`,
        evidence: [`Móvil Trabajo: ${badge.time} en ${badge.site}.`, `${login.system}: ${login.time} desde ${login.city}, ${login.country} (IP ${login.ip}).`, "No consta ningún viaje; su oficina es la sede de Madrid."],
        actions: [
          { kind: "reset_credentials", target: pid, reason: "Credenciales de VPN General probablemente comprometidas." },
          { kind: "open_incident", target: pid, reason: "Viaje imposible entre el registro del Móvil Trabajo en Madrid y el inicio de sesión en VPN General desde Lagos." },
        ],
        confidence: "medium",
      };
    }

    case "peer_outlier": {
      const ent = f.entitlementIds[0]!;
      await run([
        { say: `${first} tiene un acceso que no tiene ningún compañero de Ingeniería. Compruebo por qué.`, call: ["list_access", { principal_id: pid }] },
        { call: ["compare_with_peers", { person_id: pid, entitlement_id: ent }] },
        { say: "¿Hay un ticket aprobado?", call: ["get_access_tickets", { principal_id: pid, entitlement_id: ent }] },
        { say: "¿Se ha usado de verdad el Descodificador últimamente?", call: ["get_badge_events", { person_id: pid, since: "2026-11-01" }] },
      ]);
      const t = repo.ticketsFor(pid, ent)[0];
      const valid = t && (!t.expiresDate || t.expiresDate >= repo.c.asOf);
      const e = repo.entitlement(ent)!;
      if (valid) {
        return {
          decision: "keep",
          headline: `El acceso de ${first} a ${e.name} es poco habitual en ${repo.person(pid)!.department}, pero está aprobado hasta el ${t.expiresDate}.`,
          explanation: `Ningún compañero de Ingeniería de ${first} tiene ${e.name}, y por eso se ha señalado. Sin embargo, el ticket ${t.id} muestra que lo pidió ${repo.principalName(t.requestedBy)} y lo aprobó ${t.approvedBy} por este motivo: «${t.justification}» La aprobación es válida hasta el ${t.expiresDate} y el uso reciente durante las guardias encaja con el turno. Mantenlo y revísalo cuando caduque el ticket.`,
          evidence: [`Ticket ${t.id}: aprobado por ${t.approvedBy} el ${t.approvedDate}, caduca el ${t.expiresDate}.`, `Justificación: ${t.justification}`],
          actions: [],
          confidence: "high",
        };
      }
      return {
        decision: "revoke",
        headline: `${first} tiene acceso a ${e.name}, que no tiene nadie más del equipo, sin una aprobación válida.`,
        explanation: "Ningún compañero lo tiene y no hay ningún ticket vigente que lo cubra.",
        evidence: f.facts,
        actions: groupsFor((a) => a.entitlement.id === ent).map((g) => ({ kind: "remove_from_group" as const, target: g, reason: "Acceso anómalo sin justificar." })),
        confidence: "medium",
      };
    }
  }
}
