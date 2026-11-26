// Real-time monitoring: security alerts (SIEM, EDR, IdP, DLP, badges) arrive about people and
// service accounts. A decision engine — deterministic rules ("script") or Claude ("ia") — weighs
// each alert against what the access audit already knows about that user, and blocks their
// access when the combination is dangerous. Blocks are reversible: the removed memberships are
// kept so a person can restore them.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { agentRequestSettings } from "./agent/live.js";
import type { Membership } from "./data/types.js";
import { detect } from "./detectors/index.js";
import { computePrincipalRisk, type RiskLevel } from "./risk.js";
import { store } from "./store.js";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertKind =
  | "impossible_travel"
  | "mass_download"
  | "mfa_fatigue"
  | "malware"
  | "credential_leak"
  | "off_hours_badge"
  | "privilege_escalation"
  | "tor_login"
  | "new_device";
export type Engine = "script" | "ia";
export type MonitorAction = "block" | "watch" | "ignore";

export interface SecurityAlert {
  id: string;
  time: string;
  principalId: string;
  principalName: string;
  kind: AlertKind;
  source: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface MonitorDecision {
  action: MonitorAction;
  reason: string;
  engine: Engine;
  confidence: "low" | "medium" | "high";
  /** Set when the IA engine was asked but the rules answered instead. */
  fallback?: string;
}

export type MonitorEventStatus = "analyzing" | "decided" | "pending_block" | "dismissed";

export interface MonitorEvent {
  alert: SecurityAlert;
  status: MonitorEventStatus;
  decision?: MonitorDecision;
  /** Human-readable list of changes actually made. */
  applied: string[];
  decidedAt?: string;
}

export interface MonitorConfig {
  running: boolean;
  engine: Engine;
  autoBlock: boolean;
  /** Seconds from starting until the first simulated alert. */
  firstDelaySec: number;
  /** Seconds between simulated alerts after the first. */
  intervalSec: number;
  /** When the next simulated alert arrives, while running. */
  nextAlertAt?: string;
}

export interface BlockedPrincipal {
  principalId: string;
  principalName: string;
  at: string;
  alertId: string;
  reason: string;
  memberships: Membership[];
}

export interface WatchedPrincipal {
  id: string;
  name: string;
  kind: "person" | "service";
  subtitle: string;
  riskScore: number;
  riskLevel: RiskLevel;
  openFindings: number;
  blocked: boolean;
}

export type MonitorStreamEvent =
  | { type: "snapshot"; config: MonitorConfig; events: MonitorEvent[]; blocked: BlockedPrincipal[]; iaAvailable: boolean }
  | { type: "event"; event: MonitorEvent }
  | { type: "config"; config: MonitorConfig }
  | { type: "blocked"; blocked: BlockedPrincipal[] };

// ---------------------------------------------------------------------------------------------
// Alert catalogue
// ---------------------------------------------------------------------------------------------

interface AlertTemplate {
  source: string;
  severity: AlertSeverity;
  title: string;
  people: boolean;
  services: boolean;
  detail: (name: string) => string;
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const ip = () => `${pick([41, 77, 102, 185, 197])}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const clock = () => `${String(1 + Math.floor(Math.random() * 4)).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;

export const ALERT_TEMPLATES: Record<AlertKind, AlertTemplate> = {
  impossible_travel: {
    source: "IdP (Azure AD)",
    severity: "high",
    title: "Viaje imposible",
    people: true,
    services: false,
    detail: () => `Inicio de sesión VPN desde ${pick(["Lagos (Nigeria)", "Bucarest (Rumanía)", "Hanói (Vietnam)", "Caracas (Venezuela)"])} 35 min después de un acceso desde Madrid. IP ${ip()}.`,
  },
  mass_download: {
    source: "DLP",
    severity: "high",
    title: "Descarga masiva de datos",
    people: true,
    services: true,
    detail: () => `${(1500 + Math.floor(Math.random() * 3000)).toLocaleString("es-ES")} ficheros descargados de ${pick(["SharePoint", "Confluence", "Azure Blob Storage"])} en 10 minutos.`,
  },
  mfa_fatigue: {
    source: "IdP (Azure AD)",
    severity: "medium",
    title: "Bombardeo de MFA",
    people: true,
    services: false,
    detail: () => `${12 + Math.floor(Math.random() * 20)} solicitudes de MFA rechazadas en 5 minutos y una aceptada después.`,
  },
  malware: {
    source: "EDR",
    severity: "critical",
    title: "Malware en el equipo",
    people: true,
    services: true,
    detail: () => `Detectado ${pick(["ransomware LockBit", "un infostealer (RedLine)", "una puerta trasera Cobalt Strike"])} en el equipo asociado. Proceso aislado.`,
  },
  credential_leak: {
    source: "Threat Intel",
    severity: "high",
    title: "Credenciales filtradas",
    people: true,
    services: true,
    detail: () => `Usuario y contraseña encontrados en un volcado publicado hace ${1 + Math.floor(Math.random() * 6)} h en un foro.`,
  },
  off_hours_badge: {
    source: "Control de accesos físico",
    severity: "medium",
    title: "Fichaje fuera de horario",
    people: true,
    services: false,
    detail: () => `Tarjeta usada en ${pick(["el CPD", "la sala de servidores", "el almacén de equipos"])} a las ${clock()}.`,
  },
  privilege_escalation: {
    source: "Active Directory",
    severity: "critical",
    title: "Escalada de privilegios",
    people: true,
    services: true,
    detail: () => `La cuenta se ha añadido a sí misma al grupo ${pick(["Domain Admins", "Global Administrators", "SAP_ALL"])}.`,
  },
  tor_login: {
    source: "Firewall",
    severity: "medium",
    title: "Acceso desde Tor",
    people: true,
    services: true,
    detail: () => `Inicio de sesión desde un nodo de salida de Tor (${ip()}).`,
  },
  new_device: {
    source: "IdP (Azure AD)",
    severity: "low",
    title: "Dispositivo nuevo",
    people: true,
    services: false,
    detail: () => `Primer inicio de sesión desde un ${pick(["iPhone", "portátil Windows", "Mac"])} no registrado.`,
  },
};

// ---------------------------------------------------------------------------------------------
// Context about the user that the engines decide on
// ---------------------------------------------------------------------------------------------

const CLOSED = new Set(["approved", "rejected", "resolved"]);

function principalContext(principalId: string) {
  const { repo } = store;
  const findings = store.findings();
  const risk = computePrincipalRisk(repo, principalId, findings);
  const open = findings.filter((f) => f.principalId === principalId && !CLOSED.has(f.status));
  return { risk, open };
}

// ---------------------------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------------------------

const SEVERITY_POINTS: Record<AlertSeverity, number> = { low: 10, medium: 25, high: 45, critical: 70 };
const SEVERITY_LABEL: Record<AlertSeverity, string> = { low: "baja", medium: "media", high: "alta", critical: "crítica" };

/** Deterministic rules: alert severity + audit risk + open findings. */
function decideByRules(alert: SecurityAlert): MonitorDecision {
  const { risk, open } = principalContext(alert.principalId);
  const score = Math.min(100, SEVERITY_POINTS[alert.severity] + Math.round(risk.score * 0.5) + (open.length ? 15 : 0));
  const context = `riesgo de auditoría ${risk.score}%${open.length ? `, ${open.length} ${open.length > 1 ? "hallazgos abiertos" : "hallazgo abierto"}` : ", sin hallazgos abiertos"}`;
  const base = `Aviso de severidad ${SEVERITY_LABEL[alert.severity]} (${alert.title.toLowerCase()}) y ${context}. Puntuación ${score}/100.`;

  if (alert.severity === "critical")
    return { action: "block", engine: "script", confidence: "high", reason: `${base} Un aviso crítico siempre bloquea los accesos.` };
  if (score >= 70)
    return { action: "block", engine: "script", confidence: score >= 85 ? "high" : "medium", reason: `${base} Supera el umbral de bloqueo (70).` };
  if (score >= 40)
    return { action: "watch", engine: "script", confidence: "medium", reason: `${base} Se mantiene en vigilancia (umbral de bloqueo: 70).` };
  return { action: "ignore", engine: "script", confidence: "medium", reason: `${base} Por debajo del umbral de vigilancia (40).` };
}

const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const THREADS = !process.env.ANTHROPIC_BASE_URL;

const DecisionSchema = z.object({
  action: z
    .enum(["block", "watch", "ignore"])
    .describe("block = remove all of the user's access now; watch = keep access but flag the user; ignore = no action"),
  reason: z.string().describe("At most two short sentences in Spanish (Spain) explaining the decision to a security analyst."),
  confidence: z.enum(["low", "medium", "high"]),
});

const IA_SYSTEM = `You are AccessHound's real-time security monitor. A security alert has just arrived about one user of the company. You also get what the access audit already knows about that user: their risk score, open audit findings, access and recent activity.

Decide in seconds whether to block all of the user's access now:
- "block" when the alert plus the audit context indicate a likely compromise or insider threat (e.g. a critical alert, or a serious alert about someone who already has unjustified or leftover access, or who has left the company).
- "watch" when it is suspicious but plausibly benign and the user has low exposure.
- "ignore" for routine, low-severity events on low-risk users.
A false block interrupts someone's work but is reversible; a missed compromise is not. Lean towards blocking when the user holds high-risk access.

Answer by calling submit_decision exactly once. Write the reason in Spanish (Spain), plain language, at most two sentences, naming the deciding facts.`;

/** Claude weighs the alert against the audit context. Falls back to the rules on any problem. */
async function decideByIa(alert: SecurityAlert): Promise<MonitorDecision> {
  if (!hasCredentials()) return { ...decideByRules(alert), fallback: "La IA no está configurada (falta la clave de API): han decidido las reglas." };

  const { repo } = store;
  const { risk, open } = principalContext(alert.principalId);
  const person = repo.person(alert.principalId);
  const service = repo.serviceAccount(alert.principalId);
  const context = {
    alert,
    user: person
      ? { kind: "person", name: person.name, title: person.title, department: person.department, status: person.status, endDate: person.endDate }
      : { kind: "service_account", name: service?.name, description: service?.description, owner: service ? repo.principalName(service.ownerId) : undefined },
    auditRisk: risk,
    openFindings: open.map((f) => ({ title: f.title, severity: f.severity, facts: f.facts })),
    access: [...new Map(repo.accessOf(alert.principalId).map((a) => [a.entitlement.id, a.entitlement])).values()].map((e) => ({
      name: e.name,
      system: e.system,
      risk: e.risk,
    })),
    recentLogins: repo.loginEvents(alert.principalId).slice(-5),
  };

  try {
    const client = new Anthropic();
    let decision: z.infer<typeof DecisionSchema> | undefined;
    const submit = betaZodTool({
      name: "submit_decision",
      description: "Submit the monitoring decision for this alert. Call exactly once.",
      inputSchema: DecisionSchema,
      run: (input) => {
        decision = input;
        return "Decision recorded.";
      },
    });
    const runner = client.beta.messages.toolRunner({
      ...agentRequestSettings,
      ...(THREADS ? {} : { thread: false as const }),
      output_config: { effort: "low" },
      max_tokens: 4000,
      max_iterations: 2,
      system: IA_SYSTEM,
      tools: [submit],
      messages: [{ role: "user", content: `Alert and audit context:\n${JSON.stringify(context, null, 2)}` }],
    });
    for await (const message of runner) {
      if (message.stop_reason === "refusal") break;
      const call = message.content.find((b) => b.type === "tool_use" && b.name === "submit_decision");
      if (call?.type === "tool_use") {
        const parsed = DecisionSchema.safeParse(call.input);
        if (parsed.success) {
          decision = parsed.data;
          break;
        }
      }
    }
    if (decision) return { ...decision, engine: "ia" };
    return { ...decideByRules(alert), fallback: "La IA no ha devuelto una decisión: han decidido las reglas." };
  } catch (err) {
    console.error("Monitor IA failed, falling back to rules:", err);
    return { ...decideByRules(alert), fallback: "La IA no está disponible: han decidido las reglas." };
  }
}

// ---------------------------------------------------------------------------------------------
// Monitor state
// ---------------------------------------------------------------------------------------------

const MAX_EVENTS = 200;

class Monitor {
  config: MonitorConfig = { running: false, engine: "script", autoBlock: true, firstDelaySec: 30, intervalSec: 60 };
  events: MonitorEvent[] = [];
  blocked = new Map<string, BlockedPrincipal>();
  private seq = 0;
  private timer?: NodeJS.Timeout;
  private listeners = new Set<(e: MonitorStreamEvent) => void>();
  /** Alerts are decided one at a time, in arrival order, so blocks never race each other. */
  private queue: Promise<void> = Promise.resolve();

  subscribe(fn: (e: MonitorStreamEvent) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): MonitorStreamEvent {
    return { type: "snapshot", config: this.config, events: this.events, blocked: [...this.blocked.values()], iaAvailable: hasCredentials() };
  }

  private emit(e: MonitorStreamEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private emitEvent(event: MonitorEvent) {
    this.emit({ type: "event", event });
  }

  private emitBlocked() {
    this.emit({ type: "blocked", blocked: [...this.blocked.values()] });
  }

  reset() {
    this.stopTimer();
    this.config = { ...this.config, running: false, nextAlertAt: undefined };
    this.events = [];
    this.blocked.clear();
    this.queue = Promise.resolve();
    this.emit(this.snapshot());
  }

  configure(patch: Partial<MonitorConfig>) {
    const next = { ...this.config };
    if (typeof patch.running === "boolean") next.running = patch.running;
    if (patch.engine === "script" || patch.engine === "ia") next.engine = patch.engine;
    if (typeof patch.autoBlock === "boolean") next.autoBlock = patch.autoBlock;
    if (typeof patch.intervalSec === "number" && patch.intervalSec >= 5 && patch.intervalSec <= 3600) next.intervalSec = Math.round(patch.intervalSec);
    if (typeof patch.firstDelaySec === "number" && patch.firstDelaySec >= 0 && patch.firstDelaySec <= 3600) next.firstDelaySec = Math.round(patch.firstDelaySec);
    const restart = next.running !== this.config.running || next.intervalSec !== this.config.intervalSec;
    this.config = next;
    if (restart) {
      this.stopTimer();
      if (next.running) this.schedule(next.firstDelaySec);
      else this.config = { ...this.config, nextAlertAt: undefined };
    }
    this.emit({ type: "config", config: this.config });
    return this.config;
  }

  /** First alert after `firstDelaySec`, then one every `intervalSec`: 0:30, 1:30, 2:30… */
  private schedule(delaySec: number) {
    this.config = { ...this.config, nextAlertAt: new Date(Date.now() + delaySec * 1000).toISOString() };
    this.timer = setTimeout(() => {
      this.simulate();
      this.schedule(this.config.intervalSec);
      this.emit({ type: "config", config: this.config });
    }, delaySec * 1000);
  }

  private stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** People and service accounts the audit flagged: open findings, high risk, or already blocked. */
  watchlist(): WatchedPrincipal[] {
    const { repo } = store;
    const findings = store.findings();
    const ids = [...repo.c.people.map((p) => p.id), ...repo.c.serviceAccounts.map((s) => s.id)];
    const out: WatchedPrincipal[] = [];
    for (const id of ids) {
      const risk = computePrincipalRisk(repo, id, findings);
      const openFindings = findings.filter((f) => f.principalId === id && !CLOSED.has(f.status)).length;
      const blocked = this.blocked.has(id);
      if (!openFindings && risk.score < 60 && !blocked) continue;
      const person = repo.person(id);
      const service = repo.serviceAccount(id);
      out.push({
        id,
        name: repo.principalName(id),
        kind: person ? "person" : "service",
        subtitle: person ? `${person.title} · ${person.department}${person.status === "left" ? " · Baja" : ""}` : (service?.description ?? "Cuenta de servicio"),
        riskScore: risk.score,
        riskLevel: risk.level,
        openFindings,
        blocked,
      });
    }
    return out.sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.riskScore - a.riskScore);
  }

  /** A random alert, mostly about users the audit already flagged. */
  simulate() {
    const { repo } = store;
    const watched = this.watchlist().filter((w) => !w.blocked);
    const everyone = [
      ...repo.c.people.filter((p) => p.status === "active").map((p) => p.id),
      ...repo.c.serviceAccounts.map((s) => s.id),
    ];
    const principalId = watched.length && Math.random() < 0.7 ? pick(watched).id : pick(everyone);
    const isService = repo.principalKind(principalId) === "service";
    const kinds = (Object.keys(ALERT_TEMPLATES) as AlertKind[]).filter((k) => (isService ? ALERT_TEMPLATES[k].services : ALERT_TEMPLATES[k].people));
    // Low-severity noise is common, critical alerts are rare.
    const weighted = kinds.flatMap((k) => Array(({ low: 4, medium: 3, high: 2, critical: 1 } as const)[ALERT_TEMPLATES[k].severity]).fill(k) as AlertKind[]);
    return this.ingest({ principalId, kind: pick(weighted) });
  }

  /** Accept an alert (from the simulator, the UI or an external script) and queue its decision. */
  ingest(input: { principalId: string; kind: AlertKind; detail?: string; severity?: AlertSeverity; source?: string }): MonitorEvent {
    const { repo } = store;
    const kind = repo.principalKind(input.principalId);
    if (!kind) throw new Error(`Usuario desconocido: ${input.principalId}`);
    const template = ALERT_TEMPLATES[input.kind];
    if (!template) throw new Error(`Tipo de aviso desconocido: ${input.kind}`);
    const name = repo.principalName(input.principalId);
    const alert: SecurityAlert = {
      id: `AL-${String(++this.seq).padStart(4, "0")}`,
      time: new Date().toISOString(),
      principalId: input.principalId,
      principalName: name,
      kind: input.kind,
      source: input.source ?? template.source,
      severity: input.severity ?? template.severity,
      title: template.title,
      detail: input.detail ?? template.detail(name),
    };
    const event: MonitorEvent = { alert, status: "analyzing", applied: [] };
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    this.emitEvent(event);
    this.queue = this.queue.then(() => this.process(event)).catch((err) => console.error("Monitor failed on", alert.id, err));
    return event;
  }

  private async process(event: MonitorEvent) {
    const { alert } = event;
    if (this.blocked.has(alert.principalId)) {
      event.decision = { action: "ignore", engine: this.config.engine, confidence: "high", reason: "Los accesos de este usuario ya están bloqueados: se registra el aviso sin más acciones." };
      event.status = "decided";
    } else {
      const decision = this.config.engine === "ia" ? await decideByIa(alert) : decideByRules(alert);
      event.decision = decision;
      if (decision.action === "block" && this.config.autoBlock) {
        event.applied = this.block(alert.principalId, alert.id, decision.reason);
        event.status = "decided";
      } else {
        event.status = decision.action === "block" ? "pending_block" : "decided";
      }
    }
    event.decidedAt = new Date().toISOString();
    this.emitEvent(event);
  }

  /** A person confirms a block the engine proposed while automatic blocking was off. */
  confirm(alertId: string, accept: boolean) {
    const event = this.events.find((e) => e.alert.id === alertId);
    if (!event || event.status !== "pending_block") throw new Error("Este aviso no tiene ningún bloqueo pendiente.");
    if (accept && !this.blocked.has(event.alert.principalId)) event.applied = this.block(event.alert.principalId, alertId, event.decision?.reason ?? "");
    event.status = accept ? "decided" : "dismissed";
    event.decidedAt = new Date().toISOString();
    this.emitEvent(event);
    return event;
  }

  /** Remove every group membership. Findings that disappear because of it show as resolved. */
  private block(principalId: string, alertId: string, reason: string): string[] {
    const { repo, company } = store;
    const before = detect(repo).filter((f) => f.principalId === principalId);
    const memberships = company.memberships.filter((m) => m.principalId === principalId);
    company.memberships = company.memberships.filter((m) => m.principalId !== principalId);
    const after = new Set(detect(repo).map((f) => f.id));
    for (const f of before) if (!after.has(f.id)) store.resolved.set(f.id, f);
    const name = repo.principalName(principalId);
    this.blocked.set(principalId, { principalId, principalName: name, at: new Date().toISOString(), alertId, reason, memberships });
    this.emitBlocked();
    const groups = memberships.map((m) => repo.group(m.groupId)?.name ?? m.groupId);
    return [
      `Accesos de ${name} bloqueados: se ha quitado de ${memberships.length} ${memberships.length === 1 ? "grupo" : "grupos"}${groups.length ? ` (${groups.join(", ")})` : ""}`,
      "Sesiones activas revocadas y credenciales marcadas para restablecer",
      `Incidente de seguridad abierto a partir de ${alertId}`,
    ];
  }

  /** Give back the memberships a block removed. */
  unblock(principalId: string) {
    const entry = this.blocked.get(principalId);
    if (!entry) throw new Error("Este usuario no está bloqueado.");
    const { company } = store;
    const existing = new Set(company.memberships.filter((m) => m.principalId === principalId).map((m) => m.groupId));
    company.memberships.push(...entry.memberships.filter((m) => !existing.has(m.groupId)));
    for (const f of detect(store.repo)) if (f.principalId === principalId) store.resolved.delete(f.id);
    this.blocked.delete(principalId);
    this.emitBlocked();
    return entry;
  }
}

export const monitor = new Monitor();
