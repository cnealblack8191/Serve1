import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4, using only node:crypto so the functions need no extra packages.
 * tests/unit/spectrum.test.ts and tests/unit/eci1-bridge-aws.test.ts check it byte for byte
 * against the AWS SDK signer. Credentials come from the Lambda runtime (the function role's
 * temporary keys), never from code.
 *
 * Paths are encoded once per segment; callers use plain keys ([A-Za-z0-9._/-]), where every
 * AWS service agrees on the canonical form.
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignInput {
  method: "GET" | "POST" | "PUT";
  url: URL;
  body: string | Uint8Array;
  region: string;
  service: string;
  credentials: AwsCredentials;
  /** Extra headers to send and sign (lower-case names), e.g. x-amz-target. */
  headers?: Record<string, string>;
  /** Defaults to application/json. */
  contentType?: string;
  /** Signing time (defaults to now). */
  now?: Date;
}

const sha256Hex = (s: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof s === "string" ? Buffer.from(s, "utf8") : s)
    .digest("hex");
const hmac = (key: Buffer | string, s: string) =>
  createHmac("sha256", key).update(s, "utf8").digest();

/** RFC 3986 encoding, as SigV4 wants it. */
const rfc3986 = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const canonicalPath = (url: URL) =>
  url.pathname
    .split("/")
    .map((seg) => rfc3986(decodeURIComponent(seg)))
    .join("/") || "/";

const canonicalQuery = (params: [string, string][]) =>
  params
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

const stamp = (now: Date) => {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  return { amzDate, day: amzDate.slice(0, 8) };
};

function signature(
  secret: string,
  day: string,
  region: string,
  service: string,
  stringToSign: string,
) {
  const kDate = hmac(`AWS4${secret}`, day);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  return createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
}

/** Headers (including authorization) for one signed request. */
export function signRequest(input: SignInput): Record<string, string> {
  const { amzDate, day } = stamp(input.now ?? new Date());
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    "content-type": input.contentType ?? "application/json",
    host: input.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(input.headers ?? {}),
  };
  if (input.credentials.sessionToken)
    headers["x-amz-security-token"] = input.credentials.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]!.trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method,
    canonicalPath(input.url),
    canonicalQuery([...input.url.searchParams.entries()]),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const sig = signature(
    input.credentials.secretAccessKey,
    day,
    input.region,
    input.service,
    stringToSign,
  );
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

/** A short-lived GET link (query-string signing), e.g. for an S3 object. */
export function presignGet(input: {
  url: URL;
  region: string;
  service: string;
  credentials: AwsCredentials;
  expiresIn: number;
  now?: Date;
}): string {
  const { amzDate, day } = stamp(input.now ?? new Date());
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const params: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.credentials.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  if (input.credentials.sessionToken)
    params.push(["X-Amz-Security-Token", input.credentials.sessionToken]);
  const query = canonicalQuery(params);
  const canonicalRequest = [
    "GET",
    canonicalPath(input.url),
    query,
    `host:${input.url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const sig = signature(
    input.credentials.secretAccessKey,
    day,
    input.region,
    input.service,
    stringToSign,
  );
  return `${input.url.origin}${canonicalPath(input.url)}?${query}&X-Amz-Signature=${sig}`;
}
