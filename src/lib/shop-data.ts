// @ts-nocheck
// Shop defaults, part templates/groups, and SHOP_CART_CONFIGS.
import { callAI } from "./ai-api";

export const PART_GROUPS = [
  { id: "electronic",   label: "Electronics",    icon: "⚡", color: "#1a5fa3" },
  { id: "drive",        label: "Drive",           icon: "⚙️", color: "#e8700a" },
  { id: "linear",       label: "Linear motion",   icon: "📏", color: "#9b59b6" },
  { id: "pneumatic",    label: "Pneumatics",      icon: "💨", color: "#1a9fa3" },
  { id: "mechanic",     label: "Mechanical",      icon: "🔧", color: "#27ae60" },
  { id: "normpart",     label: "Fasteners",       icon: "🔩", color: "#7f8c8d" },
  { id: "structure",    label: "Structure",       icon: "📐", color: "#16a085" },
  { id: "connection",   label: "Connection",      icon: "🔌", color: "#8e44ad" },
  { id: "sensor",       label: "Sensors",         icon: "📡", color: "#2980b9" },
  { id: "other",        label: "Other",           icon: "📦", color: "#555" },
];

export const BUILTIN_TEMPLATES = [
  { id: "t-resistor",   group: "electronic", name: "Resistor",             icon: "🟫", color: "#8b6914",
    fields: [
      { key: "value",     label: "Value",          type: "text",   unit: "Ω",  required: true,  hint: "e.g. 10k, 4.7M" },
      { key: "tolerance", label: "Tolerance",      type: "select", options: ["1%","5%","10%","0.1%","0.5%"] },
      { key: "power",     label: "Power",          type: "text",   unit: "W",  hint: "e.g. 0.25, 0.5" },
      { key: "footprint", label: "Package",        type: "select", options: ["0402","0603","0805","1206","2512","THT axial"] },
    ]},
  { id: "t-capacitor",  group: "electronic", name: "Capacitor",            icon: "🔵", color: "#1a5fa3",
    fields: [
      { key: "value",    label: "Capacitance",     type: "text",   unit: "F",  required: true, hint: "e.g. 100nF, 10µF" },
      { key: "voltage",  label: "Voltage rating",  type: "text",   unit: "V",  required: true },
      { key: "type",     label: "Type",            type: "select", options: ["MLCC","Electrolytic","Tantalum","Film"] },
      { key: "footprint",label: "Package",         type: "select", options: ["0402","0603","0805","1206","THT radial"] },
    ]},
  { id: "t-stepper",    group: "drive",      name: "Stepper motor",        icon: "⚙️", color: "#e8700a",
    fields: [
      { key: "flange",   label: "Flange",          type: "select", options: ["NEMA8","NEMA11","NEMA14","NEMA17","NEMA23","NEMA34"], required: true },
      { key: "steps",    label: "Steps/rev",       type: "select", options: ["200 (1.8°)","400 (0.9°)","48 (7.5°)"], required: true },
      { key: "torque",   label: "Holding torque",  type: "number", unit: "Nm" },
      { key: "current",  label: "Phase current",   type: "number", unit: "A" },
      { key: "length",   label: "Motor length",    type: "number", unit: "mm" },
      { key: "shaft_d",  label: "Shaft diam.",     type: "number", unit: "mm" },
      { key: "wiring",   label: "Winding",         type: "select", options: ["Bipolar 4-wire","Unipolar 6-wire","8-wire"] },
    ]},
  { id: "t-dcmotor",    group: "drive",      name: "DC Motor",             icon: "⚡", color: "#e8700a",
    fields: [
      { key: "voltage",  label: "Rated voltage",   type: "number", unit: "V",  required: true },
      { key: "rpm",      label: "Speed",           type: "number", unit: "rpm" },
      { key: "torque",   label: "Rated torque",    type: "number", unit: "Nm" },
      { key: "current",  label: "Rated current",   type: "number", unit: "A" },
      { key: "shaft_d",  label: "Shaft diam.",     type: "number", unit: "mm" },
      { key: "gearbox",  label: "Gearbox",         type: "text",   hint: "e.g. 1:50" },
    ]},
  { id: "t-pneumatic",  group: "pneumatic",  name: "Pneumatic cylinder",   icon: "💨", color: "#1a9fa3",
    fields: [
      { key: "bore",     label: "Bore",            type: "number", unit: "mm", required: true },
      { key: "stroke",   label: "Stroke",          type: "number", unit: "mm", required: true },
      { key: "type",     label: "Type",            type: "select", options: ["Single-acting","Double-acting","Compact","Round","ISO 15552"], required: true },
      { key: "pressure", label: "Max. pressure",   type: "number", unit: "bar" },
      { key: "port",     label: "Port",            type: "select", options: ["M5","G1/8","G1/4","G3/8","G1/2"] },
      { key: "cushion",  label: "Cushioning",      type: "select", options: ["None","Adjustable","Fixed"] },
    ]},
  { id: "t-linear",     group: "linear",     name: "Linear guide",         icon: "📏", color: "#9b59b6",
    fields: [
      { key: "series",   label: "Series",          type: "select", options: ["MGN9","MGN12","MGN15","SBR12","SBR16","SBR20","HGR15","HGR20","HGR25","HGR30"], required: true },
      { key: "length",   label: "Rail length",     type: "number", unit: "mm", required: true },
      { key: "carriages",label: "No. of carriages",type: "number" },
      { key: "class",    label: "Accuracy",        type: "select", options: ["Normal","H (high)","P (precision)"] },
      { key: "preload",  label: "Preload",         type: "select", options: ["Z0","Z1","Z2","Z3"] },
    ]},
  { id: "t-ballscrew",  group: "linear",     name: "Ball screw",           icon: "🔩", color: "#9b59b6",
    fields: [
      { key: "diameter", label: "Nom. diameter",   type: "number", unit: "mm", required: true },
      { key: "pitch",    label: "Lead",            type: "number", unit: "mm", required: true, hint: "e.g. 2, 4, 5, 10" },
      { key: "length",   label: "Total length",    type: "number", unit: "mm", required: true },
      { key: "nut",      label: "Nut type",        type: "select", options: ["Single","Double preloaded","Flange nut"] },
      { key: "accuracy", label: "Accuracy",        type: "select", options: ["C7","C5","C3"] },
    ]},
  { id: "t-bearing",    group: "mechanic",   name: "Bearing",              icon: "⭕", color: "#27ae60",
    fields: [
      { key: "type",     label: "Bearing type",    type: "select", options: ["Deep groove ball","Self-aligning ball","Tapered roller","Needle","Linear ball","Plain"], required: true },
      { key: "desig",    label: "Designation",     type: "text",   hint: "e.g. 608, 6205, LM12UU" },
      { key: "id",       label: "Bore Ø (d)",      type: "number", unit: "mm", required: true },
      { key: "od",       label: "Outer Ø (D)",     type: "number", unit: "mm" },
      { key: "width",    label: "Width (B)",        type: "number", unit: "mm" },
      { key: "seal",     label: "Seal",            type: "select", options: ["Open","Z","2Z","RS","2RS"] },
    ]},
  { id: "t-damper",     group: "mechanic",   name: "Damper / Spring",      icon: "🔴", color: "#e74c3c",
    fields: [
      { key: "type",     label: "Type",            type: "select", options: ["Rubber damper","Hydraulic","Elastomer","Gas spring","Extension spring","Compression spring"], required: true },
      { key: "stroke",   label: "Stroke",          type: "number", unit: "mm" },
      { key: "force",    label: "Force",           type: "number", unit: "N" },
      { key: "thread",   label: "Thread",          type: "text",   hint: "e.g. M10×1.25" },
      { key: "length",   label: "Installed length",type: "number", unit: "mm" },
    ]},
  { id: "t-screw",      group: "normpart",   name: "Screw",                icon: "🔩", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Standard",        type: "select", options: ["ISO 4762","ISO 7380","ISO 10642","DIN 933","DIN 931","ISO 4026"], required: true },
      { key: "thread",   label: "Thread",          type: "text",   required: true, hint: "e.g. M3, M4, M5" },
      { key: "length",   label: "Length",          type: "number", unit: "mm", required: true },
      { key: "material", label: "Material",        type: "select", options: ["Steel 8.8","Steel 10.9","Stainless A2","Stainless A4","Brass"] },
      { key: "drive",    label: "Drive",           type: "select", options: ["Hex socket","Torx","Phillips","Hex head"] },
    ]},
  { id: "t-nut",        group: "normpart",   name: "Nut",                  icon: "⭕", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Standard",        type: "select", options: ["ISO 4032","ISO 4033","DIN 985","ISO 7042","ISO 10511"], required: true },
      { key: "thread",   label: "Thread",          type: "text",   required: true, hint: "e.g. M3, M4, M6" },
      { key: "material", label: "Material",        type: "select", options: ["Steel","Stainless A2","Stainless A4","Brass"] },
    ]},
  { id: "t-snap",       group: "normpart",   name: "Retaining ring",       icon: "🔘", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Standard",        type: "text",   required: true, hint: "e.g. DIN 1481, ISO 8752" },
      { key: "size",     label: "Size",            type: "text",   required: true, hint: "e.g. 3×22" },
      { key: "material", label: "Material",        type: "select", options: ["Spring steel","Stainless A2","Stainless A4","Brass"] },
    ]},
  { id: "t-profile",    group: "structure",  name: "Profile / Structure",  icon: "📐", color: "#16a085",
    fields: [
      { key: "type",     label: "Profile type",    type: "select", options: ["Alu profile system","Rectangular tube","Round tube","L-profile","U-profile","T-profile","Flat bar"], required: true },
      { key: "size",     label: "Dimensions",      type: "text",   required: true, hint: "e.g. 40×40, Ø25×2" },
      { key: "length",   label: "Length",          type: "number", unit: "mm", required: true },
      { key: "material", label: "Material",        type: "select", options: ["Aluminium","Steel S235","Stainless steel","Brass","Plastic"] },
      { key: "slot",     label: "Slot",            type: "text",   hint: "e.g. Slot 8, Slot 6" },
    ]},
  { id: "t-sensor",     group: "sensor",     name: "Sensor",               icon: "📡", color: "#2980b9",
    fields: [
      { key: "type",     label: "Sensor type",     type: "select", options: ["Limit switch","Inductive","Capacitive","Optical","Ultrasonic","Temperature","Pressure","IMU","Encoder","Hall sensor"], required: true },
      { key: "voltage",  label: "Supply",          type: "text",   unit: "V" },
      { key: "output",   label: "Output",          type: "select", options: ["Digital NPN","Digital PNP","Analog 0-10V","Analog 4-20mA","I2C","SPI","UART","Quadrature"] },
      { key: "range",    label: "Measuring range", type: "text",   hint: "e.g. 0-100mm" },
    ]},
  { id: "t-cable",      group: "connection", name: "Cable / Wire",         icon: "🔌", color: "#8e44ad",
    fields: [
      { key: "type",     label: "Cable type",      type: "select", options: ["Single core","Control cable","Drag chain cable","Coaxial","Power cable","Data cable"], required: true },
      { key: "cross",    label: "Cross-section",   type: "text",   unit: "mm²", required: true, hint: "e.g. 0.25, 0.5, 1.5" },
      { key: "cores",    label: "No. of cores",    type: "number" },
      { key: "length",   label: "Length",          type: "number", unit: "m" },
      { key: "shielded", label: "Shielded",        type: "select", options: ["No","Yes"] },
    ]},
];

