import { OPEN_STAGES, isFinished, type Job, type Opportunity } from "@/data";

import { todayIso } from "./format";

/** "Needs attention" rules shared by the dashboard and the filtered lists. */
export type OppAttention = "noNextStep" | "pastClose" | "quotePastDue" | "reminderDue";
export type JobAttention = "pastEndDate" | "noPhotos";

export const OPP_ATTENTION_LABEL: Record<OppAttention, string> = {
  noNextStep: "Open opportunities with no next step",
  pastClose: "Past expected close date",
  quotePastDue: "Quotes past their due date",
  reminderDue: "Next-step reminders due",
};
export const JOB_ATTENTION_LABEL: Record<JobAttention, string> = {
  pastEndDate: "Scheduled tasks past their end date",
  noPhotos: "Completed jobs without completion photos",
};

export const isOpen = (o: Opportunity) => OPEN_STAGES.includes(o.stage);

/** Quotes are "out" once the bid is sent; a quote due date only matters before that. */
const BEFORE_QUOTE_SENT = new Set(["Prospect", "Assessment", "ProposalBidding"]);

export function oppNeedsAttention(o: Opportunity, kind: OppAttention, today = todayIso()) {
  if (!isOpen(o)) return false;
  switch (kind) {
    case "noNextStep":
      return !o.nextStep?.trim();
    case "pastClose":
      return !!o.expectedClose && o.expectedClose < today;
    case "quotePastDue":
      return BEFORE_QUOTE_SENT.has(o.stage) && !!o.quoteDue && o.quoteDue < today;
    case "reminderDue":
      return o.nextStepRemind && !!o.nextStepDue && o.nextStepDue <= today;
  }
}

const finished = (j: Job) => isFinished(j.status);

/** `photoJobIds`: jobs that have at least one photo in the app. */
export function jobNeedsAttention(
  j: Job,
  kind: JobAttention,
  photoJobIds: Set<string>,
  today = todayIso(),
) {
  switch (kind) {
    case "pastEndDate":
      return !finished(j) && j.status !== "Cancelled" && !!j.endDate && j.endDate < today;
    case "noPhotos":
      return finished(j) && !j.completionPhotosOnFile && !photoJobIds.has(j.id);
  }
}
