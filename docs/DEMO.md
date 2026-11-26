# AccessHound demo run sheet

A 5-minute demo: three cases end to end, the audit trail, and a one-line close. Live investigations take 7–17 seconds each, so talk over the agent's notes while it works.

## Before you go on

Do these 15 minutes before, on the machine you present from.

- [ ] Your LiteLLM key is in `server/.env`, and `npm run check-agent` prints **Works**.
- [ ] Start the app on one port:
  ```bash
  npm run build && npm start      # UI and API on http://localhost:8787
  ```
- [ ] Open http://localhost:8787. The header must say **Live agent**. If it says **Replay agent**, the key wasn't picked up: check `server/.env` and restart.
- [ ] The browser window is at least 1280px wide, or zoomed to 90%. Below 1024px the findings list moves above the detail, so you lose the side-by-side view.
- [ ] Run one case, approve it, then type your name as **Reviewer** so it's pre-filled. Then click **Reset demo** and **Reset** in the dialog.
- [ ] Quick rehearsal of Patricia (below), then **Reset demo** again.
- [ ] Turn off notifications, close other tabs, and set the font size so the back row can read it.

## The script

| Time | What you click | What you say |
|---|---|---|
| **0:00** | Nothing. Show the page. | "Every company hands out hundreds of keys: app accounts, admin groups, VPN, badges that open doors. Nobody tracks who still has which. AccessHound maps all of it in one graph, rules flag what looks wrong, and an AI agent investigates each finding so a person can decide." |
| **0:20** | Point at the band at the top and the list. | "This is FCYBERL: 24 people, 1 service account, 11 kinds of access. The rules found four problems, sorted by what needs attention." |
| **0:35** | Click **Patricia Román Castro** (Role-change leftover). | "Patricia moved from Marketing to Design in March." |
| **0:45** | Scroll to **Access map**. Hover **Firebase de Marketing**. | "Here's everything they can reach, and through which group. In red, what the rules flagged: they can still reach Marketing's Firebase." |
| **1:05** | Click **Investigate**. | "Now the agent checks it. Its tools are read-only: HR history, groups, tickets, peers, badge and login logs." Read one or two of its notes aloud as they appear. |
| **1:25** | Point at the proposal card. | "It recommends **revoke**. Look at the evidence: their approval ticket is still open, but it was granted for campaign analytics in Marketing, a job they no longer have. Nobody in Design has Firebase access." |
| **1:45** | Click **Approve and revoke**. Scroll up to the map. | "A person decides, not the AI. On approval the change is applied: those paths are now dashed, revoked. Their Design access stays." |
| **3:05** | Click **Marcos Barba Ballarín** (Peer outlier), then **Investigate**. | "Last one. Marcos is the only person in AI who has a Descodificador DEMO. A naive tool would say revoke." |
| **3:30** | Point at **Keep**. | "The agent found a ticket approved by the CISO for datacentre on-call, valid until March 2027, so it recommends **keep**. It checks before it accuses anyone." |
| **3:50** | Click **Approve: keep access**. | "Nothing changes, and the decision is still recorded." |
| **4:05** | Click **Audit trail** at the top, then **Download CSV**. | "Every decision: what the agent proposed, who approved it, and what actually changed. That's the evidence a NIS2 audit asks for, and here it is as a file you can hand an auditor." |
| **4:30** | Back to **Findings**. Point at the two you didn't open. | "It also caught Daniel, who can administer both Firebase and Azure, and a login from Lagos 19 minutes after a badge-in in Madrid." |
| **4:45** | Nothing. | "Rules decide what looks wrong, so nothing is missed. The AI investigates and explains. A person always decides." |

**Short on time?** Do Patricia, then Marcos, then the audit trail: it still tells the whole story.

**Saving time:** a finding's investigation keeps running when you switch to another one. While you're explaining Patricia's proposal, you can click Marcos and **Investigate**, then come back. By the time you need it, it's done.

**Showing all four?** Click **Investigate all** above the findings list. It runs the agent on every open finding, 4 at a time with the rest shown as **Queued**, and all four are ready in about 20 seconds. Then walk through the proposals instead of waiting on each one. It's also a strong opening for a longer slot.

## If something goes wrong

| What you see | What to do |
|---|---|
| The trace says **Live agent unavailable — switching to replay** | Carry on. Replay runs the same read-only lookups on the same data, so the evidence is real. You can mention it: "and there's the safety net." |
| The agent takes more than 30 seconds | Keep talking over its notes. If it's stuck, click another finding and come back later; the investigation keeps running. |
| You approved the wrong thing | **Reset demo** (top right), then **Reset**. It restores all data and clears the audit trail. Then redo the case you were on. |
| A section shows "Couldn't draw…" | Click **Try again**, or pick another finding. |
| The whole page shows "AccessHound hit a problem" | Click **Reload**. The data lives on the server, so nothing is lost. |
| The network or gateway is down | Set `AGENT_MODE=replay` in `server/.env` and restart `npm start`. Everything works offline, with the header saying **Replay agent**. |

## Likely questions

- **"What if the AI is wrong?"** It can't change anything: its tools only read. Every change needs a person's approval, and the evidence it cites is on the card to check.
- **"How do you stop it missing things?"** Detection isn't AI. Fixed rules flag the findings; the agent only investigates what they flag.
- **"Where does the data come from?"** In this demo, a generated company. In production: HR records, directory groups, SaaS accounts and badge logs, combined into one graph.
- **"What does it cost?"** About 6 cents per investigation with Claude Opus 5.5, and 7–17 seconds.
- **"Why not just remove all unusual access?"** Marcos: unusual isn't the same as wrong. The agent looks for the reason before it recommends anything.
