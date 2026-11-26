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

## Hackathon

Built for **Equinox: Solstice Edition**, a 24-hour hackathon held 26–27 Nov 2026.

- **Submission deadline:** 27 Nov, 10:30
- **Pitch:** 5 minutes per team
- **Prizes we're aiming for:** Number One, Best Cybersecurity, Best AI, B2A (best agent-based project)

**Plan:** have the demo working end to end on fake data by about 02:00. Use the rest of the time for polish and for rehearsing the pitch.

If time runs short, cut back to the core: fake company, 5 planted problems, the agent's findings and the approve button.

## Status

🚧 Just started. Stack and repo layout to come.
