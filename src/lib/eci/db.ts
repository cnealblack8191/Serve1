import panelPhoto from "@/assets/field/panel.jpg";
import transformerPhoto from "@/assets/field/transformer.jpg";
import roughinPhoto from "@/assets/field/roughin.jpg";
import type { WorkOrder } from "./types";

/** Seeded field photos are stored in the database as `asset:<name>` tokens. */
const ASSET_MAP: Record<string, string> = {
  "asset:panel": panelPhoto,
  "asset:transformer": transformerPhoto,
  "asset:roughin": roughinPhoto,
};

export const fieldPhotoPool = [roughinPhoto, panelPhoto, transformerPhoto];

type AnyRow = Record<string, unknown>;

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Convert an app entity (camelCase) into a database row (snake_case). */
export function toRow<T extends object>(entity: T, omit: string[] = []): AnyRow {
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(entity)) {
    if (omit.includes(k) || v === undefined) continue;
    out[toSnake(k)] = v;
  }
  return out;
}

/** Convert a database row (snake_case) into an app entity (camelCase). */
export function fromRow<T>(row: AnyRow): T {
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "created_at") continue;
    out[toCamel(k)] = v === null ? undefined : v;
  }
  return out as T;
}

/* ---- per-table specialisations ---- */

export function workOrderFromRow(row: AnyRow): WorkOrder {
  const wo = fromRow<WorkOrder>(row);
  if (wo.photos) {
    wo.photos = wo.photos.map((p) => ({ ...p, src: ASSET_MAP[p.src] ?? p.src }));
  }
  return wo;
}

export function workOrderToRow(wo: WorkOrder): AnyRow {
  const row = toRow(wo);
  if (wo.photos) {
    const reverse = Object.fromEntries(Object.entries(ASSET_MAP).map(([k, v]) => [v, k]));
    row["photos"] = wo.photos.map((p) => ({ ...p, src: reverse[p.src] ?? p.src }));
  }
  return row;
}

export const emailToRow = (e: { to: string } & object) => {
  const { to, ...rest } = e;
  return { ...toRow(rest), recipient: to };
};
export const emailFromRow = <T,>(row: AnyRow): T => {
  const { recipient, ...rest } = row;
  return { ...fromRow<object>(rest), to: recipient } as T;
};

export const reminderToRow = (r: { createdAt: string } & object) => {
  const { createdAt, ...rest } = r;
  return { ...toRow(rest), created_at_label: createdAt };
};
export const reminderFromRow = <T,>(row: AnyRow): T => {
  const { created_at_label, ...rest } = row;
  return { ...fromRow<object>(rest), createdAt: created_at_label } as T;
};

/** Collision-safe id with the familiar `PREFIX-1234` shape. */
export const uid = (p: string) =>
  `${p}-${Date.now().toString(36).slice(-5).toUpperCase()}${Math.floor(Math.random() * 36 ** 2)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0")}`;
