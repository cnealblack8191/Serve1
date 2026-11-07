import type { NewOpportunity } from "@/data";

/** Native select styling, matching the app's inputs (native = easy on phones and for tests). */
export const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Today as YYYY-MM-DD in local time. */
export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** "Nov 9, 2026" for a YYYY-MM-DD date; "—" when empty. */
export function dateLabel(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const isPast = (d: string | null | undefined, today = todayIso()) => !!d && d < today;

/** The money fields of an opportunity (shown to office and owner roles only). */
export const MONEY_FIELDS: {
  key: keyof NewOpportunity;
  label: string;
  kind: "money" | "pct" | "hours";
}[] = [
  { key: "quotedAmount", label: "Quoted amount", kind: "money" },
  { key: "forecastAmount", label: "Forecast amount", kind: "money" },
  { key: "jobCost", label: "Job cost", kind: "money" },
  { key: "invoicedAmount", label: "Invoiced amount", kind: "money" },
  { key: "quotedMargin", label: "Quoted margin %", kind: "pct" },
  { key: "completedMargin", label: "Completed margin %", kind: "pct" },
  { key: "probability", label: "Probability %", kind: "pct" },
  { key: "hoursQuoted", label: "Hours quoted", kind: "hours" },
];

/** Address value for "opportunities with no sales rep". */
export const NO_REP = "none";
