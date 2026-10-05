import { relativeTime } from "@ratel-ai/burrow-model";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBurrow } from "../lib/data";
import { cx } from "./ui";

/** The sidebar's project picker: a styled popover menu, not the browser's native select. */
export function ProjectSwitcher() {
  const { projects, project, setProject } = useBurrow();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === project);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    // Focus the selected project so arrows and Enter work straight away.
    menu.current?.querySelector<HTMLButtonElement>("[aria-current='true']")?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (projects.length === 0) return null;
  const single = projects.length === 1;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(items.length - 1, at + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(0, at - 1)]?.focus();
    }
  };

  return (
    <div className="relative mb-4 px-2" ref={root}>
      <div className="eyebrow mb-1">Project</div>
      <button
        ref={trigger}
        type="button"
        disabled={single}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          "flex w-full items-center gap-2 rounded-lg border bg-base-deep/60 py-2 pr-2.5 pl-3 text-left transition-colors",
          open ? "border-green/60" : "border-forest-300",
          !single && !open && "hover:bg-forest-300/20",
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-green" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-cream">{project}</span>
        {single ? null : (
          <ChevronsUpDown className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
        )}
      </button>
      <div className="mt-1 px-0.5 text-[11px] text-warm-muted">
        {(current?.events ?? 0).toLocaleString("en-US")} events
        {single ? "" : ` · ${projects.length} projects`}
      </div>

      {open ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: arrow-key navigation between the menu's buttons
        <div
          ref={menu}
          onKeyDown={onMenuKey}
          className="absolute top-[3.6rem] right-2 left-2 z-30 max-h-72 overflow-y-auto rounded-lg border border-forest-300 bg-forest-600 p-1 shadow-2xl shadow-black/50"
        >
          {projects.map((p) => {
            const selected = p.id === project;
            return (
              <button
                key={p.id}
                type="button"
                aria-current={selected}
                onClick={() => {
                  setProject(p.id);
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-forest-300/40 focus:bg-forest-300/40 focus:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      "block truncate font-mono text-sm",
                      selected ? "text-cream" : "text-cream-dim",
                    )}
                  >
                    {p.id}
                  </span>
                  <span className="block text-[11px] text-warm-muted">
                    {p.events.toLocaleString("en-US")} events · {relativeTime(p.lastTs)}
                  </span>
                </span>
                {selected ? <Check className="size-3.5 shrink-0 text-green" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
