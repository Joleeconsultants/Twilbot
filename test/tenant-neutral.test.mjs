import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildOutputPayload,
  buildRestRequest,
  validateTenantConfig
} from "../src/index.ts";
import { blocked, scanPublicTree } from "../scripts/scan-public-tree.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const engineSourceRoots = ["src", "web", "examples"];
const ateraTicketKeys = ["TicketTitle", "Title", "CustomerID", "CustomerName", "EndUserEmail", "EndUserPhone"];
const tenantMarkers = [
  /Atera/i,
  /Jolee Phone/i,
  /Unassigned customer/i,
  /TicketTitle/,
  /api\.atera\.jolee\.ai/i,
  /\+15169730331/,
  /\+15164340641/,
  /516[-.\s]?973[-.\s]?0331/,
  /516[-.\s]?434[-.\s]?0641/
];
const deployMarkers = [
  /wrangler/i,
  /cloudflare\/wrangler-action/i,
  /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/,
  /\bCF_API_TOKEN\b/,
  /npm run deploy/i,
  /wrangler\s+deploy/i,
  /deploy-phone/i,
  /deploy-worker/i
];

async function readEngineFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return readEngineFiles(file);
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"].includes(extname(entry.name).toLowerCase())) return [];
    return [[file, await readFile(file, "utf8")]];
  }));
  return files.flat();
}

test("public-tree scan covers the 3-repo split markers", () => {
  const samples = [
    "Atera",
    "Jolee Phone",
    "Unassigned",
    "TicketTitle",
    "CustomerID",
    "api.atera.jolee.ai",
    "app.atera.com",
    "+15169730331",
    "+15164340641",
    "516-973-0331"
  ];
  for (const sample of samples) {
    assert.equal(
      blocked.some((expression) => expression.test(sample)),
      true,
      `blocklist should reject ${sample}`
    );
  }
});

test("engine source stays tenant-neutral", async () => {
  const scanMatches = await scanPublicTree();
  assert.deepEqual(scanMatches, []);

  const matches = [];
  for (const directory of engineSourceRoots) {
    for (const [file, contents] of await readEngineFiles(join(root, directory))) {
      for (const expression of tenantMarkers) {
        if (expression.test(contents)) matches.push(`${file}: ${expression}`);
      }
    }
  }
  assert.deepEqual(matches, []);
});

test("REST destination helper only shapes generic HTTP and has no ticket side effects", async () => {
  const source = await readFile(join(root, "src/index.ts"), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.doesNotMatch(source, /create[A-Z][A-Za-z]*Ticket/);
  for (const key of ateraTicketKeys) assert.equal(source.includes(key), false, key);

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (...args) => {
    fetchCalls += 1;
    if (typeof originalFetch === "function") return originalFetch(...args);
    return new Response(null, { status: 204 });
  };

  try {
    const secondTenant = JSON.parse(await readFile(join(root, "examples/tenant-config.second-tenant.example.json"), "utf8"));
    const parsed = validateTenantConfig(secondTenant);
    const destination = parsed.config.restTools.find((tool) => tool.scope === "output_destination");
    const output = buildOutputPayload({ company_name: "Example Co", customer_name: "Casey", issue_summary: "Needs help." });
    const request = buildRestRequest(destination, {
      output: output.output.text,
      TicketTitle: "[Jolee Phone] Example Co - Casey - Needs help.",
      CustomerName: "Unassigned",
      CustomerID: 1,
      EndUserPhone: "+15169730331"
    });

    assert.equal(fetchCalls, 0);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://api.second-tenant.example/output/destination");
    assert.deepEqual(request.body, { output: "Company Name: Example Co\n\nCustomer Name: Casey\n\nSummary: Needs help." });
    for (const key of ateraTicketKeys) assert.equal(key in request.body, false, key);
    assert.doesNotMatch(JSON.stringify(request), /Atera|Jolee Phone|Unassigned|TicketTitle|api\.atera\.jolee\.ai/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repository has CI checks and no tenant deploy workflows", async () => {
  for (const file of ["wrangler.toml", "wrangler.jsonc", "wrangler.json"]) {
    await assert.rejects(() => access(join(root, file), constants.F_OK));
  }

  const workflowDir = join(root, ".github/workflows");
  const names = await readdir(workflowDir);
  assert.ok(names.some((name) => name.endsWith(".yml") || name.endsWith(".yaml")), "expected a CI workflow");

  for (const name of names) {
    const contents = await readFile(join(workflowDir, name), "utf8");
    for (const expression of deployMarkers) {
      assert.equal(expression.test(contents), false, `${name} must not contain ${expression}`);
    }
    assert.match(contents, /npm run check|npm test/);
  }
});
