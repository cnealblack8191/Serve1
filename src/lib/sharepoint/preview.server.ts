/**
 * Preview drive provider — SERVER ONLY.
 *
 * Mirrors the shape of the live Graph provider using a sample folder tree so
 * the whole document experience (browsing, folders per record, attaching) can
 * be exercised before Microsoft 365 is connected. Deleting this file once the
 * tenant is connected has no effect on the rest of the application.
 */

import type { DriveProvider } from "./graph.server";
import { DOCUMENT_ROOT, type BrowseItem } from "./types";

const SITE = "https://ecinc.sharepoint.com/sites/ECI";

interface Seed {
  folders: string[];
  files: { name: string; size: string; by: string; at: string }[];
}

const f = (name: string, size: string, by: string, at: string) => ({ name, size, by, at });

/** Sample library, keyed by folder path relative to the drive root. */
const TREE: Record<string, Seed> = {
  [DOCUMENT_ROOT]: {
    folders: ["Clients", "Company", "Templates"],
    files: [f("ECI Capability Statement.pdf", "1.2 MB", "Dana Whitfield", "2026-08-28")],
  },
  [`${DOCUMENT_ROOT}/Company`]: {
    folders: ["Safety", "Insurance"],
    files: [f("W-9 and COI.pdf", "412 KB", "Ray Okafor", "2026-09-02")],
  },
  [`${DOCUMENT_ROOT}/Company/Safety`]: {
    folders: [],
    files: [
      f("Safety Manual 2026.pdf", "4.1 MB", "Dana Whitfield", "2026-07-15"),
      f("Toolbox Talk Sign-in.pdf", "310 KB", "Marcus Reid", "2026-09-05"),
    ],
  },
  [`${DOCUMENT_ROOT}/Company/Insurance`]: {
    folders: [],
    files: [f("Certificate of Insurance.pdf", "288 KB", "Ray Okafor", "2026-06-30")],
  },
  [`${DOCUMENT_ROOT}/Templates`]: {
    folders: [],
    files: [
      f("Proposal Template.docx", "96 KB", "Charles Black", "2026-05-11"),
      f("Change Order Template.docx", "74 KB", "Charles Black", "2026-05-11"),
    ],
  },
  [`${DOCUMENT_ROOT}/Clients`]: {
    folders: ["Deerfield Academy", "Covington Square Retail", "DeKalb County Schools"],
    files: [],
  },
};

/** Folders every record location gets, so uploads land somewhere sensible. */
const RECORD_SUBFOLDERS: Record<string, string[]> = {
  Bids: ["Plans", "Specifications", "Addenda", "Quotes", "Proposals"],
  Jobs: ["Submittals", "Field Photos", "Closeout"],
  Opportunities: ["Invitation to Bid", "Scope"],
  Invoices: [],
  Correspondence: [],
};

const SAMPLE_FILES: Record<string, { name: string; size: string; by: string; at: string }[]> = {
  Plans: [f("Drawings E-Sheets.pdf", "14.6 MB", "Dana Whitfield", "2026-09-05")],
  Specifications: [f("Division 26 Specifications.pdf", "2.1 MB", "Dana Whitfield", "2026-09-05")],
  Addenda: [f("Addendum 1.pdf", "0.9 MB", "Charles Black", "2026-09-03")],
  Quotes: [f("Lighting Package Quote.xlsx", "210 KB", "Ray Okafor", "2026-09-10")],
  Proposals: [],
  Submittals: [f("Switchgear Submittal.pdf", "9.7 MB", "Ray Okafor", "2026-08-26")],
  "Field Photos": [],
  Closeout: [],
  "Invitation to Bid": [f("Invitation to Bid.pdf", "3.3 MB", "Charles Black", "2026-08-30")],
  Scope: [f("Scope of Work.pdf", "640 KB", "Dana Whitfield", "2026-09-01")],
};

const clean = (p: string) => `/${p.split("/").filter(Boolean).join("/")}`;

const urlFor = (path: string) =>
  `${SITE}/Shared%20Documents${path
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/")
    .replace(/^/, "/")}`;

function folderItem(parent: string, name: string): BrowseItem {
  const path = clean(`${parent}/${name}`);
  return {
    id: `preview:${path}`,
    name,
    kind: "folder",
    extension: "",
    size: "",
    modifiedBy: "",
    modifiedAt: "",
    webUrl: urlFor(path),
    path,
  };
}

function fileItem(
  parent: string,
  file: { name: string; size: string; by: string; at: string },
): BrowseItem {
  const path = clean(`${parent}/${file.name}`);
  return {
    id: `preview:${path}`,
    name: file.name,
    kind: "file",
    extension: (file.name.split(".").pop() ?? "").toUpperCase(),
    size: file.size,
    modifiedBy: file.by,
    modifiedAt: file.at,
    webUrl: urlFor(path),
    path,
  };
}

/** Folders created on demand by ensureFolder during this server process. */
const provisioned = new Set<string>();

function seedFor(path: string): Seed {
  const known = TREE[path];
  if (known) return known;
  const parts = path.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] ?? "";
  const parent = parts[parts.length - 2] ?? "";
  // A record folder (…/Bids/<name>) gets its standard subfolders.
  const sub = RECORD_SUBFOLDERS[parent];
  if (sub) return { folders: sub, files: [] };
  // A standard subfolder gets its sample content.
  if (SAMPLE_FILES[leaf]) return { folders: [], files: SAMPLE_FILES[leaf] ?? [] };
  return { folders: [], files: [] };
}

export function createPreviewProvider(): DriveProvider {
  return {
    connected: false,
    async listFolder(rawPath) {
      const path = clean(rawPath || DOCUMENT_ROOT);
      const seed = seedFor(path);
      const extra = [...provisioned]
        .filter((p) => p.startsWith(`${path}/`) && p.slice(path.length + 1).indexOf("/") === -1)
        .map((p) => p.split("/").pop() ?? "");
      const folderNames = [...new Set([...seed.folders, ...extra])];
      return {
        webUrl: urlFor(path),
        items: [
          ...folderNames.map((n) => folderItem(path, n)),
          ...seed.files.map((file) => fileItem(path, file)),
        ],
      };
    },
    async ensureFolder(rawPath) {
      const path = clean(rawPath);
      provisioned.add(path);
      return {
        siteId: null,
        driveId: null,
        itemId: null,
        webUrl: urlFor(path),
        provisioned: false,
      };
    },
    async uploadFile(rawPath, fileName) {
      const path = clean(rawPath);
      return fileItem(path, {
        name: fileName,
        size: "—",
        by: "Preview",
        at: new Date().toISOString().slice(0, 10),
      });
    },
  };
}
