/**
 * Bid invitation classification + extraction — SERVER ONLY.
 *
 * Deliberately modular: the rest of the intake workflow only depends on the
 * `classifyBidEmail` contract below, so the model, prompt or provider can be
 * swapped (or replaced with a deterministic parser) without touching the
 * database, UI or review workflow. The layer never writes business data — it
 * returns structured, validated candidate data plus confidence, and a human
 * approves it downstream.
 */

import { EMPTY_EXTRACTION, type IntakeExtraction, type IntakeLink } from "./types";

export interface ClassifyInput {
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyText: string;
  customers: string[];
  jobTypes: string[];
  divisions: string[];
}

export interface ClassifyResult {
  isBidInvitation: boolean;
  confidence: number;
  extraction: IntakeExtraction;
  fieldConfidence: Record<string, number>;
  reviewReasons: string[];
  links: IntakeLink[];
}

const NUMBER = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TEXT = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Reads a streamed /v1/responses body and returns the joined output text. */
async function readResponsesStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed: string | null = null;
  let failure: string | null = null;

  const handle = (raw: string) => {
    const line = raw.split("\n").find((l) => l.startsWith("data:"));
    if (!line) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let evt: Record<string, any>;
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    if (evt["type"] === "response.output_text.delta") text += evt["delta"] ?? "";
    else if (evt["type"] === "response.completed") {
      const out = evt["response"]?.output_text;
      if (typeof out === "string" && out) completed = out;
    } else if (evt["type"] === "response.failed" || evt["type"] === "error") {
      failure =
        evt["response"]?.error?.message ?? evt["error"]?.message ?? evt["message"] ?? "AI request failed";
    }
  };

  for (;;) {
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
  return completed ?? text;
}

const nullableString = { type: ["string", "null"] as const };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isBidInvitation",
    "confidence",
    "customerName",
    "contactName",
    "contactEmail",
    "contactPhone",
    "projectName",
    "projectAddress",
    "bidDueDate",
    "bidDueTime",
    "description",
    "scope",
    "invitationText",
    "jobType",
    "division",
    "estimatedValue",
    "addenda",
    "links",
    "uncertainFields",
  ],
  properties: {
    isBidInvitation: { type: "boolean" },
    confidence: { type: "number" },
    customerName: nullableString,
    contactName: nullableString,
    contactEmail: nullableString,
    contactPhone: nullableString,
    projectName: nullableString,
    projectAddress: nullableString,
    bidDueDate: nullableString,
    bidDueTime: nullableString,
    description: nullableString,
    scope: nullableString,
    invitationText: nullableString,
    jobType: nullableString,
    division: nullableString,
    estimatedValue: { type: ["number", "null"] },
    addenda: nullableString,
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: { label: { type: "string" }, url: { type: "string" } },
      },
    },
    uncertainFields: { type: "array", items: { type: "string" } },
  },
};

function pickOption(value: string, options: string[]): string {
  if (!value) return "";
  const v = value.toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === v) ??
    options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())) ??
    ""
  );
}

/** Cheap pre-filter so obvious non-invitations never reach the model. */
const BID_HINTS = [
  "invitation to bid",
  "itb",
  "bid invitation",
  "request for proposal",
  "rfp",
  "rfq",
  "bid due",
  "bids due",
  "invited to bid",
  "solicit",
  "prequalif",
  "plans and specs",
  "bid package",
  "addendum",
  "walkthrough",
  "site walk",
];

export function looksLikeBidInvitation(subject: string, body: string): boolean {
  const hay = `${subject}\n${body}`.toLowerCase();
  return BID_HINTS.some((h) => hay.includes(h));
}

