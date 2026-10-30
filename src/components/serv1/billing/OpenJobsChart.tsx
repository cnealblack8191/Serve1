import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { JobStatus } from "@/data";
import { JOB_STATUS_HEX, JOB_STATUS_LABEL } from "@/lib/status";

export function OpenJobsChart({ counts }: { counts: { status: JobStatus; count: number }[] }) {
  const data = counts.map((c) => ({ ...c, name: JOB_STATUS_LABEL[c.status] }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Open jobs by status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="name" tick={{ fill: "currentColor", fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 12 }} />
          <Tooltip cursor={{ fill: "transparent" }} />
          <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.status} fill={JOB_STATUS_HEX[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
