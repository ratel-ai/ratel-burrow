import { describe, expect, it } from "vitest";
import { TraceTail } from "../src/tail";

const bytes = (s: string) => new TextEncoder().encode(s);
const line = (q: string, ts = 1) =>
  `{"v":1,"ts":${ts},"session_id":"s","type":"search","query":"${q}","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}\n`;

describe("TraceTail", () => {
  it("parses complete lines and holds a partial one until it ends", () => {
    const tail = new TraceTail();
    const full = line("a") + line("b");
    const cut = full.length - 10;
    expect(tail.push(bytes(full.slice(0, cut)))).toHaveLength(1);
    expect(tail.push(bytes(full.slice(cut)))).toHaveLength(1);
    expect(tail.events.map((e) => (e as { query?: string }).query)).toEqual(["a", "b"]);
    expect(tail.offset).toBe(bytes(full).length);
  });

  it("counts bytes, not characters, and survives a UTF-8 character split across reads", () => {
    const tail = new TraceTail();
    const b = bytes(line("çay ☕"));
    const split = b.indexOf(0xe2) + 1; // inside the 3-byte ☕
    tail.push(b.slice(0, split));
    tail.push(b.slice(split));
    expect((tail.events[0] as { query?: string }).query).toBe("çay ☕");
    expect(tail.offset).toBe(b.length);
  });

  it("counts bad lines and can reset", () => {
    const tail = new TraceTail();
    tail.push(bytes(`nope\n${line("ok")}`));
    expect(tail.badLines).toBe(1);
    tail.reset();
    expect([tail.offset, tail.events.length, tail.badLines]).toEqual([0, 0, 0]);
  });
});
