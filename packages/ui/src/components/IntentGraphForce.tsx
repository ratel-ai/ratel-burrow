import {
  type ForceGraphModel,
  type ForceNode,
  type IntentForceNode,
  intentNodeId,
} from "@ratel-ai/burrow-model";
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import { BookOpen, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Interactive capability graph, ported from Ratel Cloud's IntentGraphForce.
 *
 * Co-usage: tools (wrench, green) and skills (book, coral), sized by how often
 * they were invoked, linked when they answered the same cluster of asks.
 * Intents: clusters join as cream discs with a spoke to every capability they
 * point at. The layout is settled synchronously before the first paint and
 * never re-runs; dragging moves only the dragged node.
 */

export type GraphMode = "cousage" | "intents";

type GraphNode = ForceNode | IntentForceNode;
type SimNode = GraphNode & SimulationNodeDatum;
type GraphLink = {
  kind: "cousage" | "membership";
  value: number;
  distance: number;
  opacity: number;
};
type SimLink = GraphLink & SimulationLinkDatum<SimNode>;
type Hover =
  | { kind: "node"; id: string; x: number; y: number }
  | { kind: "link"; index: number; x: number; y: number };

const STATIC_TICKS = 300;
const FILL: Record<ForceNode["kind"], string> = {
  tool: "var(--color-cap-tool)",
  skill: "var(--color-cap-skill)",
};
const NEON_LIT = { id: "ig-neon-lit", blur: 3, alpha: 0.55 };

function globeRadius(width: number, height: number): number {
  return Math.min(width, height) / 2 - 12;
}

function discForce(nodes: SimNode[], cx: number, cy: number, radius: number) {
  return () => {
    for (const node of nodes) {
      const dx = (node.x ?? cx) - cx;
      const dy = (node.y ?? cy) - cy;
      const dist = Math.hypot(dx, dy);
      const limit = radius - node.radius - 2;
      if (dist > limit && dist > 0) {
        const k = limit / dist;
        node.x = cx + dx * k;
        node.y = cy + dy * k;
        node.vx = (node.vx ?? 0) * 0.5;
        node.vy = (node.vy ?? 0) * 0.5;
      }
    }
  };
}

function seedDisc(nodes: SimNode[], cx: number, cy: number, radius: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach((node, i) => {
    if (node.x !== undefined && node.y !== undefined) return;
    const r = radius * 0.9 * Math.sqrt((i + 0.5) / nodes.length);
    node.x = cx + Math.cos(i * golden) * r;
    node.y = cy + Math.sin(i * golden) * r;
  });
}

function endId(end: SimNode | string | number): string {
  return typeof end === "object" ? end.id : String(end);
}

/** Connected groups (union-find over links) get homes on a golden spiral, biggest in the middle. */
function groupHomes(nodes: SimNode[], links: SimLink[], cx: number, cy: number, radius: number) {
  const parent = new Map<string, string>(nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const l of links) {
    const a = find(endId(l.source));
    const b = find(endId(l.target));
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const root = find(n.id);
    groups.set(root, [...(groups.get(root) ?? []), n.id]);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const homes = new Map<string, { x: number; y: number }>();
  ordered.forEach((members, i) => {
    const r = radius * 0.85 * Math.sqrt((i + 0.5) / ordered.length);
    const home = { x: cx + Math.cos(i * golden) * r, y: cy + Math.sin(i * golden) * r };
    for (const id of members) homes.set(id, home);
  });
  return homes;
}

export function IntentGraphForce({
  model,
  mode,
  selectedClusterId,
  onSelectCluster,
  onOpenCapability,
}: {
  model: ForceGraphModel;
  mode: GraphMode;
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string) => void;
  onOpenCapability: (kind: "tool" | "skill", id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const layout = useMemo(() => {
    if (mode === "intents") {
      return {
        nodes: [...model.nodes, ...model.intents].map((n): SimNode => ({ ...n })),
        links: model.membershipLinks.map(
          (l): SimLink => ({
            source: l.source,
            target: l.target,
            kind: "membership",
            value: l.weight,
            distance: l.distance,
            opacity: l.opacity,
          }),
        ),
        maxValue: model.maxWeight,
      };
    }
    return {
      nodes: model.nodes.map((n): SimNode => ({ ...n })),
      links: model.links.map(
        (l): SimLink => ({
          source: l.source,
          target: l.target,
          kind: "cousage",
          value: l.shared,
          distance: l.distance,
          opacity: l.opacity,
        }),
      ),
      maxValue: model.maxShared,
    };
  }, [model, mode]);
  const [width, setWidth] = useState(0);
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const height = Math.round(Math.min(620, Math.max(360, width * 0.62)));
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (width === 0 || layout.nodes.length === 0) return;
    let cancelled = false;
    const { nodes, links } = layout;
    void (async () => {
      const d3 = await import("d3-force");
      if (cancelled) return;
      const cx = width / 2;
      const cy = height / 2;
      const globe = globeRadius(width, height);
      for (const n of nodes) {
        n.x = undefined;
        n.y = undefined;
      }
      seedDisc(nodes, cx, cy, globe);
      const cell = Math.sqrt((Math.PI * globe * globe) / Math.max(1, nodes.length));
      const spacing = Math.max(6, cell * 0.36);
      const homes = groupHomes(nodes, links, cx, cy, globe);
      const simulation = d3
        .forceSimulation<SimNode>(nodes)
        .force(
          "link",
          d3
            .forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance((l) => Math.max(cell * 1.2, l.distance * (cell / 120)))
            .strength((l) => 0.08 + 0.22 * Math.min(1, l.value / layout.maxValue)),
        )
        .force(
          "charge",
          d3
            .forceManyBody<SimNode>()
            .strength(-cell * 0.6)
            .distanceMax(cell * 2.2),
        )
        .force("collide", d3.forceCollide<SimNode>((d) => d.radius + spacing).strength(1))
        .force("x", d3.forceX<SimNode>((d) => homes.get(d.id)?.x ?? cx).strength(0.12))
        .force("y", d3.forceY<SimNode>((d) => homes.get(d.id)?.y ?? cy).strength(0.12))
        .force("disc", discForce(nodes, cx, cy, globe))
        .alphaDecay(0.025);
      simRef.current = simulation;
      simulation.stop();
      for (let i = 0; i < STATIC_TICKS; i += 1) simulation.tick();
      setReady(true);
      bump();
    })();
    return () => {
      cancelled = true;
      simRef.current?.stop();
      simRef.current = null;
    };
  }, [layout, width, height, bump]);

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      const set = map.get(a) ?? new Set([a]);
      set.add(b);
      map.set(a, set);
    };
    for (const link of layout.links) {
      add(endId(link.source), endId(link.target));
      add(endId(link.target), endId(link.source));
    }
    return map;
  }, [layout]);

  const hoverNode = hover?.kind === "node" ? hover.id : null;
  const lit = useMemo<Set<string> | null>(() => {
    if (selectedClusterId) {
      const set = new Set(model.clusterMembers[selectedClusterId] ?? []);
      if (mode === "intents") set.add(intentNodeId(selectedClusterId));
      return set;
    }
    if (hoverNode) return neighbours.get(hoverNode) ?? new Set([hoverNode]);
    return null;
  }, [model, mode, selectedClusterId, hoverNode, neighbours]);

  function toSvgPoint(event: { clientX: number; clientY: number }) {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function activate(node: SimNode) {
    if (node.kind === "intent") onSelectCluster(node.clusterId);
    else onOpenCapability(node.kind, node.label);
  }

  const density = layout.nodes.length === 0 ? 0 : layout.links.length / layout.nodes.length;
  const linkDim = density <= 1.5 ? 1 : Math.max(0.35, 1.5 / density);
  const tooltip = describeHover(hover, byId, layout.links, model);

  return (
    <div ref={hostRef} className="relative touch-none select-none">
      {width > 0 && ready ? (
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Capability graph: ${model.nodes.length} capabilities across ${model.intents.length} intents`}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          className="block rounded-xl bg-base-deep/40"
          onPointerLeave={() => {
            if (!dragRef.current) setHover(null);
          }}
        >
          <defs>
            <filter id={NEON_LIT.id} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation={NEON_LIT.blur} result="blur" />
              <feComponentTransfer in="blur" result="halo">
                <feFuncA type="linear" slope={NEON_LIT.alpha} />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g>
            {layout.links.map((link, index) => {
              const s = byId.get(endId(link.source));
              const t = byId.get(endId(link.target));
              if (!s || !t) return null;
              const inLit = (lit?.has(s.id) && lit.has(t.id)) ?? false;
              const dimmed = lit !== null && !inLit;
              const strokeWidth =
                (1 + 2.5 * Math.min(1, link.value / layout.maxValue)) * (linkDim < 1 ? 0.75 : 1);
              return (
                <g key={`${s.id}|${t.id}`} opacity={dimmed ? 0.08 : 1}>
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={inLit ? "var(--color-coral)" : "var(--color-cream-dim)"}
                    strokeOpacity={inLit ? 0.9 : link.opacity * linkDim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ pointerEvents: "stroke" }}
                    onPointerEnter={(e) => {
                      const p = toSvgPoint(e);
                      if (p) setHover({ kind: "link", index, x: p.x, y: p.y });
                    }}
                    onPointerLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </g>
          <g>
            {layout.nodes.map((node) => {
              const isLit = lit?.has(node.id) ?? false;
              const dimmed = lit !== null && !isLit;
              const size = node.radius * 1.9;
              return (
                // biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>.
                <g
                  key={node.id}
                  tabIndex={0}
                  role="button"
                  aria-label={
                    node.kind === "intent"
                      ? `intent ${node.label}: support ${node.support}`
                      : `${node.kind} ${node.label}: invoked ${node.totalWeight} times`
                  }
                  transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                  opacity={dimmed ? 0.18 : 1}
                  className="cursor-pointer outline-none"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = { id: node.id, moved: false };
                  }}
                  onPointerMove={(e) => {
                    if (dragRef.current?.id !== node.id) return;
                    const p = toSvgPoint(e);
                    if (!p) return;
                    dragRef.current.moved = true;
                    node.x = p.x;
                    node.y = p.y;
                    bump();
                    setHover({ kind: "node", id: node.id, x: p.x, y: p.y });
                  }}
                  onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    const drag = dragRef.current;
                    dragRef.current = null;
                    if (drag && !drag.moved) activate(node);
                  }}
                  onPointerEnter={() =>
                    setHover({ kind: "node", id: node.id, x: node.x ?? 0, y: node.y ?? 0 })
                  }
                  onPointerLeave={() => {
                    if (!dragRef.current) setHover(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activate(node);
                    }
                  }}
                >
                  <circle r={node.radius + 4} fill="transparent" />
                  {node.kind === "intent" ? (
                    <circle
                      r={node.radius}
                      fill={isLit ? "var(--color-cream)" : "var(--color-cream-dim)"}
                      fillOpacity={isLit ? 1 : 0.5}
                      stroke="var(--color-forest-300)"
                      strokeWidth={1}
                      filter={isLit ? `url(#${NEON_LIT.id})` : undefined}
                    />
                  ) : (
                    <>
                      <circle
                        r={node.radius + 3}
                        fill="var(--color-forest-600)"
                        stroke={
                          isLit
                            ? "var(--color-coral)"
                            : node.missing
                              ? "var(--color-amber)"
                              : "var(--color-forest-300)"
                        }
                        strokeWidth={isLit ? 1.5 : 1}
                        strokeDasharray={node.missing ? "2 2" : undefined}
                      />
                      <NodeIcon kind={node.kind} size={size} lit={isLit} />
                    </>
                  )}
                  <circle
                    r={node.radius + 6}
                    fill="none"
                    stroke="var(--color-coral)"
                    strokeWidth={2}
                    className="opacity-0 [g:focus-visible>&]:opacity-100"
                  />
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div
          className="rounded-xl bg-base-deep/40"
          style={{ height: width > 0 ? height : 360 }}
          aria-hidden
        />
      )}
      {tooltip && hover ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-forest-300 bg-forest-600 px-2.5 py-1.5 text-xs text-cream shadow-xl"
          style={{
            left: Math.min(Math.max(0, hover.x + 12), Math.max(0, width - 240)),
            top: Math.max(0, hover.y + 12),
          }}
        >
          <div className="font-medium">{tooltip.title}</div>
          {tooltip.lines.map((line) => (
            <div key={line} className="text-cream-dim">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NodeIcon({ kind, size, lit }: { kind: ForceNode["kind"]; size: number; lit: boolean }) {
  const Icon = kind === "tool" ? Wrench : BookOpen;
  return (
    <Icon
      aria-hidden
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      color={lit ? "var(--color-cream)" : FILL[kind]}
      fill={FILL[kind]}
      strokeWidth={lit ? 2.75 : 2.25}
      filter={lit ? `url(#${NEON_LIT.id})` : undefined}
    />
  );
}

function describeHover(
  hover: Hover | null,
  byId: Map<string, SimNode>,
  links: SimLink[],
  model: ForceGraphModel,
): { title: string; lines: string[] } | null {
  if (!hover) return null;
  if (hover.kind === "link") {
    const link = links[hover.index];
    if (!link) return null;
    const s = byId.get(endId(link.source));
    const t = byId.get(endId(link.target));
    if (!s || !t) return null;
    if (link.kind === "membership") {
      const cluster = s.kind === "intent" ? s : t;
      const capability = s.kind === "intent" ? t : s;
      return {
        title: `${cluster.label} → ${capability.label}`,
        lines: [`invoked ${link.value}× for this intent`],
      };
    }
    return {
      title: `${s.label} · ${t.label}`,
      lines: [`answer the same ${link.value === 1 ? "pattern" : `${link.value} patterns`}`],
    };
  }
  const node = byId.get(hover.id);
  if (!node) return null;
  if (node.kind === "intent") {
    return {
      title: node.label,
      lines: [
        `support ${node.support} · ${node.memberCount} queries`,
        `${node.edgeCount} capabilities · click to select`,
      ],
    };
  }
  const asks = model.memberships[node.id] ?? [];
  const lines = [`${node.kind} · invoked ${node.totalWeight}× across ${node.clusterCount} intents`];
  for (const ask of asks.slice(0, 3)) lines.push(`${ask.label} · ${ask.weight}×`);
  if (asks.length > 3) lines.push(`+${asks.length - 3} more`);
  if (node.missing) lines.push("not in the current catalog");
  lines.push("click to open in the catalog");
  return { title: node.label, lines };
}
