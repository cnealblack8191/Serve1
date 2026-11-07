import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 for one POST with a JSON body, using only node:crypto so the
 * function needs no extra packages. tests/unit/sigv4.test.ts checks it against the AWS SDK
 * signer. Credentials come from the Lambda runtime (its role's temporary keys), never code.
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignInput {
  method: "POST";
  url: URL;
  body: string;
  region: string;
  service: string;
  credentials: AwsCredentials;
  /** Signing time (defaults to now). */
  now?: Date;
}

const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: Buffer | string, s: string) =>
  createHmac("sha256", key).update(s, "utf8").digest();

/** RFC 3986 encoding, as SigV4 wants it for each path segment. */
const encodeSegment = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function signRequest(input: SignInput): Record<string, string> {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: input.url.host,
    "x-amz-content-sha256": sha256Hex(input.body),
    "x-amz-date": amzDate,
  };
  if (input.credentials.sessionToken)
    headers["x-amz-security-token"] = input.credentials.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]!.trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const path =
    input.url.pathname
      .split("/")
      .map((seg) => encodeSegment(decodeURIComponent(seg)))
      .join("/") || "/";
  const canonicalRequest = [
    input.method,
    path,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    headers["x-amz-content-sha256"],
  ].join("\n");

  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
