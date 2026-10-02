/**
 * Pure view models for the Adaptive ranking screen, ported from Ratel Cloud's
 * `lib/intent-graph/view.ts` so both draw the same graph. Cloud reads cluster and
 * edge rows from a database; Burrow derives the same rows from the document
 * with `graphRows`.
 */
import type { IntentGraphDocument, IntentGraphEdgeKind } from "./wire.js";

/** Confirmed observations at which the ranker gives a cluster full weight (ADR-0014). */
export const SUPPORT_FULL = 3;
/** Clusters drawn in the force graph; the table still lists every cluster. */
export const MAX_DRAWN_CLUSTERS = 400;
/** Cluster cap per graph (Ratel Cloud's `MAX_INTENT_GRAPH_CLUSTERS`). */
export const MAX_INTENT_GRAPH_CLUSTERS = 5_000;
/** Stored-size cap per graph (Ratel Cloud's `MAX_INTENT_GRAPH_BYTES`). */
export const MAX_INTENT_GRAPH_BYTES = 4_000_000;
/** Rows per page in the cluster table. */
export const CLUSTER_PAGE_SIZE = 25;

/** One-based page that holds `index`, or 1 for an unknown row. */
export function pageOfIndex(index: number, pageSize: number = CLUSTER_PAGE_SIZE): number {
  return index < 0 ? 1 : Math.floor(index / pageSize) + 1;
}

/** Members shown inline per cluster. */
export const MEMBERS_SHOWN = 5;
/** Pseudo-count in the runtime's passed-over damper (the core's IMPRESSION_PRIOR). */
export const IMPRESSION_PRIOR = 3;

const LINK_BASE_DISTANCE = 120;
const LINK_MIN_FRACTION = 0.3;

export interface ClusterRow {
  clusterId: string;
  label: string;
  terms: string[];
  members: string[];
  memberCount: number;
  support: number;
  seededSupport: number;
  lastTs: number | null;
  hasCentroid: boolean;
}

export interface EdgeRow {
  clusterId: string;
  kind: IntentGraphEdgeKind;
  capabilityId: string;
  weight: number;
  /** `null` when the graph did not record impressions for this edge. */
  surfaced: number | null;
}

/** Flatten a document into the cluster and edge rows every view below consumes. */
export function graphRows(doc: IntentGraphDocument): { clusters: ClusterRow[]; edges: EdgeRow[] } {
  const clusters: ClusterRow[] = [];
  const edges: EdgeRow[] = [];
  for (const intent of doc.intents) {
    clusters.push({
      clusterId: intent.id,
      label: intent.label,
      terms: intent.terms ?? [],
      members: intent.members ?? [],
      memberCount: intent.members?.length ?? 0,
      support: intent.support,
      seededSupport: intent.seeded_support ?? 0,
      lastTs: intent.last_ts ?? null,
      hasCentroid: Array.isArray(intent.centroid) && intent.centroid.length > 0,
    });
    const kinds: [
      IntentGraphEdgeKind,
      Record<string, number>,
      Record<string, number> | undefined,
    ][] = [
      ["tool", intent.tools ?? {}, intent.surfaced_tools],
      ["skill", intent.skills ?? {}, intent.surfaced_skills],
    ];
    for (const [kind, weights, surfaced] of kinds) {
      for (const [capabilityId, weight] of Object.entries(weights)) {
        edges.push({
          clusterId: intent.id,
          kind,
          capabilityId,
          weight,
          surfaced: surfaced ? (surfaced[capabilityId] ?? 0) : null,
        });
      }
    }
  }
  return { clusters, edges };
}

/** Arm weight ramp: one observation nudges, three or more carry full weight. */
export function supportRamp(support: number): number {
  if (!Number.isFinite(support) || support <= 0) return 0;
  return Math.min(1, support / SUPPORT_FULL);
}

/**
 * The embedding model behind a graph, as a readable name: the `repo=` field of a
 * runtime fingerprint (`hf|repo=22:BAAI/bge-small-en-v1.5|…`), else the raw string;
 * no model means a lexical graph.
 */
