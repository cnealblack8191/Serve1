import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RateType } from "./types";

export const EMAIL_IMPORT_STORAGE_KEY = "eci:email-import-draft";

const InputSchema = z.object({
  emailText: z.string().trim().min(20, "Paste the full email so there is enough to work with."),
  customers: z.array(z.object({ name: z.string(), rateType: z.enum(["Contract", "Non-Contract"]) })),
  jobTypes: z.array(z.string()).min(1),
  divisions: z.array(z.string()).min(1),
});

/** Shape the LLM must return (strict json_schema). */
const ExtractedSchema = z.object({
  customerName: z.string().nullable(),
  matchedExistingCustomer: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  projectAddress: z.string().nullable(),
  opportunityName: z.string().nullable(),
  jobType: z.string().nullable(),
  division: z.string().nullable(),
  expectedBidDate: z.string().nullable(),
  description: z.string().nullable(),
  estimatedValue: z.number().nullable(),
  requestsNonContractPricing: z.boolean(),
  pricingIntentEvidence: z.string().nullable(),
});

export type EmailImportResult = {
  customerName: string;
  matchedCustomer: string | null;
  isNewCustomer: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectAddress: string;
  opportunityName: string;
  jobType: string;
  division: string;
  expectedBidDate: string;
  description: string;
  estimatedValue: number;
  /** Rate the app suggests before the user confirms. */
  suggestedRateType: RateType;
  /** True when the user must explicitly confirm contract vs non-contract. */
  needsRateConfirmation: boolean;
  rateReason: string;
  requestsNonContractPricing: boolean;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|co|corp|company|ltd|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function matchCustomer(
  candidate: string | null,
  emailText: string,
  customers: { name: string; rateType: RateType }[],
) {
  const haystack = normalize(emailText);
  if (candidate) {
    const c = normalize(candidate);
    const hit = customers.find((k) => {
      const n = normalize(k.name);
      return n === c || (n.length > 3 && (c.includes(n) || n.includes(c)));
    });
    if (hit) return hit;
  }
  return customers.find((k) => {
    const n = normalize(k.name);
    return n.length > 5 && haystack.includes(n);
  });
}

function pickOption(value: string | null, options: string[]) {
  if (!value) return null;
  const v = value.toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === v) ??
    options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())) ??
    null
  );
}

