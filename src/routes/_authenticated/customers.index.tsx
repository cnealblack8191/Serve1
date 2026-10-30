import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { CustomerDialog } from "@/components/serv1/office/CustomerDialog";
import { matches } from "@/components/serv1/office/matches";
import { SearchBox } from "@/components/serv1/office/SearchBox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCustomers, useIsOffice, useSites } from "@/data";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: Page,
});

function Page() {
  const isOffice = useIsOffice();
  const customers = useCustomers();
  const sites = useSites();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const siteCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sites.data ?? []) counts.set(s.customerId, (counts.get(s.customerId) ?? 0) + 1);
    return counts;
  }, [sites.data]);

  const rows = (customers.data ?? [])
    .filter((c) => matches(q, c.name, c.phone, c.email, c.billingAddress))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Everyone you do work for, with their sites.">
        {isOffice ? <Button onClick={() => setAdding(true)}>Add customer</Button> : null}
      </PageHeader>
      <SearchBox
        label="Search customers"
        placeholder="Search by name, phone, email or address"
        value={q}
        onChange={setQ}
      />
      {customers.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading customers…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? "No customers match your search" : "No customers yet"}
          hint={
            q
              ? "Try a different name or phone number."
              : isOffice
                ? "Use Add customer to create the first one."
                : "Office staff add customers here."
          }
        />
      ) : (
        <div className="eci-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Sites</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to="/customers/$id" params={{ id: c.id }} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {siteCount.get(c.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <CustomerDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(c) => void navigate({ to: "/customers/$id", params: { id: c.id } })}
      />
    </div>
  );
}
