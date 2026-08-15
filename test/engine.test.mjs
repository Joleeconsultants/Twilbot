import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOutputPayload,
  buildRestRequest,
  evaluateDeterministicCondition,
  normalizeE164,
  renderTemplate
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
