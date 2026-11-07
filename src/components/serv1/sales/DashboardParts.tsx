import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { HEALTH_HEX, HEALTH_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

import type { Bar } from "./businessStats";

/** Plain HTML bar lists: readable, linkable and accessible without a chart library. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="eci-card flex flex-col gap-3 p-5" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function BarList({
  bars,
  label,
  tone,
  to = "/opportunities",
}: {
  bars: Bar[];
  label?: (b: Bar) => string;
  tone: "navy" | "copper";
  to?: "/opportunities" | "/jobs";
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  if (bars.length === 0) return <p className="text-sm text-muted-foreground">Nothing open.</p>;
  return (
    <ul className="space-y-1">
      {bars.map((b) => {
        const name = label ? label(b) : b.label;
        return (
          <li key={b.label}>
            <Link
              to={to}
              search={b.search ?? {}}
              className="grid min-h-9 grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 rounded-md px-1 text-sm hover:bg-muted/60"
              aria-label={`${name}: ${b.count}`}
            >
              <span className="truncate">{name}</span>
              <span className="h-3.5 rounded bg-muted" aria-hidden>
                <span
                  className={cn(
                    "block h-3.5 rounded",
                    tone === "navy"
                      ? "bg-eci-navy dark:bg-zinc-300"
                      : "bg-eci-copper dark:bg-amber-500",
                  )}
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">{b.count}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function KeyNumber({
  label,
  value,
  hint,
  warn,
  to,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
  to?: { to: "/opportunities" | "/jobs"; search: Record<string, string> };
}) {
  const body = (
    <>
      <span
        className={cn(
          "text-sm font-semibold",
          warn ? "text-orange-900 dark:text-orange-200" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span
        className={cn(
          "text-sm",
          warn ? "text-orange-900 dark:text-orange-200" : "text-muted-foreground",
        )}
      >
        {hint}
      </span>
    </>
  );
  const cls = cn(
    "eci-card flex flex-col gap-1 p-4",
    warn && "border-orange-700 bg-orange-50 dark:border-orange-400 dark:bg-orange-950",
    to && "hover:bg-muted/50",
  );
  return to ? (
    <Link to={to.to} search={to.search} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** One stacked bar of job health per work type, with the counts in text (never color alone). */
export function HealthBar({
  label,
  total,
  counts,
}: {
  label: string;
  total: number;
  counts: Record<"OnTrack" | "Watch" | "Behind" | "NotSet", number>;
}) {
  const parts = (["OnTrack", "Watch", "Behind", "NotSet"] as const).filter((k) => counts[k] > 0);
  const name = (k: (typeof parts)[number]) => (k === "NotSet" ? "Not set" : HEALTH_LABEL[k]);
  const summary = parts.map((k) => `${counts[k]} ${name(k).toLowerCase()}`).join(", ");
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        {label}, {total} {total === 1 ? "job" : "jobs"}
      </p>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No active jobs.</p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded" role="img" aria-label={summary}>
            {parts.map((k) => (
              <span
                key={k}
                style={{ width: `${(counts[k] / total) * 100}%`, background: HEALTH_HEX[k] }}
              />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
            {parts.map((k) => (
              <span key={k}>
                {name(k)} {counts[k]}
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
