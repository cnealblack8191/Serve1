/**
 * Builds small synthetic .xlsx files for import tests (no real data, no library).
 * Rows are arrays of cells; a row given as { level, cells } is indented (a Smartsheet child row).
 * Strings go in as inline strings, numbers as numbers, booleans as booleans.
 */
type Cell = string | number | boolean | null;
export type Row = Cell[] | { level: number; cells: Cell[] };

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text);
    const nameB = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameB.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    const cen = new Uint8Array(46 + nameB.length);
    const w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, nameB.length, true);
    w.setUint32(42, offset, true);
    cen.set(nameB, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cenSize, true);
  e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function sheetXml(rows: Row[]): string {
  const body = rows
    .map((row, ri) => {
      const { level, cells } = Array.isArray(row) ? { level: 0, cells: row } : row;
      const cs = cells
        .map((c, ci) => {
          const ref = `${col(ci)}${ri + 1}`;
          if (c === null) return "";
          if (typeof c === "number") return `<c r="${ref}"><v>${c}</v></c>`;
          if (typeof c === "boolean") return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}"${level ? ` outlineLevel="${level}"` : ""}>${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function makeXlsx(sheets: { name: string; rows: Row[] }[]): Uint8Array {
  const wb = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}</Relationships>`;
  return zip([
    ["xl/workbook.xml", wb],
    ["xl/_rels/workbook.xml.rels", rels],
    ...sheets.map(
      (s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)] as [string, string],
    ),
  ]);
}

// ---------------------------------------------------------------- synthetic owner-style exports

const SALES_HEADERS = [
  "Status",
  "Hours Quoted",
  "Opportunity",
  "Notes",
  "Probability",
  "Opportunity Type",
  "Customer Contact Name",
  "Sales Stage",
  "Forecast Amount",
  "Quote Due by",
  "Expected Close Date",
  "Sales Rep",
  "Job Cost",
  "Next Step",
  "Created",
];
const SERVICE_HEADERS = [
  "Service Opportunity",
  "Priority",
  "Invoice Contact",
  "ECI Quote #",
  "Customer PO #",
  "Job Stage",
  "Quoted Amount $",
  "Date(s) on Site",
  "Date Completed",
  "Service Report Approved",
  "Invoiced Amount $",
  "Completed Project Pics",
  "Quoted Margin",
  "Completed Margin",
];
const TASK_HEADERS = [
  "Task",
  "Description",
  "Assigned To",
  "Status",
  "PO Received",
  "Lift/Connex",
  "Material Ordered",
  "Material Delivered",
  "Health",
  "Start Date",
  "End Date",
];
const sales = (o: Record<string, Cell>) => SALES_HEADERS.map((h) => o[h] ?? null);
const service = (o: Record<string, Cell>) => SERVICE_HEADERS.map((h) => o[h] ?? null);
const task = (o: Record<string, Cell>) => TASK_HEADERS.map((h) => o[h] ?? null);

/** Made-up rows shaped like the owner's exports: 6 sales, 4 service (3 duplicates), 4 tasks. */
export function syntheticExports() {
  const salesFile = makeXlsx([
    {
      name: "Sales Pipeline",
      rows: [
        SALES_HEADERS,
        sales({ Opportunity: "DeKalb Service" }), // parent row naming the contract
        {
          level: 1,
          cells: sales({
            Opportunity: "Library lighting retrofit",
            "Opportunity Type": "Dekalb Service",
            "Sales Stage": "2 - Assessment",
            "Sales Rep": "Pat Example",
            Probability: 0.25,
            "Forecast Amount": "$12,500.00",
            "Expected Close Date": 46300,
            Created: "9/1/26",
          }),
        },
        {
          level: 1,
          cells: sales({
            Opportunity: "Annex panel upgrade",
            "Opportunity Type": "DeKalb Gov Service",
            "Sales Stage": "5 Customer Review",
            "Sales Rep": "Pat Example",
            "Next Step": "Call engineer",
          }),
        },
        sales({
          Opportunity: "School intercom",
          "Opportunity Type": "Low Voltage",
          "Customer Contact Name": "Sam Sample",
          "Sales Stage": "4 Proposal/Bid Sent",
          "Sales Rep": "Lee Demo",
        }),
        sales({
          Opportunity: "Gym high-bays",
          "Opportunity Type": "High Voltage - Barrow",
          "Sales Stage": "Closed Won",
          Status: "Won",
          "Expected Close Date": "2026-08-01",
        }),
        sales({
          Opportunity: "Park receptacles",
          "Opportunity Type": "Rockdale Service",
          "Sales Stage": "Closed Lost",
        }),
        sales({
          Opportunity: "Bus depot fiber",
          "Opportunity Type": "Low Voltage",
          "Sales Stage": "No Bid",
        }),
      ],
    },
  ]);
  const serviceFile = makeXlsx([
    {
      name: "Service Pipeline",
      rows: [
        SERVICE_HEADERS,
        service({
          "Service Opportunity": "Library lighting retrofit",
          "ECI Quote #": "Q-1001",
          "Quoted Amount $": 12500,
          "Quoted Margin": "31%",
        }),
        service({
          "Service Opportunity": "Gym High-Bays",
          "ECI Quote #": "Q-1002",
          "Customer PO #": "PO-9",
          "Job Stage": "Complete",
          "Date Completed": "8/20/26",
          "Service Report Approved": true,
          "Completed Project Pics": "Yes",
          "Invoiced Amount $": "$40,100",
        }),
        service({
          "Service Opportunity": "Annex panel upgrade",
          Priority: "High",
          "Invoice Contact": "AP Desk",
        }),
        service({
          "Service Opportunity": "Fire station outlet repair",
          "Job Stage": "In Progress",
          "Date(s) on Site": "10/3/26",
        }),
      ],
    },
  ]);
  const taskFile = makeXlsx([
    {
      name: "High Voltage Task Tracker",
      rows: [
        TASK_HEADERS,
        task({ Task: "Gwinnett Schools" }), // parent row
        {
          level: 1,
          cells: task({
            Task: "Stadium light poles",
            Status: "In Progress",
            Health: "Yellow",
            "PO Received": true,
            "Material Ordered": true,
            "Start Date": "10/1/26",
            "End Date": "10/30/26",
            "Assigned To": "Crew A",
          }),
        },
        {
          level: 1,
          cells: task({
            Task: "Kitchen panel swap",
            Status: "Not Started",
            Health: "Green",
            "Start Date": "11/20/26",
            "End Date": "11/22/26",
          }),
        },
        task({
          Task: "Gym high-bays",
          Status: "Complete",
          Health: "Green",
          "Lift/Connex": true,
          "Material Delivered": true,
        }),
      ],
    },
  ]);
  return { salesFile, serviceFile, taskFile };
}