export function modelLabel(model: string | null): string {
  if (!model) return "lexical";
  const repo = /(?:^|\|)repo=(\d+):/.exec(model);
  if (!repo) return model;
  const start = repo.index + repo[0].length;
  const length = Number(repo[1]);
  const name = model.slice(start, start + length);
  return name.length === length && name.length > 0 ? name : model;
}

/** How much of an edge's weight survives ranking: min(1, (invoked + 3) / (surfaced + 3)). */
export function edgeDamper(weight: number, surfaced: number | null): number | null {
  if (surfaced === null) return null;
  return Math.min(1, (weight + IMPRESSION_PRIOR) / (surfaced + IMPRESSION_PRIOR));
}

export function missingKey(kind: IntentGraphEdgeKind, capabilityId: string): string {
  return `${kind}:${capabilityId}`;
}

export interface TopEdge {
  id: string;
  weight: number;
  missing: boolean;
}

export interface ClusterEdge {
  kind: IntentGraphEdgeKind;
  id: string;
  weight: number;
  missing: boolean;
  surfaced: number | null;
  damper: number | null;
}

export interface ClusterTableRow {
  clusterId: string;
  displayLabel: string;
  members: string[];
  memberCount: number;
  support: number;
  supportRamp: number;
  seededSupport: number;
  lastTs: number | null;
  hasCentroid: boolean;
  toolEdgeCount: number;
  skillEdgeCount: number;
  topTool: TopEdge | null;
  topSkill: TopEdge | null;
  /** Every edge, weight descending then id. */
  edges: ClusterEdge[];
  terms: string[];
}

function byCluster(edges: readonly EdgeRow[]): Map<string, EdgeRow[]> {
  const map = new Map<string, EdgeRow[]>();
  for (const edge of edges) {
    const list = map.get(edge.clusterId);
    if (list) list.push(edge);
    else map.set(edge.clusterId, [edge]);
  }
  return map;
}

function topEdge(
  edges: readonly EdgeRow[],
  kind: IntentGraphEdgeKind,
  missing: ReadonlySet<string>,
): TopEdge | null {
  let best: EdgeRow | null = null;
  for (const edge of edges) {
    if (edge.kind !== kind) continue;
    if (
      best === null ||
      edge.weight > best.weight ||
      (edge.weight === best.weight && edge.capabilityId < best.capabilityId)
    ) {
      best = edge;
    }
  }
  return best
    ? {
        id: best.capabilityId,
        weight: best.weight,
        missing: missing.has(missingKey(kind, best.capabilityId)),
      }
    : null;
}

function rankClusters<T extends { support: number; memberCount: number; clusterId: string }>(
  rows: T[],
): T[] {
  return rows.sort(
    (a, b) =>
      b.support - a.support ||
      b.memberCount - a.memberCount ||
      (a.clusterId < b.clusterId ? -1 : a.clusterId > b.clusterId ? 1 : 0),
  );
}

export function buildClusterTableRows(
  clusters: readonly ClusterRow[],
  edges: readonly EdgeRow[],
  missing: ReadonlySet<string> = new Set(),
): ClusterTableRow[] {
  const grouped = byCluster(edges);
  return rankClusters(
    clusters.map((cluster): ClusterTableRow => {
      const own = grouped.get(cluster.clusterId) ?? [];
      return {
        clusterId: cluster.clusterId,
        displayLabel: cluster.label,
        members: cluster.members,
        memberCount: cluster.memberCount,
        support: cluster.support,
        supportRamp: supportRamp(cluster.support),
        seededSupport: cluster.seededSupport,
        lastTs: cluster.lastTs,
        hasCentroid: cluster.hasCentroid,
        toolEdgeCount: own.filter((e) => e.kind === "tool").length,
        skillEdgeCount: own.filter((e) => e.kind === "skill").length,
        topTool: topEdge(own, "tool", missing),
        topSkill: topEdge(own, "skill", missing),
        edges: [...own]
          .sort((a, b) => b.weight - a.weight || (a.capabilityId < b.capabilityId ? -1 : 1))
          .map((e) => ({
            kind: e.kind,
            id: e.capabilityId,
            weight: e.weight,
            missing: missing.has(missingKey(e.kind, e.capabilityId)),
            surfaced: e.surfaced,
            damper: edgeDamper(e.weight, e.surfaced),
          })),
        terms: cluster.terms,
      };
    }),
  );
}

