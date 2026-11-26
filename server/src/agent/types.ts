import { z } from "zod";

export const ProposalSchema = z.object({
  decision: z
    .enum(["revoke", "keep", "escalate"])
    .describe("revoke = remove the access; keep = access is justified; escalate = possible security incident, hand to the security team"),
  headline: z.string().describe("One sentence a manager understands, e.g. 'Marta moved to Marketing in March and can still approve SAP payments.'"),
  explanation: z.string().describe("2-4 sentences in plain language: what you found, why it matters, why you recommend this decision."),
  evidence: z.array(z.string()).describe("Concrete facts you verified with tools, each with dates/ids, e.g. 'HR: transferred Finance → Marketing on 2026-03-02'."),
  actions: z
    .array(
      z.object({
        kind: z.enum(["remove_from_group", "disable_account", "disable_badge", "reset_credentials", "open_incident"]),
        target: z.string().describe("Group id for remove_from_group (e.g. 'g-fin-payment-approvers'); principal id for the other kinds."),
        reason: z.string(),
      }),
    )
    .describe("What should happen if a human approves. Empty for 'keep'."),
  confidence: z.enum(["low", "medium", "high"]),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/** Events streamed to the UI while the agent works. */
export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: unknown }
  | { type: "proposal"; proposal: Proposal }
  | { type: "error"; message: string }
  | { type: "done" };

export type Emit = (event: AgentEvent) => void;
