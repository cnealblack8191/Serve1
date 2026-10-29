/**
 * Bid opportunity intake service — the single API for the review queue.
 *
 * Flow: shared-mailbox message -> classification/extraction -> pending intake
 * record -> human review and correction -> BID (creates a CRM opportunity and
 * files the documents) or NO BID (retained as history only).
 *
 * Nothing in here creates an opportunity, a customer or an estimate without an
 * explicit human decision.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DIVISIONS, JOB_TYPES } from "@/lib/eci/data";
import {
  EMPTY_EXTRACTION,
  type CustomerMatchState,
  type IntakeAttachment,
  type IntakeExtraction,
  type IntakeLink,
  type IntakeRecord,
  type IntakeStatus,
} from "./types";

type Row = Record<string, any>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const req = (v: unknown, field: string) => {
  const s = str(v);
  if (!s) throw new Error(`${field} is required`);
  return s;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(inc|llc|co|corp|company|ltd|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

function toExtraction(raw: unknown): IntakeExtraction {
  const r = (raw ?? {}) as Row;
  const value = r["estimatedValue"];
  return {
    ...EMPTY_EXTRACTION,
    ...Object.fromEntries(
      Object.keys(EMPTY_EXTRACTION)
        .filter((k) => k !== "estimatedValue")
        .map((k) => [k, str(r[k])]),
    ),
    estimatedValue: typeof value === "number" && Number.isFinite(value) ? value : null,
  } as IntakeExtraction;
}

function toRecord(r: Row): IntakeRecord {
  return {
    id: String(r["id"]),
    messageId: r["message_id"] ? String(r["message_id"]) : null,
    threadId: r["thread_id"] ? String(r["thread_id"]) : null,
    status: String(r["status"]) as IntakeStatus,
    isBidInvitation: Boolean(r["is_bid_invitation"]),
    confidence: Number(r["confidence"] ?? 0),
    needsReview: Boolean(r["needs_review"]),
    reviewReasons: Array.isArray(r["review_reasons"]) ? r["review_reasons"].map(String) : [],
    extracted: toExtraction(r["extracted"]),
    fieldConfidence: (r["field_confidence"] ?? {}) as Record<string, number>,
    customerMatch: String(r["customer_match"] ?? "new") as CustomerMatchState,
    matchedCustomer: r["matched_customer"] ? String(r["matched_customer"]) : null,
    candidateCustomers: Array.isArray(r["candidate_customers"])
      ? r["candidate_customers"].map(String)
      : [],
    attachments: Array.isArray(r["attachments"]) ? (r["attachments"] as IntakeAttachment[]) : [],
    links: Array.isArray(r["links"]) ? (r["links"] as IntakeLink[]) : [],
    fromName: str(r["from_name"]),
    fromAddress: str(r["from_address"]),
    subject: str(r["subject"]),
    bodyPreview: str(r["body_preview"]),
    receivedAt: String(r["received_at"] ?? new Date().toISOString()),
    opportunityId: r["opportunity_id"] ? String(r["opportunity_id"]) : null,
    decisionNote: str(r["decision_note"]),
    decidedBy: r["decided_by"] ? String(r["decided_by"]) : null,
    decidedAt: r["decided_at"] ? String(r["decided_at"]) : null,
  };
}

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** Customer matching that refuses to silently create near-duplicate records. */
function matchCustomer(candidate: string, customers: string[]) {
  const c = normalize(candidate);
  if (!c) return { state: "new" as CustomerMatchState, matched: null, candidates: [] as string[] };

  const exact = customers.find((n) => normalize(n) === c);
  if (exact) return { state: "matched" as CustomerMatchState, matched: exact, candidates: [exact] };

  const near = customers.filter((n) => {
    const k = normalize(n);
    return k.length > 3 && (k.includes(c) || c.includes(k));
  });
  if (near.length === 1)
    return { state: "ambiguous" as CustomerMatchState, matched: near[0]!, candidates: near };
  if (near.length > 1)
    return { state: "ambiguous" as CustomerMatchState, matched: null, candidates: near };
  return { state: "new" as CustomerMatchState, matched: null, candidates: [] };
}

/* ------------------------------------------------------------------ */
/* Scan the shared mailbox for bid invitations                         */
/* ------------------------------------------------------------------ */

