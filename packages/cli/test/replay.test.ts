import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeReplay, loadSdk } from "../src/replay";

const trace = readFileSync(new URL("./fixtures/replay.jsonl", import.meta.url), "utf8");
const here = new URL(".", import.meta.url).pathname;

async function sdk() {
  const loaded = await loadSdk(join(here, ".."));
  if (!loaded) throw new Error("@ratel-ai/sdk is a devDependency of this package");
  return loaded;
}

describe("loadSdk", () => {
  it("resolves @ratel-ai/sdk from the project folder, or returns null", async () => {
    expect(await loadSdk(join(here, ".."))).not.toBeNull();
    expect(await loadSdk(join(here, ".."), "@ratel-ai/not-a-package")).toBeNull();
  });
});

describe("computeReplay (Cloud's fold, locally)", () => {
  it("ranks every tool search plain and boosted, keyed by event id", async () => {
    const replay = await computeReplay([trace], null, await sdk());
    if ("error" in replay) throw new Error(replay.error);
    expect(replay).toMatchObject({ v: 1, method: "bm25", k: 5 });
    expect(replay.turns).toHaveLength(7);
    expect(replay.turns[0]?.key).toBe("E005");
  });

  it("boosts only from turns learned before the search", async () => {
    const replay = await computeReplay([trace], null, await sdk());
    if ("error" in replay) throw new Error(replay.error);
    const [first, , , , , last] = replay.turns;
    // Nothing learned yet: both lists agree, no intent matched.
    expect(first?.boosted_ids).toEqual(first?.plain_ids);
    expect(first?.matched).toBe(false);
    // After four confirmed turns the same ask matches the learned intent: the usage arm brings
    // in stripe_refund, which BM25 alone never returns for this wording.
    expect(last?.matched).toBe(true);
    expect(first?.plain_ids).not.toContain("stripe_refund");
    expect(last?.boosted_ids).toContain("stripe_refund");
    expect(last?.plain_ids).toEqual(first?.plain_ids);
  });

  it("passes a turn the runtime reported (base_hits) through untouched", async () => {
    const replay = await computeReplay([trace], null, await sdk());
    if ("error" in replay) throw new Error(replay.error);
    expect(replay.turns.at(-1)).toMatchObject({
      reported: true,
      plain_ids: ["email_send", "stripe_refund"],
      boosted_ids: ["stripe_refund"],
    });
  });

  it("learns one graph per project (source_id), like Cloud's per-project graphs", async () => {
    // A second project with the same tools asks the learned question once, after project t learned it.
    const other = trace
      .split("\n")
      .filter((l) => l.includes("catalog_definition"))
      .map((l) =>
        l
          .replace(/"source_id": ?"t"/, '"source_id":"other"')
          .replace(/"event_id": ?"E/, '"event_id":"O'),
      );
    other.push(
      '{"v":2,"event_id":"O900","ts":1790000009000,"session_id":"s2","source_id":"other","turn_id":"x1","type":"search","query":"give the customer their money back","origin":"agent","top_k":5,"hits":[],"stages":[],"took_ms":1}',
    );
    const replay = await computeReplay([trace, other.join("\n")], null, await sdk());
    if ("error" in replay) throw new Error(replay.error);
    const fromOther = replay.turns.find((t) => t.key === "O900");
    expect(fromOther?.matched).toBe(false);
    expect(fromOther?.boosted_ids).toEqual(fromOther?.plain_ids);
  });

  it("needs tool definitions", async () => {
    const noDefs = trace
      .split("\n")
      .filter((l) => !l.includes("catalog_definition"))
      .join("\n");
    expect(await computeReplay([noDefs], null, await sdk())).toMatchObject({
      error: expect.stringContaining("definitions"),
    });
  });
});
