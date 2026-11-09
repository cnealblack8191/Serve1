/**
 * Loads the synthetic demo data into the DEPLOYED pilot backend (docs/PILOT-DEPLOY.md, step 4).
 * Run by the owner, after create-users.sh, from the repository root:
 *
 *   npx tsx scripts/pilot/seed-demo.ts amplify_outputs.json scripts/pilot/pilot-users.json
 *
 * It signs in as the pilot Admin (the password is typed at the prompt, never an argument, a file
 * or a log line) and writes through the normal Serv1 data API, so every access rule applies.
 * Safe to run twice: a row whose id already exists is left as it is.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { Amplify } from "aws-amplify";
import { signIn, signOut } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";

import { buildSeedPlan, type PilotUser } from "./seed-plan";

type Model = {
  get(args: object): Promise<{ data: unknown; errors?: { message: string }[] }>;
  create(args: object): Promise<{ data: unknown; errors?: { message: string }[] }>;
};

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(question)) out.output.write(s);
  };
  const answer = await new Promise<string>((r) => rl.question(question, r));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const [outputsPath, usersPath] = process.argv.slice(2);
  if (!outputsPath || !usersPath) {
    console.error(
      "Usage: npx tsx scripts/pilot/seed-demo.ts <amplify_outputs.json> <pilot-users.json>",
    );
    process.exit(2);
  }
  const outputs = JSON.parse(readFileSync(outputsPath, "utf8"));
  const pilot = JSON.parse(readFileSync(usersPath, "utf8")) as { users: PilotUser[] };
  const plan = buildSeedPlan(pilot.users);
  const admin = pilot.users.find((u) => u.demoIdentityId === "local-admin");
  if (!admin) throw new Error("pilot-users.json has no Admin sign-in");

  Amplify.configure(outputs);
  const password = await askHidden(`Password for ${admin.email}: `);
  const res = await signIn({ username: admin.email, password });
  if (!res.isSignedIn) throw new Error(`Sign-in did not finish (${res.nextStep.signInStep})`);

  const client = generateClient({ authMode: "userPool" });
  const models = client.models as unknown as Record<string, Model>;
  const put = async (model: string, key: Record<string, string>, row: object) => {
    const m = models[model];
    if (!m) throw new Error(`The deployed backend has no ${model} model`);
    const found = await m.get(key);
    if (found.data) return "kept";
    const made = await m.create(row);
    if (made.errors?.length)
      throw new Error(`${model} ${JSON.stringify(key)}: ${made.errors[0]!.message}`);
    return "created";
  };

  const steps: [
    string,
    string,
    object[],
    (r: Record<string, unknown>) => Record<string, string>,
    (r: object) => object,
  ][] = [
    ["User", "users", plan.users, (r) => ({ id: String(r.id) }), (r) => r],
    ["Customer", "customers", plan.customers, (r) => ({ id: String(r.id) }), (r) => r],
    ["Site", "sites", plan.sites, (r) => ({ id: String(r.id) }), (r) => r],
    [
      "Job",
      "jobs",
      plan.jobs,
      (r) => ({ id: String(r.id) }),
      (r) => {
        const j = r as { materials?: unknown };
        return j.materials === undefined || j.materials === null
          ? r
          : { ...r, materials: JSON.stringify(j.materials) };
      },
    ],
    ["Opportunity", "opportunities", plan.opportunities, (r) => ({ id: String(r.id) }), (r) => r],
    [
      "Invoice",
      "invoices",
      plan.invoices,
      (r) => ({ jobId: String(r.jobId) }),
      (r) => ({ ...r, lineItems: JSON.stringify((r as { lineItems: unknown }).lineItems) }),
    ],
    ["TechNote", "tech notes", plan.techNotes, (r) => ({ id: String(r.id) }), (r) => r],
    ["TechReceipt", "tech receipts", plan.techReceipts, (r) => ({ id: String(r.id) }), (r) => r],
  ];
  for (const [model, label, rows, key, encode] of steps) {
    let created = 0;
    let kept = 0;
    for (const row of rows) {
      const outcome = await put(model, key(row as Record<string, unknown>), encode(row));
      if (outcome === "created") created++;
      else kept++;
    }
    console.log(`${label}: ${created} created, ${kept} already there`);
  }
  await signOut();
  console.log("Demo data loaded. Every record is synthetic.");
}

main().catch((e) => {
  // The message only: never the request, the password or a token.
  console.error(`Seed stopped: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
