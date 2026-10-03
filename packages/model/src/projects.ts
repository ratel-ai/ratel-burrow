import type { TraceEvent } from "./events.js";

/**
 * A project is one runtime's `source_id` (the SDK takes it from `events.sourceId` /
 * `OTEL_SERVICE_NAME`), the local counterpart of a Ratel Cloud project: everything
 * one agent emits, kept apart from the others. Lines written before envelope v2
 * carry no source id and belong to {@link DEFAULT_PROJECT}.
 */
export const DEFAULT_PROJECT = "default";

export interface ProjectSummary {
  id: string;
  events: number;
  lastTs: number;
}

export function projectOf(event: TraceEvent): string {
  return event.sourceId ?? DEFAULT_PROJECT;
}

/** Every project in the log, busiest first (then by name). */
export function listProjects(events: readonly TraceEvent[]): ProjectSummary[] {
  const byId = new Map<string, ProjectSummary>();
  for (const e of events) {
    const id = projectOf(e);
    const p = byId.get(id) ?? { id, events: 0, lastTs: e.ts };
    p.events += 1;
    p.lastTs = Math.max(p.lastTs, e.ts);
    byId.set(id, p);
  }
  return [...byId.values()].sort((a, b) => b.events - a.events || (a.id < b.id ? -1 : 1));
}

/** The events of one project; `null` keeps them all. */
export function scopeToProject(
  events: readonly TraceEvent[],
  project: string | null,
): TraceEvent[] {
  return project === null ? [...events] : events.filter((e) => projectOf(e) === project);
}

/** A project's intent-graph file name (`intent-graphs/<this>`): unsafe characters become `_`. */
export function projectFileName(project: string): string {
  return `${project.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}
