/**
 * Guards for content that originates outside the app.
 *
 * Mail bodies mirrored from the shared mailbox and links extracted from those
 * mails are written by whoever sent the email, so they are attacker-controlled
 * even though they reach us through Microsoft Graph. Everything here is the
 * boundary between that content and the DOM.
 */

import DOMPurify, { type Config } from "dompurify";

/* ------------------------------------------------------------------ */
/* Mail bodies                                                         */
/* ------------------------------------------------------------------ */

// `style`/`link` pull in CSS that can reposition content over the rest of the
// page; form tags can post a staff member's input somewhere else. None of it is
// needed to read an email, so it goes. Scripts, event handlers and
// `javascript:` URLs are already stripped by DOMPurify's defaults.
const MAIL_HTML_CONFIG: Config = {
  ADD_ATTR: ["target"],
  FORBID_TAGS: [
    "style",
    "link",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "iframe",
    "object",
    "embed",
    "base",
  ],
  FORBID_ATTR: ["action", "formaction", "srcset", "ping"],
};

let hookInstalled = false;

function installHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  // Anything left with a target must not get a handle on our window.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof Element && node.hasAttribute("target")) {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Strip scripting from a mail body so it is safe for `dangerouslySetInnerHTML`.
 *
 * Falls back to escaped plain text when there is no DOM to sanitise against
 * (SSR, tests): DOMPurify becomes a pass-through there, and a pass-through on
 * this input is exactly the bug we are closing.
 */
export function sanitizeMailHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (!DOMPurify.isSupported) return `<p>${escapeHtml(html.replace(/<[^>]*>/g, " ")).trim()}</p>`;
  installHook();
  return DOMPurify.sanitize(html, MAIL_HTML_CONFIG);
}

/** Wrap an untrusted plain-text preview for rendering as HTML. */
export const mailPreviewHtml = (preview: string | null | undefined) =>
  preview ? `<p>${escapeHtml(preview)}</p>` : "";

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

// Only used to resolve relative URLs; the caller always gets its own string back.
const RESOLUTION_BASE = "https://untrusted.invalid/";

/**
 * Return `url` when it is safe to put in an `href`, otherwise `undefined`.
 *
 * Blocks `javascript:`, `data:` and friends. Callers render a plain label
 * instead of a link when this returns `undefined`.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  try {
    // URL parsing drops the tabs and newlines browsers also ignore, so
    // "java\tscript:..." is classified the same way the browser would treat it.
    const { protocol } = new URL(trimmed, RESOLUTION_BASE);
    return SAFE_PROTOCOLS.has(protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