export async function classifyBidEmail(input: ClassifyInput): Promise<ClassifyResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const today = new Date().toISOString().slice(0, 10);
  const instructions = [
    "You screen email arriving at the shared mailbox of Electrical Contractor Inc. (ECI), an electrical contractor in Covington, Georgia.",
    "Decide whether the email is a bid invitation / solicitation / request for proposal for electrical work, and extract project data from it.",
    "Return ONLY the JSON object described by the schema. Use null for anything not stated; never invent values.",
    "confidence: 0-1, how certain you are the email is a genuine bid invitation.",
    "uncertainFields: list field names you guessed at or inferred rather than read directly.",
    `Known ECI customers: ${input.customers.join("; ") || "(none)"}. If the sending organization clearly matches one, use that exact name in customerName.`,
    `jobType must be exactly one of: ${input.jobTypes.join(" | ")} (or null).`,
    `division must be exactly one of: ${input.divisions.join(" | ")} (K-12 = schools/districts; Service = small service calls; High Volt = medium/high voltage, switchgear, utility; Business Services = commercial/tenant work; Global = large multi-site accounts). Null if unclear.`,
    `bidDueDate must be YYYY-MM-DD, bidDueTime a plain local time like "2:00 PM". Today is ${today}; resolve relative dates against it.`,
    "scope: the electrical scope being solicited. invitationText: a short verbatim excerpt of the invitation wording. addenda: any addendum numbers/dates mentioned.",
    "links: every plan-room, document, portal or file URL mentioned, with a short label.",
  ].join("\n");

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
          content: [
            {
              type: "input_text",
              text: `From: ${input.fromName} <${input.fromAddress}>\nSubject: ${input.subject}\n\n${input.bodyText}`,
            },
          ],
        },
      ],
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "bid_intake", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to keep screening mail.");
    if (res.status === 429) throw new Error("AI is rate limited right now. Try the scan again shortly.");
    throw new Error(body || `AI request failed (${res.status})`);
  }

  const raw = await readResponsesStream(res);
  if (!raw.trim()) throw new Error("The screening model returned no data for this email.");
  const x = JSON.parse(raw) as Record<string, unknown>;

  const extraction: IntakeExtraction = {
    ...EMPTY_EXTRACTION,
    customerName: TEXT(x["customerName"]),
    contactName: TEXT(x["contactName"]) || input.fromName,
    contactEmail: TEXT(x["contactEmail"]) || input.fromAddress,
    contactPhone: TEXT(x["contactPhone"]),
    projectName: TEXT(x["projectName"]) || input.subject,
    projectAddress: TEXT(x["projectAddress"]),
    bidDueDate: TEXT(x["bidDueDate"]),
    bidDueTime: TEXT(x["bidDueTime"]),
    description: TEXT(x["description"]),
    scope: TEXT(x["scope"]),
    invitationText: TEXT(x["invitationText"]),
    jobType: pickOption(TEXT(x["jobType"]), input.jobTypes),
    division: pickOption(TEXT(x["division"]), input.divisions),
    estimatedValue: NUMBER(x["estimatedValue"]),
    addenda: TEXT(x["addenda"]),
  };

  const uncertain = Array.isArray(x["uncertainFields"])
    ? (x["uncertainFields"] as unknown[]).map((f) => String(f))
    : [];
  const fieldConfidence: Record<string, number> = {};
  for (const key of Object.keys(extraction)) {
    const filled = String((extraction as unknown as Record<string, unknown>)[key] ?? "").trim() !== "";
    fieldConfidence[key] = !filled ? 0 : uncertain.includes(key) ? 0.5 : 0.9;
  }

  const links: IntakeLink[] = Array.isArray(x["links"])
    ? (x["links"] as Record<string, unknown>[])
        .map((l) => ({ label: TEXT(l["label"]) || "Link", url: TEXT(l["url"]) }))
        .filter((l) => /^https?:\/\//i.test(l.url))
    : [];

  const confidence = Math.max(0, Math.min(1, Number(x["confidence"]) || 0));
  const reviewReasons: string[] = [];
  if (confidence < 0.8) reviewReasons.push("Classification confidence is below the auto-queue threshold.");
  if (!extraction.bidDueDate) reviewReasons.push("No bid due date was found in the email.");
  if (!extraction.projectAddress) reviewReasons.push("No project address was found.");
  if (!extraction.division) reviewReasons.push("Division could not be determined.");
  for (const f of uncertain) reviewReasons.push(`"${f}" was inferred rather than stated — confirm it.`);

  return {
    isBidInvitation: Boolean(x["isBidInvitation"]),
    confidence,
    extraction,
    fieldConfidence,
    reviewReasons,
    links,
  };
}
