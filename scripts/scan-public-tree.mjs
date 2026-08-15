import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const blocked = [
  /joleeconsultants/i,
  /twilio\.jolee/i,
  /beta\.twilbot/i,
  /jolee\.twilbot/i,
  /atera\.jolee/i,
  /zacharygaret/i
];
const allowed = new Set(["scripts/scan-public-tree.mjs"]);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && [".git", "node_modules"].includes(entry.name)) return [];
    return entry.isDirectory() ? files(file) : [file];
  }));
  return nested.flat();
}

const matches = [];
for (const file of await files(root)) {
  const path = relative(root, file).replaceAll("\\", "/");
  if (allowed.has(path)) continue;
  const contents = await readFile(file, "utf8");
  for (const expression of blocked) {
    if (expression.test(contents)) matches.push(`${path}: ${expression}`);
  }
}

if (matches.length) {
  console.error("Public-tree scan found tenant-specific text:\n" + matches.join("\n"));
  process.exit(1);
}

console.log("Public-tree scan passed.");
