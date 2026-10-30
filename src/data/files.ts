import { backend, newId } from "./backend";
import type { Attachment, AttachmentType, Job, Signature } from "./types";

/**
 * File helpers. Paths follow the S3 policy in amplify/storage/resource.ts:
 *   office uploads:  jobs/{jobId}/photos/...           (techs have no access)
 *   tech uploads:    tech-files/{storageId}/{jobId}/... (only that tech, plus office)
 *   invoice PDFs:    invoices/{invoiceId}/...
 * Screens should prefer addJobPhoto / addJobSignature below, which upload the
 * file AND create the record with the job's assigned tech copied onto it, after
 * checking the signed-in tech is actually assigned to that job.
 */
const ext = (file: Blob, fallback: string) => {
  const name = (file as File).name;
  const m = name?.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() ?? fallback;
};

async function jobPrefix(jobId: string): Promise<string> {
  const me = await backend().auth.currentUser();
  if (!me) throw new Error("Not signed in");
  return me.role === "Tech" ? `tech-files/${me.storageId}/${jobId}` : `jobs/${jobId}`;
}

/** Throws unless the signed-in user may add files to this job. Returns the job's tech id to tag the row with. */
async function assertCanAttach(job: Job): Promise<string | null> {
  const me = await backend().auth.currentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role === "Tech") {
    if (job.assignedTechId !== me.identityId) throw new Error("This job is not assigned to you");
    return me.identityId;
  }
  if (me.role === "Owner") throw new Error("Owners can view jobs but not add files");
  return job.assignedTechId;
}

export async function uploadJobPhoto(jobId: string, file: Blob): Promise<string> {
  const path = `${await jobPrefix(jobId)}/photos/${newId()}.${ext(file, "jpg")}`;
  return backend().files.upload(path, file, file.type || "image/jpeg");
}

export async function uploadSignature(jobId: string, png: Blob): Promise<string> {
  const path = `${await jobPrefix(jobId)}/signatures/${newId()}.png`;
  return backend().files.upload(path, png, "image/png");
}

export async function uploadInvoicePdf(invoiceId: string, pdf: Blob): Promise<string> {
  const path = `invoices/${invoiceId}/${newId()}.pdf`;
  return backend().files.upload(path, pdf, "application/pdf");
}

/** Upload a photo (or document) for a job and record it. The one call tech screens should use. */
export async function addJobPhoto(
  job: Job,
  file: Blob,
  caption: string | null = null,
  type: AttachmentType = "Photo",
): Promise<Attachment> {
  const assignedTechId = await assertCanAttach(job);
  const me = await backend().auth.currentUser();
  const storagePath = await uploadJobPhoto(job.id, file);
  return backend().attachments.create({
    jobId: job.id,
    assignedTechId,
    storagePath,
    type,
    caption,
    uploadedBy: me?.name ?? null,
  });
}

/** Save the customer's signature image for a job and record it. */
export async function addJobSignature(job: Job, png: Blob, signerName: string): Promise<Signature> {
  const assignedTechId = await assertCanAttach(job);
  const storagePath = await uploadSignature(job.id, png);
  return backend().signatures.create({
    jobId: job.id,
    assignedTechId,
    signerName,
    storagePath,
    signedAt: new Date().toISOString(),
  });
}

export const fileUrl = (path: string): Promise<string> => backend().files.getUrl(path);
export const removeFile = (path: string): Promise<void> => backend().files.remove(path);
