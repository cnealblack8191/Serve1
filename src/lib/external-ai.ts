/**
 * Kill switch for external AI services.
 *
 * Bid emails and customer names must not leave ECI's systems for a third-party
 * AI service until the owner approves a data-handling path. This is a code
 * constant, not an environment variable, so setting an API key cannot turn it
 * back on; re-enabling is a reviewed code change.
 */
export const EXTERNAL_AI_ENABLED = false;

export const EXTERNAL_AI_DISABLED_MESSAGE =
  "AI email processing is turned off pending ECI data-handling approval. Enter the details manually.";

export function assertExternalAiAllowed(): void {
  if (!EXTERNAL_AI_ENABLED) throw new Error(EXTERNAL_AI_DISABLED_MESSAGE);
}
