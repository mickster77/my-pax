import { readdirSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";

// Strategy Lab results/replay API. (This replaces the original Pax live-game
// WebSocket host — the lab is bots-only, so the server's job is now just to serve
// tournament summaries and recorded replays that the lab wrote to a runs dir, for
// the web UI to fetch.)
//
//   Lab → writes <name>.summary.json / <name>.replay.json into RUNS_DIR
//   Web → GET /api/summaries, /api/replays, and the file by name
//
// Point the lab's --out / --replay at RUNS_DIR (default ./runs):
//   npm run dev:lab -- --game catan --seats builder,random,random --out runs/catan
//   npm run dev:lab -- --game monopoly --seats buyer,random --replay runs/monopoly.replay.json

const RUNS_DIR = resolve(process.env.RUNS_DIR ?? "runs");
const PORT = Number(process.env.PORT ?? 4000);

function listFiles(suffix: string): string[] {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(suffix))
    .sort();
}

function readJson(name: string): unknown | null {
  // Only a plain summary/replay filename — strict charset (no separators) plus an
  // allow-list of suffixes. This already excludes traversal; the realpath check
  // below additionally blocks symlinks that escape RUNS_DIR.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (!name.endsWith(".summary.json") && !name.endsWith(".replay.json")) return null;
  const path = join(RUNS_DIR, name);
  if (!existsSync(path)) return null;
  try {
    const real = realpathSync(path);
    if (real !== RUNS_DIR + sep + name) return null; // reject symlinks / anything not directly in RUNS_DIR
    return JSON.parse(readFileSync(real, "utf8"));
  } catch {
    return null; // corrupt/partial JSON, EISDIR, EACCES, etc. → treat as not found
  }
}

async function main(): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, runsDir: RUNS_DIR }));

  app.get("/api/summaries", async () => ({ files: listFiles(".summary.json") }));
  app.get("/api/replays", async () => ({ files: listFiles(".replay.json") }));

  app.get<{ Params: { name: string } }>("/api/file/:name", async (req, reply) => {
    const data = readJson(req.params.name);
    if (data === null) return reply.code(404).send({ error: `Not found: ${req.params.name}` });
    return data;
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`Strategy Lab results API on http://localhost:${PORT} (runs dir: ${RUNS_DIR})`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
