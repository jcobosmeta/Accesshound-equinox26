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
   - risky combinations, like "creates suppliers and approves payments"
   - a badge swipe in Madrid at the same time as a VPN login from abroad
3. **Investigate.** For each finding, an agent uses tools to check the HR record, group memberships and badge log, then explains it in plain language:
   *"Marta moved from Finance to Marketing in March and still has SAP payment approval."*
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

A fake company of about 40 people, with 5 planted access problems:

| # | Problem | What gives it away |
|---|---------|--------------------|
| 1 | Role-change leftover | Moved from Finance to Marketing and still has SAP payment approval |
| 2 | Leaver's badge | Left the company, and the badge still opens the server room |
| 3 | Orphaned service account | Its owner is gone and it still has admin rights |
| 4 | Toxic combination | Can both create suppliers and approve payments |
| 5 | Impossible travel | Badge swipe in Madrid while the VPN login comes from abroad |

The 5-minute demo runs on that data end to end. AccessHound maps the access and flags the five problems. The agent investigates each one and explains it. A person approves or rejects each proposal, and the audit trail fills in.

There is also a sixth, decoy case: Elena, an engineer, has server-room access that none of her peers have. A valid ticket approved by the CISO backs it, so the agent should propose **keep**. This shows the agent checks before it accuses anyone.

## Architecture

TypeScript throughout. The UI will be React built on [Mística](https://github.com/telefonica/mistica-web), so one language covers everything.

```
server/src/
  data/
    types.ts        domain model: people, service accounts, groups, entitlements, HR events, tickets, badge + login logs
    company.ts      the demo company (40 people, deterministic) with the planted cases
    repo.ts         read-only queries shared by detectors, agent tools and API
  detectors/        rule-based: leaver access, orphaned service account, role-change leftover,
                    separation-of-duties, impossible travel, peer outlier
  agent/
    tools.ts        read-only lookup tools the agent can call
    live.ts         Claude agent (SDK tool runner); finishes by calling submit_proposal
    replay.ts       scripted agent that calls the same tools on the same data — no API key needed
  store.ts          in-memory state; applies approved actions; writes the audit trail (data/audit.jsonl)
  index.ts          Express API
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
npm run dev          # API on http://localhost:8787 (auto-reloads)
```

```bash
npm run detect       # print the findings to the terminal
```

Set `ANTHROPIC_API_KEY` to use the live agent. Without it, everything runs in replay mode. The other settings are in [`.env.example`](.env.example).

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/summary` | Company name, counts and the default agent mode |
| GET | `/api/findings` | All findings with `status` (`open`, `investigating`, `proposed`, `approved`, `rejected`, `resolved`) and the proposal, if there is one |
| GET | `/api/findings/:id/investigate?mode=live\|replay` | Runs the agent and streams Server-Sent Events: `status`, `text`, `tool_call`, `tool_result`, `proposal`, `error`, `done` |
| POST | `/api/findings/:id/decision` | Body `{ "decision": "approved" \| "rejected", "reviewer": "...", "note": "..." }`. Applies the actions and writes to the audit trail |
| GET | `/api/principals/:id` | A person or service account's profile and every access path (entitlement ← group ← membership), for the graph |
| GET | `/api/audit` | The audit trail |
| POST | `/api/reset` | Restores the demo data and clears proposals and the audit trail |

## Status

- [x] Demo data, detectors, agent (live and replay), API, audit trail
- [ ] UI: findings list, access graph, live agent trace, approve/reject, audit trail
- [ ] Try the live agent with a real API key
