/**
 * Human-readable record numbers that do not collide when two office users save
 * at the same moment (Codex review of PRs #2 and #3). Format: prefix, date,
 * then a random 4-character tail, e.g. J-261030-7K2Q. The database stores the
 * number as a plain string; uniqueness comes from the random tail, which is
 * enough for the pilot. A server-side counter can replace this later.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

function tail(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function datePart(d = new Date()): string {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export const newJobNumber = (): string => `J-${datePart()}-${tail()}`;
export const newInvoiceNumber = (): string => `INV-${datePart()}-${tail()}`;
