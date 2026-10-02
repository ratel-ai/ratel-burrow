/**
 * A scripted "agent" over a small support-desk catalog, writing everything Ratel
 * Burrow reads into ./.ratel/burrow:
 *
 *   - JSONL traces (searches, invocations, usage boosts) via `burrowConfig()`
 *   - catalog definitions (descriptions, schemas)
 *   - the adaptive-ranking intent graph (`burrowPaths().intentGraph`)
 *
 * Run it, then `ratel-burrow` in this folder. `--live` keeps it going so you can
 * watch Burrow update.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { burrowConfig, burrowPaths } from "@ratel-ai/burrow";
import { getSkillContentTool, IntentGraph, SkillCatalog, ToolCatalog } from "@ratel-ai/sdk";

const live = process.argv.includes("--live");
const rounds = Number(process.argv.find((a) => a.startsWith("--rounds="))?.split("=")[1] ?? 6);

const burrow = burrowConfig();
const paths = burrowPaths();
const tools = new ToolCatalog({ trace: burrow.trace });
const skills = new SkillCatalog({
  trace: { ...burrow.trace, path: burrow.trace.path.replace(/\.jsonl$/, "-skills.jsonl") },
});
// burrowConfig() turns this on through ratel({ events }); with bare catalogs, call it directly.
tools.experimentalEnableCatalogDefinitions();
skills.experimentalEnableCatalogDefinitions();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (
  properties: Record<string, { type: "string" | "number" | "object"; description?: string }>,
  required: string[] = [],
) => ({
  type: "object" as const,
  properties,
  required,
});

const failing = new Set(["crm_lookup_customer"]);
let calls = 0;
const tool = (id: string, description: string, input: ReturnType<typeof obj>, latency: number) => ({
  id,
  name: id,
  description,
  inputSchema: input,
  outputSchema: { type: "object" as const },
  execute: async () => {
    calls += 1;
    await sleep(latency + Math.round(Math.random() * latency));
    if (failing.has(id) && calls % 3 === 0) throw new Error("upstream timeout after 5s");
    return { ok: true };
  },
});

await tools.register([
  tool(
    "stripe_refund",
    "Refund a Stripe charge, fully or partially.",
    obj({ charge_id: { type: "string" }, amount: { type: "number" } }, ["charge_id"]),
    180,
  ),
  tool(
    "stripe_get_charge",
    "Look up a Stripe charge by id: amount, status, customer.",
    obj({ charge_id: { type: "string" } }, ["charge_id"]),
    90,
  ),
  tool(
    "stripe_list_invoices",
    "List a customer's Stripe invoices.",
    obj({ customer_id: { type: "string" } }, ["customer_id"]),
    120,
  ),
  tool(
    "crm_lookup_customer",
    "Find a customer in the CRM by email or name.",
    obj({ query: { type: "string" } }, ["query"]),
    140,
  ),
  tool(
    "crm_update_customer",
    "Update a CRM customer's fields.",
    obj({ customer_id: { type: "string" }, fields: { type: "object" } }),
    160,
  ),
  tool(
    "crm_add_note",
    "Add a note to a customer's CRM timeline.",
    obj({ customer_id: { type: "string" }, note: { type: "string" } }),
    70,
  ),
  tool(
    "email_send",
    "Send an email to a customer.",
    obj({ to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, ["to"]),
    220,
  ),
  tool(
    "email_search",
    "Search the support inbox for past emails.",
    obj({ query: { type: "string" } }),
    130,
  ),
  tool(
    "calendar_create_event",
    "Book a meeting on the team calendar.",
    obj({ title: { type: "string" }, start: { type: "string" } }),
    110,
  ),
  tool(
    "calendar_find_slot",
    "Find a free slot in the team calendar.",
    obj({ duration_min: { type: "number" } }),
    95,
  ),
  tool(
    "files_read",
    "Read a text file from the shared drive.",
    obj({ path: { type: "string" } }, ["path"]),
    40,
  ),
  tool(
    "files_search",
    "Search the shared drive by filename or content.",
    obj({ query: { type: "string" } }),
    85,
  ),
  tool(
    "orders_get",
    "Fetch an order: items, totals, shipping status.",
    obj({ order_id: { type: "string" } }, ["order_id"]),
    100,
  ),
  tool(
    "orders_cancel",
    "Cancel an order that has not shipped yet.",
    obj({ order_id: { type: "string" } }, ["order_id"]),
    150,
  ),
  {
    ...tool(
      "shipping_track",
      "Track a parcel with the carrier.",
      obj({ tracking_number: { type: "string" } }),
      260,
    ),
    experimentalSearchableDescription:
      "Track a parcel shipment delivery where is my package carrier tracking",
  },
]);
await skills.register([
  {
    id: "refund_playbook",
    name: "Refund playbook",
    description: "How to process a refund: check the charge, refund, email the customer.",
    tags: ["billing"],
    tools: ["stripe_get_charge", "stripe_refund", "email_send"],
    body: "1. Look up the charge…",
  },
  {
    id: "escalation",
    name: "Escalation",
    description: "When and how to escalate an angry customer to a human.",
    tags: ["support"],
    body: "Escalate when…",
  },
  {
    id: "shipping_issues",
    name: "Shipping issues",
    description: "Handle late or lost parcels.",
    tags: ["logistics"],
    tools: ["shipping_track", "orders_get"],
    body: "Check tracking first…",
  },
]);

const graph = existsSync(paths.intentGraph)
  ? IntentGraph.fromJson(readFileSync(paths.intentGraph, "utf8"))
  : new IntentGraph();
tools.experimentalEnableAdaptiveRanking(graph);
skills.experimentalEnableAdaptiveRanking(graph);
const skillContent = getSkillContentTool(skills);

/** What a user asks, and the tool our scripted agent ends up calling. */
const script: { asks: string[]; calls: string[]; skill?: string }[] = [
  {
    asks: ["refund the last order", "give the customer their money back", "refund order 4411"],
    calls: ["stripe_get_charge", "stripe_refund"],
    skill: "refund_playbook",
  },
  {
    asks: ["where is my package", "parcel has not arrived", "track shipment for order 88"],
    calls: ["shipping_track"],
    skill: "shipping_issues",
  },
  { asks: ["email the customer an update", "send a follow-up email"], calls: ["email_send"] },
  { asks: ["who is jane@acme.com", "find customer acme corp"], calls: ["crm_lookup_customer"] },
  {
    asks: ["book a call with the customer", "schedule a meeting next week"],
    calls: ["calendar_find_slot", "calendar_create_event"],
  },
  {
    asks: ["customer is furious and wants a manager"],
    calls: ["crm_add_note"],
    skill: "escalation",
  },
  { asks: ["cancel my order", "stop order 77 before it ships"], calls: ["orders_cancel"] },
  { asks: ["what did we tell them last time"], calls: ["email_search"] },
  { asks: ["read the returns policy document"], calls: ["files_read"] },
];

async function turn(ask: string, plan: (typeof script)[number]) {
  await tools.searchAsync(ask, 5, "agent");
  if (plan.skill) {
    await skills.searchAsync(ask, 3, "agent");
    await skillContent.execute({ skillId: plan.skill }, undefined);
  }
  for (const id of plan.calls) {
    try {
      await tools.invoke(id, {});
    } catch {
      // failures are part of the demo
    }
  }
}

let round = 0;
do {
  for (const plan of script) {
    const ask = plan.asks[round % plan.asks.length] ?? plan.asks[0] ?? "";
    await turn(ask, plan);
    await sleep(live ? 1_500 : 20);
  }
  writeFileSync(paths.intentGraph, graph.toJson());
  round += 1;
  console.log(`round ${round}: wrote ${burrow.trace.path} and ${paths.intentGraph}`);
} while (live || round < rounds);
