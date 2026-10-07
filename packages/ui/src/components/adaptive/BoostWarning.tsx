import { formatCount, formatPercent } from "@ratel-ai/burrow-model";
import { TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { BoostVerdict } from "./GraphMeta";

/**
 * The boost warning as a badge on the graph card: hover says what it is in one
 * line; a click opens the numbers and what to do about them.
 */
export function BoostWarningBadge({ verdict }: { verdict: BoostVerdict }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { better, worse, same, compared } = verdict;
  const parts = [
    { label: "Ranked lower", n: worse, color: "bg-coral/80" },
    { label: "Ranked higher", n: better, color: "bg-green" },
    { label: "No change", n: same, color: "bg-forest-300" },
  ];

  return (
    <div ref={root} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Adaptive ranking warning"
        className="inline-flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral/10 px-2.5 py-1 text-xs text-cream transition-colors hover:border-coral/70"
      >
        <TriangleAlert className="size-3.5 text-coral" strokeWidth={1.8} aria-hidden />
        <span className="font-mono tabular">{formatPercent(worse / compared)}</span>
        ranked lower
      </button>

      {open ? null : (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-forest-300 bg-forest-600 px-3 py-2 text-xs leading-5 text-cream-dim opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100"
        >
          This graph sometimes pushes down the tool your agent ends up using. Click for details.
        </div>
      )}

      {open ? (
        <section
          id={panelId}
          aria-label="Adaptive ranking warning details"
          className="absolute left-0 top-full z-30 mt-2 w-[22rem] space-y-3 rounded-xl border border-forest-300 bg-forest-600 p-4 text-sm shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex items-center gap-2 font-medium text-cream">
              <TriangleAlert className="size-4 text-coral" strokeWidth={1.8} aria-hidden />
              Ranking may be hurting
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-0.5 text-warm-muted transition-colors hover:text-cream"
            >
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>

          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-forest-300/40">
              {parts.map((p) =>
                p.n ? (
                  <div
                    key={p.label}
                    className={p.color}
                    style={{ width: `${(p.n / compared) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {parts.map((p) => (
                <li key={p.label}>
                  <div className="font-mono text-lg text-cream tabular">{formatCount(p.n)}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-warm-muted">
                    <span className={`size-2 rounded-sm ${p.color}`} aria-hidden />
                    {p.label}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-warm-muted">
              Of {formatCount(compared)} searches, comparing where the tool your agent used ranked
              with and without this graph.
            </p>
          </div>

          <div className="border-t border-forest-300/60 pt-3">
            <div className="eyebrow mb-1.5">What to do</div>
            <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-cream-dim">
              <li>Keep watching for a while: an online graph can settle as it learns.</li>
              <li>
                If the share stays high, turn adaptive ranking off: remove the call that enables it
                in your runtime. Search falls back to plain ranking.
              </li>
            </ol>
          </div>
        </section>
      ) : null}
    </div>
  );
}