export const scanInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 15), 1), 40),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { classifyBidEmail, looksLikeBidInvitation } = await import("./extract.server");

    const { data: seenRows } = await supabase
      .from("bid_intake")
      .select("message_id")
      .not("message_id", "is", null);
    const seen = new Set((seenRows ?? []).map((r: Row) => String(r["message_id"])));

    const { data: msgs, error } = await supabase
      .from("messages")
      .select(
        "id, thread_id, from_name, from_address, subject, body_preview, body_html, received_at, sent_at, has_attachments",
      )
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const pending = (msgs ?? []).filter((m: Row) => !seen.has(String(m["id"]))).slice(0, data.limit);
    if (pending.length === 0) return { scanned: 0, queued: 0 };

    const { data: custRows } = await supabase.from("customers").select("name");
    const customers = (custRows ?? []).map((c: Row) => String(c["name"]));

    let queued = 0;
    for (const m of pending) {
      const bodyText = stripHtml(String(m["body_html"] ?? "")) || str(m["body_preview"]);
      const subject = str(m["subject"]);

      // Cheap pre-filter: obvious non-invitations are recorded as screened out
      // so they are never reprocessed and never reach the review queue.
      if (!looksLikeBidInvitation(subject, bodyText)) {
        await supabase.from("bid_intake").insert({
          message_id: m["id"],
          thread_id: m["thread_id"],
          status: "dismissed",
          is_bid_invitation: false,
          confidence: 0,
          needs_review: false,
          review_reasons: ["Screened out — no bid invitation language found."],
          from_name: str(m["from_name"]),
          from_address: str(m["from_address"]),
          subject,
          body_preview: str(m["body_preview"]),
          received_at: m["received_at"] ?? m["sent_at"] ?? new Date().toISOString(),
        });
        continue;
      }

      let result;
      try {
        result = await classifyBidEmail({
          subject,
          fromName: str(m["from_name"]),
          fromAddress: str(m["from_address"]),
          bodyText,
          customers,
          jobTypes: JOB_TYPES,
          divisions: DIVISIONS,
        });
      } catch (e) {
        // Leave the message unclaimed so a later scan can retry it.
        console.warn("[intake] classification failed", e);
        continue;
      }

      const match = matchCustomer(result.extraction.customerName, customers);
      const reasons = [...result.reviewReasons];
      if (match.state === "ambiguous")
        reasons.unshift(
          `Customer "${result.extraction.customerName}" is similar to existing record(s) — confirm which one applies.`,
        );
      if (match.state === "new" && result.extraction.customerName)
        reasons.unshift(`"${result.extraction.customerName}" is not in the CRM yet.`);

      const attachments: IntakeAttachment[] = [];
      if (m["has_attachments"]) {
        const { data: atts } = await supabase
          .from("message_attachments")
          .select("name, extension, size_bytes, web_url")
          .eq("message_id", m["id"]);
        for (const a of atts ?? []) {
          attachments.push({
            name: str(a["name"]),
            extension: str(a["extension"]),
            sizeBytes: a["size_bytes"] == null ? null : Number(a["size_bytes"]),
            webUrl: str(a["web_url"]),
          });
        }
      }

      await supabase.from("bid_intake").insert({
        message_id: m["id"],
        thread_id: m["thread_id"],
        status: result.isBidInvitation ? "pending" : "dismissed",
        is_bid_invitation: result.isBidInvitation,
        confidence: result.confidence,
        needs_review: true,
        review_reasons: result.isBidInvitation
          ? reasons
          : ["Screened out — the message does not read as a bid invitation."],
        extracted: result.extraction as unknown as Row,
        field_confidence: result.fieldConfidence,
        customer_match: match.state,
        matched_customer: match.matched,
        candidate_customers: match.candidates,
        attachments: attachments as unknown as Row[],
        links: result.links as unknown as Row[],
        from_name: str(m["from_name"]),
        from_address: str(m["from_address"]),
        subject,
        body_preview: str(m["body_preview"]),
        received_at: m["received_at"] ?? m["sent_at"] ?? new Date().toISOString(),
      });
      if (result.isBidInvitation) queued += 1;
    }

    return { scanned: pending.length, queued };
  });

/* ------------------------------------------------------------------ */
/* Queue reads                                                         */
/* ------------------------------------------------------------------ */

export const listIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: IntakeStatus | "all" } | undefined) => ({
    status: (input?.status ?? "pending") as IntakeStatus | "all",
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("bid_intake")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toRecord);
  });

