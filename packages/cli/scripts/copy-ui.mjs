// Bundle the built UI next to the server: dist/ui (served by bin.js).
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "ui", "dist");
const to = join(here, "..", "dist", "ui");
if (!existsSync(join(from, "index.html"))) {
  console.error(`copy-ui: ${from} has no index.html; build @ratel-ai/burrow-ui first.`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copy-ui: ${from} → ${to}`);
