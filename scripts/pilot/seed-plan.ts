/**
 * What the pilot seed writes (docs/PILOT-DEPLOY.md): the same synthetic demo data the local
 * demo uses (src/data/local/seed.ts), with each demo account's local identity replaced by the
 * Cognito identity of the matching pilot sign-in. Pure: no network, so it is unit-tested.
 *
 * Synthetic data only. Nothing here reads, copies or imports real records.
 */
import {
  DEMO_ACCOUNTS,
  SEED_CUSTOMERS,
  SEED_INVOICES,
  SEED_JOBS,
  SEED_OPPORTUNITIES,
  SEED_SITES,
  SEED_TECH_NOTES,
  SEED_TECH_RECEIPTS,
  SEED_USERS,
} from "../../src/data/local/seed";

/** A pilot sign-in as create-users.sh records it (no password, ever). */
export interface PilotUser {
  /** The demo account it stands for, e.g. "local-tech-1". */
  demoIdentityId: string;
  /** Sign-in name, e.g. "tech1@serv1.ecinc.us". */
  email: string;
  /** Cognito user id (sub) and username, as AdminCreateUser returned them. */
  sub: string;
  username: string;
}

/** Serv1's identity for a Cognito user: `${sub}::${username}` (src/data/amplify, currentUser). */
export const cognitoIdentity = (u: Pick<PilotUser, "sub" | "username">) =>
  `${u.sub}::${u.username}`;

/** The pilot sign-in name for each demo account: same local part, the pilot's domain. */
export const pilotEmail = (demoEmail: string, domain: string) =>
  `${demoEmail.split("@")[0]}@${domain}`;

const strip = <T extends { createdAt?: string; updatedAt?: string }>(r: T) => {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest;
};

export function buildSeedPlan(pilotUsers: PilotUser[]) {
  const byDemo = new Map(pilotUsers.map((u) => [u.demoIdentityId, u]));
  const missing = DEMO_ACCOUNTS.filter((a) => !byDemo.has(a.identityId)).map((a) => a.email);
  if (missing.length) throw new Error(`No pilot sign-in for: ${missing.join(", ")}`);
  const identity = (local: string | null) => {
    if (local === null) return null;
    const u = byDemo.get(local);
    if (!u) throw new Error(`Seed refers to an unknown demo identity: ${local}`);
    return cognitoIdentity(u);
  };

  return {
    users: SEED_USERS.map((u) => ({
      ...strip(u),
      email: byDemo.get(u.identityId!)!.email,
      identityId: identity(u.identityId),
    })),
    customers: SEED_CUSTOMERS.map(strip),
    sites: SEED_SITES.map(strip),
    jobs: SEED_JOBS.map((j) => ({ ...strip(j), assignedTechId: identity(j.assignedTechId) })),
    opportunities: SEED_OPPORTUNITIES.map(strip),
    // Invoice rows are keyed by jobId (amplify/data/resource.ts); `id` is not a field.
    invoices: SEED_INVOICES.map((i) => {
      const { id: _id, ...rest } = strip(i);
      return rest;
    }),
    techNotes: SEED_TECH_NOTES.map((n) => ({
      ...strip(n),
      assignedTechId: identity(n.assignedTechId),
    })),
    techReceipts: SEED_TECH_RECEIPTS.map((r) => ({
      ...strip(r),
      assignedTechId: identity(r.assignedTechId),
    })),
  };
}

export type SeedPlan = ReturnType<typeof buildSeedPlan>;
