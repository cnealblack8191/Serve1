/**
 * Moving the hosting app out of CDKToolkit (infra/hosting-move/RUNBOOK.md): the template change and
 * the change-set checks, against a copy of the live template (account id replaced). No AWS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bucketEmpty,
  bucketReimportTemplate,
  checkBucketRemoveOnly,
  checkImportOnly,
  checkRemoveOnly,
  hostingMatches,
  importTemplate,
  liveMatches,
  reimportTemplate,
  stripBucket,
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
        tags: { Project: "serv1-demo", Environment: "demo" },
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

describe("undo of step 1", () => {
  it("re-imports with the current outputs; the original outputs come back afterwards", () => {
    const before = live();
    const current = stripHosting(before);
    const t = reimportTemplate(before, current);
    assert.deepEqual(t.Outputs, current.Outputs);
    assert.deepEqual(t.Resources, before.Resources);
    // The only difference from the stack's current template: the three imported resources.
    assert.deepEqual(
      Object.keys(t.Resources)
        .filter((id) => !(id in current.Resources))
        .sort(),
      ["ContainerAssetsRepository", "HostingApp", "HostingBranch"],
    );
  });
  it("refuses when a kept resource changed since the snapshot (for example after a bootstrap)", () => {
    const before = live();
    const current = structuredClone(stripHosting(before));
    (current.Resources.CdkBootstrapVersion!.Properties as Record<string, unknown>).Value = "28";
    assert.throws(() => reimportTemplate(before, current), /CdkBootstrapVersion differs/);
  });
});

describe("step 2 import template", () => {
  it("has the same resources and parameters but no outputs (added by update afterwards)", () => {
    const full = hosting();
    const t = importTemplate(full);
    assert.equal(t.Outputs, undefined);
    assert.deepEqual(t.Resources, full.Resources);
    assert.deepEqual(t.Parameters, full.Parameters);
    assert.ok(full.Outputs && Object.keys(full.Outputs).length === 3);
  });
});

describe("the branch's live Environment tag (snapshot, 2026-11-09)", () => {
  it("serv1-hosting declares it, so the import and the update leave it in place", () => {
    const tags = (hosting().Resources.HostingBranch!.Properties as { Tags: unknown }).Tags;
    assert.deepEqual(tags, [
      { Key: "Project", Value: "serv1-demo" },
      { Key: "Environment", Value: "demo" },
    ]);
  });
  it("the CDKToolkit comparison accepts exactly that known difference and no other", () => {
    assert.deepEqual(hostingMatches(live(), hosting()), []);
    const other = hosting();
    (other.Resources.HostingBranch!.Properties as { Tags: unknown }).Tags = [
      { Key: "Project", Value: "serv1-demo" },
      { Key: "Environment", Value: "prod" },
    ];
    assert.match(hostingMatches(live(), other).join(), /branch.Tags differs/);
    const declaredChanged = live();
    (declaredChanged.Resources.HostingBranch!.Properties as { Tags: unknown }).Tags = [];
    assert.match(hostingMatches(declaredChanged, hosting()).join(), /branch.Tags differs/);
  });
  it("the live check still needs the branch exactly as it is", () => {
    const app = {
      app: {
        name: "serv1-demo",
        platform: "WEB",
        customRules: [{ source: "/<*>", target: "/index.html", status: "404-200" }],
        tags: { Project: "serv1-demo", Environment: "demo" },
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
    assert.match(liveMatches(app, branch, hosting()).join(), /branch tags differ/);
  });
});

describe("step 3b: the staging bucket the stock bootstrap cannot update", () => {
  // CDKToolkit as step 1 left it (and as the failed bootstrap rolled back to).
  const afterStep1 = () => stripHosting(live());

  it("removes the bucket and its policy and their outputs; the version parameter stays", () => {
    const before = afterStep1();
    const after = stripBucket(before);
    assert.deepEqual(Object.keys(after.Resources), ["CdkBootstrapVersion"]);
    assert.deepEqual(after.Resources.CdkBootstrapVersion, before.Resources.CdkBootstrapVersion);
    assert.deepEqual(Object.keys(after.Outputs ?? {}), ["BootstrapVersion"]);
  });

  it("refuses when the bucket would be deleted, is missing, or is still referenced", () => {
    const noRetain = afterStep1();
    delete noRetain.Resources.StagingBucket!.DeletionPolicy;
    assert.throws(() => stripBucket(noRetain), /would delete it/);
    const missing = afterStep1();
    delete missing.Resources.StagingBucketPolicy;
    assert.throws(() => stripBucket(missing), /no StagingBucketPolicy/);
    const referenced = afterStep1();
    (
      referenced.Resources.CdkBootstrapVersion as { Properties: Record<string, unknown> }
    ).Properties.X = { "Fn::GetAtt": ["StagingBucket", "Arn"] };
    assert.throws(() => stripBucket(referenced), /still refers to StagingBucket/);
  });

  it("the change set may retain the bucket and delete only its policy", () => {
    const row = (id: string, action: string, policy?: string) => ({
      Type: "Resource",
      ResourceChange: { Action: action, LogicalResourceId: id, PolicyAction: policy },
    });
    const ok = [
      row("StagingBucket", "Remove", "Retain"),
      row("StagingBucketPolicy", "Remove", "Delete"),
    ];
    assert.deepEqual(checkBucketRemoveOnly(ok), []);
    assert.match(
      checkBucketRemoveOnly([row("StagingBucket", "Remove", "Delete"), ok[1]!]).join(),
      /StagingBucket: PolicyAction Delete, not Retain/,
    );
    assert.match(
      checkBucketRemoveOnly([row("StagingBucket", "Remove"), ok[1]!]).join(),
      /PolicyAction none, not Retain/,
    );
    assert.match(checkBucketRemoveOnly([ok[0]!]).join(), /StagingBucketPolicy: missing/);
    assert.match(
      checkBucketRemoveOnly([...ok, row("CdkBootstrapVersion", "Modify")]).join(),
      /CdkBootstrapVersion: Modify, not Remove.*not the staging bucket/,
    );
  });

  it("the bucket is deleted only when it holds no versions, delete markers or uploads", () => {
    assert.deepEqual(bucketEmpty({ versions: 0, deleteMarkers: 0, uploads: 0 }), []);
    assert.match(bucketEmpty({ versions: 1, deleteMarkers: 0, uploads: 0 }).join(), /1 object/);
    assert.match(bucketEmpty({ versions: 0, deleteMarkers: 2, uploads: 0 }).join(), /2 delete/);
    assert.match(bucketEmpty({ versions: 0, deleteMarkers: 0, uploads: 1 }).join(), /1 unfinished/);
  });

  it("undo re-imports the bucket alone with the current outputs", () => {
    const before = afterStep1();
    const current = stripBucket(before);
    const t = bucketReimportTemplate(before, current);
    assert.deepEqual(Object.keys(t.Resources).sort(), ["CdkBootstrapVersion", "StagingBucket"]);
    assert.deepEqual(t.Resources.StagingBucket, before.Resources.StagingBucket);
    assert.deepEqual(t.Outputs, current.Outputs);
  });
});
