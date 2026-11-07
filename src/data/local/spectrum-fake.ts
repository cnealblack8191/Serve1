import type { SpectrumApi } from "../backend";
import type { AuthUser } from "../types";
import {
  isSpectrumOperation,
  refusal,
  roleMayRun,
  SPECTRUM_ERROR_CODES,
  SPECTRUM_ERROR_TEXT,
  validParams,
  type SpectrumErrorCode,
  type SpectrumJob,
  type SpectrumOperation,
  type SpectrumOps,
  type SpectrumReply,
  type SpectrumWorkOrder,
} from "../../../amplify/functions/spectrum/contract";

/**
 * Local demo stand-in for the Spectrum connector: same operations, value rules, role rules and
 * replies as API.md, with synthetic records only. It plays the connector's part, so it keeps
 * the "saved" state the real connector keeps in Parameter Store, but only what the demo needs:
 * who saved, when, the auth mode and the company code (records carry it). The address,
 * authorization ID and operator code are checked and then dropped.
 *
 * Demo-only switches, for tests: an authorization ID starting "BAD" makes Spectrum refuse the
 * credentials; localStorage "serv1.local.spectrumFail" set to an error code makes every
 * Spectrum call fail with that code.
 */
export const FAKE_STATE_KEY = "serv1.local.spectrumFake";
export const FAKE_FAIL_KEY = "serv1.local.spectrumFail";
/** The fake's list cap, so the "truncated" path can be seen with a small data set. */
export const FAKE_LIST_CAP = 20;

interface FakeState {
  savedBy: string;
  savedAt: string;
  authMode: "basic" | "enhanced";
  companyCode: string;
  refused: boolean;
}

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const injectedFailure = (): SpectrumErrorCode | null => {
  try {
    const v = localStorage.getItem(FAKE_FAIL_KEY);
    return v && (SPECTRUM_ERROR_CODES as readonly string[]).includes(v)
      ? (v as SpectrumErrorCode)
      : null;
  } catch {
    return null;
  }
};

const JOB_NAMES = [
  "Switchgear maintenance",
  "Panel upgrade",
  "Lighting retrofit",
  "Generator transfer switch",
  "Fire alarm panel service",
  "Feeder replacement",
];
const CUSTOMERS = [
  { code: "SYN01", name: "Synthetic County Schools" },
  { code: "SYN02", name: "Synthetic City Government" },
  { code: "SYN03", name: "Synthetic Medical Office" },
  { code: "SYN04", name: "Synthetic Warehouse Co" },
];
const JOB_STATUSES = ["A", "A", "C", "I"];

/** 24 synthetic jobs and 24 work orders (two each on the first 12 jobs) for one company. */
export function fakeRecords(companyCode: string): {
  jobs: SpectrumJob[];
  workOrders: SpectrumWorkOrder[];
} {
  const jobs: SpectrumJob[] = Array.from({ length: 24 }, (_, i) => {
    const customer = CUSTOMERS[i % CUSTOMERS.length]!;
    return {
      companyCode,
      jobNumber: String(2401 + i),
      jobName: `${JOB_NAMES[i % JOB_NAMES.length]} - Building ${i + 1}`,
      address: {
        line1: `${100 + i} Sample Street`,
        line2: null,
        city: "Testville",
        state: "GA",
        zip: "30000",
      },
      customer,
      status: JOB_STATUSES[i % JOB_STATUSES.length]!,
      projectManager: i % 2 ? "Pat Example" : "Sam Sample",
    };
  });
  const workOrders: SpectrumWorkOrder[] = [];
  jobs.slice(0, 12).forEach((j, i) => {
    for (const n of [0, 1]) {
      const k = i * 2 + n;
      const day = String(1 + (k % 27)).padStart(2, "0");
      workOrders.push({
        companyCode,
        workOrderNumber: `WO-${5001 + k}`,
        jobNumber: j.jobNumber,
        description: `${n ? "Follow-up" : "Service call"}: ${j.jobName}`,
        site: { name: `Site ${i + 1}`, ...j.address },
        status: n ? "C" : "O",
        assignedTechnician: n ? "Alex Placeholder" : null,
        dates: {
          entered: `2026-10-${day}`,
          scheduled: `2026-11-${day}`,
          completed: n ? `2026-11-${day}` : null,
        },
      });
    }
  });
  return { jobs, workOrders };
}

