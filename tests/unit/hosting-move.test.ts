/**
 * Moving the hosting app out of CDKToolkit (infra/hosting-move/RUNBOOK.md): the template change and
 * the change-set checks, against a copy of the live template (account id replaced). No AWS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  checkImportOnly,
  checkRemoveOnly,
  hostingMatches,
  liveMatches,
  stripHosting,
  type Template,
} from "../../scripts/hosting-move/plan.ts";

const load = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as Template;
const live = () => load("./fixtures/cdktoolkit-live.json");
const hosting = () => load("../../infra/hosting-move/serv1-hosting.json");

describe("CDKToolkit without the hosting app", () => {
  it("removes exactly the app, the branch and the container repository, and their outputs", () => {
    const before = live();
    const after = stripHosting(before);
    assert.deepEqual(Object.keys(after.Resources).sort(), [
      "CdkBootstrapVersion",
      "StagingBucket",
      "StagingBucketPolicy",
    ]);
    assert.deepEqual(Object.keys(after.Outputs ?? {}).sort(), [
      "BootstrapVersion",
      "BucketDomainName",
      "BucketName",
    ]);
    // Everything that stays is byte-for-byte as it was.
    for (const id of Object.keys(after.Resources))
      assert.deepEqual(after.Resources[id], before.Resources[id]);
    assert.deepEqual(after.Conditions, before.Conditions);
    assert.equal(after.Description, before.Description);
  });

  it("refuses when a moved resource would be deleted, is missing, or is still referenced", () => {
    const noRetain = live();
    delete noRetain.Resources.HostingApp!.DeletionPolicy;
    assert.throws(() => stripHosting(noRetain), /would delete it/);
    const missing = live();
    delete missing.Resources.HostingBranch;
    assert.throws(() => stripHosting(missing), /no HostingBranch/);
    const referenced = live();
    (
      referenced.Resources.StagingBucketPolicy as { Properties: Record<string, unknown> }
    ).Properties.X = { Ref: "ContainerAssetsRepository" };
    assert.throws(() => stripHosting(referenced), /still refers to ContainerAssetsRepository/);
  });
});

describe("change-set checks", () => {
  const remove = (id: string, policy?: string) => ({
    Type: "Resource",
    ResourceChange: { Action: "Remove", LogicalResourceId: id, PolicyAction: policy },
  });
  it("step 1 passes only three retained removes", () => {
    const ok = [
      remove("HostingApp", "Retain"),
      remove("HostingBranch", "Retain"),
      remove("ContainerAssetsRepository"),
    ];
    assert.deepEqual(checkRemoveOnly(ok), []);
    assert.match(checkRemoveOnly(ok.slice(0, 2)).join(), /ContainerAssetsRepository: missing/);
    assert.match(
      checkRemoveOnly([
        ...ok,
        { ResourceChange: { Action: "Modify", LogicalResourceId: "StagingBucket" } },
      ]).join(),
      /StagingBucket: Modify, not Remove/,
    );
    assert.match(
      checkRemoveOnly([remove("HostingApp", "Delete"), ok[1]!, ok[2]!]).join(),
      /PolicyAction Delete/,
    );
  });
  it("step 2 passes only the app and branch imports", () => {
    const imp = (id: string) => ({ ResourceChange: { Action: "Import", LogicalResourceId: id } });
    assert.deepEqual(checkImportOnly([imp("HostingApp"), imp("HostingBranch")]), []);
    assert.match(checkImportOnly([imp("HostingApp")]).join(), /HostingBranch: missing/);
    assert.match(
      checkImportOnly([imp("HostingApp"), imp("HostingBranch"), imp("Other")]).join(),
      /Other: not expected/,
    );
  });
});

describe("serv1-hosting imports the app as it is", () => {
  it("declares the same app and branch as CDKToolkit did, retained on delete", () => {
    assert.deepEqual(hostingMatches(live(), hosting()), []);
    const changed = hosting();
    (changed.Resources.HostingApp!.Properties as Record<string, unknown>).Name = "other";
    assert.match(hostingMatches(live(), changed).join(), /app.Name differs/);
  });
  it("checks the live app and branch, ignoring Amplify's own aws: tags", () => {
    const app = {
      app: {
        name: "serv1-demo",
        platform: "WEB",
        customRules: [{ source: "/<*>", target: "/index.html", status: "404-200" }],
        tags: { Project: "serv1-demo", Environment: "demo", "aws:cloudformation:stack-name": "x" },
      },
    };
    const branch = {
      branch: {
        branchName: "demo",
        enableAutoBuild: false,
        stage: "DEVELOPMENT",
        tags: { Project: "serv1-demo" },
      },
    };
    assert.deepEqual(liveMatches(app, branch, hosting()), []);
    const extraRule = structuredClone(app);
    extraRule.app.customRules.push({ source: "/x", target: "/y", status: "301" });
    assert.match(liveMatches(extraRule, branch, hosting()).join(), /rewrite rules differ/);
    assert.match(
      liveMatches(app, { branch: { ...branch.branch, stage: "PRODUCTION" } }, hosting()).join(),
      /stage is PRODUCTION/,
    );
  });
});
