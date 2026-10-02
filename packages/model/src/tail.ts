import { parseTraceLine, type TraceEvent } from "./events.js";

/**
 * Incremental reader for a growing JSONL trace file. Feed it the bytes after
 * `offset`; it decodes UTF-8 across chunk boundaries, parses every completed
 * line, and keeps the trailing partial line for the next chunk.
 */
export class TraceTail {
  /** Bytes consumed so far: the next read starts here. */
  offset = 0;
  events: TraceEvent[] = [];
  badLines = 0;
  #partial = "";
  #decoder = new TextDecoder();

  /** Consume a chunk; returns the events it completed. */
  push(chunk: Uint8Array): TraceEvent[] {
    this.offset += chunk.byteLength;
    const text = this.#partial + this.#decoder.decode(chunk, { stream: true });
    const lines = text.split("\n");
    this.#partial = lines.pop() ?? "";
    const added: TraceEvent[] = [];
    for (const l of lines) {
      if (l.trim().length === 0) continue;
      const event = parseTraceLine(l);
      if (event) added.push(event);
      else this.badLines += 1;
    }
    for (const e of added) this.events.push(e);
    return added;
  }

  /** Start over (the file was truncated or replaced). */
  reset(): void {
    this.offset = 0;
    this.events = [];
    this.badLines = 0;
    this.#partial = "";
    this.#decoder = new TextDecoder();
  }
}
