/**
 * Response security headers.
 *
 * Applied to every SSR response from `src/server.ts`. HTML gets the full set
 * including a Content-Security-Policy; other responses get only the headers
 * that are meaningful for them.
 */

/** Lovable's editor renders the app in an iframe, so it must stay a permitted ancestor. */
const FRAME_ANCESTORS = [
  "'self'",
  "https://lovable.dev",
  "https://*.lovable.dev",
  "https://gptengineer.app",
  "https://*.gptengineer.app",
];

function connectSources(): string[] {
  const sources = new Set(["'self'", "https://*.supabase.co", "wss://*.supabase.co"]);
  // The project's own Supabase host, when it is not on the default domain.
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  if (url) {
    try {
      const { origin, host } = new URL(url);
      sources.add(origin);
      sources.add(`wss://${host}`);
    } catch {
      // A malformed URL just means we fall back to the wildcards above.
    }
  }
  return [...sources];
}

function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // TanStack Start inlines its hydration and streaming scripts, and there is
    // no nonce plumbing yet, so 'unsafe-inline' is required here. The policy
    // still blocks third-party script origins, plugins and base-tag injection;
    // XSS in mail bodies is handled by sanitising at the boundary instead.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind and Radix both set inline styles.
    "style-src 'self' 'unsafe-inline'",
    // data:/blob: cover field photos read through FileReader; https: covers
    // remote images in mail bodies and SharePoint thumbnails.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources().join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${FRAME_ANCESTORS.join(" ")}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Add the security headers to a response, preserving everything already set.
 *
 * Returns a new Response because header objects on a returned Response are
 * immutable once it has been constructed by some runtimes.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // The field app captures job photos, so camera stays available to this origin.
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // A CSP only means something for documents. Note that frame-ancestors is used
  // rather than X-Frame-Options, because it can name the Lovable editor origins
  // that X-Frame-Options cannot express.
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy());
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
