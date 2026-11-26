// Live agent: Claude investigates one finding with the lookup tools and ends
// by calling submit_proposal. Uses the SDK's tool runner (we host the loop,
// so the tools run in-process against the demo data).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Repo } from "../data/repo.js";
import type { Finding } from "../detectors/index.js";
import { lookupTools } from "./tools.js";
import { ProposalSchema, type Emit, type Proposal } from "./types.js";

const MODEL = process.env.AGENT_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.AGENT_EFFORT ?? "medium") as "low" | "medium" | "high";

const SYSTEM = `You are AccessHound's access-review agent. A rule-based detector has flagged a possible access problem at a company. Your job is to investigate it, explain it in plain language, and propose what to do. A human reviewer makes the final decision; you never change access yourself.

How to work:
- Verify the detector's claims with the tools before relying on them. Look at HR history, the access list, tickets, peers, badge swipes and logins as relevant.
- Look for legitimate reasons too. A valid, unexpired, properly approved ticket can justify unusual access; in that case propose "keep". Expired or "temporary" tickets do not justify access today.
- Propose "revoke" when access should be removed, listing the exact groups to remove (use group ids from list_access). Remove only what is unjustified; leave baseline access alone.
- Propose "escalate" when the evidence suggests an active security incident (e.g. a leaver's badge used after leaving, or a login that cannot be the real person). Include containment actions such as disable_badge, disable_account or reset_credentials, plus open_incident.
- Write for a busy manager: short, concrete, with names, dates and systems. No jargon like "entitlement" or "principal" in the headline or explanation.
- Finish by calling submit_proposal exactly once. Do not write a separate summary after it.`;

export async function investigateLive(repo: Repo, finding: Finding, emit: Emit): Promise<Proposal | undefined> {
  const client = new Anthropic();
  let proposal: Proposal | undefined;
  let callSeq = 0;

  const tools = lookupTools(repo).map((t) =>
    betaZodTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      run: (input) => {
        const id = `call-${++callSeq}`;
        emit({ type: "tool_call", id, name: t.name, input });
        const output = t.run(input as never);
        emit({ type: "tool_result", id, name: t.name, output });
        return JSON.stringify(output);
      },
    }),
  );

  const submit = betaZodTool({
    name: "submit_proposal",
    description: "Submit your final recommendation for the human reviewer. Call this exactly once, at the end.",
    inputSchema: ProposalSchema,
    run: (input) => {
      proposal = input;
      emit({ type: "proposal", proposal: input });
      return "Proposal recorded for human review. You are done.";
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 15,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: EFFORT },
    cache_control: { type: "ephemeral" },
    system: SYSTEM,
    tools: [...tools, submit],
    messages: [
      {
        role: "user",
        content: `Today is ${repo.c.asOf}. Company: ${repo.c.name}.\n\nInvestigate this finding:\n${JSON.stringify(finding, null, 2)}`,
      },
    ],
  });

  for await (const message of runner) {
    for (const block of message.content) {
      if (block.type === "text" && block.text.trim()) emit({ type: "text", text: block.text });
    }
    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "The model declined to continue this investigation." });
      break;
    }
    if (proposal) break; // submit_proposal ran; no need for another turn
  }

  if (!proposal) emit({ type: "error", message: "The agent finished without submitting a proposal." });
  return proposal;
}