export const intakeCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase.from("bid_intake").select("status");
    if (error) throw new Error(error.message);
    const counts = { pending: 0, bid: 0, no_bid: 0, dismissed: 0 } as Record<IntakeStatus, number>;
    for (const r of rows ?? []) {
      const s = String((r as Row)["status"]) as IntakeStatus;
      if (s in counts) counts[s] += 1;
    }
    return counts;
  });

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */

export const updateIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      extracted?: Partial<IntakeExtraction>;
      matchedCustomer?: string | null;
      customerMatch?: CustomerMatchState;
      decisionNote?: string;
    }) => ({
      id: req(input?.id, "Intake record"),
      extracted: input?.extracted ?? null,
      matchedCustomer: input?.matchedCustomer === undefined ? undefined : input.matchedCustomer,
      customerMatch: input?.customerMatch,
      decisionNote: input?.decisionNote === undefined ? undefined : str(input.decisionNote),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: row, error } = await supabase
      .from("bid_intake")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That intake record no longer exists.");
    const current = toRecord(row);
    if (current.status !== "pending") throw new Error("This intake has already been decided.");

    const patch: Row = { updated_at: new Date().toISOString() };
    if (data.extracted)
      patch["extracted"] = toExtraction({ ...current.extracted, ...data.extracted }) as unknown as Row;
    if (data.matchedCustomer !== undefined) patch["matched_customer"] = data.matchedCustomer || null;
    if (data.customerMatch) patch["customer_match"] = data.customerMatch;
    if (data.decisionNote !== undefined) patch["decision_note"] = data.decisionNote;

    const { error: upErr } = await supabase.from("bid_intake").update(patch as never).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Bid / No-bid decision                                               */
/* ------------------------------------------------------------------ */

const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

export const decideIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      decision: "bid" | "no_bid";
      note?: string;
      assignedTo?: string;
      decidedBy?: string;
      createCustomer?: boolean;
    }) => {
      const decision = input?.decision;
      if (decision !== "bid" && decision !== "no_bid") throw new Error("Choose Bid or No bid");
      return {
        id: req(input?.id, "Intake record"),
        decision,
        note: str(input?.note),
        assignedTo: str(input?.assignedTo) || "Unassigned",
        decidedBy: str(input?.decidedBy) || "ECI user",
        createCustomer: Boolean(input?.createCustomer),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const nowIso = new Date().toISOString();

    const { data: row, error } = await supabase
      .from("bid_intake")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That intake record no longer exists.");
    const intake = toRecord(row);
    if (intake.status !== "pending") throw new Error("This intake has already been decided.");

    if (data.decision === "no_bid") {
      const { error: noErr } = await supabase
        .from("bid_intake")
        .update({
          status: "no_bid",
          decision_note: data.note,
          decided_by: data.decidedBy,
          decided_at: nowIso,
          needs_review: false,
          updated_at: nowIso,
        })
        .eq("id", data.id);
      if (noErr) throw new Error(noErr.message);
      return { status: "no_bid" as const, opportunityId: null };
    }

    /* ---- BID: create the CRM opportunity ---- */
    const x = intake.extracted;
    const customerName = intake.matchedCustomer || x.customerName;
    if (!customerName) throw new Error("Select or enter the customer before choosing Bid.");
    if (!x.projectName) throw new Error("A project name is required before choosing Bid.");

    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, name, rate_type")
      .eq("name", customerName)
      .maybeSingle();

    if (!existingCustomer && !data.createCustomer) {
      throw new Error(
        `"${customerName}" is not an existing customer. Pick the matching customer or confirm creating a new one.`,
      );
    }

    let rateType = existingCustomer ? String(existingCustomer["rate_type"]) : "Contract";
    if (!existingCustomer) {
      const { error: custErr } = await supabase.from("customers").insert({
        id: genId("CUST"),
        name: customerName,
        billing_address: x.projectAddress,
        contact_email: x.contactEmail,
        contact_phone: x.contactPhone,
        rate_type: "Contract",
        quote_format: "Lump Sum",
        markup_table: [],
      });
      if (custErr) throw new Error(custErr.message);
      rateType = "Contract";
    }

    const opportunityId = genId("OPP");
    const activity = [
      {
        id: genId("ACT"),
        kind: "system",
        message: `Created from bid intake — email from ${intake.fromName || intake.fromAddress} reviewed and approved to bid by ${data.decidedBy}.`,
        actor: data.decidedBy,
        at: nowIso,
      },
      {
        id: genId("ACT"),
        kind: "stage",
        message: "Opportunity created in stage New Opportunity",
        actor: data.decidedBy,
        at: nowIso,
      },
    ];
    if (data.note) {
      activity.unshift({
        id: genId("ACT"),
        kind: "note",
        message: `Bid decision note: ${data.note}`,
        actor: data.decidedBy,
        at: nowIso,
      });
    }
    if (x.bidDueTime) {
      activity.push({
        id: genId("ACT"),
        kind: "note",
        message: `Bid due ${x.bidDueDate || "TBD"}${x.bidDueTime ? ` at ${x.bidDueTime}` : ""}.`,
        actor: data.decidedBy,
        at: nowIso,
      });
    }

    const descriptionParts = [x.description, x.scope ? `Scope: ${x.scope}` : "", x.addenda ? `Addenda: ${x.addenda}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const { error: oppErr } = await supabase.from("opportunities").insert({
      id: opportunityId,
      name: x.projectName,
      customer: customerName,
      contact_name: x.contactName || intake.fromName,
      address: x.projectAddress,
      job_type: x.jobType || "Design Build",
      division: x.division || "Business Services",
      expected_bid_date: x.bidDueDate || "",
      description: descriptionParts,
      notes: x.invitationText,
      assigned_to: data.assignedTo,
      value: x.estimatedValue ?? 0,
      stage: "New Opportunity",
      source: "Sales",
      rate_type: rateType,
      contacts: [
        {
          id: genId("CT"),
          name: x.contactName || intake.fromName || "Primary Contact",
          title: "Bid contact",
          email: x.contactEmail || intake.fromAddress,
          phone: x.contactPhone,
          primary: true,
        },
      ],
      documents: [],
      activity,
    });
    if (oppErr) throw new Error(oppErr.message);

    // File the invitation's attachments and plan links against the opportunity.
    // References only — the file is never copied, and an existing reference to
    // the same URL is reused.
    const docTargets = [
      ...intake.attachments
        .filter((a) => a.webUrl)
        .map((a) => ({ name: a.name, url: a.webUrl, label: "Bid invitation attachment", ext: a.extension })),
      ...intake.links.map((l) => ({ name: l.label, url: l.url, label: "Plan / document link", ext: "" })),
    ];
    for (const t of docTargets) {
      const { data: hit } = await supabase
        .from("document_refs")
        .select("id")
        .eq("web_url", t.url)
        .maybeSingle();
      let documentId = hit?.id ?? null;
      if (!documentId) {
        const { data: created, error: refErr } = await supabase
          .from("document_refs")
          .insert({
            provider: "sharepoint",
            name: t.name,
            kind: "file",
            extension: t.ext || (t.name.split(".").pop() ?? "").toUpperCase(),
            web_url: t.url,
            folder_path: "",
            origin: "communication",
            created_by_name: data.decidedBy,
            modified_at: nowIso,
          })
          .select("id")
          .single();
        if (refErr) continue;
        documentId = created.id;
      }
      await supabase.from("document_links").upsert(
        {
          document_id: documentId,
          record_type: "opportunity",
          record_id: opportunityId,
          label: t.label,
          linked_by: data.decidedBy,
        },
        { onConflict: "document_id,record_type,record_id" },
      );
    }

    // Keep the originating email in the opportunity's communication history.
    if (intake.messageId) {
      const { data: existingLink } = await supabase
        .from("message_links")
        .select("id")
        .eq("message_id", intake.messageId)
        .eq("record_type", "opportunity")
        .eq("record_id", opportunityId)
        .maybeSingle();
      if (!existingLink) {
        const { error: linkErr } = await supabase.from("message_links").insert({
          message_id: intake.messageId,
          thread_id: intake.threadId,
          record_type: "opportunity",
          record_id: opportunityId,
          auto_matched: false,
          linked_by: data.decidedBy,
        });
        if (linkErr) console.warn("[intake] message link failed", linkErr.message);
      }
    }

    const { error: doneErr } = await supabase
      .from("bid_intake")
      .update({
        status: "bid",
        opportunity_id: opportunityId,
        decision_note: data.note,
        decided_by: data.decidedBy,
        decided_at: nowIso,
        needs_review: false,
        matched_customer: customerName,
        customer_match: "matched",
        updated_at: nowIso,
      })
      .eq("id", data.id);
    if (doneErr) throw new Error(doneErr.message);

    return { status: "bid" as const, opportunityId };
  });
