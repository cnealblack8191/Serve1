import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { cn } from "@/lib/utils";

// Light and dark variants (SPEC.md section 13). Job statuses use src/lib/status.ts instead.
const TONES: Record<string, string> = {
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-500/30",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-500/30",
  copper:
    "bg-orange-50 text-eci-copper ring-orange-600/15 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-950 dark:text-red-200 dark:ring-red-500/30",
  navy: "bg-eci-navy/5 text-eci-navy ring-eci-navy/10 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-500/30",
  zinc: "bg-muted text-zinc-700 ring-black/5 dark:text-zinc-200 dark:ring-white/10",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  Active: "green",
  Complete: "green",
  Delivered: "green",
  Paid: "green",
  Won: "green",
  Synced: "green",
  Approved: "green",
  "In Progress": "amber",
  "Pending PO": "amber",
  Ordered: "amber",
  "Partially Paid": "amber",
  "Awaiting Approval": "amber",
  Connecting: "amber",
  "Changes Requested": "amber",
  Pending: "amber",
  Overdue: "red",
  Failed: "red",
  Rejected: "red",
  "On Hold": "red",
  "No-Bid": "red",
  Lost: "red",
  "Ready to Send": "copper",
  "Priority 1": "copper",
  Estimating: "navy",
  "Sent to Customer": "navy",
  Sent: "navy",
  "Submitted to Spectrum": "navy",
  "Approved to Estimate": "navy",
  Contract: "navy",
  "Non-Contract": "copper",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[STATUS_TONE[status] ?? "zinc"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1",
        tone,
        className,
      )}
    >
      {status}
    </span>
  );
}

export function SummaryCard({
  label,
  value,
  hint,
  hintTone = "zinc",
  accent,
  chartValue,
  chartTotal,
  chartLabel,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "zinc" | "green" | "amber" | "copper";
  accent?: boolean;
  chartValue?: number;
  chartTotal?: number;
  chartLabel?: string;
  to?: LinkProps["to"];
}) {
  const hintClass = {
    zinc: "text-muted-foreground",
    green: "text-emerald-600",
    amber: "text-amber-600",
    copper: "text-eci-copper",
  }[hintTone];
  const hasChart = typeof chartValue === "number" && typeof chartTotal === "number";
  const safeValue = hasChart ? Math.max(0, chartValue) : 0;
  const safeTotal = hasChart ? Math.max(safeValue, chartTotal) : 0;
  const percent = safeTotal > 0 ? Math.round((safeValue / safeTotal) * 100) : 0;
  const chartData =
    safeTotal > 0
      ? [
          { name: label, value: safeValue },
          { name: "Remainder", value: Math.max(0, safeTotal - safeValue) },
        ]
      : [{ name: "No data", value: 1 }];
  const chartColor = accent
    ? "var(--eci-copper)"
    : hintTone === "green"
      ? "var(--chart-4)"
      : hintTone === "amber"
        ? "var(--eci-amber)"
        : hintTone === "copper"
          ? "var(--eci-copper)"
          : "var(--eci-navy)";
  const content = (
    <>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={cn("text-2xl font-semibold", accent ? "text-eci-copper" : "text-foreground")}
        >
          {value}
        </span>
        {hint ? <span className={cn("text-xs font-medium", hintClass)}>{hint}</span> : null}
      </div>
      {hasChart ? (
        <div
          className="relative size-20 shrink-0"
          role="img"
          aria-label={chartLabel ?? `${label}: ${percent}% of total`}
        >
          <PieChart width={80} height={80}>
            <Pie
              data={chartData}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={25}
              outerRadius={36}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={safeTotal > 0 ? chartColor : "var(--muted)"} />
              {safeTotal > 0 ? <Cell fill="var(--muted)" /> : null}
            </Pie>
          </PieChart>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
            {percent}%
          </span>
        </div>
      ) : null}
    </>
  );

  const cardClassName = cn(
    "eci-card flex min-h-32 items-center justify-between gap-3 p-5",
    accent && "border-l-4 border-eci-amber",
    to &&
      "group cursor-pointer transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-eci-navy/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eci-copper focus-visible:ring-offset-2",
  );

  return to ? (
    <Link to={to} className={cardClassName} aria-label={`Open ${label}`}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  to,
}: {
  title: string;
  description?: string;
  action?: string;
  to?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="eci-panel-title">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>

      {action ? (
        to ? (
          <Link to={to} className="text-sm font-medium text-eci-copper hover:underline">
            {action}
          </Link>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{action}</span>
        )
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-medium leading-tight text-balance">{title}</h1>
        {description ? (
          <p className="max-w-[62ch] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="eci-card flex flex-col items-center gap-1 p-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/70 py-3 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
