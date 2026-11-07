/** Customer duplicate warning. Run: npm run test:unit */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { possibleDuplicates } from "../../src/components/serv1/office/duplicates.ts";
import type { Customer } from "../../src/data/types.ts";

const c = (
  id: string,
  name: string,
  phone: string | null = null,
  email: string | null = null,
): Customer => ({
  id,
  name,
  phone,
  email,
  billingAddress: null,
  notes: null,
  createdAt: "",
  updatedAt: "",
});
const all = [
  c("1", "Riverside Dental Group, LLC", "(770) 555-0201", "office@riverside.example"),
  c("2", "Oak Hill Apartments"),
];

describe("possibleDuplicates", () => {
  it("matches the same name ignoring case, punctuation and LLC", () => {
    assert.deepEqual(
      possibleDuplicates({ name: "riverside dental group", phone: null, email: null }, all).map(
        (d) => d.customer.id,
      ),
      ["1"],
    );
  });
  it("matches the same phone or email", () => {
    assert.equal(
      possibleDuplicates({ name: "RDG", phone: "770-555-0201", email: null }, all)[0]?.why,
      "same phone",
    );
    assert.equal(
      possibleDuplicates({ name: "RDG", phone: null, email: "Office@Riverside.example " }, all)[0]
        ?.why,
      "same email",
    );
  });
  it("ignores the customer being edited and unrelated names", () => {
    assert.equal(
      possibleDuplicates({ name: "Riverside Dental Group", phone: null, email: null }, all, "1")
        .length,
      0,
    );
    assert.equal(
      possibleDuplicates({ name: "Oak Hill Pharmacy", phone: null, email: null }, all).length,
      0,
    );
  });
});
