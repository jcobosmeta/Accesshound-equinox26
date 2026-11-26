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
// Server-side fallbacks: if the model declines a request, the API retries it on a fallback model
// within the same call. Some proxies (e.g. LiteLLM routing to Bedrock or Vertex) reject the
// parameter; set AGENT_FALLBACKS=off for those.
const FALLBACKS = process.env.AGENT_FALLBACKS !== "off";
// The SDK's tool runner uses message threads by default: after the first turn it sends only the new
// messages and the API remembers the rest. Only Anthropic's API keeps threads; through a proxy
// (ANTHROPIC_BASE_URL set, e.g. LiteLLM) the backend gets tool results with no history and returns a 400.
const THREADS = !process.env.ANTHROPIC_BASE_URL;

/** Request settings shared by the live agent and `npm run check-agent`, so the check tests what the agent sends. */
export const agentRequestSettings = {
  model: MODEL,
  output_config: { effort: EFFORT },
  cache_control: { type: "ephemeral" as const },
  // The model's short notes between tool calls come back as `thinking` blocks, empty unless
  // display is "updates". The UI shows them as the "why" line above each lookup. Reasoning stays hidden.
  thinking: { type: "adaptive" as const, display: "updates" as const },
  betas: ["thinking-display-updates-2026-08-18", ...(FALLBACKS ? ["server-side-fallback-2026-07-01"] : [])],
  ...(FALLBACKS ? { fallbacks: "default" as const } : {}),
};

/** Placeholder the API puts in a progress block when the response was cut off; not worth showing. */
const INTERRUPTED = "This part of the response was interrupted before it finished.";

const SYSTEM = `You are AccessHound's access-review agent. A rule-based detector has flagged a possible access problem at a company. Your job is to investigate it, explain it in plain language, and propose what to do. A human reviewer makes the final decision; you never change access yourself.

How to work:
- Verify the detector's claims with the tools before relying on them. Look at HR history, the access list, tickets, peers, badge swipes and logins as relevant.
- Look for legitimate reasons too. A valid, unexpired, properly approved ticket can justify unusual access; in that case propose "keep". Expired or "temporary" tickets do not justify access today.
- Propose "revoke" when access should be removed, listing the exact groups to remove (use group ids from list_access). Remove only what is unjustified; leave baseline access alone.
- Propose "escalate" when the evidence suggests an active security incident (e.g. a leaver's badge used after leaving, or a login that cannot be the real person). Include containment actions such as disable_badge, disable_account or reset_credentials, plus open_incident.
- disable_account already removes every group membership, so don't also list remove_from_group actions for the same person.
- A reviewer watches your investigation live. Before each round of lookups, say in one short sentence what you're checking and why.

How to write the proposal (it is shown on a card, so keep it tight):
- headline: one sentence of at most 25 words that a busy manager understands.
- explanation: at most four short sentences: what is wrong, why it matters, what you recommend. Leave the details to the evidence.
- evidence: one verified fact per item, with the source, names and ids. Write dates as "14 nov 2026" and times as "22:47".
- Plain language: no jargon like "entitlement" or "principal" in the headline or explanation.
- Write everything the reviewer sees in Spanish (Spain): your short notes between lookups, the headline, explanation, evidence and each action's reason. Keep names, ids, group names and system names exactly as the tools return them.
- Finish by calling submit_proposal exactly once.`;

/** Called with each model response; used by `npm run eval-agent` to add up token usage. */
export type OnMessage = (message: Anthropic.Beta.BetaMessage) => void;

export async function investigateLive(
  repo: Repo,
  finding: Finding,
  emit: Emit,
  onMessage?: OnMessage,
): Promise<Proposal | undefined> {
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
    ...agentRequestSettings,
    ...(THREADS ? {} : { thread: false as const }),
    max_tokens: 16000,
    max_iterations: 15,
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
    onMessage?.(message);
    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "The model declined to continue this investigation." });
      break;
    }
    const submitCall = message.content.find((b) => b.type === "tool_use" && b.name === "submit_proposal");
    // Text next to submit_proposal restates the proposal, which the UI already shows as a card.
    // Non-empty thinking blocks are progress notes (display: "updates"); empty ones are hidden reasoning.
    for (const block of message.content) {
      const note = block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : "";
      if (note.trim() && note.trim() !== INTERRUPTED && !submitCall) emit({ type: "text", text: note.trim() });
    }
    // The runner yields a message before running its tools. Stop here on a valid proposal: otherwise
    // the runner sends the tool result back and the model spends another turn writing a recap.
    // An invalid one falls through: the runner returns the validation error and the model retries.
    if (submitCall?.type === "tool_use") {
      const parsed = ProposalSchema.safeParse(submitCall.input);
      if (parsed.success) {
        proposal = parsed.data;
        emit({ type: "proposal", proposal });
        break;
      }
    }
    if (proposal) break;
  }

  if (!proposal) emit({ type: "error", message: "The agent finished without submitting a proposal." });
  return proposal;
}
