import "./env.js"; // must stay first
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { investigateLive } from "./agent/live.js";
import { investigateReplay } from "./agent/replay.js";
import type { AgentEvent, Proposal } from "./agent/types.js";
import { store } from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);
const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const defaultMode: "live" | "replay" = process.env.AGENT_MODE === "replay" || !hasCredentials ? "replay" : "live";

const app = express();
app.use(express.json());

app.get("/api/summary", (_req, res) => {
  const c = store.company;
  res.json({
    company: c.name,
    asOf: c.asOf,
    people: c.people.length,
    activePeople: c.people.filter((p) => p.status === "active").length,
    serviceAccounts: c.serviceAccounts.length,
    groups: c.groups.length,
    entitlements: c.entitlements.length,
    memberships: c.memberships.length,
    badgeEvents: c.badgeEvents.length,
    loginEvents: c.loginEvents.length,
    agentMode: defaultMode,
  });
});

app.get("/api/findings", (_req, res) => {
  res.json(store.findings());
});

/** Everything about one principal, for the side panel and its access graph. */
app.get("/api/principals/:id", (req, res) => {
  const { repo } = store;
  const id = req.params.id;
  const kind = repo.principalKind(id);
  if (!kind) return res.status(404).json({ error: "not found" });
  res.json({
    kind,
    profile: kind === "person" ? repo.person(id) : repo.serviceAccount(id),
    access: repo.accessOf(id).map((a) => ({
      entitlement: a.entitlement,
      group: { id: a.group.id, name: a.group.name, source: a.group.source },
      granted: a.membership.grantedDate,
      ticketId: a.membership.ticketId ?? null,
    })),
  });
});

/** Run the agent on a finding, streaming its steps as Server-Sent Events. */
app.get("/api/findings/:id/investigate", async (req, res) => {
  const finding = store.finding(req.params.id);
  if (!finding) return res.status(404).json({ error: "Finding not found (it may already be resolved)." });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const emit = (e: AgentEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const requested = req.query.mode === "replay" || req.query.mode === "live" ? req.query.mode : defaultMode;
  let mode: "live" | "replay" = requested === "live" && hasCredentials ? "live" : "replay";

  store.investigating.add(finding.id);
  store.proposals.delete(finding.id);
  let proposal: Proposal | undefined;
  try {
    emit({ type: "status", message: mode === "live" ? "Agent investigating (live)" : "Agent investigating (replay)" });
    if (mode === "live") {
      try {
        proposal = await investigateLive(store.repo, finding, emit);
      } catch (err) {
        console.error("Live agent failed, falling back to replay:", err);
        emit({ type: "status", message: "Live agent unavailable — switching to replay." });
        mode = "replay";
      }
    }
    if (!proposal && mode === "replay") proposal = await investigateReplay(store.repo, finding, emit);
    if (proposal) store.proposals.set(finding.id, { proposal, mode });
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    store.investigating.delete(finding.id);
    emit({ type: "done" });
    res.end();
  }
});

app.post("/api/findings/:id/decision", (req, res) => {
  const { decision, reviewer, note } = req.body ?? {};
  if (decision !== "approved" && decision !== "rejected") return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  try {
    res.json(store.decide(req.params.id, decision, typeof reviewer === "string" && reviewer ? reviewer : "Reviewer", note));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/audit", (_req, res) => {
  res.json(store.audit);
});

app.post("/api/reset", (_req, res) => {
  store.reset();
  res.json({ ok: true });
});

// In production, serve the built web app from the same port.
const webDist = resolve(import.meta.dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(webDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`AccessHound API on http://localhost:${PORT} (agent mode: ${defaultMode})`);
});
