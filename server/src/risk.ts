// Computes deterministic 0–100% risk scores and builds the interconnected
// organization + access graph from the live Company snapshot and findings.

import type { Repo } from "./data/repo.js";
import type { Risk } from "./data/types.js";
import type { FindingView } from "./store.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFactor {
  label: string;
  points: number;
  severity: Risk;
}

export interface PrincipalRisk {
  score: number; // 0..100
  level: RiskLevel;
  factors: RiskFactor[];
}

export interface GraphNode {
  id: string;
  kind: "org" | "person" | "service";
  name: string;
  avatarUrl?: string;
  subtitle: string;
  department: string;
  status: "active" | "left" | "service" | "org";
  managerId?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  entitlementCount: number;
  highRiskEntitlementCount: number;
  findingIds: string[];
  topFindingSeverity?: Risk;
  topFindingStatus?: FindingView["status"];
}

export type GraphEdgeKind =
  | "hierarchy"
  | "owns"
  | "cross_dept_access"
  | "shared_privilege"
  | "ticket_approval"
  | "peer_mesh";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  label?: string;
  risk?: Risk;
  dashed?: boolean;
}

export interface OrgGraph {
  company: string;
  asOf: string;
  avgRisk: number;
  maxRisk: number;
  atRiskCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const ORG_ROOT_ID = "org-root";

export function riskLevelFor(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

const severityRank: Record<Risk, number> = { high: 3, medium: 2, low: 1 };

/** Compute a transparent 0–100% risk score for any person or service account. */
export function computePrincipalRisk(repo: Repo, principalId: string, allFindings: FindingView[]): PrincipalRisk {
  const factors: RiskFactor[] = [];
  const kind = repo.principalKind(principalId);
  const person = kind === "person" ? repo.person(principalId) : undefined;
  const service = kind === "service" ? repo.serviceAccount(principalId) : undefined;

  const access = repo.accessOf(principalId);
  const uniqueEnts = new Map(access.map((a) => [a.entitlement.id, a.entitlement]));
  const ents = [...uniqueEnts.values()];

  const highEnts = ents.filter((e) => e.risk === "high");
  const medEnts = ents.filter((e) => e.risk === "medium");
  const lowEnts = ents.filter((e) => e.risk === "low");

  if (highEnts.length > 0) {
    const pts = Math.min(30, highEnts.length * 11);
    factors.push({
      label: `${highEnts.length} ${highEnts.length > 1 ? "permisos" : "permiso"} de riesgo alto (${highEnts.map((e) => e.name).join(", ")})`,
      points: pts,
      severity: highEnts.length >= 2 ? "high" : "medium",
    });
  }
  if (medEnts.length > 0) {
    const pts = Math.min(12, medEnts.length * 4);
    factors.push({
      label: `${medEnts.length} ${medEnts.length > 1 ? "permisos" : "permiso"} de riesgo medio`,
      points: pts,
      severity: "low",
    });
  }
  if (lowEnts.length > 0) {
    const pts = Math.min(5, lowEnts.length);
    factors.push({
      label: `${lowEnts.length} ${lowEnts.length > 1 ? "permisos básicos" : "permiso básico"}`,
      points: pts,
      severity: "low",
    });
  }

  // Holding both high-risk devices and high-risk cloud/VPN admin rights widens blast radius.
  if (highEnts.some((e) => e.physical) && highEnts.some((e) => !e.physical)) {
    factors.push({
      label: "Privilegios altos combinados en dispositivos y en la nube",
      points: 3,
      severity: "medium",
    });
  }

  if (person) {
    const isManager = repo.c.people.some((p) => p.managerId === person.id);
    if (isManager && person.status === "active") {
      factors.push({ label: "Jefe de departamento / capacidad de aprobación", points: 3, severity: "low" });
    }

    const owned = repo.c.serviceAccounts.filter((s) => s.ownerId === person.id);
    if (owned.length > 0) {
      if (person.status === "left") {
        const orphanedHigh = owned.some((s) => repo.accessOf(s.id).some((a) => a.entitlement.risk === "high"));
        factors.push({
          label: `Aún figura como propietario de ${owned.map((s) => s.name).join(", ")}`,
          points: orphanedHigh ? 14 : 4,
          severity: orphanedHigh ? "medium" : "low",
        });
      } else {
        factors.push({
          label: `Propietario de la cuenta de servicio ${owned.map((s) => s.name).join(", ")}`,
          points: 3,
          severity: "low",
        });
      }
    }

    if (person.status === "active" && repo.loginEvents(person.id).length > 0) {
      factors.push({ label: "Actividad reciente por VPN remota", points: 2, severity: "low" });
    }
  }

  if (service) {
    factors.push({ label: "Credencial de cuenta de servicio no humana", points: 5, severity: "low" });
    const owner = repo.person(service.ownerId);
    const crossDeptGroups = access
      .map((a) => a.group)
      .filter((g) => g.department && owner && g.department !== owner.department);
    if (crossDeptGroups.length > 0) {
      const names = [...new Set(crossDeptGroups.map((g) => g.department))];
      factors.push({
        label: `Automatización con acceso a otros departamentos: ${names.join(", ")}`,
        points: 4,
        severity: "low",
      });
    }
  }

  // Active findings drive risk sharply upward; approved/resolved findings cool down immediately.
  const myFindings = allFindings.filter((f) => f.principalId === principalId);
  for (const f of myFindings) {
    if (f.status === "resolved") continue;

    if (f.status === "approved") {
      // "keep" was approved by a human (e.g. Elena's CISO-approved ticket): no anomaly penalty.
      if (f.proposal?.decision === "keep") continue;
      // "escalate" was approved (e.g. Carlos's impossible travel): incident opened & contained.
      if (f.proposal?.decision === "escalate") {
        factors.push({
          label: "Incidente contenido: escalado para seguimiento",
          points: 12,
          severity: "medium",
        });
      }
      continue;
    }

    switch (f.type) {
      case "leaver_access": {
        factors.push({ label: "Conserva accesos activos tras dejar la empresa", points: 48, severity: "high" });
        const afterExit = person?.endDate ? repo.badgeEvents(principalId, person.endDate).filter((e) => e.result === "granted") : [];
        if (afterExit.length > 0) {
          factors.push({ label: "Dispositivo corporativo usado tras la fecha de baja", points: 10, severity: "high" });
        }
        break;
      }
      case "impossible_travel":
        factors.push({ label: "Viaje imposible (posibles credenciales comprometidas)", points: 78, severity: "high" });
        break;
      case "orphaned_service_account": {
        factors.push({ label: "Cuenta de servicio privilegiada huérfana (el propietario se fue)", points: 55, severity: "high" });
        if (repo.loginEvents(principalId).length > 0) {
          factors.push({ label: "Cuenta de servicio sin propietario que sigue autenticándose", points: 6, severity: "high" });
        }
        break;
      }
      case "role_change_leftover": {
        factors.push({ label: "Accesos sin revocar del departamento anterior", points: 51, severity: "high" });
        if (highEnts.some((e) => f.entitlementIds.includes(e.id))) {
          factors.push({ label: "Los accesos sobrantes incluyen privilegios de riesgo alto", points: 5, severity: "high" });
        }
        break;
      }
      case "peer_outlier":
        factors.push({ label: "Permiso de riesgo alto que no tiene ningún compañero del departamento", points: 29, severity: "medium" });
        break;
    }
  }

  const raw = factors.reduce((sum, x) => sum + x.points, 0);
  const score = Math.max(0, Math.min(98, raw));
  return { score, level: riskLevelFor(score), factors };
}

/** Build the complete interconnected organization & access graph. */
export function buildOrgGraph(repo: Repo, allFindings: FindingView[]): OrgGraph {
  const { c } = repo;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeByKey = new Map<string, GraphEdge>();

  const addEdge = (edge: Omit<GraphEdge, "id">) => {
    if (edge.from === edge.to) return;
    const isUndirected = edge.kind === "shared_privilege" || edge.kind === "peer_mesh";
    const key = isUndirected
      ? `${edge.kind}:${[edge.from, edge.to].sort().join("<->")}`
      : `${edge.kind}:${edge.from}->${edge.to}`;
    const existing = edgeByKey.get(key);
    if (existing) {
      if (edge.label && existing.label && !existing.label.includes(edge.label)) {
        existing.label = `${existing.label} · ${edge.label}`;
      } else if (edge.label && !existing.label) {
        existing.label = edge.label;
      }
      if (edge.risk && (!existing.risk || severityRank[edge.risk] > severityRank[existing.risk])) {
        existing.risk = edge.risk;
      }
      if (edge.dashed) existing.dashed = true;
      return;
    }
    const created: GraphEdge = { id: key, ...edge };
    edgeByKey.set(key, created);
    edges.push(created);
  };

  // Active findings lookup per principal
  const findingsByPrincipal = new Map<string, FindingView[]>();
  for (const f of allFindings) {
    const list = findingsByPrincipal.get(f.principalId) ?? [];
    list.push(f);
    findingsByPrincipal.set(f.principalId, list);
  }

  // A head is someone with no manager who has people reporting to them; managerless people without
  // reports are "transversal" nodes that hang directly from the company.
  const managerIds = new Set(c.people.flatMap((p) => (p.managerId ? [p.managerId] : [])));
  const isHead = (p: { id: string; managerId?: string }) => !p.managerId && managerIds.has(p.id);

  const headByDept = new Map<string, string>();
  for (const p of c.people) {
    if (isHead(p)) headByDept.set(p.department, p.id);
  }

  const personNodes: GraphNode[] = [];

  for (const p of c.people) {
    const risk = computePrincipalRisk(repo, p.id, allFindings);
    const access = repo.accessOf(p.id);
    const uniqueEnts = new Map(access.map((a) => [a.entitlement.id, a.entitlement]));
    const myFindings = findingsByPrincipal.get(p.id) ?? [];
    const activeFindings = myFindings.filter((f) => f.status !== "resolved" && f.status !== "approved");
    const topFinding = [...(activeFindings.length ? activeFindings : myFindings)].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity]
    )[0];

    personNodes.push({
      id: p.id,
      kind: "person",
      name: p.name,
      avatarUrl: p.avatarUrl,
      subtitle: p.title,
      department: p.department,
      status: p.status,
      managerId: p.managerId ?? ORG_ROOT_ID,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskFactors: risk.factors,
      entitlementCount: uniqueEnts.size,
      highRiskEntitlementCount: [...uniqueEnts.values()].filter((e) => e.risk === "high").length,
      findingIds: myFindings.map((f) => f.id),
      topFindingSeverity: activeFindings.length ? topFinding?.severity : undefined,
      topFindingStatus: topFinding?.status,
    });

    // Hierarchy edge: manager (or company root for department heads) -> person
    addEdge({
      from: p.managerId ?? ORG_ROOT_ID,
      to: p.id,
      kind: "hierarchy",
      label: p.managerId ? "Depende de" : isHead(p) ? `Responsable de ${p.department}` : "Equipo transversal",
      dashed: p.status === "left",
      risk: p.status === "left" && activeFindings.length > 0 ? "high" : undefined,
    });
  }

