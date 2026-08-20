import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Markers that belong in Jolee-Twilbot or atera, never this engine.
 * Tests may name these strings; the scanner skips test/.
 */
export const blocked = [
  /joleeconsultants/i,
  /jolee(?:\.|\b)/i,
  /twilio\.jolee/i,
  /beta\.twilbot/i,
  /jolee\.twilbot/i,
  /atera\.jolee/i,
  /api\.atera\.jolee\.ai/i,
  /app\.atera\.com/i,
  /atera(?:\.|\b)/i,
  /TicketTitle/,
  /\bCustomerID\b/,
  /\bCustomerName\b/,
  /\bEndUserEmail\b/,
  /\bEndUserPhone\b/,
  /\bUnassigned\b/,
  /Jolee Phone/i,
  /\+15169730331/,
  /\+15164340641/,
  /516[-.\s]?973[-.\s]?0331/,
  /516[-.\s]?434[-.\s]?0641/,
  /zachary(?:\b|garet)/i,
  /rgaret/i,
  /@(?:gmail|joleeconsultants)\.com/i,
  /\b[0-9a-f]{32}\b/i
];

export const allowed = new Set(["scripts/scan-public-tree.mjs"]);
export const skippedDirectories = new Set([".git", "node_modules", "test"]);
export const skippedExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"]);

export async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) return [];
    return entry.isDirectory() ? collectFiles(file) : [file];
  }));
  return nested.flat();
}

export async function scanPublicTree(directory = root) {
  const matches = [];
  for (const file of await collectFiles(directory)) {
    const path = relative(root, file).replaceAll("\\", "/");
    if (allowed.has(path) || skippedExtensions.has(extname(path).toLowerCase())) continue;
    const contents = await readFile(file, "utf8");
    for (const expression of blocked) {
      if (expression.test(contents)) matches.push(`${path}: ${expression}`);
    }
  }
  return matches;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const matches = await scanPublicTree();
  if (matches.length) {
    console.error("Public-tree scan found tenant-specific text:\n" + matches.join("\n"));
    process.exit(1);
  }
  console.log("Public-tree scan passed.");
}
