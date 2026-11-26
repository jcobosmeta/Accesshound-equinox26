// The audit trail as files someone can hand to an auditor: CSV for spreadsheets, JSON for tools.

import type { AuditEntry } from "./store.js";

const columns: { header: string; value: (e: AuditEntry) => string }[] = [
  { header: "Entry", value: (e) => e.id },
  { header: "Time (UTC)", value: (e) => e.time },
  { header: "Finding", value: (e) => e.findingTitle },
  { header: "Finding ID", value: (e) => e.findingId },
  { header: "Person or account", value: (e) => e.principalName },
  { header: "Principal ID", value: (e) => e.principalId },
  { header: "Agent proposed", value: (e) => e.agentDecision },
  { header: "Agent summary", value: (e) => e.agentHeadline },
  { header: "Agent mode", value: (e) => e.agentMode },
  { header: "Decision", value: (e) => e.humanDecision },
  { header: "Reviewer", value: (e) => e.reviewer },
  { header: "Note", value: (e) => e.note ?? "" },
  { header: "Changes applied", value: (e) => e.applied.join("; ") },
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

export const auditFileName = (ext: "csv" | "json") => `accesshound-audit-${new Date().toISOString().slice(0, 10)}.${ext}`;
