import type { Customer } from "@/data";

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|co|corp|company|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

/**
 * Existing customers that look like the one being saved: same name (ignoring case, punctuation
 * and Inc/LLC), same phone number, or same email. Used to warn, never to block.
 */
export function possibleDuplicates(
  draft: { name: string; phone: string | null; email: string | null },
  customers: Customer[],
  ignoreId?: string,
): { customer: Customer; why: string }[] {
  const name = normName(draft.name);
  const phone = digits(draft.phone);
  const email = (draft.email ?? "").trim().toLowerCase();
  const out: { customer: Customer; why: string }[] = [];
  for (const c of customers) {
    if (c.id === ignoreId) continue;
    const why = [
      name && normName(c.name) === name ? "same name" : null,
      phone.length === 10 && digits(c.phone) === phone ? "same phone" : null,
      email && (c.email ?? "").trim().toLowerCase() === email ? "same email" : null,
    ].filter(Boolean);
    if (why.length) out.push({ customer: c, why: why.join(", ") });
  }
  return out;
}
