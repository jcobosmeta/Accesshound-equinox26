// The audit trail as files someone can hand to an auditor: CSV for spreadsheets, JSON for tools.

import type { AuditEntry } from "./store.js";

const agentDecision: Record<AuditEntry["agentDecision"], string> = { revoke: "Revocar", keep: "Mantener", escalate: "Escalar" };

const columns: { header: string; value: (e: AuditEntry) => string }[] = [
  { header: "Entrada", value: (e) => e.id },
  { header: "Hora (UTC)", value: (e) => e.time },
  { header: "Hallazgo", value: (e) => e.findingTitle },
  { header: "ID del hallazgo", value: (e) => e.findingId },
  { header: "Persona o cuenta", value: (e) => e.principalName },
  { header: "ID del usuario", value: (e) => e.principalId },
  { header: "Propuesta del agente", value: (e) => agentDecision[e.agentDecision] },
  { header: "Resumen del agente", value: (e) => e.agentHeadline },
  { header: "Modo del agente", value: (e) => (e.agentMode === "live" ? "En vivo" : "Reproducción") },
  { header: "Decisión", value: (e) => (e.humanDecision === "approved" ? "Aprobada" : "Rechazada") },
  { header: "Revisor", value: (e) => e.reviewer },
  { header: "Nota", value: (e) => e.note ?? "" },
  { header: "Cambios aplicados", value: (e) => e.applied.join("; ") },
];

const BOM = String.fromCharCode(0xfeff);

/** Quote a CSV field when it contains a comma, quote or line break (RFC 4180). */
const field = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function auditCsv(entries: AuditEntry[]): string {
  const rows = [columns.map((c) => c.header), ...entries.map((e) => columns.map((c) => c.value(e)))];
  // The byte-order mark makes Excel read names like "Lucía" as UTF-8 instead of mangling them.
  return BOM + rows.map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}

export function auditJson(entries: AuditEntry[], company: string): string {
  return JSON.stringify({ company, exportedAt: new Date().toISOString(), entries }, null, 2);
}

export const auditFileName = (ext: "csv" | "json") => `mi-portero-auditoria-${new Date().toISOString().slice(0, 10)}.${ext}`;
