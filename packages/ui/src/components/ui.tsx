import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="relative mb-6 overflow-hidden rounded-xl border border-forest-300/60 bg-forest-600/60 px-6 py-5">
      <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cream">{title}</h1>
          {children ? (
            <p className="mt-2 text-sm leading-relaxed text-cream-dim/80">{children}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function Card({
  title,
  hint,
  children,
  className,
  actions,
}: {
  title?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section
      className={cx("rounded-xl border border-forest-300/60 bg-forest-600/70 p-5", className)}
    >
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="eyebrow">{title}</h2> : null}
            {hint ? <p className="mt-1 text-xs text-warm-muted">{hint}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A headline number. `tone` only tints the small marker, never the number. */
export function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "green" | "coral" | "amber" | "muted";
}) {
  const dot = {
    green: "bg-green",
    coral: "bg-coral",
    amber: "bg-amber",
    muted: "bg-warm-muted",
  }[tone ?? "muted"];
  return (
    <div className="rounded-xl border border-forest-300/60 bg-forest-600/70 px-4 py-3.5">
      <div className="eyebrow flex items-center gap-2">
        <span className={cx("inline-block size-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl text-cream tabular">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-warm-muted">{sub}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
  title,
}: {
  children: ReactNode;
  tone?: "muted" | "green" | "coral" | "amber";
  title?: string;
}) {
  const tones = {
    muted: "border-forest-300 text-cream-dim",
    green: "border-green/50 text-cream bg-green/10",
    coral: "border-coral/50 text-cream bg-coral/10",
    amber: "border-amber/50 text-cream bg-amber/10",
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const KIND_DOT = {
  tool: "bg-cap-tool",
  skill: "bg-cap-skill",
  fact: "bg-cap-fact",
} as const;

/** Identity swatch for a capability kind; the text beside it stays in text colors. */
export function KindDot({ kind }: { kind: "tool" | "skill" | "fact" }) {
  return (
    <span className={cx("inline-block size-2 shrink-0 rounded-full", KIND_DOT[kind])} aria-hidden />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-forest-300 px-6 py-10 text-center">
      <div className="text-sm text-cream">{title}</div>
      {children ? (
        <div className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-warm-muted">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-base-deep/70 px-1.5 py-0.5 font-mono text-[12px] text-cream-dim">
      {children}
    </code>
  );
}

export function Pre({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-forest-300/70 bg-base-deep/40 p-3 font-mono text-[12px] leading-relaxed text-cream-dim">
      {text}
    </pre>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="eyebrow">{label}</div>
      <div className="text-sm text-cream">{children}</div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-forest-300 bg-forest-600 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-forest-300 px-5 py-4">
          <div className="min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-warm-muted hover:bg-forest-300/50 hover:text-cream"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full max-w-xs rounded-lg border border-forest-300 bg-base-deep/50 px-3 py-1.5 text-sm text-cream placeholder:text-warm-muted focus:border-green focus:outline-none"
    />
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-forest-300 bg-base-deep/40 p-0.5"
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors",
            o.value === value ? "bg-forest-300 text-cream" : "text-warm-muted hover:text-cream",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A horizontal meter: track + fill. */
export function Meter({
  ratio,
  tone = "green",
}: {
  ratio: number;
  tone?: "green" | "coral" | "amber";
}) {
  const fill = { green: "bg-green", coral: "bg-coral", amber: "bg-amber" }[tone];
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-forest-300/60">
      <div className={cx("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