/** Reads a streamed /v1/responses body and returns the joined output text. */
async function readResponsesStream(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completedText: string | null = null;
  let failure: string | null = null;

  const handle = (raw: string) => {
    const line = raw
      .split("\n")
      .find((l) => l.startsWith("data:"));
    if (!line) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let evt: any;
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
    else if (evt.type === "response.completed") {
      const out = evt.response?.output_text;
      if (typeof out === "string" && out) completedText = out;
    } else if (evt.type === "response.failed" || evt.type === "error") {
      failure = evt.response?.error?.message ?? evt.error?.message ?? evt.message ?? "AI request failed";
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) handle(buffer);
  if (failure) throw new Error(failure);
  return completedText ?? text;
}

export const parseBidEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<EmailImportResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const today = new Date().toISOString().slice(0, 10);
    const instructions = [
      "You extract structured bid-request data from forwarded emails for Electrical Contractor Inc. (ECI), an electrical contractor in Covington, Georgia.",
      "Return ONLY the JSON object described by the schema. Use null for anything not present; never invent values.",
      `Known existing customers: ${data.customers.map((c) => c.name).join("; ") || "(none)"}. If the sender's organization clearly matches one of them, put that exact existing name in matchedExistingCustomer; otherwise null.`,
      `jobType must be exactly one of: ${data.jobTypes.join(" | ")} (or null if unclear).`,
      `division must be exactly one of: ${data.divisions.join(" | ")} (K-12 = schools/school districts; Service = small service calls/repairs; High Volt = medium/high voltage, switchgear, utility work; Business Services = commercial tenant/office work; Global = large multi-site or national accounts). Use null if unclear.`,
      `expectedBidDate must be YYYY-MM-DD. Today is ${today}; resolve relative dates against that.`,
      "opportunityName: a short project title (e.g. 'Lincoln High — Gym Lighting Retrofit').",
      "description: 1-3 sentence scope summary in plain language.",
      "requestsNonContractPricing: true only if the email explicitly asks for non-contract, off-contract, separate-budget, or 'not under our agreement' pricing. Quote the evidence in pricingIntentEvidence.",
    ].join("\n");

    const jsonSchema = {
      type: "object",
      additionalProperties: false,
      required: [
        "customerName",
        "matchedExistingCustomer",
        "contactName",
        "contactEmail",
        "contactPhone",
        "projectAddress",
        "opportunityName",
        "jobType",
        "division",
        "expectedBidDate",
        "description",
        "estimatedValue",
        "requestsNonContractPricing",
        "pricingIntentEvidence",
      ],
      properties: {
        customerName: { type: ["string", "null"] },
        matchedExistingCustomer: { type: ["string", "null"] },
        contactName: { type: ["string", "null"] },
        contactEmail: { type: ["string", "null"] },
        contactPhone: { type: ["string", "null"] },
        projectAddress: { type: ["string", "null"] },
        opportunityName: { type: ["string", "null"] },
        jobType: { type: ["string", "null"] },
        division: { type: ["string", "null"] },
        expectedBidDate: { type: ["string", "null"] },
        description: { type: ["string", "null"] },
        estimatedValue: { type: ["number", "null"] },
        requestsNonContractPricing: { type: "boolean" },
        pricingIntentEvidence: { type: ["string", "null"] },
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: `Forwarded email:\n\n${data.emailText}` }],
          },
        ],
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: { type: "json_schema", name: "bid_email_extraction", strict: true, schema: jsonSchema },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = body;
      try {
        message = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? body;
      } catch {
        /* keep raw */
      }
      if (res.status === 402)
        throw new Error("AI credits are exhausted. Add credits to the workspace to keep importing emails.");
      if (res.status === 429) throw new Error("AI is rate limited right now. Wait a moment and try again.");
      throw new Error(message || `AI request failed (${res.status})`);
    }

    const raw = await readResponsesStream(res);
    if (!raw.trim()) throw new Error("AI returned no data for this email. Try pasting more of the message.");
    const parsed = ExtractedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("AI returned an unexpected format. Please try again.");
    const x = parsed.data;

    const matched = matchCustomer(x.matchedExistingCustomer ?? x.customerName, data.emailText, data.customers);
    const isNewCustomer = !matched;

    let suggestedRateType: RateType = "Contract";
    let needsRateConfirmation = false;
    let rateReason = "";
    if (!matched) {
      needsRateConfirmation = true;
      suggestedRateType = x.requestsNonContractPricing ? "Non-Contract" : "Contract";
      rateReason = "Customer not found in ECI records — confirm which rate schedule applies.";
    } else if (x.requestsNonContractPricing) {
      needsRateConfirmation = true;
      suggestedRateType = "Non-Contract";
      rateReason = `${matched.name} is a ${matched.rateType.toLowerCase()} customer, but the email asks for non-contract pricing${x.pricingIntentEvidence ? ` ("${x.pricingIntentEvidence}")` : ""}.`;
    } else if (matched.rateType === "Contract") {
      suggestedRateType = "Contract";
      rateReason = `${matched.name} is on contract rates — defaulting to contract.`;
    } else {
      needsRateConfirmation = true;
      suggestedRateType = "Non-Contract";
      rateReason = `${matched.name} is set up as a non-contract customer — confirm the rate.`;
    }

    return {
      customerName: matched?.name ?? x.customerName?.trim() ?? "",
      matchedCustomer: matched?.name ?? null,
      isNewCustomer,
      contactName: x.contactName ?? "",
      contactEmail: x.contactEmail ?? "",
      contactPhone: x.contactPhone ?? "",
      projectAddress: x.projectAddress ?? "",
      opportunityName: x.opportunityName ?? "",
      jobType: pickOption(x.jobType, data.jobTypes) ?? "",
      division: pickOption(x.division, data.divisions) ?? "",
      expectedBidDate: /^\d{4}-\d{2}-\d{2}$/.test(x.expectedBidDate ?? "") ? x.expectedBidDate! : "",
      description: x.description ?? "",
      estimatedValue: x.estimatedValue ?? 0,
      suggestedRateType,
      needsRateConfirmation,
      rateReason,
      requestsNonContractPricing: x.requestsNonContractPricing,
    };
  });
