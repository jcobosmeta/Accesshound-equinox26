# AccessHound

> BloodHound-style risk analysis for physical and digital access. Maps who can reach what, and an AI agent explains each risk so humans can review and revoke it.

Every company hands out hundreds of keys: app accounts, admin groups, VPN access, badges that open doors. Nobody keeps track of who still has which ones. People change roles and keep their old access, leavers' badges still open the server room, and service accounts outlive their owners.

BloodHound shows attack paths in Active Directory. **AccessHound** maps all access, digital and physical, in one graph, and gives it to an agent that does the review.

**The agent investigates and recommends; a person always decides.**

## How it works

1. **Map.** Combine HR records, group memberships, SaaS accounts and badge logs into one graph of who can do what.
2. **Detect.** Find the outliers:
   - access none of your peers have
   - leftovers from a previous role
   - risky combinations, like holding both Firebase and Azure admin
   - a work phone registering in Madrid while the VPN login comes from abroad
3. **Investigate.** For each finding, an agent uses tools to check the HR record, group memberships and device log, then explains it in plain language:
   *"Patricia pasó a Diseño en marzo y sigue teniendo VPN DEMO y Firebase de Marketing."*
4. **Decide.** The agent proposes **revoke** or **keep**. A human approves or rejects it, and every decision is written to an audit trail, ready for NIS2.

```
 HR records ─┐
 Groups ─────┤                 ┌──────────────┐     ┌────────────┐     ┌─────────────┐
 SaaS accts ─┼─► access graph ─► detectors    ├────► agent      ├────► human       │
 Badge logs ─┘                 │ (findings)   │     │ (evidence, │     │ approve /   │
                               └──────────────┘     │  proposal) │     │ reject      │
                                                    └────────────┘     └──────┬──────┘
                                                                              ▼
                                                                         audit trail
```

## Demo scenario

A fake company, FCYBERL, built from the Future Cybersecurity Lab team: 24 people (real GitHub names and photos, invented roles) and 1 service account. The UI and the agent's output are in Spanish. There are 3 planted access problems:

| # | Problem | What gives it away |
|---|---------|--------------------|
| 1 | Role-change leftover | Patricia moved from Marketing to Design and still has Marketing's VPN DEMO and Firebase |
| 2 | Toxic combination | Daniel has Firebase and Azure admin; the Azure access came from a temporary ticket that expired |
| 3 | Impossible travel | Carlos's phone registered in Madrid, and 19 minutes later their VPN login came from Lagos |

The 5-minute demo runs on that data end to end ([docs/DEMO.md](docs/DEMO.md)). AccessHound maps the access and flags the problems. The agent investigates each one and explains it. A person approves or rejects each proposal, the audit trail fills in, and the risk map calms down.

There is also a fourth, decoy case: Marcos, on the AI team, is the only one with a Descodificador DEMO. A valid ticket approved by the CISO backs it, so the agent should propose **keep**. This shows the agent checks before it accuses anyone.

## Architecture

