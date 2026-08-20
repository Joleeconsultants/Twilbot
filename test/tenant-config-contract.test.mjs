import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  TENANT_CONFIG_VERSION,
  exportTenantConfig,
  parseTenantConfig,
  validateTenantConfig
} from "../src/index.ts";
import { isTenantConfigExample, validateExampleFiles } from "../scripts/validate-examples.mjs";

const examplesDir = fileURLToPath(new URL("../examples", import.meta.url));

function generatedOnboardConfig() {
  return {
    version: TENANT_CONFIG_VERSION,
    branding: { applicationName: "Generated Tenant Phone" },
    restTools: [
      {
        key: "caller_lookup",
        scope: "live_variable",
        method: "POST",
        url: "https://api.generated-tenant.example/lookup",
        tokenAlias: "GENERATED_LOOKUP_TOKEN",
        parameters: [
          { name: "caller_id", where: "json", source: "{{caller_id}}", required: true }
        ]
      },
      {
        key: "post_call_sorter",
        scope: "output_sorter",
        method: "POST",
        url: "https://api.generated-tenant.example/output/sort",
        tokenAlias: "GENERATED_OUTPUT_TOKEN",
        parameters: [
          { name: "output", where: "json", source: "{{output}}", required: true }
        ]
      }
    ]
  };
}

test("tenant-config contract is versioned and documented", async () => {
  assert.equal(TENANT_CONFIG_VERSION, 1);
  const schema = JSON.parse(await readFile(join(examplesDir, "tenant-config.schema.json"), "utf8"));
  assert.equal(schema.properties.version.const, TENANT_CONFIG_VERSION);
  const contractReadme = await readFile(join(examplesDir, "README.md"), "utf8");
  assert.match(contractReadme, /AI-onboard contract/);
  assert.match(contractReadme, /version` must be `1/);
  assert.match(contractReadme, /validateTenantConfig/);
});

test("checked-in tenant-config examples validate", async () => {
  const names = (await readdir(examplesDir)).filter(isTenantConfigExample);
  assert.deepEqual(names.sort(), [
    "tenant-config.example.json",
    "tenant-config.second-tenant.example.json"
  ]);
  const results = await validateExampleFiles();
  assert.equal(results.length, 2);
  for (const { name, parsed } of results) {
    assert.equal(parsed.ok, true, `${name}: ${parsed.errors.join("; ")}`);
    assert.equal(parsed.config?.version, TENANT_CONFIG_VERSION);
  }
});

test("AI-generated tenant-config validates against the onboard contract", () => {
  const generated = generatedOnboardConfig();
  const result = validateTenantConfig(generated);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.config?.version, TENANT_CONFIG_VERSION);
  assert.equal(result.config?.branding.applicationName, "Generated Tenant Phone");
  assert.equal(result.config?.restTools?.length, 2);

  const exported = exportTenantConfig(generated);
  const parsed = parseTenantConfig(exported);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.config, result.config);

  const invalid = validateTenantConfig({
    ...generated,
    restTools: [{
      ...generated.restTools[0],
      token: "sk-live-never-export",
      url: "http://api.generated-tenant.example/lookup?api_key=never-export"
    }]
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /tokenAlias/);
  assert.match(invalid.errors.join(" "), /HTTPS/);
});
