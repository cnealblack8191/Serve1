import { bidTotals, lineSell, money } from "@/lib/eci/store";
import type { Bid, LineItem, QuoteFormat } from "@/lib/eci/types";
import eciLogo from "@/assets/eci-logo.png.asset.json";

/**
 * Placeholder labor roles and billing rates. Real role/rate data will replace
 * these once the labor schedule is loaded; the structure is what matters.
 */
const PLACEHOLDER_ROLES: { role: string; rate: number; match: RegExp }[] = [
  { role: "Foreman", rate: 96, match: /foreman|supervis|lead/i },
  { role: "Journeyman Electrician", rate: 84, match: /journey|install|termination|feeder|panel/i },
  { role: "Apprentice Electrician", rate: 58, match: /apprentice|helper|demo|rough/i },
];
const DEFAULT_ROLE = PLACEHOLDER_ROLES[1]!;

function roleFor(item: LineItem) {
  const text = `${item.description} ${item.customerDescription} ${item.costCode}`;
  return PLACEHOLDER_ROLES.find((r) => r.match.test(text)) ?? DEFAULT_ROLE;
}

/** Hours come from the line quantity when it is priced hourly. */
function hoursFor(item: LineItem) {
  const hourly = /^(hr|hrs|hour|hours|mh)$/i.test(item.unit.trim());
  return hourly ? item.qty : Math.round((lineSell(item) / roleFor(item).rate) * 10) / 10;
}

export function QuotePreview({
  bid,
  quoteFormat = "Lump Sum",
}: {
  bid: Bid;
  quoteFormat?: QuoteFormat;
}) {
  const totals = bidTotals(bid.lineItems);
  const itemized = quoteFormat === "Itemized";

  const labor = bid.lineItems.filter((l) => l.category === "Labor");
  const materials = bid.lineItems.filter((l) => l.category !== "Labor");

  const laborByRole = Object.values(
    labor.reduce<Record<string, { role: string; rate: number; hours: number; amount: number }>>(
      (acc, l) => {
        const { role, rate } = roleFor(l);
        const row = acc[role] ?? { role, rate, hours: 0, amount: 0 };
        row.hours += hoursFor(l);
        row.amount += lineSell(l);
        acc[role] = row;
        return acc;
      },
      {},
    ),
  );
  const laborTotal = laborByRole.reduce((s, r) => s + r.amount, 0);
  const materialTotal = materials.reduce((s, l) => s + lineSell(l), 0);

  return (
    <div className="mx-auto w-full max-w-3xl bg-card p-8 ring-1 ring-black/10">
      <div className="flex items-start justify-between border-b-4 border-eci-amber pb-6">
        <div className="flex items-center gap-3">
          <img
            src={eciLogo.url}
            alt="Electrical Contractor Incorporated logo"
            width={48}
            height={48}
            className="size-12 rounded-full"
          />
          <div>
            <p className="text-lg font-semibold">Electrical Contractor Incorporated</p>
            <p className="text-xs text-muted-foreground">
              8141 Technology Dr, Covington, GA 30014 · (770) 788-8082 · www.electricalcontractorinc.com
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Quotation</p>
          <p className="font-mono text-sm">{bid.id}</p>
          <p className="text-xs text-muted-foreground">{quoteFormat}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-6 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Prepared for</p>
          <p className="font-medium">{bid.customer}</p>
          <p className="text-muted-foreground">{bid.address}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Project</p>
          <p className="font-medium">{bid.name}</p>
          <p className="text-muted-foreground">
            {bid.jobType} · {bid.division}
          </p>
        </div>
      </div>

      {itemized ? (
        <div className="space-y-8">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Labor hours by role
            </h3>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Role</th>
                  <th className="py-2 text-right">Hours</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {laborByRole.map((r) => (
                  <tr key={r.role}>
                    <td className="py-2 pr-4">{r.role}</td>
                    <td className="py-2 text-right">{r.hours.toFixed(1)}</td>
                    <td className="py-2 text-right">{money(r.rate)}/hr</td>
                    <td className="py-2 text-right">{money(r.amount)}</td>
                  </tr>
                ))}
                {laborByRole.length === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={4}>
                      No labor lines on this bid.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="py-2">Labor subtotal</td>
                  <td />
                  <td />
                  <td className="py-2 text-right">{money(laborTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-1 text-xs text-muted-foreground">
              Rates shown are placeholder role rates pending the published labor schedule.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Materials &amp; other direct costs
            </h3>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {materials.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4">{l.customerDescription || l.description}</td>
                    <td className="py-2 text-right">{l.qty}</td>
                    <td className="py-2 text-right">{l.unit}</td>
                    <td className="py-2 text-right">{money(lineSell(l))}</td>
                  </tr>
                ))}
                {materials.length === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={4}>
                      No material lines on this bid.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="py-2">Materials subtotal</td>
                  <td />
                  <td />
                  <td className="py-2 text-right">{money(materialTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-border">
              <th className="py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Scope of work
              </th>
              <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {bid.lineItems.map((l) => (
              <tr key={l.id}>
                <td className="py-3 pr-4">{l.customerDescription || l.description}</td>
                <td className="py-3 text-right">{money(lineSell(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 flex justify-end border-t-2 border-eci-navy pt-4">
        <div className="w-64 space-y-1 text-sm">
          {itemized ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labor</span>
                <span>{money(laborTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Materials</span>
                <span>{money(materialTotal)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(totals.sell)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total quoted price</span>
            <span>{money(totals.sell)}</span>
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Quotation valid 30 days. Work performed per NEC and local jurisdiction requirements.
        Prepared by {bid.owner}, Electrical Contractor Incorporated
      </p>
    </div>
  );
}
