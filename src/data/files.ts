import { backend, newId } from "./backend";

/**
 * File helpers. Paths follow the S3 policy in amplify/storage/resource.ts:
 *   jobs/{jobId}/photos/..., jobs/{jobId}/signatures/..., invoices/{invoiceId}/...
 * Screens get back a storage path to save on the record, and ask fileUrl() for
 * a short-lived link when they need to show it.
 */
const ext = (file: Blob, fallback: string) => {
  const name = (file as File).name;
  const m = name?.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() ?? fallback;
};

export async function uploadJobPhoto(jobId: string, file: Blob): Promise<string> {
  const path = `jobs/${jobId}/photos/${newId()}.${ext(file, "jpg")}`;
  return backend().files.upload(path, file, file.type || "image/jpeg");
}

export async function uploadSignature(jobId: string, png: Blob): Promise<string> {
  const path = `jobs/${jobId}/signatures/${newId()}.png`;
  return backend().files.upload(path, png, "image/png");
}

export async function uploadInvoicePdf(invoiceId: string, pdf: Blob): Promise<string> {
  const path = `invoices/${invoiceId}/${newId()}.pdf`;
  return backend().files.upload(path, pdf, "application/pdf");
}

export const fileUrl = (path: string): Promise<string> => backend().files.getUrl(path);
export const removeFile = (path: string): Promise<void> => backend().files.remove(path);