const cap = <T>(rows: T[]) => ({
  records: rows.slice(0, FAKE_LIST_CAP),
  truncated: rows.length > FAKE_LIST_CAP,
});

export function createFakeSpectrum(currentUser: () => AuthUser | null): SpectrumApi {
  const run = (op: SpectrumOperation, params: unknown): SpectrumReply => {
    const me = currentUser();
    if (!isSpectrumOperation(op) || !me || !roleMayRun(op, me.roles.concat(me.role)))
      return refusal("operation_refused");
    if (op === "credentials.save" && params && typeof params === "object")
      params = { ...(params as object), savedBy: me.name || me.email };
    if (!validParams(op, params)) return refusal("bad_request");
    const ok = <O extends SpectrumOperation>(operation: O, data: SpectrumOps[O]["data"]) =>
      ({ ok: true, operation, data }) as SpectrumReply;

    const state = read<FakeState>(FAKE_STATE_KEY);
    if (op === "credentials.save") {
      const p = params as SpectrumOps["credentials.save"]["params"];
      const next: FakeState = {
        savedBy: p.savedBy,
        savedAt: new Date().toISOString(),
        authMode: p.authMode,
        companyCode: p.companyCode,
        refused: p.authorizationId.toUpperCase().startsWith("BAD"),
      };
      try {
        localStorage.setItem(FAKE_STATE_KEY, JSON.stringify(next));
      } catch {
        return refusal("internal");
      }
      return ok(op, { saved: true, savedBy: next.savedBy, savedAt: next.savedAt });
    }
    if (op === "credentials.status") {
      return ok(
        op,
        state
          ? {
              configured: true,
              savedBy: state.savedBy,
              savedAt: state.savedAt,
              authMode: state.authMode,
            }
          : { configured: false },
      );
    }
    if (!state) return refusal("not_configured");
    const failure = injectedFailure() ?? (state.refused ? "bad_credentials" : null);
    if (op === "credentials.test") {
      return ok(
        op,
        failure
          ? {
              result: "failed",
              reason: failure,
              message: SPECTRUM_ERROR_TEXT[failure],
              durationMs: 380,
            }
          : { result: "connected", durationMs: 120 },
      );
    }
    if (failure) return refusal(failure);

    const { jobs, workOrders } = fakeRecords(state.companyCode);
    switch (op) {
      case "jobs.list": {
        const p = params as SpectrumOps["jobs.list"]["params"];
        return ok(op, cap(jobs.filter((j) => !p.status || j.status === p.status.toUpperCase())));
      }
      case "jobs.get": {
        const p = params as SpectrumOps["jobs.get"]["params"];
        const record = jobs.find((j) => j.jobNumber === p.jobNumber);
        return record ? ok(op, { record }) : refusal("not_found");
      }
      case "workOrders.list": {
        const p = params as SpectrumOps["workOrders.list"]["params"];
        return ok(
          op,
          cap(
            workOrders.filter(
              (w) =>
                (!p.status || w.status === p.status.toUpperCase()) &&
                (!p.jobNumber || w.jobNumber === p.jobNumber),
            ),
          ),
        );
      }
      case "workOrders.get": {
        const p = params as SpectrumOps["workOrders.get"]["params"];
        const record = workOrders.find((w) => w.workOrderNumber === p.workOrderNumber);
        return record ? ok(op, { record }) : refusal("not_found");
      }
    }
    return refusal("operation_refused");
  };

  return {
    async call(operation, params) {
      // A small pause so busy states show, as with the real connector.
      await new Promise((r) => setTimeout(r, 50));
      return run(operation, params) as SpectrumReply<typeof operation>;
    },
  };
}