  const serviceNodes: GraphNode[] = [];
  for (const s of c.serviceAccounts) {
    const owner = repo.person(s.ownerId);
    const risk = computePrincipalRisk(repo, s.id, allFindings);
    const access = repo.accessOf(s.id);
    const uniqueEnts = new Map(access.map((a) => [a.entitlement.id, a.entitlement]));
    const myFindings = findingsByPrincipal.get(s.id) ?? [];
    const activeFindings = myFindings.filter((f) => f.status !== "resolved" && f.status !== "approved");
    const topFinding = [...(activeFindings.length ? activeFindings : myFindings)].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity]
    )[0];

    serviceNodes.push({
      id: s.id,
      kind: "service",
      name: s.name,
      subtitle: s.description,
      department: owner?.department ?? "TI",
      status: "service",
      managerId: s.ownerId,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskFactors: risk.factors,
      entitlementCount: uniqueEnts.size,
      highRiskEntitlementCount: [...uniqueEnts.values()].filter((e) => e.risk === "high").length,
      findingIds: myFindings.map((f) => f.id),
      topFindingSeverity: activeFindings.length ? topFinding?.severity : undefined,
      topFindingStatus: topFinding?.status,
    });

    // Ownership edge: owner -> service account
    const orphaned = !owner || owner.status === "left";
    addEdge({
      from: s.ownerId,
      to: s.id,
      kind: "owns",
      label: orphaned ? "Propietario dado de baja" : "Propietario de la cuenta de servicio",
      dashed: orphaned,
      risk: orphaned && activeFindings.length > 0 ? "high" : undefined,
    });
  }

  const principalNodes = [...personNodes, ...serviceNodes];
  const nodeById = new Map(principalNodes.map((n) => [n.id, n]));

  // Company root node with aggregate risk metrics
  const avgRisk = c.displayRisk ?? Math.round(principalNodes.reduce((s, n) => s + n.riskScore, 0) / Math.max(1, principalNodes.length));
  const maxRisk = Math.max(0, ...principalNodes.map((n) => n.riskScore));
  const atRiskCount = principalNodes.filter((n) => n.riskScore >= 50 || Boolean(n.topFindingSeverity)).length;

  const rootNode: GraphNode = {
    id: ORG_ROOT_ID,
    kind: "org",
    name: c.name,
    subtitle: `${c.people.filter((p) => p.status === "active").length} activos · ${c.serviceAccounts.length} cuentas de servicio`,
    department: "Dirección",
    status: "org",
    riskScore: avgRisk,
    riskLevel: riskLevelFor(maxRisk >= 80 ? Math.max(avgRisk, 45) : avgRisk),
    riskFactors: [],
    entitlementCount: c.entitlements.length,
    highRiskEntitlementCount: c.entitlements.filter((e) => e.risk === "high").length,
    findingIds: allFindings.filter((f) => f.status !== "resolved" && f.status !== "approved").map((f) => f.id),
  };

  nodes.push(rootNode, ...principalNodes);

  // ---------------------------------------------------------------- Interconnections

  // 1. Cross-department access & shared sensitive group links
  for (const g of c.groups) {
    if (g.id === "g-all-staff") continue;
    const members = c.memberships.filter((m) => m.groupId === g.id).map((m) => m.principalId);
    const hasHighRisk = g.entitlementIds.some((eid) => repo.entitlement(eid)?.risk === "high");

    // Cross-department access: member is in a group belonging to a DIFFERENT department (or the device lab from outside IT)
    const targetDept = g.department ?? (g.id === "g-demo-lab" ? "TI" : undefined);
    const targetHead = targetDept ? headByDept.get(targetDept) : undefined;

    for (const pid of members) {
      const node = nodeById.get(pid);
      if (!node || !targetDept || !targetHead) continue;
      if (node.department !== targetDept) {
        const flagged = (findingsByPrincipal.get(pid) ?? []).some(
          (f) => f.status !== "resolved" && f.status !== "approved" && f.entitlementIds.some((eid) => g.entitlementIds.includes(eid))
        );
        addEdge({
          from: pid,
          to: targetHead,
          kind: "cross_dept_access",
          label: `${g.name} (${targetDept})`,
          risk: flagged ? "high" : hasHighRisk ? "medium" : "low",
          dashed: flagged,
        });
      }
    }

    // Shared specialized / high-risk role group links
    const isRoleGroup = !g.department || g.id === "g-inn-firebase" || g.id === "g-inn-cloud" || g.id === "g-it-admins" || g.id === "g-demo-lab";
    if (isRoleGroup && hasHighRisk && members.length >= 2) {
      const uniqueMembers = [...new Set(members)];
      // Connect members sequentially within the group so everyone sharing the high-risk role is linked without O(n^2) clutter
      for (let i = 0; i < uniqueMembers.length - 1; i++) {
        const a = uniqueMembers[i]!;
        const b = uniqueMembers[i + 1]!;
        const aFlagged = Boolean(nodeById.get(a)?.topFindingSeverity);
        const bFlagged = Boolean(nodeById.get(b)?.topFindingSeverity);
        addEdge({
          from: a,
          to: b,
          kind: "shared_privilege",
          label: g.name,
          risk: aFlagged || bFlagged ? "high" : "medium",
        });
      }
    }
  }

  // 2. Access ticket sponsorship / approval links (when approver or requester is a known Person)
  for (const t of c.tickets) {
    const sponsor = repo.person(t.approvedBy) ? t.approvedBy : repo.person(t.requestedBy) ? t.requestedBy : undefined;
    if (!sponsor || sponsor === t.principalId) continue;
    // Only draw if principal still holds that entitlement
    if (!repo.holds(t.principalId, t.entitlementId)) continue;
    const expired = Boolean(t.expiresDate && t.expiresDate < c.asOf);
    const entName = repo.entitlement(t.entitlementId)?.name ?? t.entitlementId;
    addEdge({
      from: sponsor,
      to: t.principalId,
      kind: "ticket_approval",
      label: `${t.id}: ${entName}${expired ? " (caducado)" : ""}`,
      risk: expired ? "high" : "low",
      dashed: true,
    });
  }

  // 3. Executive ring connecting department heads & team peer mesh connecting department colleagues
  const deptHeads = c.people.filter(isHead);
  for (let i = 0; i < deptHeads.length - 1; i++) {
    addEdge({
      from: deptHeads[i]!.id,
      to: deptHeads[i + 1]!.id,
      kind: "peer_mesh",
      label: "Compañero de dirección",
    });
  }

  for (const head of deptHeads) {
    const team = c.people.filter((p) => p.managerId === head.id && p.status === "active");
    for (let i = 0; i < team.length - 1; i++) {
      addEdge({
        from: team[i]!.id,
        to: team[i + 1]!.id,
        kind: "peer_mesh",
        label: `Equipo de ${head.department}`,
      });
    }
  }

  return {
    company: c.name,
    asOf: c.asOf,
    avgRisk,
    maxRisk,
    atRiskCount,
    nodes,
    edges,
  };
}
