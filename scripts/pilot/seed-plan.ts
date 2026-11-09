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
  SEED_VISITS,
} from "../../src/data/local/seed";

/** A pilot sign-in as create-users.sh records it (no password, ever). */
export interface PilotUser {
  /** The demo account it stands for, e.g. "local-tech-1". */
  demoIdentityId: string;
  /** Contact email attribute, e.g. "tech@serv1.ecinc.us" (no mailbox, no mail sent). */
  email: string;
  /** Cognito user id (sub) and username ("tech": the pilot signs in by username). */
  sub: string;
  username: string;
}

/** Serv1's identity for a Cognito user: `${sub}::${username}` (src/data/amplify, currentUser). */
export const cognitoIdentity = (u: Pick<PilotUser, "sub" | "username">) =>
  `${u.sub}::${u.username}`;

/**
 * The four pilot sign-ins, plain usernames (owner, 2026-11-09: "admin, user, tech", and "instead
 * of share, make it viewer"), and the demo account each stands for. "viewer" is the read-only
 * Owner role. The other demo techs stay on the roster and the dispatch board without a sign-in.
 */
export const PILOT_SIGN_INS = [
  { local: "admin", demoIdentityId: "local-admin", group: "Admin" },
  { local: "user", demoIdentityId: "local-office", group: "Office" },
  { local: "tech", demoIdentityId: "local-tech-1", group: "Tech" },
  { local: "viewer", demoIdentityId: "local-owner", group: "Owner" },
] as const;

/** The pilot's time zone (the company's, as in amplify/functions/eci1-tech-bridge/resource.ts). */
export const PILOT_TIME_ZONE = "America/New_York";

/** Roster identity for a demo person who has no pilot sign-in (never matches a Cognito user). */
export const noSignInIdentity = (demoIdentityId: string) => `no-sign-in:${demoIdentityId}`;

const strip = <T extends { createdAt?: string; updatedAt?: string }>(r: T) => {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest;
};

export function buildSeedPlan(pilotUsers: PilotUser[]) {
  const byDemo = new Map(pilotUsers.map((u) => [u.demoIdentityId, u]));
  const missing = PILOT_SIGN_INS.filter((p) => !byDemo.has(p.demoIdentityId)).map((p) => p.local);
  if (missing.length) throw new Error(`No pilot sign-in for: ${missing.join(", ")}`);
  const demoIds = new Set(DEMO_ACCOUNTS.map((a) => a.identityId));
  const identity = (local: string | null) => {
    if (local === null) return null;
    if (!demoIds.has(local)) throw new Error(`Seed refers to an unknown demo identity: ${local}`);
    const u = byDemo.get(local);
    return u ? cognitoIdentity(u) : noSignInIdentity(local);
  };
  const identities = (ids: string[]) =>
    ids.map((x) => identity(x)).filter((x): x is string => x !== null);
  // Demo people without a sign-in keep a name-only email on the pilot domain (no mailbox, no login).
  const domain = pilotUsers[0]!.email.split("@")[1]!;

  return {
    users: SEED_USERS.map((u) => ({
      ...strip(u),
      email: byDemo.get(u.identityId!)?.email ?? `${u.email.split("@")[0]}.no-sign-in@${domain}`,
      identityId: identity(u.identityId),
    })),
    customers: SEED_CUSTOMERS.map(strip),
    sites: SEED_SITES.map(strip),
    jobs: SEED_JOBS.map((j) => ({
      ...strip(j),
      assignedTechId: identity(j.assignedTechId),
      ...(j.visitTechIds ? { visitTechIds: identities(j.visitTechIds) } : {}),
    })),
    // Multi-visit demo job (docs/VISITS.md): each visit's tech and the job's tech list.
    visits: SEED_VISITS.map((v) => ({
      ...strip(v),
      assignedTechId: identity(v.assignedTechId),
      jobTechIds: v.jobTechIds ? identities(v.jobTechIds) : null,
    })),
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
