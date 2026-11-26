// `npm run check-agent`: one small request with the live agent's settings, to confirm the key,
// endpoint (Anthropic or a proxy such as LiteLLM) and model work before a demo.
// Costs a fraction of a cent. Prints where it connected, never the key.

import "../env.js"; // must stay first
import Anthropic from "@anthropic-ai/sdk";
import { agentRequestSettings } from "../agent/live.js";

const client = new Anthropic();
const { model } = agentRequestSettings;
const fallbacks = "fallbacks" in agentRequestSettings ? "on" : "off";
console.log(`Endpoint:  ${client.baseURL}`);
console.log(`Model:     ${model}`);
console.log(`Fallbacks: ${fallbacks} (AGENT_FALLBACKS)\n`);

try {
  const res = await client.beta.messages.create({
    ...agentRequestSettings,
    max_tokens: 1024,
    messages: [{ role: "user", content: "Reply with the single word OK." }],
  });
  if (res.stop_reason === "refusal") {
    console.log(`Connected, but the model declined the test request (${res.stop_details?.category ?? "no category"}).`);
  } else {
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text.trim()] : [])).join(" ");
    console.log(`Works. ${res.model} replied: "${text}"`);
    console.log("Restart the server (npm run dev) and the agent runs live.");
  }
} catch (err) {
  process.exitCode = 1;
  if (err instanceof Anthropic.AuthenticationError) {
    console.log("The key was rejected (401). Check ANTHROPIC_API_KEY, and that ANTHROPIC_BASE_URL points at the service the key is for.");
  } else if (err instanceof Anthropic.PermissionDeniedError) {
    console.log(`The key works but isn't allowed to use ${model} (403). Ask for access, or set AGENT_MODEL to a model it can use.`);
  } else if (err instanceof Anthropic.NotFoundError) {
    console.log(`Not found (404): the endpoint or model "${model}" doesn't exist there.`);
    console.log("On a LiteLLM proxy, AGENT_MODEL must be the proxy's model name, which may differ from Anthropic's.");
  } else if (err instanceof Anthropic.BadRequestError) {
    console.log(`The request was rejected (400): ${err.message}`);
    if (fallbacks === "on") console.log("If it mentions fallbacks or a beta, set AGENT_FALLBACKS=off and try again.");
  } else if (err instanceof Anthropic.RateLimitError) {
    console.log("Rate limited (429). The key works; try again in a minute.");
  } else if (err instanceof Anthropic.APIConnectionError) {
    console.log(`Couldn't connect to ${client.baseURL}. Check ANTHROPIC_BASE_URL and your network or VPN.`);
  } else if (err instanceof Anthropic.APIError) {
    console.log(`API error ${err.status}: ${err.message}`);
  } else {
    throw err;
  }
}