TypeScript throughout. The UI is React built on [Mística](https://github.com/telefonica/mistica-web) with the Telefónica skin, so one language covers everything.

```
server/src/
  data/
    types.ts        domain model: people, service accounts, groups, entitlements, HR events, tickets, badge + login logs
    company.ts      the demo company (24 people, deterministic) with the planted cases
    repo.ts         read-only queries shared by detectors, agent tools and API
  detectors/        rule-based: leaver access, orphaned service account, role-change leftover,
                    separation-of-duties, impossible travel, peer outlier
  agent/
    tools.ts        read-only lookup tools the agent can call
    live.ts         Claude agent (SDK tool runner); finishes by calling submit_proposal
    replay.ts       scripted agent that calls the same tools on the same data — no API key needed
  store.ts          in-memory state; applies approved actions; writes the audit trail (data/audit.jsonl)
  risk.ts           risk score per person and account for the risk map; drops once findings are approved
  audit-export.ts   the audit trail as CSV or JSON for download
  index.ts          Express API; also serves web/dist when it has been built

web/src/
  App.tsx           app shell and state: three views (risk map, findings, audit), agent traces, decisions, reset;
                    investigations are queued, 4 at a time
  api.ts            typed API client; investigate() reads the agent's SSE stream
  present.tsx       labels, icons and colours for findings, statuses and decisions
  usePrincipal.ts   loads a person's access and remembers what was revoked
  components/
    OrgRiskGraph    the whole organisation as a graph, coloured by risk; click someone to inspect them
    PrincipalInspector  one person's access map, findings and investigations, opened from the risk map
    AnalysesView    analyses: each one lists the findings with the agent's proposal and your decision;
                    "Investigar todos" runs the agent on all of them
    SummaryBand     company snapshot and risk and decision counts
    FindingDetail   rule facts, access map, agent investigation and proposal for one finding
    AccessGraph     person → groups → entitlements in three columns; flagged paths in red,
                    revoked paths dashed after approval; stacks vertically on mobile
    AgentTrace      the agent's steps as they stream in: why, which lookup, what came back
    ProposalCard    the recommendation, evidence and planned changes; approve or reject
    AuditTrail      every decision and what it changed, with CSV and JSON download
```

- **Detection is deterministic and investigation is AI.** The rules decide what looks wrong, so a planted case is never missed. The agent verifies each finding, explains it and proposes `revoke`, `keep` or `escalate`.
- **The agent can't change anything.** All its tools are read-only. Access changes only when a human approves a proposal. Approving actually changes the data, so a finding that's been fixed disappears on re-detection.
- **Replay mode is the demo's safety net.** If there's no API key, or the live call fails, the agent falls back to replay. Replay runs the real tools, so the evidence on screen is still real.

## Running it

Requires Node 22+.

```bash
npm install
```

```bash
npm run dev          # API on :8787 and UI on http://localhost:5173, both auto-reload
```

```bash
npm run build        # build the UI into web/dist
npm start            # then the API serves the UI too, on http://localhost:8787
```

```bash
npm run detect       # print the findings to the terminal
```

### Live agent

Without a key, everything runs in replay mode. To use the live agent, copy [`.env.example`](.env.example) to `server/.env`, which is gitignored and loaded on startup, and set `ANTHROPIC_API_KEY`. Then check the setup before a demo:

```bash
npm run check-agent  # one small request with the agent's settings; says what to fix if it fails
```

To see how the live agent does on every case, for example after changing its prompt in `server/src/agent/live.ts`:

```bash
npm run eval-agent -- my-label   # all findings in parallel, about $0.35 in total
```

It checks each proposal against the expected outcome for the planted case: the decision and the key actions. It also flags redundant actions and proposals too long for the card. It prints every proposal and saves the run to `server/data/agent-evals/` for comparison. It uses its own copy of the demo data, so the running server isn't affected.

**Through a LiteLLM proxy:** set `ANTHROPIC_BASE_URL` to the proxy's URL and `ANTHROPIC_API_KEY` to the proxy key. If the proxy uses its own model names, set `AGENT_MODEL` to the one it uses for Claude Opus 5.5. If requests fail with an error about fallbacks or a beta, set `AGENT_FALLBACKS=off`. With a proxy URL set, the agent sends the full conversation every turn rather than using message threads, which only Anthropic's API supports. If the live agent fails during a demo, the server switches to replay and logs the error.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/summary` | Company name, counts and the default agent mode |
| GET | `/api/findings` | All findings with `status` (`open`, `investigating`, `proposed`, `approved`, `rejected`, `resolved`) and the proposal, if there is one |
| GET | `/api/findings/:id/investigate?mode=live\|replay` | Runs the agent and streams Server-Sent Events: `status`, `text`, `tool_call`, `tool_result`, `proposal`, `error`, `done` |
| POST | `/api/findings/:id/decision` | Body `{ "decision": "approved" \| "rejected", "reviewer": "...", "note": "..." }`. Applies the actions and writes to the audit trail |
| GET | `/api/principals/:id` | A person or service account's profile and every access path (entitlement ← group ← membership), for the graph |
| GET | `/api/audit` | The audit trail |
| GET | `/api/audit/export?format=csv\|json` | The audit trail as a file download: CSV for spreadsheets (opens correctly in Excel), or JSON |
| POST | `/api/reset` | Restores the demo data and clears proposals and the audit trail |

## Status

- [x] Demo data, detectors, agent (live and replay), API, audit trail
- [x] UI: findings list, access graph, live agent trace, approve/reject, audit trail
- [ ] Try the live agent with a real API key
