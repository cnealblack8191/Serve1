import { defineFunction } from "@aws-amplify/backend";

/**
 * Spectrum caller (handler.ts). Defined here, wired in amplify/data/resource.ts and
 * amplify/backend.ts; nothing is deployed until the owner runs a deployment.
 * SPECTRUM_CONNECTOR_URL is read at deploy time from the deployer's environment, so no
 * address is kept in code; empty until the connector is deployed.
 */
export const spectrumCaller = defineFunction({
  name: "spectrum-caller",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    SPECTRUM_CONNECTOR_URL: process.env.SPECTRUM_CONNECTOR_URL ?? "",
  },
});
