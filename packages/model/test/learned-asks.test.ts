import { describe, expect, it } from "vitest";
import { learnedAsks } from "../src/intent-graph/asks";
import type { IntentGraphDocument } from "../src/intent-graph/wire";

const doc: IntentGraphDocument = {
  v: 1,
  built_from_ts: 0,
  intents: [
    {
      id: "small",
      label: "list tags",
      terms: [],
      members: ["list tags"],
      support: 2,
      tools: { list_tag_categories: 2 },
      skills: {},
    },
    {
      id: "big",
      label: "Create a task in a project",
      terms: [],
      members: ["create task", "Create a task in a project", "new todo", "add a ticket", "x"],
      support: 10,
      seeded_support: 4,
      last_ts: 99,
      tools: { create_task: 6, create_document: 3, filter_tasks: 1 },
      skills: { triage: 2 },
    },
  ],
};

describe("learnedAsks", () => {
  it("lists what users ask for, busiest first, with the tools that answered", () => {
    const [first, second] = learnedAsks(doc);
    expect(first).toMatchObject({ id: "big", label: "Create a task in a project", support: 10 });
    expect(first?.examples).toEqual(["create task", "new todo", "add a ticket"]);
    expect(first?.answers).toEqual([
      { kind: "tool", id: "create_task", count: 6, share: 0.5 },
      { kind: "tool", id: "create_document", count: 3, share: 0.25 },
      { kind: "skill", id: "triage", count: 2, share: 2 / 12 },
    ]);
    expect(first?.seededShare).toBeCloseTo(0.4);
    expect(second?.id).toBe("small");
  });

  it("filters by any text in the label, examples or answers", () => {
    expect(learnedAsks(doc, "ticket").map((a) => a.id)).toEqual(["big"]);
    expect(learnedAsks(doc, "LIST_TAG").map((a) => a.id)).toEqual(["small"]);
  });
});