export interface SummaryTiles {
  clusters: number;
  totalSupport: number;
  distinctTools: number;
  distinctSkills: number;
  membersTotal: number;
  clustersWithFullSupport: number;
  singletonClusters: number;
  /** 0..1 share of clusters carrying a centroid. */
  centroidCoverage: number;
}

export function buildSummaryTiles(
  clusters: readonly ClusterRow[],
  edges: readonly EdgeRow[],
): SummaryTiles {
  const tools = new Set<string>();
  const skills = new Set<string>();
  for (const edge of edges) (edge.kind === "tool" ? tools : skills).add(edge.capabilityId);
  const withCentroid = clusters.filter((c) => c.hasCentroid).length;
  return {
    clusters: clusters.length,
    totalSupport: clusters.reduce((sum, c) => sum + c.support, 0),
    distinctTools: tools.size,
    distinctSkills: skills.size,
    membersTotal: clusters.reduce((sum, c) => sum + c.memberCount, 0),
    clustersWithFullSupport: clusters.filter((c) => c.support >= SUPPORT_FULL).length,
    singletonClusters: clusters.filter((c) => c.memberCount === 1).length,
    centroidCoverage: clusters.length === 0 ? 0 : withCentroid / clusters.length,
  };
}

export function truncateMembers(
  members: readonly string[],
  limit: number = MEMBERS_SHOWN,
): { shown: string[]; hidden: number } {
  const shown = members.slice(0, limit);
  return { shown, hidden: Math.max(0, members.length - shown.length) };
}

// --- force graph model -------------------------------------------------------

/**
 * One model, two drawings. Co-usage: capability nodes only, linked when they
 * answered the same cluster. Intents: one node per cluster too, with a spoke to
 * every capability it points at.
 */
export interface ForceNode {
  id: string;
  kind: IntentGraphEdgeKind;
  label: string;
  radius: number;
  degree: number;
  clusterCount: number;
  totalWeight: number;
  missing?: boolean;
}

export interface ForceLink {
  source: string;
  target: string;
  /** Clusters both endpoints answer. */
  shared: number;
  distance: number;
  opacity: number;
}

export interface ForceMembership {
  clusterId: string;
  label: string;
  weight: number;
  support: number;
}

export interface IntentForceNode {
  id: string;
  kind: "intent";
  clusterId: string;
  label: string;
  radius: number;
  support: number;
  memberCount: number;
  edgeCount: number;
}

export interface MembershipLink {
  source: string;
  target: string;
  weight: number;
  distance: number;
  opacity: number;
}

export interface ForceGraphModel {
  nodes: ForceNode[];
  links: ForceLink[];
  memberships: Record<string, ForceMembership[]>;
  clusterMembers: Record<string, string[]>;
  intents: IntentForceNode[];
  membershipLinks: MembershipLink[];
  truncated: { drawn: number; total: number } | null;
  maxShared: number;
  maxWeight: number;
}

export function capabilityNodeId(kind: IntentGraphEdgeKind, capabilityId: string): string {
  return `${kind}:${capabilityId}`;
}

export function intentNodeId(clusterId: string): string {
  return `intent:${clusterId}`;
}

export function linkDistance(weight: number, maxWeight: number): number {
  const fraction = maxWeight > 0 ? Math.min(1, Math.max(0, weight / maxWeight)) : 0;
  const distance = LINK_BASE_DISTANCE * (1 - (1 - LINK_MIN_FRACTION) * fraction);
  return Math.round(distance * 100) / 100;
}

