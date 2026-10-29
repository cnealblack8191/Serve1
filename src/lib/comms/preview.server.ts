/**
 * Preview mailbox provider — SERVER ONLY.
 *
 * Stands in for the designated Microsoft 365 shared mailbox until the tenant
 * connection is made. It implements the same MailboxProvider contract, so every
 * screen, database relationship and workflow exercised against it is the same
 * code path that will run against Microsoft Graph. Delete-safe: once
 * SHARED_MAILBOX_ADDRESS and the Graph credentials exist, this provider is
 * never selected.
 */

import type { MailboxProvider, ProviderMessage } from "./mailbox.server";
import type { MailAddress } from "./types";

export const PREVIEW_MAILBOX = "service@electricalcontractorinc.com";

/** Contacts discovered in the CRM, used to make the sample mail realistic. */
export interface PreviewContactHint {
  name: string;
  address: string;
  subject: string;
}

const FALLBACK_HINTS: PreviewContactHint[] = [
  {
    name: "Alicia Barnett",
    address: "alicia.barnett@meridianproperties.com",
    subject: "Meridian Tower — Floor 14 retrofit schedule",
  },
  {
    name: "Ron Pate",
    address: "rpate@oaklinelogistics.com",
    subject: "Oakline DC lighting retrofit — revised scope",
  },
  {
    name: "Dee Coleman",
    address: "dcoleman@newtoncountyschools.org",
    subject: "Invitation to bid — Newton County HS gym lighting",
  },
];

const iso = (daysAgo: number, hour: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 15, 0, 0);
  return d.toISOString();
};

const me: MailAddress = { name: "ECI Service", address: PREVIEW_MAILBOX };

function inbound(
  i: number,
  hint: PreviewContactHint,
  body: string,
  attachments: ProviderMessage["attachments"] = [],
): ProviderMessage {
  return {
    graphMessageId: `preview-msg-${i}`,
    internetMessageId: `<preview-${i}@electricalcontractorinc.com>`,
    conversationId: `preview-thread-${i}`,
    folder: "inbox",
    direction: "inbound",
    from: { name: hint.name, address: hint.address },
    to: [me],
    cc: [],
    subject: hint.subject,
    bodyPreview: body.slice(0, 160),
    bodyHtml: `<p>${body}</p><p>Thanks,<br/>${hint.name}</p>`,
    isRead: i > 1,
    sentAt: iso(i, 13),
    receivedAt: iso(i, 13),
    attachments,
  };
}

function reply(i: number, hint: PreviewContactHint, body: string): ProviderMessage {
  return {
    graphMessageId: `preview-msg-${i}-reply`,
    internetMessageId: `<preview-${i}-reply@electricalcontractorinc.com>`,
    conversationId: `preview-thread-${i}`,
    folder: "sent",
    direction: "outbound",
    from: me,
    to: [{ name: hint.name, address: hint.address }],
    cc: [],
    subject: `RE: ${hint.subject}`,
    bodyPreview: body.slice(0, 160),
    bodyHtml: `<p>${body}</p><p>— Electrical Contractor Inc., Covington GA</p>`,
    isRead: true,
    sentAt: iso(i, 15),
    receivedAt: null,
    attachments: [],
  };
}

export function createPreviewMailboxProvider(
  hints: PreviewContactHint[] = [],
): MailboxProvider {
  const list = [...hints, ...FALLBACK_HINTS].slice(0, 3);

  return {
    connected: false,
    mailboxAddress: PREVIEW_MAILBOX,

    async deltaSync() {
      const messages: ProviderMessage[] = [];
      const bodies = [
        "Can you confirm the crew start date and send over the current scope letter? We'd like to get this on the schedule this month.",
        "Attached is the revised drawing set. Please re-price the lighting package and let us know if the addendum changes your number.",
        "We're soliciting bids for the project below. Bid documents and the site walk schedule are in the portal — please confirm you intend to bid.",
      ];
      list.forEach((hint, idx) => {
        const i = idx + 1;
        messages.push(
          inbound(
            i,
            hint,
            bodies[idx] ?? bodies[0]!,
            idx === 1
              ? [
                  {
                    name: "Revised Drawings Rev C.pdf",
                    extension: "pdf",
                    sizeBytes: 2_480_112,
                    webUrl: "",
                  },
                ]
              : [],
          ),
        );
        if (idx === 0) {
          messages.push(
            reply(
              i,
              hint,
              "Thanks for reaching out — we have crew availability the week of the 14th and I'm sending the scope letter today.",
            ),
          );
        }
      });
      // A realistic invitation to bid so the bid intake queue can be reviewed
      // end to end before Microsoft 365 is connected.
      messages.push(
        inbound(
          4,
          {
            name: "Marcus Webb",
            address: "mwebb@harlowconstruction.com",
            subject: "Invitation to Bid — Covington Logistics Center Phase 2 (Electrical)",
          },
          [
            "Harlow Construction Group is soliciting electrical subcontractor bids for the Covington Logistics Center Phase 2 at 1480 Industrial Blvd NE, Covington, GA 30014.",
            "Scope: complete electrical package — 2500A service and distribution, LED warehouse lighting, dock equipment power, fire alarm rough-in, and site lighting. Budget range discussed with the owner is roughly $1.4M.",
            "Bids are due Friday at 2:00 PM local time. Addendum 1 (revised panel schedules) and Addendum 2 (site lighting photometrics) are posted.",
            "Plans and specifications: https://planroom.harlowconstruction.com/covington-logistics-ph2",
            "Please confirm whether you intend to bid.",
          ].join(" "),
          [
            {
              name: "ITB - Covington Logistics Ph2.pdf",
              extension: "pdf",
              sizeBytes: 1_204_336,
              webUrl: "",
            },
            {
              name: "Addendum 2 - Site Lighting.pdf",
              extension: "pdf",
              sizeBytes: 486_220,
              webUrl: "",
            },
          ],
        ),
      );

      return { messages, deltaToken: "preview" };
    },

    async sendMail(payload) {
      // Nothing leaves the building until the shared mailbox is connected; the
      // message is still recorded in full so the history is complete.
      return {
        graphMessageId: null,
        internetMessageId: null,
        conversationId: null,
        status: "pending",
        detail: `Recorded. Will send from the shared mailbox once Microsoft 365 is connected (${payload.to.length} recipient(s)).`,
      };
    },

    async archiveThread() {
      /* Archived locally until the mailbox is connected. */
    },

    async markRead() {
      /* Read state is held locally until the mailbox is connected. */
    },
  };
}
