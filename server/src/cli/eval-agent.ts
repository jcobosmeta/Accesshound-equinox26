// `npm run eval-agent [label]`: run the live agent on every finding, check each proposal against
// the expected outcome for the planted case, and save the run to data/agent-evals/ so prompt or
// setting changes can be compared. Read-only: proposals aren't applied. Costs a few cents per finding.

import "../env.js"; // must stay first
import { mkdirSync, writeFileSync } from "node:fs";
import { investigateLive } from "../agent/live.js";
import type { AgentEvent, Proposal } from "../agent/types.js";
import { company } from "../data/company.js";
import { Repo } from "../data/repo.js";
import { detect, type FindingType } from "../detectors/index.js";

/** What a good investigation concludes for each planted case. */
const expected: Record<FindingType, { decision: Proposal["decision"]; check: (p: Proposal) => string[] }> = {
  role_change_leftover: {
    decision: "revoke",
    check: (p) => requireGroups(p, ["g-mkt-firebase", "g-mkt-staff"]),
  },
  leaver_access: {
    decision: "escalate",
    check: (p) => requireKinds(p, ["disable_badge", "disable_account", "open_incident"]),
  },
  orphaned_service_account: {
    decision: "revoke",
    check: (p) => requireGroups(p, ["g-it-admins"]),
  },
  impossible_travel: {
    decision: "escalate",
    check: (p) => requireKinds(p, ["reset_credentials", "open_incident"]),
  },
  peer_outlier: {
    decision: "keep",
    check: (p) => (p.actions.length ? ["'keep' should change nothing, but lists actions"] : []),
  },
};

const BASELINE_GROUPS = ["g-all-staff"]; // everyone has this; removing it is overreach
const requireGroups = (p: Proposal, groups: string[]) =>
  groups.filter((g) => !p.actions.some((a) => a.kind === "remove_from_group" && a.target === g)).map((g) => `missing remove ${g}`);
const requireKinds = (p: Proposal, kinds: string[]) =>
  kinds.filter((k) => !p.actions.some((a) => a.kind === k)).map((k) => `missing ${k}`);

interface Result {
  finding: string;
  type: FindingType;
  ok: boolean;
  problems: string[];
  seconds: number;
  lookups: string[];
  /** Progress notes shown in the trace as the "why" lines. */
  notes: string[];
  turns: number;
  tokens: { input: number; cacheRead: number; cacheWrite: number; output: number };
  proposal?: Proposal;
  error?: string;
}

async function run(findingId: string): Promise<Result> {
  const f = findings.find((x) => x.id === findingId)!;
  const events: AgentEvent[] = [];
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let turns = 0;
  const start = Date.now();
  let proposal: Proposal | undefined;
  let error: string | undefined;
  try {
    proposal = await investigateLive(repo, f, (e) => events.push(e), (m) => {
      turns++;
      tokens.input += m.usage.input_tokens;
      tokens.cacheRead += m.usage.cache_read_input_tokens ?? 0;
      tokens.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
      tokens.output += m.usage.output_tokens;
    });
  } catch (err) {
    error = err instanceof Error ? err.message.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-<redacted>").slice(0, 300) : String(err);
  }
  const exp = expected[f.type];
  const problems: string[] = [];
  if (error) problems.push(`error: ${error}`);
  else if (!proposal) problems.push("no proposal");
  else {
    if (proposal.decision !== exp.decision) problems.push(`decided ${proposal.decision}, expected ${exp.decision}`);
    problems.push(...exp.check(proposal));
    const disables = proposal.actions.some((a) => a.kind === "disable_account");
    const removals = proposal.actions.filter((a) => a.kind === "remove_from_group");
    if (disables && removals.length) {
      // disable_account already drops every membership; the extra removals show as "nothing to do" in the audit.
      problems.push(`redundant: ${removals.length} remove_from_group next to disable_account`);
    } else {
      const overreach = removals.filter((a) => BASELINE_GROUPS.includes(a.target));
      if (overreach.length) problems.push(`removes baseline access: ${overreach.map((a) => a.target).join(", ")}`);
    }
    // The proposal is shown on a card: keep it readable.
    const words = proposal.headline.split(/\s+/).length;
    if (words > 30) problems.push(`headline is ${words} words`);
    const sentences = proposal.explanation.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
    if (sentences > 5) problems.push(`explanation is ${sentences} sentences`);
  }
  return {
    finding: f.id,
    type: f.type,
    ok: problems.length === 0,
    problems,
    seconds: Math.round((Date.now() - start) / 100) / 10,
    lookups: events.flatMap((e) => (e.type === "tool_call" ? [e.name] : [])),
    notes: events.flatMap((e) => (e.type === "text" ? [e.text] : [])),
    turns,
    tokens,
    proposal,
    error,
  };
}

const label = process.argv[2] ?? "run";
// Its own copy of the demo data: the eval never touches the running server or its audit file.
const repo = new Repo(structuredClone(company));
const findings = detect(repo);
console.log(`Running the live agent on ${findings.length} findings in parallel…\n`);
const results = await Promise.all(findings.map((f) => run(f.id)));

for (const r of results) {
  const p = r.proposal;
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${r.finding}  (${r.seconds}s, ${r.turns} turns, ${r.lookups.length} lookups, ${r.notes.length} notes)`,
  );
  for (const note of r.notes) console.log(`      › ${note}`);
  for (const problem of r.problems) console.log(`      ✗ ${problem}`);
  if (p) {
    console.log(`      ${p.decision.toUpperCase()} · ${p.confidence} confidence`);
    console.log(`      Headline: ${p.headline}`);
    console.log(`      Explanation: ${p.explanation}`);
    console.log(`      Evidence:${p.evidence.map((e) => `\n        - ${e}`).join("")}`);
    console.log(`      Actions:${p.actions.length ? p.actions.map((a) => `\n        - ${a.kind} ${a.target}: ${a.reason}`).join("") : " none"}`);
  }
  console.log(`      Lookups: ${r.lookups.join(", ")}\n`);
}

const total = results.reduce(
  (t, r) => ({
    input: t.input + r.tokens.input,
    cacheRead: t.cacheRead + r.tokens.cacheRead,
    cacheWrite: t.cacheWrite + r.tokens.cacheWrite,
    output: t.output + r.tokens.output,
  }),
  { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
);
// Claude Opus 5.5 list prices per million tokens; a gateway may bill differently.
const cost = (total.input * 4 + total.cacheWrite * 5 + total.cacheRead * 0.2 + total.output * 20) / 1e6;
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(
  `Tokens: ${total.input} input, ${total.cacheWrite} cache write, ${total.cacheRead} cache read, ${total.output} output (≈ $${cost.toFixed(2)} at Opus 5.5 list prices)`,
);

mkdirSync("data/agent-evals", { recursive: true });
const file = `data/agent-evals/${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`;
writeFileSync(file, JSON.stringify({ label, model: process.env.AGENT_MODEL, results, total }, null, 2));
console.log(`Saved ${file}`);
