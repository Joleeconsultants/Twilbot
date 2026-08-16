import assert from "node:assert/strict";
import test from "node:test";
import {
  advancePromptFlow,
  buildOutputPayload,
  buildRestRequest,
  classifyConversationRelayEvent,
  evaluateDeterministicCondition,
  formatOutputEmail,
  normalizeE164,
  outputRetryDelaySeconds,
  renderTemplate,
  runPostCallOutputPipeline
} from "../src/index.ts";

const values = { caller: { id: "(555) 010-0200" }, company: "Example Co" };

test("renders only supplied tenant values", () => {
  assert.equal(renderTemplate("Call {{caller.id}} for {{company}}", values), "Call (555) 010-0200 for Example Co");
});

test("evaluates deterministic conditions", () => {
  assert.equal(evaluateDeterministicCondition({ left: "company", operator: "contains", right: "example" }, values), true);
  assert.equal(evaluateDeterministicCondition({ left: "missing", operator: "is_empty" }, values), true);
});

test("builds a REST request without exposing a token in the URL", () => {
  const request = buildRestRequest({
    key: "lookup",
    scope: "live_variable",
    method: "POST",
    url: "https://api.example.test/lookup",
    parameters: [{ name: "caller_id", where: "json", source: "{{caller.id}}", required: true }]
  }, values, "private-token");
  assert.equal(request.headers.authorization, "Bearer private-token");
  assert.equal(request.url, "https://api.example.test/lookup");
  assert.deepEqual(request.body, { caller_id: "(555) 010-0200" });
});

test("formats generic output without tenant labels", () => {
  const payload = buildOutputPayload({ company_name: "Example Co", issue_summary: "Needs help." });
  assert.equal(payload.output.text, "Company Name: Example Co\n\nSummary: Needs help.");
  assert.equal(normalizeE164("555-010-0200"), "+15550100200");
});

test("advances a prompt graph through a branch until an answer is required", async () => {
  const result = await advancePromptFlow({
    queue: ["intro", "route", "finish"],
    prompts: [
      { id: "intro", text: "Hello {{company}}", mode: "statement" },
      { id: "followup", text: "What can we help with?" },
      { id: "finish", text: "Goodbye", mode: "statement" },
    ],
    conditions: [{ id: "route", thenIds: ["followup"], elseIds: [] }],
    values,
    decideCondition: () => true,
    shouldWaitForAnswer: (prompt) => prompt.mode !== "statement",
  });
  assert.deepEqual(result.spokenPromptIds, ["intro", "followup"]);
  assert.equal(result.text, "Hello Example Co\n\nWhat can we help with?");
  assert.equal(result.currentPrompt?.id, "followup");
  assert.equal(result.waitingForAnswer, true);
  assert.deepEqual(result.queue, ["finish"]);
});

test("formats an escaped plain-text output email", () => {
  const email = formatOutputEmail({ company_name: "Example <Co>", issue_summary: "Needs help." }, "Phone call");
  assert.equal(email.text, "Company Name: Example <Co>\n\nSummary: Needs help.");
  assert.match(email.html, /Example &lt;Co&gt;/);
});

test("classifies generic realtime call events without provider bindings", () => {
  assert.deepEqual(classifyConversationRelayEvent({ type: "setup" }), { kind: "connected", transcript: "" });
  assert.deepEqual(classifyConversationRelayEvent({ type: "prompt", voicePrompt: "Need help" }), { kind: "caller_prompt", transcript: "Need help" });
  assert.deepEqual(classifyConversationRelayEvent({ type: "dtmf", digit: "1" }), { kind: "dtmf", transcript: "1" });
});

test("runs the generic post-call sequence and skips disabled email", async () => {
  const steps = [];
  const result = await runPostCallOutputPipeline({ value: 0, email: false }, {
    step: async (name, work) => { steps.push(name); return work(); },
    start: async (state) => ({ ...state, value: state.value + 1 }),
    isDuplicate: () => false,
    duplicateResult: () => ({ ok: true, duplicate: true }),
    loadSettings: async (state) => ({ ...state, value: state.value + 1 }),
    formatOutput: async (state) => ({ ...state, value: state.value + 1 }),
    runSorters: async (state) => ({ ...state, value: state.value + 1 }),
    shouldSendEmail: (state) => state.email,
    sendEmail: async (state) => ({ ...state, value: state.value + 1 }),
    skipEmail: async (state) => ({ ...state, value: state.value + 1 }),
    runDestinations: async (state) => ({ ...state, value: state.value + 1 }),
    persist: async (state) => ({ ...state, value: state.value + 1 }),
    result: (state) => ({ ok: true, value: state.value }),
  });
  assert.deepEqual(result, { ok: true, value: 7 });
  assert.deepEqual(steps, ["1. Start output delivery", "2. Load output settings", "3. Format output", "3a. Run REST output sorters", "4a. Skip email output", "5. Run REST output destinations", "6. Persist output result"]);
  assert.equal(outputRetryDelaySeconds(0), 5);
  assert.equal(outputRetryDelaySeconds(2), 20);
  assert.equal(outputRetryDelaySeconds(10), 300);
});