export function buildForceGraphModel(
  clusters: readonly ClusterRow[],
  edges: readonly EdgeRow[],
  options: { maxClusters?: number; missing?: ReadonlySet<string> } = {},
): ForceGraphModel {
  const maxClusters = options.maxClusters ?? MAX_DRAWN_CLUSTERS;
  const missing = options.missing ?? new Set<string>();

  const ranked = rankClusters([...clusters]);
  const drawn = ranked.slice(0, maxClusters);
  const truncated =
    ranked.length > drawn.length ? { drawn: drawn.length, total: ranked.length } : null;
  const clusterById = new Map(drawn.map((c) => [c.clusterId, c]));
  const drawnEdges = edges.filter((e) => clusterById.has(e.clusterId) && e.weight > 0);
  const maxWeight = drawnEdges.reduce((max, e) => Math.max(max, e.weight), 0) || 1;

  const nodes = new Map<string, ForceNode>();
  const memberships: Record<string, ForceMembership[]> = {};
  const clusterMembers: Record<string, string[]> = {};
  for (const cluster of drawn) clusterMembers[cluster.clusterId] = [];

  for (const edge of drawnEdges) {
    const id = capabilityNodeId(edge.kind, edge.capabilityId);
    let node = nodes.get(id);
    if (!node) {
      node = {
        id,
        kind: edge.kind,
        label: edge.capabilityId,
        radius: 5,
        degree: 0,
        clusterCount: 0,
        totalWeight: 0,
        missing: missing.has(missingKey(edge.kind, edge.capabilityId)),
      };
      nodes.set(id, node);
    }
    node.degree += 1;
    node.clusterCount += 1;
    node.totalWeight += edge.weight;
    const cluster = clusterById.get(edge.clusterId);
    if (!cluster) continue;
    const list = memberships[id] ?? [];
    memberships[id] = list;
    list.push({
      clusterId: cluster.clusterId,
      label: cluster.label,
      weight: edge.weight,
      support: cluster.support,
    });
    clusterMembers[cluster.clusterId]?.push(id);
  }
  for (const list of Object.values(memberships)) {
    list.sort((a, b) => b.weight - a.weight || b.support - a.support);
  }

  const sharedByPair = new Map<string, { source: string; target: string; shared: number }>();
  for (const members of Object.values(clusterMembers)) {
    const unique = [...new Set(members)].sort();
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const source = unique[i] as string;
        const target = unique[j] as string;
        const key = `${source}|${target}`;
        const pair = sharedByPair.get(key);
        if (pair) pair.shared += 1;
        else sharedByPair.set(key, { source, target, shared: 1 });
      }
    }
  }
  const maxShared = [...sharedByPair.values()].reduce((max, p) => Math.max(max, p.shared), 0) || 1;
  const links: ForceLink[] = [...sharedByPair.values()].map((pair) => ({
    source: pair.source,
    target: pair.target,
    shared: pair.shared,
    distance: linkDistance(pair.shared, maxShared),
    opacity: 0.25 + 0.6 * Math.min(1, pair.shared / maxShared),
  }));

  const maxTotal = [...nodes.values()].reduce((max, n) => Math.max(max, n.totalWeight), 0) || 1;
  for (const node of nodes.values()) {
    node.radius = 6 + 8 * Math.sqrt(node.totalWeight / maxTotal);
  }

  const maxSupport = drawn.reduce((max, c) => Math.max(max, c.support), 0) || 1;
  const intents: IntentForceNode[] = drawn.map((cluster) => ({
    id: intentNodeId(cluster.clusterId),
    kind: "intent",
    clusterId: cluster.clusterId,
    label: cluster.label,
    radius: 4 + 5 * Math.sqrt(cluster.support / maxSupport),
    support: cluster.support,
    memberCount: cluster.memberCount,
    edgeCount: clusterMembers[cluster.clusterId]?.length ?? 0,
  }));
  const membershipLinks: MembershipLink[] = drawnEdges.map((edge) => ({
    source: intentNodeId(edge.clusterId),
    target: capabilityNodeId(edge.kind, edge.capabilityId),
    weight: edge.weight,
    distance: linkDistance(edge.weight, maxWeight),
    opacity: 0.25 + 0.6 * Math.min(1, edge.weight / maxWeight),
  }));

  return {
    nodes: [...nodes.values()],
    links,
    memberships,
    clusterMembers,
    intents,
    membershipLinks,
    truncated,
    maxShared,
    maxWeight,
  };
}

/** The node plus every node one link away. */
export function neighborhoodOf(model: ForceGraphModel, nodeId: string): Set<string> {
  const out = new Set<string>([nodeId]);
  for (const link of model.links) {
    if (link.source === nodeId) out.add(link.target);
    else if (link.target === nodeId) out.add(link.source);
  }
  return out;
}
