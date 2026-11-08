import { defineFunction } from "@aws-amplify/backend";

/**
 * ECI1 tech bridge (handler.ts, docs/ECI1-BRIDGE.md). Table names, the bucket and the
 * function URL are wired in amplify/backend.ts. Ships OFF: ECI1_BRIDGE_ENABLED is read from
 * the deployer's environment and anything but "true" makes every call answer not_enabled.
 */
export const eci1TechBridge = defineFunction({
  name: "eci1-tech-bridge",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  memoryMB: 512,
  // Lives with the data tables it reads, which avoids a stack cycle (the data stack already
  // depends on the function stack through the Spectrum query).
  resourceGroupName: "data",
  environment: {
    ECI1_BRIDGE_ENABLED: process.env.ECI1_BRIDGE_ENABLED === "true" ? "true" : "false",
    COMPANY_TIME_ZONE: "America/New_York",
  },
});