export const DEFAULT_SHOPS = [
  { id: "aliexpress", name: "AliExpress",    region: "Global", url: "https://aliexpress.com",  categories: [], aliOk: true,  trusted: false },
  { id: "mouser",     name: "Mouser",        region: "Global", url: "https://mouser.com",       categories: [], aliOk: false, trusted: true  },
  { id: "digikey",    name: "DigiKey",       region: "Global", url: "https://digikey.com",      categories: [], aliOk: false, trusted: true  },
  { id: "lcsc",       name: "LCSC",          region: "Global", url: "https://lcsc.com",         categories: [], aliOk: true,  trusted: true  },
  { id: "misumi",     name: "Misumi",        region: "Global", url: "https://misumi-ec.com",    categories: [], aliOk: false, trusted: true  },
  { id: "rs",         name: "RS Components", region: "Global", url: "https://rs-online.com",    categories: [], aliOk: false, trusted: true  },
];

export async function suggestShopsForRegion(country, categories, apiKey) {
  const prompt = `You are a hardware/electronics sourcing expert. Suggest the best parts suppliers for a user in: "${country}".

They work with these part categories: ${categories.join(", ") || "electronics, mechanical, fasteners"}.

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "id": "unique_id_lowercase_no_spaces",
    "name": "Shop Name",
    "region": "Country/Region",
    "url": "https://...",
    "speciality": "What this shop is best for (1 short sentence)",
    "categories": ["electronic", "mechanical", "normpart", "pneumatic", "drive", "linear"]
  }
]

Include 6-10 shops. Prioritize:
- Local/regional specialists most relevant to that country
- Mix of: electronics, mechanical/industrial, fasteners/normparts
- Use your training knowledge — no need to search, you know these shops well
Do NOT include AliExpress, Mouser, DigiKey, LCSC, Misumi, RS Components — already added.`;

  const text = await callAI([{ role: "user", content: prompt }], 1500, apiKey);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Shop cart / CSV export configs ───────────────────────────────────────────

export const SHOP_CART_CONFIGS = {
  reichelt: {
    name: "Reichelt",
    color: "#e8381a",
    logo: "RE",
    cartType: "url_multi",
    buildUrl: (items) => {
      const base = "https://www.reichelt.de/index.html?ACTION=ADDTOCART";
      const params = items.map((it, i) => `&ARTICLE[${i}]=${encodeURIComponent(it.sku)}&QUANTITY[${i}]=${it.qty}`).join("");
      return base + params;
    },
    exportCsv: null,
    notes: "Opens Reichelt cart with all items directly.",
  },
  conrad: {
    name: "Conrad",
    color: "#e8700a",
    logo: "CO",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => `https://www.conrad.de/search.html?search=${encodeURIComponent(it.sku || it.name)}`),
    exportCsv: null,
    notes: "Opens search results for each item individually.",
  },
  mouser: {
    name: "Mouser",
    color: "#0066cc",
    logo: "MO",
    cartType: "bom_csv",
    buildUrl: null,
    exportCsv: (items) => {
      const rows = [["Quantity", "MouserPartNumber", "CustomerPartNumber"]];
      items.forEach(it => rows.push([it.qty, it.sku || "", it.name]));
      return rows.map(r => r.join(",")).join("\n");
    },
    exportFileName: "mouser_bom.csv",
    uploadUrl: "https://www.mouser.de/Bom/",
    notes: "Export CSV → upload at Mouser under 'BOM Tool'.",
  },
  digikey: {
    name: "DigiKey",
    color: "#cc0000",
    logo: "DK",
    cartType: "bom_csv",
    buildUrl: null,
    exportCsv: (items) => {
      const rows = [["Quantity", "Part Number", "Customer Reference"]];
      items.forEach(it => rows.push([it.qty, it.sku || "", it.name]));
      return rows.map(r => r.join(",")).join("\n");
    },
    exportFileName: "digikey_bom.csv",
    uploadUrl: "https://www.digikey.de/de/mylists/list",
    notes: "Export CSV → upload at DigiKey under 'My Lists → Create from BOM'.",
  },
  lcsc: {
    name: "LCSC",
    color: "#1a7fc1",
    logo: "LC",
    cartType: "bom_csv",
    buildUrl: null,
    exportCsv: (items) => {
      const rows = [["Comment", "Designator", "Footprint", "LCSC Part #", "Quantity"]];
      items.forEach(it => rows.push([it.name, it.reference || "", it.footprint || "", it.sku || "", it.qty]));
      return rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    },
    exportFileName: "lcsc_bom.csv",
    uploadUrl: "https://www.lcsc.com/bom",
    notes: "Export CSV → upload at LCSC under 'BOM Order'.",
  },
  berrybase: {
    name: "BerryBase",
    color: "#e63946",
    logo: "BB",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => `https://www.berrybase.de/search?sSearch=${encodeURIComponent(it.sku || it.name)}`),
    notes: "Opens search results for each item.",
  },
  aliexpress: {
    name: "AliExpress",
    color: "#e62e04",
    logo: "AE",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => it.productUrl || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(it.name)}`),
    notes: "Opens product pages. Prefer /item/… links from search — AliExpress has no official multi-item cart API here.",
  },
  "aliexpress-bulk": {
    name: "AliExpress (Bulk)",
    color: "#c02606",
    logo: "AE+",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => it.productUrl || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(it.name)}`),
    notes: "Bulk / reel listings — verify pack size before ordering.",
  },
};

export function downloadText(content, filename, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
