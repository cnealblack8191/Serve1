/**
 * Address matching — SERVER ONLY.
 *
 * Resolves email addresses to CRM records so incoming and outgoing mail is
 * filed automatically against the right client, opportunity, bid, job,
 * work order or invoice.
 */

import type { DocumentRecordType } from "@/lib/sharepoint/types";

export interface MatchTarget {
  recordType: DocumentRecordType;
  recordId: string;
}

type Client = { from: (t: string) => any };

const emailsIn = (value: unknown): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const m = v.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
      if (m) out.push(...m);
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk(value);
  return out.map((e) => e.toLowerCase());
};

const domainOf = (address: string) => address.toLowerCase().split("@")[1] ?? "";

const INTERNAL_DOMAINS = ["electricalcontractorinc.com", "ecinc.us"];

/**
 * Finds the business records an email conversation belongs to, by matching the
 * external participants against client contact addresses and record contacts.
 */
export async function matchRecordsForAddresses(
  supabase: Client,
  addresses: string[],
): Promise<MatchTarget[]> {
  const external = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))].filter(
    (a) => !INTERNAL_DOMAINS.includes(domainOf(a)),
  );
  if (external.length === 0) return [];
  const domains = new Set(external.map(domainOf).filter(Boolean));

  const hits: MatchTarget[] = [];
  const customers = new Set<string>();

  const { data: customerRows } = await supabase
    .from("customers")
    .select("id, name, contact_email");
  for (const row of (customerRows ?? []) as { name: string; contact_email: string | null }[]) {
    const email = (row.contact_email ?? "").toLowerCase();
    if (!email) continue;
    if (external.includes(email) || domains.has(domainOf(email))) {
      customers.add(row.name);
      hits.push({ recordType: "customer", recordId: row.name });
    }
  }

  const { data: oppRows } = await supabase
    .from("opportunities")
    .select("id, customer, contacts")
    .order("created_at", { ascending: false })
    .limit(500);
  for (const row of (oppRows ?? []) as { id: string; customer: string; contacts: unknown }[]) {
    const found = emailsIn(row.contacts);
    if (found.some((e) => external.includes(e))) {
      hits.push({ recordType: "opportunity", recordId: row.id });
      if (row.customer) {
        customers.add(row.customer);
        hits.push({ recordType: "customer", recordId: row.customer });
      }
    }
  }

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, customer, contacts")
    .order("created_at", { ascending: false })
    .limit(500);
  for (const row of (jobRows ?? []) as { id: string; customer: string; contacts: unknown }[]) {
    const found = emailsIn(row.contacts);
    if (found.some((e) => external.includes(e))) {
      hits.push({ recordType: "job", recordId: row.id });
      if (row.customer) {
        customers.add(row.customer);
        hits.push({ recordType: "customer", recordId: row.customer });
      }
    }
  }

  // Deduplicate.
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.recordType}:${h.recordId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Contacts used to make the preview mailbox reflect real CRM data. */
export async function previewContactHints(supabase: Client) {
  const { data } = await supabase
    .from("opportunities")
    .select("name, customer, contact_name, contacts")
    .order("created_at", { ascending: false })
    .limit(25);
  const hints: { name: string; address: string; subject: string }[] = [];
  for (const row of (data ?? []) as {
    name: string;
    customer: string;
    contact_name: string | null;
    contacts: unknown;
  }[]) {
    const email = emailsIn(row.contacts).find((e) => !INTERNAL_DOMAINS.includes(domainOf(e)));
    if (!email) continue;
    hints.push({
      name: row.contact_name || row.customer,
      address: email,
      subject: `${row.name} — next steps`,
    });
    if (hints.length >= 3) break;
  }
  return hints;
}
