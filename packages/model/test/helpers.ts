import { readFileSync } from "node:fs";
import { parseTraceLog, type TraceEvent } from "../src/events";

export const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

export const v1Events = (): TraceEvent[] => parseTraceLog(fixture("v1-legacy.jsonl")).events;
export const v2Events = (): TraceEvent[] => parseTraceLog(fixture("v2-sdk.jsonl")).events;
