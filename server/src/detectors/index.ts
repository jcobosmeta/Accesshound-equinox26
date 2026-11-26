// Deterministic detectors. They decide WHAT looks wrong; the agent decides
// WHY and what to do about it. Keeping detection rule-based means the demo
// never "misses" a planted case, and the AI is only ever explaining facts.

import type { Repo } from "../data/repo.js";
import type { Risk } from "../data/types.js";

export type FindingType =
  | "leaver_access"
  | "orphaned_service_account"
  | "role_change_leftover"
  | "toxic_combination"
  | "impossible_travel"
  | "peer_outlier";

export interface Finding {
  id: string;
  type: FindingType;
  severity: Risk;
  principalId: string;
  principalName: string;
  principalKind: "person" | "service";
  title: string;
  /** Short, rule-generated facts. The agent verifies and expands on these. */
  facts: string[];
  entitlementIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function detect(repo: Repo): Finding[] {
  const { c } = repo;
  const findings: Finding[] = [];
  const covered = new Set<string>(); // `${principalId}|${entitlementId}` already explained by a more specific finding
  const cover = (principalId: string, ids: string[]) => ids.forEach((id) => covered.add(`${principalId}|${id}`));

  const push = (f: Omit<Finding, "id" | "principalName" | "principalKind">) => {
    findings.push({
      ...f,
      // Stable across re-detection, so a finding keeps its id after other access changes.
      id: `${f.type}:${f.principalId}${f.type === "peer_outlier" ? `:${f.entitlementIds[0]}` : ""}`,
      principalName: repo.principalName(f.principalId),
      principalKind: repo.principalKind(f.principalId)!,
    });
  };

  // 1. Leavers who still have access ------------------------------------------
  for (const p of c.people.filter((x) => x.status === "left")) {
    const access = repo.accessOf(p.id);
    if (access.length === 0) continue;
    const afterLeaving = repo.badgeEvents(p.id, p.endDate).filter((e) => e.result === "granted");
    const ids = [...new Set(access.map((a) => a.entitlement.id))];
    const highRisk = access.filter((a) => a.entitlement.risk === "high").map((a) => a.entitlement.name);
    push({
      type: "leaver_access",
      severity: "high",
      principalId: p.id,
      title: `${p.name} causó baja el ${p.endDate} pero aún tiene ${ids.length} permisos activos`,
      facts: [
        `Dejó la empresa el ${p.endDate}.`,
        `Aún tiene: ${[...new Set(highRisk)].join(", ") || "solo accesos de riesgo bajo"}.`,
        ...(afterLeaving.length ? [`${afterLeaving.length} registros de dispositivo permitidos después de la baja; el último, ${afterLeaving.at(-1)!.time}.`] : []),
      ],
      entitlementIds: ids,
    });
    cover(p.id, ids);
  }

  // 2. Service accounts whose owner is gone -----------------------------------
  for (const s of c.serviceAccounts) {
    const owner = repo.person(s.ownerId);
    if (owner && owner.status === "active") continue;
    const access = repo.accessOf(s.id);
    const ids = [...new Set(access.map((a) => a.entitlement.id))];
    const last = repo.loginEvents(s.id).at(-1);
    push({
      type: "orphaned_service_account",
      severity: access.some((a) => a.entitlement.risk === "high") ? "high" : "medium",
      principalId: s.id,
      title: `${s.name} no tiene propietario activo pero aún tiene ${access.map((a) => a.entitlement.name).join(", ")}`,
      facts: [
        owner ? `Su propietario, ${owner.name}, causó baja el ${owner.endDate}.` : `El propietario ${s.ownerId} no existe.`,
        ...(last ? [`Último inicio de sesión: ${last.time} desde ${last.ip}.`] : ["No hay inicios de sesión registrados."]),
      ],
      entitlementIds: ids,
    });
    cover(s.id, ids);
  }

  // 3. Access left over from a previous department ----------------------------
  for (const e of c.hrEvents.filter((x) => x.type === "transfer")) {
    const p = repo.person(e.personId);
    if (!p || p.status !== "active") continue;
    const leftovers = repo
      .membershipsOf(p.id)
      .map((m) => ({ m, g: repo.group(m.groupId)! }))
      .filter(({ m, g }) => g.department === e.fromDepartment && g.department !== p.department && m.grantedDate < e.date);
    if (leftovers.length === 0) continue;
    const ents = leftovers.flatMap(({ g }) => g.entitlementIds.map((id) => repo.entitlement(id)!));
    const ids = ents.map((x) => x.id);
    const days = Math.round((Date.parse(c.asOf) - Date.parse(e.date)) / DAY_MS);
    push({
      type: "role_change_leftover",
      severity: ents.some((x) => x.risk === "high") ? "high" : "medium",
      principalId: p.id,
      title: `${p.name} pasó de ${e.fromDepartment} a ${e.toDepartment} y conservó los accesos de ${e.fromDepartment}`,
      facts: [
        `Traslado ${e.fromDepartment} → ${e.toDepartment} el ${e.date} (hace ${days} días).`,
        `Sigue en: ${leftovers.map(({ g }) => g.name).join(", ")}.`,
        `Permisos que le sobran: ${ents.map((x) => (x.system === x.name ? x.name : `${x.system}: ${x.name}`)).join(", ")}.`,
      ],
      entitlementIds: ids,
    });
    cover(p.id, ids);
  }

  // 4. Separation-of-duties violations ----------------------------------------
  for (const rule of c.sodRules) {
    const principals = [...c.people.filter((p) => p.status === "active").map((p) => p.id), ...c.serviceAccounts.map((s) => s.id)];
    for (const pid of principals) {
      const access = repo.accessOf(pid);
      const [a, b] = rule.duties.map((d) => access.find((x) => x.entitlement.duties?.includes(d)));
      if (!a || !b) continue;
      if (covered.has(`${pid}|${a.entitlement.id}`) || covered.has(`${pid}|${b.entitlement.id}`)) continue;
      push({
        type: "toxic_combination",
        severity: "high",
        principalId: pid,
        title: `${repo.principalName(pid)} tiene a la vez ${a.entitlement.name} y ${b.entitlement.name}`,
        facts: [`Incumple la regla «${rule.name}»: ${rule.why}`, `${a.entitlement.name} a través de ${a.group.name}; ${b.entitlement.name} a través de ${b.group.name}.`],
        entitlementIds: [a.entitlement.id, b.entitlement.id],
      });
      cover(pid, [a.entitlement.id, b.entitlement.id]);
    }
  }

  // 5. Impossible travel: badge in one country, login from another ------------
  const WINDOW_MS = 2 * 60 * 60 * 1000;
  for (const p of c.people.filter((x) => x.status === "active")) {
    const badges = repo.badgeEvents(p.id).filter((e) => e.result === "granted");
    for (const login of repo.loginEvents(p.id)) {
      const t = Date.parse(login.time);
      const gap = (b: (typeof badges)[number]) => Math.abs(Date.parse(b.time) - t);
      const clash = badges
        .filter((b) => b.country !== login.country && gap(b) <= WINDOW_MS)
        .sort((x, y) => gap(x) - gap(y))[0];
      if (!clash) continue;
      const minutes = Math.round(Math.abs(Date.parse(clash.time) - t) / 60000);
      push({
        type: "impossible_travel",
        severity: "high",
        principalId: p.id,
        title: `El dispositivo de ${p.name} se registró en ${clash.site} y hubo un inicio de sesión en ${login.system} desde ${login.city} con ${minutes} minutos de diferencia`,
        facts: [
          `Dispositivo: ${clash.time} en ${clash.site} (${clash.city}, ${clash.country}).`,
          `Inicio de sesión en ${login.system}: ${login.time} desde ${login.city}, ${login.country} (IP ${login.ip}).`,
        ],
        entitlementIds: ["ent-vpn-general"],
      });
      break;
    }
  }

  // 6. High-risk access none of your peers have -------------------------------
  for (const p of c.people.filter((x) => x.status === "active")) {
    const peers = repo.activePeers(p);
    if (peers.length < 2) continue;
    const seen = new Set<string>();
    for (const a of repo.accessOf(p.id)) {
      const ent = a.entitlement;
      if (ent.risk !== "high" || seen.has(ent.id) || covered.has(`${p.id}|${ent.id}`)) continue;
      // Access through your own department's role groups is expected (e.g. Finance payment approvers).
      if (a.group.department === p.department) continue;
      seen.add(ent.id);
      const holders = peers.filter((peer) => repo.holds(peer.id, ent.id)).length;
      if (holders / peers.length >= 0.25) continue;
      push({
        type: "peer_outlier",
        severity: "medium",
        principalId: p.id,
        title: `${p.name} tiene ${ent.name}, que ${holders === 0 ? "no tiene ninguno" : `solo tienen ${holders}`} de sus ${peers.length} compañeros de ${p.department}`,
        facts: [`${holders}/${peers.length} compañeros activos de ${p.department} tienen ${ent.name}.`, `Concedido a través de ${a.group.name} el ${a.membership.grantedDate}.`],
        entitlementIds: [ent.id],
      });
    }
  }

  return findings;
}
