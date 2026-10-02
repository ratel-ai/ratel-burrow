/** Compact relative label ("just now", "3h ago", "12d ago"). */
export function relativeTime(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return "never";
  const seconds = Math.max(0, Math.round((now - ts) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "–";
  if (ms < 1) return "<1 ms";
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

/** 1234 → "1.2k", 2_500_000 → "2.5M". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 1_000) return `${Math.round(n)}`;
  if (abs < 1_000_000) return `${(n / 1_000).toFixed(abs < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "–";
  return `${Math.round(ratio * 100)}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1_000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** `1 session`, `3 sessions`; pass `many` for irregular plurals. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
