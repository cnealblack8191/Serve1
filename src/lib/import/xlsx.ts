/**
 * Minimal .xlsx reader for the one-time Smartsheet import (no extra library).
 * An .xlsx file is a zip of XML parts; this reads the zip directory, inflates parts with the
 * platform's DecompressionStream (browsers and Node 18+), and pulls cell values, shared strings,
 * sheet names and each row's outline level (Smartsheet's parent/child rows).
 */
export type Cell = string | number | boolean | null;
export interface SheetRow {
  /** 1-based row number in the sheet. */
  r: number;
  /** Outline (indent) level: 0 for top rows, 1+ for children. */
  level: number;
  cells: Cell[];
}
export interface Sheet {
  name: string;
  rows: SheetRow[];
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads every file in a zip archive. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  // End of central directory: last occurrence of PK\x05\x06.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not an Excel (.xlsx) file.");
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("Damaged .xlsx file.");
    const method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = u16(bytes, local + 26);
    const lExtraLen = u16(bytes, local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : null;
};

/** All text runs inside an <si> or <is> element. */
const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join("");

/** "C12" -> 2 (0-based column). */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const read = (p: string) => {
    const f = files.get(p);
    return f ? dec.decode(f) : null;
  };
  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => textOf(m[1]!),
  );
  const workbook = read("xl/workbook.xml") ?? "";
  const rels = read("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const t = attr(m[0], "Target");
    if (id && t) target.set(id, t.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], "r:id");
    const xml = read(target.get(rid ?? "") ?? `xl/worksheets/sheet${sheets.length + 1}.xml`);
    if (!xml) continue;
    const rows: SheetRow[] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowTag = `<row${rm[1]}>`;
      const cells: Cell[] = [];
      for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${cm[1]}>`;
        const body = cm[2] ?? "";
        const ref = attr(tag, "r");
        const idx = ref ? colIndex(ref) : cells.length;
        const type = attr(tag, "t");
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: Cell = null;
        if (type === "s" && v !== undefined) value = shared[Number(v)] ?? null;
        else if (type === "inlineStr") value = textOf(body);
        else if (type === "str" && v !== undefined) value = decodeXml(v);
        else if (type === "b" && v !== undefined) value = v === "1";
        else if (v !== undefined) value = Number(v);
        while (cells.length < idx) cells.push(null);
        cells[idx] = value === "" ? null : value;
      }
      rows.push({
        r: Number(attr(rowTag, "r") ?? rows.length + 1),
        level: Number(attr(rowTag, "outlineLevel") ?? 0),
        cells,
      });
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** CSV (comma, quotes, CRLF) as one sheet with no outline levels. */
export function readCsv(text: string, name = "CSV"): Sheet {
  const rows: SheetRow[] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  const push = () => {
    row.push(cell.trim() === "" ? null : cell);
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      push();
      rows.push({ r: rows.length + 1, level: 0, cells: row });
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    push();
    rows.push({ r: rows.length + 1, level: 0, cells: row });
  }
  return { name, rows };
}
