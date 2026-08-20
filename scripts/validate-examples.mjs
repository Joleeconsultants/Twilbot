import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TENANT_CONFIG_VERSION, parseTenantConfig } from "../src/index.ts";

const examplesDir = fileURLToPath(new URL("../examples", import.meta.url));

export function isTenantConfigExample(name) {
  return name.startsWith("tenant-config") && name.endsWith(".json") && !name.endsWith(".schema.json");
}

export async function validateExampleFiles(directory = examplesDir) {
  const names = (await readdir(directory)).filter(isTenantConfigExample).sort();
  const results = [];
  for (const name of names) {
    const serialized = await readFile(join(directory, name), "utf8");
    const parsed = parseTenantConfig(serialized);
    results.push({ name, parsed });
  }
  return results;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const results = await validateExampleFiles();
  if (!results.length) {
    console.error("No tenant-config examples found.");
    process.exit(1);
  }
  let failed = false;
  for (const { name, parsed } of results) {
    if (!parsed.ok || parsed.config?.version !== TENANT_CONFIG_VERSION) {
      console.error(`${name}: ${(parsed.errors.length ? parsed.errors : ["unexpected contract version"]).join("; ")}`);
      failed = true;
      continue;
    }
    console.log(`${name}: valid tenant-config v${parsed.config.version}`);
  }
  if (failed) process.exit(1);
}
