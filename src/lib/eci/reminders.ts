/**
 * Automatic reminder definitions shared by the settings UI and the scheduled sweep.
 * Keys double as notification-preference keys stored on the user's profile.
 */
export const AUTO_REMINDER_KEYS = {
  bidNoBid: "Bid / no-bid decision prompt",
  bidDue: "Bid due-date reminder",
  postBid: "Post-bid status update reminder",
} as const;

export type AutoReminderKey = (typeof AUTO_REMINDER_KEYS)[keyof typeof AUTO_REMINDER_KEYS];

export const AUTO_REMINDER_DESCRIPTIONS: Record<AutoReminderKey, string> = {
  [AUTO_REMINDER_KEYS.bidNoBid]:
    "About 1 week after an opportunity is created and still sitting in New Opportunity.",
  [AUTO_REMINDER_KEYS.bidDue]: "About 1 week before a bid's expected bid date.",
  [AUTO_REMINDER_KEYS.postBid]:
    "About 2 weeks after a quote is sent to the customer with no stage change since.",
};

/** Timing knobs (days). */
export const AUTO_REMINDER_TIMING = {
  bidNoBidAfterDays: 7,
  bidDueWithinDays: 7,
  postBidAfterDays: 14,
} as const;

/** Every reminder type is on by default unless the user turns it off. */
export const AUTO_REMINDER_DEFAULTS: Record<string, boolean> = {
  [AUTO_REMINDER_KEYS.bidNoBid]: true,
  [AUTO_REMINDER_KEYS.bidDue]: true,
  [AUTO_REMINDER_KEYS.postBid]: true,
};
