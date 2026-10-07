import { formatCount, formatPercent, plural } from "@ratel-ai/burrow-model";
import { useBurrow } from "../../lib/data";
import { TimeChart } from "../charts";
import { Code, cx } from "../ui";
import { relativeDelta, TrendChip } from "./Trend";

/** The headline: context Ratel kept out of the model, against sending every tool. */
export function TokensSaved() {
  const { savings, previous } = useBurrow();
  if (savings.basis === "none") {
    return (
      <section className="rounded-2xl border border-forest-300/60 bg-forest-600/70 p-6">
        <div className="eyebrow">Tokens saved</div>
        <p className="mt-2 text-sm text-cream-dim">
          Turn on catalog definitions with <Code>burrowConfig()</Code> to measure how much context
          Ratel keeps out of your model.
        </p>
      </section>
    );
  }
  const full = savings.fullCatalogTokens;
  const served = savings.servedTokensPerSearch;
  const reduction = full > 0 ? 1 - served / full : 0;
  const delta = previous ? relativeDelta(savings.savedTotal, previous.savedTotal) : null;
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-green/30 bg-forest-600/70 p-6"
      title="Estimated tokens Ratel kept out of your model's context, against sending every definition on every turn."
    >
      <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-green" aria-hidden />
            Tokens saved
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-5xl font-semibold text-cream tabular">
              ~{formatCount(savings.savedTotal)}
            </span>
            {delta ? <TrendChip text={delta.text} up={delta.up} good={delta.up} /> : null}
          </div>
          <p className="mt-2 text-sm text-cream-dim">
            over {formatCount(savings.searches)} searches
          </p>
          <div className="mt-5 flex flex-wrap gap-6">
            <Mini label="less context" value={`−${formatPercent(reduction)}`} />
            <Mini label="per search" value={`~${formatCount(savings.savedPerSearch)}`} />
          </div>
        </div>

        <div className="space-y-4 self-center">
          <Compare
            label="Without Ratel"
            note={`${formatCount(savings.entryCount)} tools`}
            tokens={full}
            width={1}
            color="bg-coral/70"
          />
          <Compare
            label="With Ratel"
            note={`top ${savings.avgReturned.toFixed(1)}`}
            tokens={served}
            width={full > 0 ? served / full : 0}
            color="bg-green"
          />
        </div>
      </div>

      {savings.series.length > 1 ? (
        <div className="relative mt-6 border-t border-forest-300/50 pt-4">
          <div className="eyebrow mb-2">Saved over time · running total</div>
          <TimeChart
            label="Estimated tokens saved, running total"
            points={savings.series.map((b) => ({
              x: b.start,
              y: b.cumulative,
              detail: b.searches
                ? [`+${formatCount(b.saved)} · ${plural(b.searches, "search", "searches")}`]
                : [],
            }))}
            color="var(--color-green)"
            format={(v) => formatCount(v)}
            height={140}
            kind="area"
          />
        </div>
      ) : null}
    </section>
  );
}

function Compare({
  label,
  note,
  tokens,
  width,
  color,
}: {
  label: string;
  note: string;
  tokens: number;
  width: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-cream">
          {label} <span className="text-xs text-warm-muted">· {note}</span>
        </span>
        <span className="font-mono text-cream tabular">~{formatCount(tokens)} tokens</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-forest-300/40">
        <div
          className={cx("h-full rounded-full", color)}
          style={{ width: `${Math.max(1, width * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-xl text-green tabular">{value}</div>
      <div className="text-xs text-warm-muted">{label}</div>
    </div>
  );
}
