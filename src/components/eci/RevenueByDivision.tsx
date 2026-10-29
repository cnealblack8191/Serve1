import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DIVISIONS } from "@/lib/eci/data";
import { money } from "@/lib/eci/store";
import type { Job } from "@/lib/eci/types";

const SLICE_COLORS = [
  "var(--eci-navy)",
  "var(--eci-amber)",
  "var(--eci-copper)",
  "var(--eci-navy-soft)",
  "var(--muted-foreground)",
];

export function RevenueByDivision({ jobs }: { jobs: Job[] }) {
  const rows = DIVISIONS.map((division) => ({
    division,
    value: jobs.filter((j) => j.division === division).reduce((s, j) => s + j.contractValue, 0),
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const chartRows = rows.filter((r) => r.value > 0);

  return (
    <div className="eci-card grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
      <div className="hidden h-64 md:block" aria-hidden="true">
        {chartRows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartRows}
                dataKey="value"
                nameKey="division"
                innerRadius={55}
                outerRadius={100}
                paddingAngle={2}
                stroke="var(--card)"
              >
                {chartRows.map((r) => (
                  <Cell
                    key={r.division}
                    fill={SLICE_COLORS[DIVISIONS.indexOf(r.division) % SLICE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [
                  `${money(v)} (${total ? Math.round((v / total) * 100) : 0}%)`,
                  name,
                ]}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No job contract value recorded yet.
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Revenue by division from job contract values</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Division</th>
            <th className="pb-2 text-right font-medium">Total</th>
            <th className="pb-2 text-right font-medium">% of total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r, i) => (
            <tr key={r.division}>
              <td className="py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  {r.division}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{money(r.value)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {total ? ((r.value / total) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right tabular-nums">{money(total)}</td>
            <td className="pt-2 text-right tabular-nums">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
