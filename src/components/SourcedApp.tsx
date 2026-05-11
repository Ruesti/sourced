// @ts-nocheck
// ── Sourced — BOM & Parts Manager ───────────────────────────────────────────
// Supabase credentials are read from environment variables.
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local

import { useState, useEffect, useRef, useCallback } from "react";

// ── Supabase — auth via /api/supabase-auth, data via JS client ───────────────
const SESS_STORAGE = "partsdb-sb-session";
let _sbClient: any = null;
let _sbUrl = "";
let _sbKey = "";
let _sbConfigPromise: Promise<void> | null = null;

// Strip non-ASCII-printable chars that would break HTTP headers
const sanitize = (s: string) => s.trim().replace(/[^\x20-\x7E]/g, "");

function loadSbConfig(): Promise<void> {
  if (_sbUrl && _sbKey) return Promise.resolve();
  if (_sbConfigPromise) return _sbConfigPromise;
  _sbConfigPromise = fetch("/api/config")
    .then(r => r.ok ? r.json() : {})
    .then(d => { _sbUrl = sanitize(d.supabaseUrl || ""); _sbKey = sanitize(d.supabaseAnonKey || ""); })
    .catch(() => {});
  return _sbConfigPromise;
}

// Server-side auth helpers
async function sbAuth(action: string, payload: object = {}): Promise<any> {
  const r = await fetch("/api/supabase-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  return r.json();
}

function getSbSession() { try { return JSON.parse(localStorage.getItem(SESS_STORAGE) || "null"); } catch { return null; } }
function setSbSession(s: any) { try { if (s) localStorage.setItem(SESS_STORAGE, JSON.stringify(s)); else localStorage.removeItem(SESS_STORAGE); } catch {} }

async function getSb() {
  await loadSbConfig();
  if (!_sbUrl || !_sbKey) return null;
  try { new URL(_sbUrl); } catch { return null; }
  if (_sbClient) return _sbClient;
  if (!window.supabase) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // Use session access token so data queries are authenticated
  const session = getSbSession();
  _sbClient = window.supabase.createClient(_sbUrl, _sbKey, {
    global: { headers: session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {} }
  });
  return _sbClient;
}

function resetSbClient() { _sbClient = null; _sbConfigPromise = null; }

// ── Smart Storage — localStorage lokal, Supabase wenn eingeloggt ──────────────
const STORAGE_KEYS = {
  parts:      "partsdb-parts",
  projects:   "partsdb-projects",
  bomItems:   "partsdb-bom",
  suppliers:  "partsdb-suppliers",
  shops:      "partsdb-shops",
  templates:  "partsdb-templates",
  attributes: "partsdb-attributes",
};

// Lokaler Fallback (artifact storage oder localStorage)
async function loadLocal(key, fallback = []) {
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : fallback;
    }
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

async function saveLocal(key, val) {
  try {
    if (window.storage) { await window.storage.set(key, JSON.stringify(val)); return; }
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ── Supabase CRUD helpers ─────────────────────────────────────────────────────
async function sbLoadAll(userId) {
  const sb = await getSb();
  if (!sb || !userId) return null;
  try {
    const [parts, projects, bomItems, suppliers, shops] = await Promise.all([
      sb.from("bm_parts").select("*").eq("user_id", userId),
      sb.from("bm_projects").select("*").eq("user_id", userId),
      sb.from("bm_bom_items").select("*").eq("user_id", userId),
      sb.from("bm_suppliers").select("*").eq("user_id", userId),
      sb.from("bm_shops").select("*").eq("user_id", userId),
    ]);
    return {
      parts:     (parts.data     || []).map(sbToPart),
      projects:  (projects.data  || []).map(sbToProject),
      bomItems:  (bomItems.data  || []).map(sbToBomItem),
      suppliers: (suppliers.data || []).map(sbToSupplier),
      shops:     shops.data?.length ? shops.data.map(sbToShop) : null,
    };
  } catch { return null; }
}

// ── Field mapping: Supabase snake_case ↔ App camelCase ───────────────────────
const sbToPart = r => ({ id: r.id, name: r.name, mpn: r.mpn||"", manufacturer: r.manufacturer||"", category: r.category||"", footprint: r.footprint||"", description: r.description||"", notes: r.notes||"", datasheet: r.datasheet||"", drawer: r.drawer||"", stock: r.stock||0, stockMin: r.stock_min||0 });
const partToSb = (p, uid) => ({ id: p.id, user_id: uid, name: p.name, mpn: p.mpn||null, manufacturer: p.manufacturer||null, category: p.category||null, footprint: p.footprint||null, description: p.description||null, notes: p.notes||null, datasheet: p.datasheet||null, drawer: p.drawer||null, stock: p.stock||0, stock_min: p.stockMin||0 });

const sbToProject = r => ({ id: r.id, name: r.name, description: r.description||"", created: r.created_at });
const projectToSb = (p, uid) => ({ id: p.id, user_id: uid, name: p.name, description: p.description||null });

const sbToBomItem = r => ({ id: r.id, projectId: r.project_id, partId: r.part_id, quantity: r.quantity, reference: r.reference||"", notes: r.notes||"", preferredSupplierId: r.preferred_supplier_id||null, preferredShopId: r.preferred_shop_id||null });
const bomItemToSb = (b, uid) => ({ id: b.id, user_id: uid, project_id: b.projectId, part_id: b.partId, quantity: b.quantity, reference: b.reference||null, notes: b.notes||null, preferred_supplier_id: b.preferredSupplierId||null, preferred_shop_id: b.preferredShopId||null });

const sbToSupplier = r => ({ id: r.id, partId: r.part_id, shopId: r.shop_id||"", shopName: r.shop_name, sku: r.sku||"", searchUrl: r.search_url||"", price: r.price ? parseFloat(r.price) : null, currency: r.currency||"EUR", notes: r.notes||"", aiGenerated: r.ai_generated||false, packQty: r.pack_qty||1 });
const supplierToSb = (s, uid) => ({ id: s.id, user_id: uid, part_id: s.partId, shop_id: s.shopId||null, shop_name: s.shopName, sku: s.sku||null, search_url: s.searchUrl||null, price: s.price||null, currency: s.currency||"EUR", notes: s.notes||null, ai_generated: s.aiGenerated||false, pack_qty: s.packQty||1 });

const sbToShop = r => ({ id: r.id, name: r.name, region: r.region||"", url: r.url||"" });
const shopToSb = (s, uid) => ({ id: s.id, user_id: uid, name: s.name, region: s.region||null, url: s.url||null });

// ── Supabase upsert/delete wrappers ──────────────────────────────────────────
async function sbUpsert(table, rows) {
  const sb = await getSb(); if (!sb) return;
  await sb.from(table).upsert(rows, { onConflict: "id" });
}
async function sbDelete(table, id) {
  const sb = await getSb(); if (!sb) return;
  await sb.from(table).delete().eq("id", id);
}

// ── Persistenz ────────────────────────────────────────────────────────────────
// ── Kategorie-Gruppen & Built-in Templates ────────────────────────────────────
const PART_GROUPS = [
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

const BUILTIN_TEMPLATES = [
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
      { key: "width",    label: "Width (B)",       type: "number", unit: "mm" },
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

// ── Shops — nur wirklich globale Defaults, Rest per KI-Empfehlung ────────────
// Keine regionalen Annahmen — User definiert seine eigenen Shops
const DEFAULT_SHOPS = [
  { id: "aliexpress", name: "AliExpress", region: "Global", url: "https://aliexpress.com", categories: [] },
  { id: "mouser",     name: "Mouser",     region: "Global", url: "https://mouser.com",     categories: [] },
  { id: "digikey",    name: "DigiKey",    region: "Global", url: "https://digikey.com",    categories: [] },
  { id: "lcsc",       name: "LCSC",       region: "Global", url: "https://lcsc.com",        categories: [] },
  { id: "misumi",     name: "Misumi",     region: "Global", url: "https://misumi-ec.com",   categories: [] },
  { id: "rs",         name: "RS Components", region: "Global", url: "https://rs-online.com", categories: [] },
];

// ── KI-Shop-Empfehlung nach Region ───────────────────────────────────────────
async function suggestShopsForRegion(country, categories, apiKey) {
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

// ── API Key & Provider Management ────────────────────────────────────────────
const KEY_STORAGE      = "partsdb-api-key";
const PROVIDER_STORAGE = "partsdb-provider";
const ENDPOINT_STORAGE = "partsdb-endpoint";
const getApiKey         = () => { try { return localStorage.getItem(KEY_STORAGE)      || ""; } catch { return ""; } };
const saveApiKey        = (k) => { try { localStorage.setItem(KEY_STORAGE, k);                } catch {} };
const clearApiKey       = () => { try { localStorage.removeItem(KEY_STORAGE);                 } catch {} };
const getProvider       = () => { try { return localStorage.getItem(PROVIDER_STORAGE) || "anthropic"; } catch { return "anthropic"; } };
const saveProvider      = (p) => { try { localStorage.setItem(PROVIDER_STORAGE, p);          } catch {} };
const getCustomEndpoint = () => { try { return localStorage.getItem(ENDPOINT_STORAGE) || ""; } catch { return ""; } };
const saveCustomEndpoint= (u) => { try { localStorage.setItem(ENDPOINT_STORAGE, u);          } catch {} };

const PROVIDERS = {
  anthropic: {
    label: "Anthropic Claude",
    model: "claude-sonnet-4-6",
    endpoint: "https://api.anthropic.com/v1/messages",
    keyPlaceholder: "sk-ant-api03-…",
    keyHint: "Starts with sk-ant-",
    guideUrl: "https://console.anthropic.com/settings/keys",
    guideSteps: ["Go to console.anthropic.com", "Sign in / Create account", "\"API Keys\" → \"Create Key\"", "Copy the key and paste it here"],
  },
  openai: {
    label: "OpenAI (GPT-4o)",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyPlaceholder: "sk-…",
    keyHint: "Starts with sk-",
    guideUrl: "https://platform.openai.com/api-keys",
    guideSteps: ["Go to platform.openai.com", "Sign in / Create account", "\"API Keys\" → \"Create new secret key\"", "Copy the key and paste it here"],
  },
  compatible: {
    label: "OpenAI-compatible (Groq, Ollama, …)",
    model: "llama-3.3-70b-versatile",
    endpoint: "",
    keyPlaceholder: "Provider API key",
    keyHint: "Format depends on provider",
    guideUrl: "",
    guideSteps: ["Enter your API endpoint URL (e.g. https://api.groq.com/openai/v1/chat/completions)", "Enter the provider API key"],
  },
};

function apiHeaders(key) {
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function openaiHeaders(key) {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
}

async function callAI(messages: {role:string,content:string}[], maxTokens: number, apiKey?: string): Promise<string> {
  const key = apiKey ?? getApiKey();
  const provider = getProvider();
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;
  const endpoint = (provider === "compatible" && getCustomEndpoint()) || cfg.endpoint;

  // Route through server-side proxy (avoids CORS + keeps keys safe)
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      maxTokens,
      provider,
      model: cfg.model,
      endpoint: provider === "compatible" ? endpoint : undefined,
      apiKey: key || undefined, // sent only if user configured one manually
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || res.statusText); }
  const data = await res.json();
  return data.text || "";
}

// ── Tavily & Nexar API Keys ───────────────────────────────────────────────────
const TAVILY_KEY_STORAGE  = "partsdb-tavily-key";
const NEXAR_ID_STORAGE    = "partsdb-nexar-id";
const NEXAR_SEC_STORAGE   = "partsdb-nexar-secret";
const NEXAR_TOKEN_STORAGE = "partsdb-nexar-token"; // cache: {token, exp}
const getTavilyKey   = () => { try { return localStorage.getItem(TAVILY_KEY_STORAGE) || ""; } catch { return ""; } };
const saveTavilyKey  = (k) => { try { localStorage.setItem(TAVILY_KEY_STORAGE, k); } catch {} };
const getNexarId     = () => { try { return localStorage.getItem(NEXAR_ID_STORAGE) || ""; } catch { return ""; } };
const saveNexarId    = (k) => { try { localStorage.setItem(NEXAR_ID_STORAGE, k); } catch {} };
const getNexarSecret = () => { try { return localStorage.getItem(NEXAR_SEC_STORAGE) || ""; } catch { return ""; } };
const saveNexarSecret= (k) => { try { localStorage.setItem(NEXAR_SEC_STORAGE, k); } catch {} };

async function getNexarToken(): Promise<string> {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(NEXAR_TOKEN_STORAGE) || "null"); } catch { return null; } })();
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  // Use server-side proxy — credentials come from Vercel env vars or fall back to user's stored keys
  const id = getNexarId(); const sec = getNexarSecret();
  const res = await fetch("/api/nexar-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: id || undefined, clientSecret: sec || undefined }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Nexar token error"); }
  const d = await res.json();
  try { localStorage.setItem(NEXAR_TOKEN_STORAGE, JSON.stringify({ token: d.access_token, exp: Date.now() + d.expires_in * 1000 })); } catch {}
  return d.access_token;
}

async function nexarSearchMpn(mpn: string, name: string): Promise<{distributor:string,url:string,sku:string,price:number|null,stock:number|null,currency:string}[]> {
  const token = await getNexarToken();
  const q = mpn || name;
  const query = `query($q:String!){supSearchMpn(q:$q,limit:3){results{part{mpn sellers(authorizedOnly:false){company{name homepage}offers{sku url inventoryLevel prices{quantity price currency}}}}}}}`;
  const res = await fetch("https://api.nexar.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { q } }),
  });
  if (!res.ok) throw new Error("Nexar API error: " + res.statusText);
  const data = await res.json();
  const results: {distributor:string,url:string,sku:string,price:number|null,stock:number|null,currency:string}[] = [];
  for (const r of data.data?.supSearchMpn?.results || []) {
    for (const seller of r.part?.sellers || []) {
      for (const offer of seller.offers || []) {
        const price1 = offer.prices?.find((p:any) => p.quantity <= 1) || offer.prices?.[0];
        results.push({
          distributor: seller.company?.name || "?",
          url: offer.url || seller.company?.homepage || "",
          sku: offer.sku || "",
          price: price1 ? parseFloat(price1.price) : null,
          stock: offer.inventoryLevel ?? null,
          currency: price1?.currency || "USD",
        });
      }
    }
  }
  return results;
}

async function tavilySearch(query: string, siteFilter?: string): Promise<{title:string,url:string,snippet:string}[]> {
  // Try server-side proxy first (uses TAVILY_API_KEY env var, no client key needed)
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, domain: siteFilter }),
    });
    if (res.ok) { const d = await res.json(); return d.results || []; }
    if (res.status !== 503) { const e = await res.json(); throw new Error(e.error || "Search error"); }
    // 503 = TAVILY_API_KEY not set on server → fall through to client key
  } catch (e: any) {
    if (!e.message?.includes("503") && !e.message?.includes("Search not configured")) throw e;
  }
  // Fall back to user-configured Tavily key
  const key = getTavilyKey();
  if (!key) throw new Error("Live search not available. Ask the app owner to configure TAVILY_API_KEY, or add your own key under 🔑 API Key.");
  const fullQuery = siteFilter ? `${query} site:${siteFilter}` : query;
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query: fullQuery, search_depth: "basic", max_results: 5 }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Tavily error"); }
  const d = await r.json();
  return (d.results || []).map((r:any) => ({ title: r.title, url: r.url, snippet: r.content || "" }));
}

async function tavilySearchAliExpress(query: string): Promise<{title:string,url:string,snippet:string}[]> {
  return tavilySearch(query, "aliexpress.com");
}

async function parseAliExpressResults(part: {name:string,mpn?:string}, webResults: {title:string,url:string,snippet:string}[]): Promise<{storeName:string,productUrl:string,priceEur:number|null,packQty?:number,note:string}[]> {
  if (!webResults.length) return [];
  const prompt = `From these search results for part "${part.mpn || part.name}":
${webResults.map((r,i)=>`${i+1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n")}

Extract offers as a JSON array. Estimate EUR prices from title/snippet. Also look for pack sizes (e.g. "100pcs", "pack of 50", "10er Pack") — set packQty accordingly, default 1.
Reply ONLY with JSON array:
[{"storeName":"Store name or AliExpress","productUrl":"URL","priceEur":1.23,"packQty":10,"note":"e.g. 10pcs, free shipping"}]`;
  const text = await callAI([{ role: "user", content: prompt }], 600);
  const match = text.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

// ── Claude API ────────────────────────────────────────────────────────────────
async function claudeSearch(part, shops, apiKey) {
  const shopList = shops.map(s => `${s.name} (${s.region}, ${s.url})`).join(", ");
  const prompt = `Du bist ein Elektronik-Einkaufsassistent. Für das folgende Bauteil suchst du Bezugsquellen.

Bauteil: ${part.name}
MPN: ${part.mpn || "unbekannt"}
Hersteller: ${part.manufacturer || "unbekannt"}
Beschreibung: ${part.description || ""}
Kategorie: ${part.category || ""}

Verfügbare Shops: ${shopList}

Gib realistische Bezugsquellen als JSON-Array zurück. WICHTIG: Antworte NUR mit einem validen JSON-Array, kein Markdown, keine Erklärung.

Format:
[
  {
    "shopId": "reichelt",
    "shopName": "Reichelt",
    "sku": "z.B. ATM328P-PU",
    "searchUrl": "https://www.reichelt.de/search/...",
    "estimatedPrice": 2.50,
    "currency": "EUR",
    "notes": "z.B. auch als SMD verfügbar"
  }
]

Wenn du eine SKU nicht kennst, schreib "suchen". Gib 2-4 realistische Einträge.`;

  const text = await callAI([{ role: "user", content: prompt }], 1000, apiKey);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Claude Report Parser ──────────────────────────────────────────────────────
async function claudeParseReport(rawText, fileName, apiKey) {
  const prompt = `Du bist ein Experte für Elektronik-Stücklisten (BOM). Dir wird ein Report / eine Datei übergeben.
Dateiname: "${fileName || "unbekannt"}"

Deine Aufgabe: Extrahiere alle Bauteil-Positionen aus dem Report und gib sie als JSON zurück.
Erkenne automatisch das Format (CSV, JSON, Netliste, YAML, Freitext, KiCad, Eagle, Altium, eigenes Format etc.).

WICHTIG: Antworte NUR mit einem validen JSON-Objekt, kein Markdown, keine Erklärung.

Rückgabe-Format:
{
  "format_detected": "z.B. KiCad BOM CSV / Freitext / JSON / Eagle Netliste / …",
  "confidence": "high|medium|low",
  "project_name": "Falls erkennbar aus dem Report, sonst null",
  "notes": "Kurze Beschreibung was erkannt wurde (1 Satz)",
  "fields_found": ["Welche Felder im Report enthalten waren"],
  "items": [
    {
      "name": "Bauteilname/Bezeichnung",
      "mpn": "Hersteller-Teilenummer oder null",
      "manufacturer": "Hersteller oder null",
      "quantity": 1,
      "reference": "Referenzbezeichner z.B. R1,R2 oder null",
      "footprint": "Gehäuse oder null",
      "description": "Beschreibung oder null",
      "category": "Widerstand|Kondensator|IC|Transistor|Diode|LED|Relais|Stecker|Schalter|Sensor|MCU|MOSFET|Modul|Mechanik|Kabel|Sonstiges oder null",
      "value": "Wert z.B. 10k, 100nF oder null",
      "raw": "Original-Zeile/Eintrag aus dem Report"
    }
  ]
}

Wenn quantity nicht angegeben, zähle Referenzbezeichner (R1,R2,R3 = 3) oder setze 1.
Gruppiere identische Bauteile (gleicher Name+Wert) zu einer Position und summiere Mengen.

Report-Inhalt:
---
${rawText.slice(0, 8000)}
---`;

  const text = await callAI([{ role: "user", content: prompt }], 4000, apiKey);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --border2: #484f58;
    --text: #e6edf3;
    --text2: #8b949e;
    --text3: #6e7681;
    --green: #2ea043;
    --green2: #238636;
    --green3: #1a7f37;
    --blue: #4493f8;
    --orange: #bb8009;
    --red: #f85149;
    --purple: #a371f7;
    --accent: #2ea043;
  }

  body { background: var(--bg); color: var(--text); font-family: 'IBM Plex Sans', sans-serif; }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--bg2);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .logo {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
    font-size: 15px;
    color: var(--accent);
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-badge {
    background: var(--green2);
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
    letter-spacing: 0.08em;
  }

  .nav {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .nav-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--text2);
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav-btn:hover { color: var(--text); background: var(--bg3); }
  .nav-btn.active {
    color: var(--text);
    background: var(--bg3);
    border-color: var(--border2);
  }

  .main { flex: 1; padding: 24px; max-width: 1400px; margin: 0 auto; width: 100%; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    gap: 12px;
  }

  .section-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    padding: 2px 8px;
    border-radius: 20px;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--green2);
    color: #fff;
    border-color: var(--green3);
  }
  .btn-primary:hover { background: var(--green3); }

  .btn-secondary {
    background: var(--bg3);
    color: var(--text);
    border-color: var(--border2);
  }
  .btn-secondary:hover { background: var(--border); }

  .btn-ghost {
    background: none;
    color: var(--text2);
    border-color: transparent;
  }
  .btn-ghost:hover { color: var(--text); background: var(--bg3); }

  .btn-danger {
    background: none;
    color: var(--red);
    border-color: transparent;
    padding: 4px 8px;
    font-size: 12px;
  }
  .btn-danger:hover { background: rgba(248,81,73,0.1); }

  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-ai {
    background: #1c2d3f;
    color: #4493f8;
    border-color: #2d4a6b;
  }
  .btn-ai:hover { background: #243548; }
  .btn-ai:disabled { opacity: 0.5; cursor: not-allowed; }

  .table-wrap {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg2);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    background: var(--bg3);
    color: var(--text2);
    font-weight: 500;
    padding: 10px 14px;
    text-align: left;
    font-size: 12px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }

  .mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    font-family: 'IBM Plex Mono', monospace;
  }

  .tag-cat { background: rgba(88,166,255,0.1); color: var(--blue); border: 1px solid rgba(88,166,255,0.2); }
  .tag-shop { background: rgba(63,185,80,0.1); color: var(--green); border: 1px solid rgba(63,185,80,0.2); }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    backdrop-filter: blur(3px);
  }

  .modal {
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 10px;
    padding: 24px;
    width: 580px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-row { margin-bottom: 14px; }
  .form-row label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 5px; font-weight: 500; }
  .form-row input, .form-row select, .form-row textarea {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: border-color 0.15s;
  }
  .form-row input:focus, .form-row select:focus, .form-row textarea:focus {
    outline: none;
    border-color: var(--green);
  }
  .form-row textarea { resize: vertical; min-height: 72px; }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

  .supplier-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 8px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .supplier-card:hover { border-color: var(--border2); }

  .supplier-logo {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: var(--text2);
    flex-shrink: 0;
  }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--text3);
  }

  .empty-state h3 { font-size: 15px; color: var(--text2); margin-bottom: 6px; }
  .empty-state p { font-size: 13px; }

  .search-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .search-input {
    flex: 1;
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .search-input:focus { outline: none; border-color: var(--border2); }

  .project-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .project-card:hover, .project-card.active { border-color: var(--green); }
  .project-card.active { background: rgba(57,211,83,0.04); }

  .pc-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--bg3);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .pc-info { flex: 1 }
  .pc-name { font-weight: 600; font-size: 14px; }
  .pc-meta { font-size: 12px; color: var(--text2); margin-top: 2px; }

  .two-col { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }

  .bom-qty {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 2px 6px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
  }

  .price-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(88,166,255,0.3);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .ai-result {
    background: rgba(88,166,255,0.06);
    border: 1px solid rgba(88,166,255,0.2);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .ai-result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .tabs-inner {
    display: flex;
    gap: 1px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    margin-bottom: 18px;
    width: fit-content;
  }

  .tab-inner-btn {
    background: none;
    border: none;
    color: var(--text2);
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: all 0.15s;
  }

  .tab-inner-btn.active {
    background: var(--bg2);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
    cursor: pointer;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
    transition: all 0.15s;
  }
  .export-btn:hover { color: var(--text); border-color: var(--border2); }

  .info-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .info-chip {
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: var(--text3);
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .drop-zone {
    border: 2px dashed var(--border2);
    border-radius: 10px;
    padding: 40px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg2);
    position: relative;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--green);
    background: rgba(57,211,83,0.04);
  }
  .drop-zone input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .drop-zone-icon { font-size: 32px; margin-bottom: 10px; }
  .drop-zone-text { font-size: 14px; color: var(--text2); margin-bottom: 4px; }
  .drop-zone-sub { font-size: 12px; color: var(--text3); }

  .parse-result-banner {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: rgba(57,211,83,0.06);
    border: 1px solid rgba(57,211,83,0.2);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .parse-result-banner.warn {
    background: rgba(210,153,34,0.08);
    border-color: rgba(210,153,34,0.3);
  }

  .field-chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    background: rgba(188,140,255,0.1);
    color: var(--purple);
    border: 1px solid rgba(188,140,255,0.2);
    font-family: 'IBM Plex Mono', monospace;
    margin: 2px 3px;
  }

  .import-item-row {
    display: grid;
    grid-template-columns: 40px 1fr 80px 80px 80px 80px 40px;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .import-item-row:last-child { border-bottom: none; }
  .import-item-row:hover { background: rgba(255,255,255,0.02); }

  .import-item-row input {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text);
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'IBM Plex Sans', sans-serif;
    width: 100%;
  }
  .import-item-row input:focus {
    outline: none;
    border-color: var(--border2);
    background: var(--bg3);
  }

  .import-steps {
    display: flex;
    gap: 0;
    margin-bottom: 28px;
    position: relative;
  }

  .import-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
    z-index: 1;
  }

  .import-step::before {
    content: '';
    position: absolute;
    top: 16px;
    left: -50%;
    right: 50%;
    height: 2px;
    background: var(--border);
    z-index: -1;
  }
  .import-step:first-child::before { display: none; }

  .step-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    border: 2px solid var(--border);
    background: var(--bg2);
    color: var(--text3);
    transition: all 0.3s;
  }

  .step-circle.done { border-color: var(--green); background: var(--green2); color: #fff; }
  .step-circle.active { border-color: var(--blue); color: var(--blue); background: rgba(88,166,255,0.1); }

  .step-label { font-size: 11px; color: var(--text3); margin-top: 5px; text-align: center; }
  .step-label.active { color: var(--blue); }
  .step-label.done { color: var(--green); }

  .select-proj-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: var(--text3);
    text-align: center;
    gap: 8px;
  }
  .select-proj-hint h3 { color: var(--text2); font-size: 15px; }
  .sync-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block; margin-right: 5px;
    flex-shrink: 0;
  }
  .sync-dot.online  { background: var(--green); animation: pulse 3s ease-in-out infinite; }
  .sync-dot.offline { background: var(--text3); }
  .sync-dot.syncing { background: var(--blue);  animation: spin 1s linear infinite; border-radius: 0; clip-path: circle(50%); }

  .user-chip {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg3); border: 1px solid var(--border2);
    border-radius: 6px; padding: 4px 10px; cursor: pointer;
    font-size: 12px; color: var(--text2); transition: all 0.15s;
  }
  .user-chip:hover { color: var(--text); border-color: var(--border2); }

  .auth-modal-tabs {
    display: flex; border-bottom: 1px solid var(--border); margin-bottom: 20px;
  }
  .auth-tab {
    flex: 1; padding: 10px; text-align: center; cursor: pointer;
    font-size: 13px; font-weight: 500; color: var(--text2);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    background: none; border-top: none; border-left: none; border-right: none;
    font-family: 'IBM Plex Sans', sans-serif; transition: all 0.15s;
  }
  .auth-tab.active { color: var(--green); border-bottom-color: var(--green); }

  .migration-card {
    background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.2);
    border-radius: 8px; padding: 14px 16px; margin-top: 16px; font-size: 13px;
  }

  .beta-bar {
    background: linear-gradient(90deg, rgba(57,211,83,0.08), rgba(88,166,255,0.06));
    border-bottom: 1px solid rgba(57,211,83,0.15);
    padding: 6px 24px; display: flex; align-items: center; gap: 10;
    font-size: 12px; color: var(--text2);
  }
`;

// ── Auth Modal (Login / Register) ─────────────────────────────────────────────
function AuthModal({ onClose, onLoggedIn }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");

  const handle = async () => {
    setLoading(true); setErr(""); setMsg(null);
    try {
      if (tab === "register") {
        const d = await sbAuth("signup", { email, password });
        if (d.error) throw new Error(d.error);
        setMsg("Confirmation email sent! Please confirm your email then sign in.");
      } else {
        const d = await sbAuth("signin", { email, password });
        if (d.error) throw new Error(d.error);
        setSbSession(d.session);
        resetSbClient(); // rebuild client with new access token
        onLoggedIn(d.user);
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <div className="auth-modal-tabs">
          <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setErr(""); setMsg(null); }}>Sign in</button>
          <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setErr(""); setMsg(null); }}>Register</button>
        </div>

        {tab === "register" && (
          <div style={{ background: "rgba(57,211,83,0.06)", border: "1px solid rgba(57,211,83,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
            🎉 <strong style={{ color: "var(--green)" }}>Beta — Cloud sync is free.</strong>{" "}
            Early access users will pay less permanently compared to new customers.
          </div>
        )}

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        <div className="form-row">
          <label>Password {tab === "register" && <span style={{ color: "var(--text3)" }}>(min. 8 characters)</span>}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>⚠️ {err}</div>}
        {msg && <div style={{ color: "var(--green)", fontSize: 12, marginBottom: 10 }}>✓ {msg}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !email || !password} onClick={handle}>
            {loading ? <><span className="spinner" /></> : tab === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Migration Modal ───────────────────────────────────────────────────────────
function MigrationModal({ localData, userId, onDone, onSkip }) {
  const [migrating, setMigrating] = useState(false);
  const [done, setDone] = useState(false);

  const migrate = async () => {
    setMigrating(true);
    const sb = await getSb();
    if (!sb) { onSkip(); return; }
    try {
      if (localData.parts?.length)     await sbUpsert("bm_parts",     localData.parts.map(p => partToSb(p, userId)));
      if (localData.projects?.length)  await sbUpsert("bm_projects",  localData.projects.map(p => projectToSb(p, userId)));
      if (localData.suppliers?.length) await sbUpsert("bm_suppliers", localData.suppliers.map(s => supplierToSb(s, userId)));
      if (localData.bomItems?.length)  await sbUpsert("bm_bom_items", localData.bomItems.map(b => bomItemToSb(b, userId)));
      if (localData.shops?.length)     await sbUpsert("bm_shops",     localData.shops.map(s => shopToSb(s, userId)));
      setDone(true);
    } catch (e) { console.error(e); }
    setMigrating(false);
  };

  const total = (localData.parts?.length || 0) + (localData.projects?.length || 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 460 }}>
        {done ? (
          <>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>☁️</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Migration complete!</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
                All local data has been backed up to the cloud.
              </div>
              <button className="btn btn-primary" onClick={onDone}>Let's go →</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">☁️ Transfer local data to cloud?</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
              Found <strong style={{ color: "var(--text)" }}>{total} local entries</strong>
              ({localData.parts?.length || 0} parts, {localData.projects?.length || 0} projects).
              Transfer them to your cloud account?
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onSkip}>Skip</button>
              <button className="btn btn-primary" disabled={migrating} onClick={migrate}>
                {migrating ? <><span className="spinner" /> Transferring…</> : "☁️ Transfer now"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Onboarding Screen ─────────────────────────────────────────────────────────
function OnboardingScreen({ onDone }) {
  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;

  const testKey = async () => {
    if (!key.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      saveProvider(provider);
      if (provider === "compatible") saveCustomEndpoint(endpoint.trim());
      await callAI([{ role: "user", content: "Hi" }], 5, key.trim());
      saveApiKey(key.trim());
      setTestResult("ok");
      setTimeout(() => onDone(), 800);
    } catch (e) {
      setTestResult("error:" + e.message);
    }
    setTesting(false);
  };

  const card = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column" }}>
      <style>{css}</style>

      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div className="logo"><span>⚡</span><span>PartsDB</span><span className="logo-badge">v1</span></div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, width: "100%" }}>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to PartsDB</h1>
            <p style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.7 }}>
              AI-powered parts database &amp; BOM manager. Your data stays local in the browser.
            </p>
          </div>

          {/* Provider selection */}
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>1. Choose AI provider</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <button key={id} onClick={() => { setProvider(id); setTestResult(null); }}
                  className={provider === id ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ fontSize: 12, padding: "5px 12px" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7, background: "var(--bg3)", borderRadius: 6, padding: "10px 12px" }}>
              {provider === "anthropic" && <><strong style={{ color: "var(--text)" }}>Recommended.</strong> Start free with credits. Approx. <strong style={{ color: "var(--text)" }}>€0.01–0.05 per search</strong>.</>}
              {provider === "openai" && <><strong style={{ color: "var(--text)" }}>OpenAI GPT-4o-mini.</strong> Cheap and fast. Comparable quality for BOM import.</>}
              {provider === "compatible" && <><strong style={{ color: "var(--text)" }}>Groq, Ollama, etc.</strong> Groq has a free tier with very fast latencies.</>}
            </div>
          </div>

          {/* Instructions */}
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>2. Create API key</div>
            {cfg.guideSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13, color: "var(--text2)" }}>
                <span style={{ color: "var(--blue)", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
            {cfg.guideUrl && (
              <a href={cfg.guideUrl} target="_blank" rel="noopener"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--blue)", padding: "6px 14px", borderRadius: 6, fontSize: 13, textDecoration: "none", fontWeight: 500, marginTop: 8 }}>
                🔗 {cfg.guideUrl} ↗
              </a>
            )}
          </div>

          {/* Key input */}
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>3. Enter key &amp; get started</div>
            {provider === "compatible" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Endpoint URL</div>
                <input value={endpoint} onChange={e => { setEndpoint(e.target.value); setTestResult(null); }}
                  placeholder="https://api.groq.com/openai/v1/chat/completions"
                  style={{ width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono", marginBottom: 8 }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={key} onChange={e => { setKey(e.target.value); setTestResult(null); }}
                placeholder={cfg.keyPlaceholder} type="password"
                style={{ flex: 1, background: "var(--bg3)", border: `1px solid ${testResult === "ok" ? "var(--green)" : testResult?.startsWith("error") ? "var(--red)" : "var(--border2)"}`, color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Mono" }}
                onKeyDown={e => e.key === "Enter" && testKey()} />
              <button className="btn btn-primary" onClick={testKey} disabled={testing || !key.trim()}>
                {testing ? <><span className="spinner" />Checking…</> : testResult === "ok" ? "✓ Valid!" : "Confirm"}
              </button>
            </div>
            {testResult?.startsWith("error:") && (
              <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>⚠️ {testResult.replace("error:", "")}</div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--text3)" }} onClick={onDone}>
              Start without AI features →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Help Modal ────────────────────────────────────────────────────────────────
const HELP_SECTIONS = [
  {
    title: "Parts", icon: "🔩",
    items: [
      { q: "How do I add a part?", a: "In the \"Parts\" tab click \"+ Add Part\". Enter name, MPN, and category." },
      { q: "What is the AI supplier search?", a: "Click on a part → \"AI Search\" finds matching shops from your shop list and suggests SKU and price." },
      { q: "How do I select a preferred supplier?", a: "In the part detail under \"Suppliers\" add an entry or save it via the Sourcing search. The preferred supplier will then appear in the BOM." },
    ],
  },
  {
    title: "BOM (Bill of Materials)", icon: "📋",
    items: [
      { q: "How do I create a project?", a: "In the BOM tab click \"+\" or a new project is automatically created during CSV/AI import." },
      { q: "How do I add parts to the BOM?", a: "Select a project → \"+ Add Part\" → choose from the parts database and enter quantity/reference." },
      { q: "Can I export the BOM?", a: "Yes: select a project → \"CSV Export\" in the top right." },
    ],
  },
  {
    title: "Import", icon: "📥",
    items: [
      { q: "Which formats are supported?", a: "CSV Import: KiCad, Eagle, Altium, generic CSV. AI Import: any text files, PDF text, free text — the AI detects the format automatically." },
      { q: "How does AI import work?", a: "In the Import tab select \"AI Analysis\", upload a file or paste text. The AI extracts all parts and shows a preview. Review and then import." },
      { q: "Import shows an empty project?", a: "After importing click \"→ Go to BOM\" — the newly created project will be automatically selected." },
    ],
  },
  {
    title: "Sourcing (AliExpress)", icon: "🛍️",
    items: [
      { q: "How does the vendor search work?", a: "In the Sourcing tab select a project → \"Start Search\". The AI suggests AliExpress vendors for each part (from AI training knowledge, no live web access)." },
      { q: "How do I save a vendor as a supplier?", a: "After searching expand a store → \"Save as Supplier\". The entries then appear in the Parts database as suppliers." },
      { q: "Prices are not current?", a: "The AI estimates prices from training knowledge — these are estimates, not live prices. Always verify on AliExpress." },
    ],
  },
  {
    title: "Shops", icon: "🏪",
    items: [
      { q: "What is the shop list?", a: "In the \"Shops\" tab you manage your preferred suppliers (Reichelt, Mouser, Conrad, AliExpress etc.). The AI search uses this list." },
      { q: "How do I add a shop?", a: "In the Shops tab click \"+ Add Shop\" → enter name, region and URL." },
      { q: "Can AI suggest shops for my region?", a: "Yes: \"Find shops for my region\" → enter your country → the AI suggests regional suppliers you can then add." },
    ],
  },
  {
    title: "API Key & AI", icon: "🔑",
    items: [
      { q: "Which provider is recommended?", a: "Anthropic Claude is most reliable for structured JSON output and BOM parsing. OpenAI GPT-4o-mini is slightly cheaper. Groq is free but less precise for complex BOMs." },
      { q: "What does AI usage cost?", a: "Anthropic: ~€0.01–0.05 per search. OpenAI: similar. Groq: free rate limits. Costs are charged directly by your provider, not by PartsDB." },
      { q: "Where is the key stored?", a: "Exclusively in your browser's localStorage. No server receives your key." },
    ],
  },
];

function HelpModal({ onClose }) {
  const [openSection, setOpenSection] = useState(null);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: "80vh", overflowY: "auto" }}>
        <div className="modal-title">? User Guide</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>
          PartsDB — AI-powered parts database &amp; BOM manager
        </div>
        {HELP_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 8 }}>
            <button onClick={() => setOpenSection(openSection === section.title ? null : section.title)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: openSection === section.title ? "8px 8px 0 0" : 8, padding: "10px 14px", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{section.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{section.title}</span>
              <span style={{ color: "var(--text3)", fontSize: 12 }}>{openSection === section.title ? "▲" : "▼"}</span>
            </button>
            {openSection === section.title && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "0 14px 10px" }}>
                {section.items.map((item, i) => (
                  <div key={i} style={{ padding: "12px 0", borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--blue)" }}>{item.q}</div>
                    <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{item.a}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── API Key Settings Modal ────────────────────────────────────────────────────
function ApiKeyModal({ onClose }) {
  const [section, setSection] = useState<"ai"|"sourcing">("ai");
  const [provider, setProvider] = useState(getProvider());
  const [key, setKey] = useState(getApiKey());
  const [endpoint, setEndpoint] = useState(getCustomEndpoint());
  const [tavilyKey, setTavilyKey] = useState(getTavilyKey());
  const [nexarId, setNexarId] = useState(getNexarId());
  const [nexarSecret, setNexarSecret] = useState(getNexarSecret());
  const [testing, setTesting] = useState(false);
  const [testingSourcing, setTestingSourcing] = useState(false);
  const [result, setResult] = useState(null);
  const [sourcingResult, setSourcingResult] = useState(null);
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;

  const testAndSave = async () => {
    if (!key.trim()) { clearApiKey(); saveProvider(provider); onClose(); return; }
    setTesting(true); setResult(null);
    try {
      saveProvider(provider);
      if (provider === "compatible") saveCustomEndpoint(endpoint.trim());
      await callAI([{ role: "user", content: "Hi" }], 5, key.trim());
      saveApiKey(key.trim());
      setResult("ok");
      setTimeout(onClose, 700);
    } catch (e) { setResult("error:" + e.message); }
    setTesting(false);
  };

  const saveSourcingKeys = async () => {
    setTestingSourcing(true); setSourcingResult(null);
    try {
      if (tavilyKey.trim()) saveTavilyKey(tavilyKey.trim());
      if (nexarId.trim()) saveNexarId(nexarId.trim());
      if (nexarSecret.trim()) saveNexarSecret(nexarSecret.trim());
      if (nexarId.trim() && nexarSecret.trim()) {
        await getNexarToken();
      }
      setSourcingResult("ok");
    } catch (e: any) { setSourcingResult("error:" + e.message); }
    setTestingSourcing(false);
  };

  const rowStyle = { marginBottom: 12 };
  const labelStyle = { fontSize: 12, color: "var(--text2)", marginBottom: 4, display: "block" as const };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 540, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="modal-title">🔑 API Keys</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
          All keys are stored locally in your browser (localStorage) only, never transmitted to any server.
        </div>

        {/* Section Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <button onClick={() => setSection("ai")} className={section === "ai" ? "btn btn-primary" : "btn btn-secondary"} style={{ fontSize: 13 }}>
            🤖 AI Provider
          </button>
          <button onClick={() => setSection("sourcing")} className={section === "sourcing" ? "btn btn-primary" : "btn btn-secondary"} style={{ fontSize: 13 }}>
            🛍️ Live Sourcing
            {(getNexarId() || getTavilyKey()) && <span style={{ marginLeft: 4, fontSize: 10, color: "var(--green)" }}>✓</span>}
          </button>
        </div>

        {section === "ai" && <>
          {/* Provider Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <button key={id} onClick={() => { setProvider(id); setResult(null); }}
                className={provider === id ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: 12, padding: "5px 12px" }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Instructions */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text2)" }}>How to get your API key:</div>
            {cfg.guideSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, color: "var(--text2)" }}>
                <span style={{ color: "var(--blue)", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
            {cfg.guideUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={cfg.guideUrl} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12 }}>
                  → {cfg.guideUrl} ↗
                </a>
              </div>
            )}
          </div>

          {provider === "compatible" && (
            <div style={rowStyle}>
              <label style={labelStyle}>Endpoint URL</label>
              <input value={endpoint} onChange={e => { setEndpoint(e.target.value); setResult(null); }}
                placeholder="https://api.groq.com/openai/v1/chat/completions"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
            </div>
          )}

          <div style={rowStyle}>
            <label style={labelStyle}>API Key ({cfg.keyHint})</label>
            <input value={key} onChange={e => { setKey(e.target.value); setResult(null); }} type="password"
              placeholder={cfg.keyPlaceholder} style={{ fontFamily: "IBM Plex Mono", width: "100%" }}
              onKeyDown={e => e.key === "Enter" && testAndSave()} />
          </div>

          {result === "ok" && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>✓ Key valid and saved!</div>}
          {result?.startsWith("error:") && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>⚠️ {result.replace("error:", "")}</div>}

          <div className="modal-actions">
            {getApiKey() && <button className="btn btn-danger" style={{ marginRight: "auto", padding: "6px 12px", fontSize: 13 }}
              onClick={() => { clearApiKey(); onClose(); }}>Remove key</button>}
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={testing} onClick={testAndSave}>
              {testing ? <><span className="spinner" /> Checking…</> : "Save & test"}
            </button>
          </div>
        </>}

        {section === "sourcing" && <>
          {/* Nexar */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🏭 Nexar / Octopart</div>
            <div style={{ color: "var(--text2)", marginBottom: 8 }}>Real stock levels from Mouser, DigiKey, LCSC, Farnell and others.</div>
            <div style={{ color: "var(--text3)", lineHeight: 1.6 }}>
              1. <a href="https://nexar.com/sign-up" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>nexar.com/sign-up ↗</a><br />
              2. Sign in → <strong>Applications</strong> → <strong>New Application</strong><br />
              3. Copy Client ID and Client Secret
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Nexar Client ID</label>
            <input value={nexarId} onChange={e => { setNexarId(e.target.value); setSourcingResult(null); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Nexar Client Secret</label>
            <input value={nexarSecret} onChange={e => { setNexarSecret(e.target.value); setSourcingResult(null); }} type="password"
              placeholder="Client Secret" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />

          {/* Tavily */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🔍 Tavily (AliExpress live search)</div>
            <div style={{ color: "var(--text2)", marginBottom: 8 }}>Searches live on AliExpress — 1,000 searches/month free.</div>
            <div style={{ color: "var(--text3)", lineHeight: 1.6 }}>
              1. <a href="https://app.tavily.com" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>app.tavily.com ↗</a><br />
              2. Create account → Copy API key
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Tavily API Key</label>
            <input value={tavilyKey} onChange={e => { setTavilyKey(e.target.value); setSourcingResult(null); }}
              placeholder="tvly-…" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>

          {sourcingResult === "ok" && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>✓ Keys saved{nexarId && nexarSecret ? " — Nexar token successfully retrieved!" : "!"}</div>}
          {sourcingResult?.startsWith("error:") && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>⚠️ {sourcingResult.replace("error:", "")}</div>}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={testingSourcing} onClick={saveSourcingKeys}>
              {testingSourcing ? <><span className="spinner" /> Checking…</> : "Save"}
            </button>
          </div>
        </>}

      </div>
    </div>
  );
}

// ── Haupt-App ─────────────────────────────────────────────────────────────────
export default function SourcedApp() {
  const [tab, setTab] = useState("bom");
  const [parts, setParts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [bomItems, setBomItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [shops, setShops] = useState(DEFAULT_SHOPS);
  const [loaded, setLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(!!getApiKey());
  const [user, setUser] = useState(null);
  const [syncState, setSyncState] = useState("offline");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [localDataForMigration, setLocalDataForMigration] = useState(null);

  useEffect(() => {
    (async () => {
      let cloudUser = null;
      try {
        const session = getSbSession();
        if (session?.access_token) {
          const d = await sbAuth("getuser", { accessToken: session.access_token });
          cloudUser = d?.user || null;
          if (!cloudUser) setSbSession(null); // expired session
        }
      } catch {}
      // Always load localStorage first — this is the guaranteed local copy
      const [lp, lpr, lb, ls, lsh] = await Promise.all([
        loadLocal(STORAGE_KEYS.parts), loadLocal(STORAGE_KEYS.projects),
        loadLocal(STORAGE_KEYS.bomItems), loadLocal(STORAGE_KEYS.suppliers),
        loadLocal(STORAGE_KEYS.shops, DEFAULT_SHOPS),
      ]);
      setParts(lp); setProjects(lpr); setBomItems(lb); setSuppliers(ls); setShops(lsh);

      if (cloudUser) {
        setUser(cloudUser); setSyncState("syncing");
        const cloud = await sbLoadAll(cloudUser.id);
        if (cloud) {
          setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems);
          setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops);
          setSyncState("online");
        } else {
          setSyncState("offline"); // Tables not set up yet — local data already loaded above
        }
      }
      setLoaded(true);
      if (!getApiKey()) {
        // Skip onboarding if server already has an AI key configured
        const serverHasAI = await fetch("/api/config").then(r => r.ok ? r.json() : {}).then(d => !!d.hasServerAI).catch(() => false);
        if (!serverHasAI) setShowOnboarding(true);
        else setApiKeySet(true); // server key counts as "key set"
      }
    })().catch(() => setLoaded(true));
  }, []);

  const [pendingBomProjectId, setPendingBomProjectId] = useState<string|null>(null);
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail;
      if (d && typeof d === "object") {
        setTab(d.tab);
        if (d.projectId) setPendingBomProjectId(d.projectId);
      } else {
        setTab(d);
      }
    };
    window.addEventListener("switchTab", handler);
    return () => window.removeEventListener("switchTab", handler);
  }, []);

  const sync = (table, rows, mapper) => {
    if (!user) return;
    setSyncState("syncing");
    sbUpsert(table, rows.map(r => mapper(r, user.id)))
      .then(() => setSyncState("online"))
      .catch(() => setSyncState("offline"));
  };

  const saveParts     = (v) => { setParts(v);     saveLocal(STORAGE_KEYS.parts,     v); sync("bm_parts",     v, partToSb); };
  const saveProjects  = (v) => { setProjects(v);  saveLocal(STORAGE_KEYS.projects,  v); sync("bm_projects",  v, projectToSb); };
  const saveBom       = (v) => { setBomItems(v);  saveLocal(STORAGE_KEYS.bomItems,  v); sync("bm_bom_items", v, bomItemToSb); };
  const saveSuppliers = (v) => { setSuppliers(v); saveLocal(STORAGE_KEYS.suppliers, v); sync("bm_suppliers", v, supplierToSb); };
  const saveShops     = (v) => { setShops(v);     saveLocal(STORAGE_KEYS.shops,     v); sync("bm_shops",     v, shopToSb); };

  const handleLoggedIn = async (u) => {
    setUser(u); setShowAuthModal(false);
    const [p, pr, b, s, sh] = await Promise.all([loadLocal(STORAGE_KEYS.parts), loadLocal(STORAGE_KEYS.projects), loadLocal(STORAGE_KEYS.bomItems), loadLocal(STORAGE_KEYS.suppliers), loadLocal(STORAGE_KEYS.shops, [])]);
    if (p.length > 0 || pr.length > 0) {
      setLocalDataForMigration({ parts: p, projects: pr, bomItems: b, suppliers: s, shops: sh });
      setShowMigration(true);
    } else {
      setSyncState("syncing");
      const cloud = await sbLoadAll(u.id);
      if (cloud) { setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems); setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops); setSyncState("online"); }
    }
  };

  const handleLogout = async () => {
    const session = getSbSession();
    if (session?.access_token) sbAuth("signout", { accessToken: session.access_token }).catch(() => {});
    setSbSession(null); resetSbClient(); setUser(null); setSyncState("offline");
  };

  const handleMigrationDone = async () => {
    setShowMigration(false); setSyncState("syncing");
    const cloud = await sbLoadAll(user.id);
    if (cloud) { setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems); setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops); setSyncState("online"); }
  };

  if (!loaded) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117", color:"#4493f8", fontFamily:"IBM Plex Mono, monospace", fontSize:13 }}>
      <div style={{ textAlign:"center" }}><div className="spinner" style={{ width:24, height:24, margin:"0 auto 12px" }} />Loading…</div>
    </div>
  );

  if (showOnboarding) return <OnboardingScreen onDone={() => { setShowOnboarding(false); setApiKeySet(!!getApiKey()); }} />;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <header className="header">
          <div className="logo"><span>⚡</span><span>PartsDB</span><span className="logo-badge">v1</span></div>
          <nav className="nav">
            {[
              { id: "bom",      label: "BOM" },
              { id: "parts",    label: "Parts" },
              { id: "shops",    label: "Shops" },
              { id: "import",   label: "Import" },
            ].map(n => (
              <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Cloud / Auth */}
          {user ? (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color: syncState==="online" ? "var(--green)" : syncState==="syncing" ? "var(--blue)" : "var(--text3)" }}>
                <span className={`sync-dot ${syncState}`} />
                {syncState === "online" ? "Sync ✓" : syncState === "syncing" ? "Sync…" : "Offline"}
              </div>
              <button className="user-chip" onClick={handleLogout} title="Sign out">
                👤 {user.email?.split("@")[0]} ×
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAuthModal(true)}>
              ☁️ Sign in / Register
            </button>
          )}

          {/* Help */}
          <button onClick={() => setShowHelpModal(true)}
            style={{ display:"flex", alignItems:"center", gap:4, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:12, color:"var(--text2)", fontFamily:"IBM Plex Sans" }}>
            ? Help
          </button>

          {/* API Key */}
          <button onClick={() => setShowKeyModal(true)}
            style={{ display:"flex", alignItems:"center", gap:6, background: apiKeySet ? "rgba(57,211,83,0.1)" : "rgba(248,81,73,0.1)", border:`1px solid ${apiKeySet ? "rgba(57,211,83,0.3)" : "rgba(248,81,73,0.3)"}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:12, color: apiKeySet ? "var(--green)" : "var(--red)", fontFamily:"IBM Plex Sans" }}>
            {apiKeySet ? "🔑 API Key" : "⚠️ Key missing"}
          </button>
        </header>

        {!user && (
          <div className="beta-bar">
            <span className="sync-dot offline" style={{ marginRight:6 }} />
            Stored locally ·{" "}
            <strong style={{ color:"var(--green)", marginLeft:4, marginRight:8 }}>Cloud sync free during beta</strong>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setShowAuthModal(true)}>
              ☁️ Activate now →
            </button>
          </div>
        )}

        <main className="main">
          {tab === "parts"    && <PartsTab    parts={parts} saveParts={saveParts} suppliers={suppliers} saveSuppliers={saveSuppliers} shops={shops} />}
          {tab === "bom"      && <BomTab      projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} parts={parts} saveParts={saveParts} suppliers={suppliers} saveSuppliers={saveSuppliers} shops={shops} initialProjectId={pendingBomProjectId} />}
          {tab === "import"   && <ImportTab   parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />}
          {tab === "shops"    && <ShopsTab    shops={shops} saveShops={saveShops} />}
        </main>

        {showKeyModal  && <ApiKeyModal onClose={() => { setShowKeyModal(false); setApiKeySet(!!getApiKey()); }} />}
        {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLoggedIn={handleLoggedIn} />}
        {showMigration && localDataForMigration && user && (
          <MigrationModal localData={localDataForMigration} userId={user.id} onDone={handleMigrationDone} onSkip={() => setShowMigration(false)} />
        )}
      </div>
    </>
  );
}

// ── Parts Tab ─────────────────────────────────────────────────────────────────
function PartsTab({ parts, saveParts, suppliers, saveSuppliers, shops }) {
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [detailPart, setDetailPart] = useState(null);

  const cats = [...new Set(parts.map(p => {
    const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
    return tmpl ? tmpl.group : (p.category || null);
  }).filter(Boolean))];

  const filtered = parts.filter(p => {
    const q = query.toLowerCase();
    const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
    const matchQ = !q || p.name?.toLowerCase().includes(q) || p.mpn?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.manufacturer?.toLowerCase().includes(q);
    const partCat = tmpl ? tmpl.group : p.category;
    const matchC = !catFilter || partCat === catFilter;
    return matchQ && matchC;
  });

  const handleSave = (part) => {
    if (part.id) {
      saveParts(parts.map(p => p.id === part.id ? part : p));
    } else {
      saveParts([...parts, { ...part, id: Date.now().toString() }]);
    }
    setShowAdd(false); setEditPart(null);
  };

  const handleDelete = (id) => {
    if (!confirm("Delete part?")) return;
    saveParts(parts.filter(p => p.id !== id));
    saveSuppliers(suppliers.filter(s => s.partId !== id));
  };

  const partSuppliers = (id) => suppliers.filter(s => s.partId === id);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🗄️ Parts Database
          <span className="badge">{parts.length} entries</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Part</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by name, MPN, manufacturer…" value={query} onChange={e => setQuery(e.target.value)} />
        <select style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", padding: "7px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
          value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => {
            const g = PART_GROUPS.find(g => g.id === c);
            return <option key={c} value={c}>{g ? `${g.icon} ${g.label}` : c}</option>;
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No parts {parts.length > 0 ? "found" : "yet"}</h3>
          <p>{parts.length === 0 ? "Add your first part." : "Try different search terms."}</p>
        </div>
      ) : (
          <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name / Description</th>
                    <th>Category</th>
                    <th>MPN</th>
                    <th>Key values</th>
                    <th>Stock</th>
                    <th>Suppliers</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
                    const sups = partSuppliers(p.id);
                    const lowestPrice = sups.reduce((m, s) => s.price && s.price < m ? s.price : m, Infinity);
                    const attrs = p.attributes || {};
                    // Show first 2 key attributes
                    const keyAttrs = tmpl?.fields.slice(0, 2).map(f => attrs[f.key] ? `${f.label}: ${attrs[f.key]}${f.unit ? " " + f.unit : ""}` : null).filter(Boolean) || [];
                    const stockWarn = p.stockMin > 0 && (p.stock || 0) <= p.stockMin;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                          {p.description && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.description}</div>}
                        </td>
                        <td>
                          {tmpl ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${tmpl.color}15`, border: `1px solid ${tmpl.color}40`, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 500, color: tmpl.color }}>
                              {tmpl.icon} {tmpl.name}
                            </span>
                          ) : p.category ? <span className="tag tag-cat">{p.category}</span> : "—"}
                        </td>
                        <td><span className="mono">{p.mpn || "—"}</span></td>
                        <td>
                          <div style={{ fontSize: 11, color: "var(--text2)" }}>
                            {keyAttrs.length > 0 ? keyAttrs.map((a, i) => <div key={i}>{a}</div>) : "—"}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {p.drawer && (
                              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, background: "rgba(88,166,255,0.1)", color: "var(--blue)", padding: "1px 6px", borderRadius: 4 }}>
                                📦 {p.drawer}
                              </span>
                            )}
                            {(p.stock !== undefined && p.stock !== null) && (
                              <span style={{ fontSize: 11, color: stockWarn ? "var(--orange)" : "var(--text3)" }}>
                                {stockWarn ? "⚠️" : ""} {p.stock} pcs{p.stockMin > 0 ? ` / min. ${p.stockMin}` : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, color: sups.length ? "var(--green)" : "var(--text3)" }}>
                              {sups.length} Shop{sups.length !== 1 ? "s" : ""}
                            </span>
                            {lowestPrice < Infinity && <span className="price-tag">ab {lowestPrice.toFixed(2)}€</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setDetailPart(p)}>Detail</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditPart(p)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {(showAdd || editPart) && (
        <PartModal part={editPart} onSave={handleSave} onClose={() => { setShowAdd(false); setEditPart(null); }} />
      )}

      {detailPart && (
        <PartDetailModal
          part={detailPart}
          suppliers={partSuppliers(detailPart.id)}
          shops={shops}
          onClose={() => setDetailPart(null)}
          onSaveSuppliers={(sups) => {
            const other = suppliers.filter(s => s.partId !== detailPart.id);
            saveSuppliers([...other, ...sups]);
          }}
        />
      )}
    </div>
  );
}

// ── Part Modal (Template-aware) ───────────────────────────────────────────────
function PartModal({ part, onSave, onClose }) {
  const [step, setStep] = useState(part ? "form" : "template");
  const [selectedTemplate, setSelectedTemplate] = useState(
    part?.templateId ? BUILTIN_TEMPLATES.find(t => t.id === part.templateId) || null : null
  );
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [form, setForm] = useState(part || {
    name: "", mpn: "", manufacturer: "", description: "",
    notes: "", datasheet: "", drawer: "", stock: 0, stockMin: 0,
    templateId: null, partType: "other",
  });
  const [attrs, setAttrs] = useState(part?.attributes || {});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAttr = (k, v) => setAttrs(a => ({ ...a, [k]: v }));

  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    setForm(f => ({ ...f, templateId: tmpl.id, partType: tmpl.group }));
    setStep("form");
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    setForm(f => ({ ...f, templateId: null, partType: "other" }));
    setStep("form");
  };

  const handleSave = () => {
    if (!form.name) return;
    onSave({ ...form, attributes: attrs });
  };

  const groupedTemplates = PART_GROUPS.map(g => ({
    ...g,
    templates: BUILTIN_TEMPLATES.filter(t => t.group === g.id),
  })).filter(g => g.templates.length > 0);

  // ── Step 1: Template wählen ──
  if (step === "template") return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxHeight: "88vh" }}>
        <div className="modal-title">➕ New Part — Choose Category</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          Select a category for optimal fields, or skip for a blank form.
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", marginBottom: 14 }}>
          {groupedTemplates.map(g => (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{g.icon}</span> {g.label.toUpperCase()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {g.templates.map(t => (
                  <div key={t.id} onClick={() => handleSelectTemplate(t)}
                    style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 5 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = `${t.color}15`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg3)"; }}>
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{t.fields.length} fields</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={handleSkipTemplate} style={{ fontSize: 12, color: "var(--text3)" }}>
            Continue without category →
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Formular ──
  const fields = selectedTemplate?.fields || [];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620, maxHeight: "90vh" }}>
        <div className="modal-title" style={{ gap: 10 }}>
          {selectedTemplate && (
            <span style={{ background: `${selectedTemplate.color}20`, border: `1px solid ${selectedTemplate.color}50`, borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>
              {selectedTemplate.icon} {selectedTemplate.name}
            </span>
          )}
          {part ? "Edit Part" : "New Part"}
          {!part && <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", fontSize: 11 }} onClick={() => setStep("template")}>← Change category</button>}
        </div>

        <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
          {/* Basis-Felder */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 8 }}>GENERAL</div>
          <div className="form-grid">
            <div className="form-row" style={{ gridColumn: "1 / -1" }}>
              <label>Name / Designation *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder={selectedTemplate ? `e.g. ${selectedTemplate.name} XYZ` : "Part name"} autoFocus />
            </div>
            <div className="form-row">
              <label>MPN / Part number</label>
              <input value={form.mpn || ""} onChange={e => set("mpn", e.target.value)} className="mono" placeholder="Order number / Standard" />
            </div>
            <div className="form-row">
              <label>Manufacturer</label>
              <input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} />
            </div>
          </div>

          {/* Template-spezifische Felder */}
          {fields.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>
                {selectedTemplate.icon} {selectedTemplate.name.toUpperCase()} — TECHNICAL DATA
              </div>
              <div className="form-grid">
                {fields.map(f => (
                  <div className="form-row" key={f.key}>
                    <label>
                      {f.label}
                      {f.unit && <span style={{ color: "var(--text3)", marginLeft: 4 }}>({f.unit})</span>}
                      {f.required && <span style={{ color: "var(--red)", marginLeft: 3 }}>*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)}>
                        <option value="">— select —</option>
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "number" ? (
                      <input type="number" step="any" value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)} placeholder={f.hint || ""} />
                    ) : (
                      <input value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)} placeholder={f.hint || ""} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Lager */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>INVENTORY</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Storage location / Drawer</label>
              <input value={form.drawer || ""} onChange={e => set("drawer", e.target.value)} placeholder="e.g. A3, Drawer 7, Shelf B2" className="mono" />
            </div>
            <div className="form-row">
              <label>Stock quantity</label>
              <input type="number" min="0" value={form.stock || 0} onChange={e => set("stock", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Minimum stock</label>
              <input type="number" min="0" value={form.stockMin || 0} onChange={e => set("stockMin", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Datasheet URL</label>
              <input value={form.datasheet || ""} onChange={e => set("datasheet", e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} style={{ minHeight: 56 }} placeholder="Internal notes, alternatives…" />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.name}>
            {part ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Part Detail Modal (Lieferanten + AI) ─────────────────────────────────────
function PartDetailModal({ part, suppliers, shops, onClose, onSaveSuppliers }) {
  const [sups, setSups] = useState(suppliers.map(s => ({ ...s })));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [addSupForm, setAddSupForm] = useState(null);

  const handleAiSearch = async () => {
    setAiLoading(true); setAiError("");
    try {
      const results = await claudeSearch(part, shops, getApiKey());
      const newSups = results.map(r => ({
        id: Date.now().toString() + Math.random(),
        partId: part.id,
        shopId: r.shopId || "",
        shopName: r.shopName || "",
        sku: r.sku || "",
        searchUrl: r.searchUrl || "",
        price: r.estimatedPrice || null,
        currency: r.currency || "EUR",
        notes: r.notes || "",
        aiGenerated: true,
      }));
      const merged = [...sups.filter(s => !s.aiGenerated), ...newSups];
      setSups(merged);
      onSaveSuppliers(merged);
    } catch (e) {
      setAiError("AI search failed: " + e.message);
    }
    setAiLoading(false);
  };

  const deleteSup = (id) => {
    const updated = sups.filter(s => s.id !== id);
    setSups(updated); onSaveSuppliers(updated);
  };

  const saveSup = (sup) => {
    let updated;
    if (sup.id && sups.find(s => s.id === sup.id)) {
      updated = sups.map(s => s.id === sup.id ? sup : s);
    } else {
      updated = [...sups, { ...sup, id: Date.now().toString(), partId: part.id, aiGenerated: false }];
    }
    setSups(updated); onSaveSuppliers(updated); setAddSupForm(null);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 660 }}>
        <div className="modal-title">
          🔍 {part.name}
          {part.mpn && <span className="mono" style={{ color: "var(--text2)", fontSize: 13 }}>({part.mpn})</span>}
        </div>

        <div style={{ background: "var(--bg3)", borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 12, color: "var(--text2)" }}>
          <div className="info-row">
            {part.manufacturer && <span className="info-chip">🏭 {part.manufacturer}</span>}
            {part.category && <span className="info-chip">📦 {part.category}</span>}
            {part.footprint && <span className="info-chip">📐 {part.footprint}</span>}
          </div>
          {part.description && <div style={{ marginTop: 6, fontSize: 12 }}>{part.description}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>🏪 Sources ({sups.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddSupForm({ shopName: "", sku: "", searchUrl: "", price: "", currency: "EUR", notes: "" })}>+ Manual</button>
            <button className="btn btn-ai btn-sm" onClick={handleAiSearch} disabled={aiLoading}>
              {aiLoading ? <><span className="spinner" /> Searching…</> : "🤖 AI Search"}
            </button>
          </div>
        </div>

        {aiError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{aiError}</div>}

        {sups.length === 0 && !addSupForm && (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text3)", fontSize: 13 }}>
            No sources yet. Click <strong>AI Search</strong> to find shops automatically.
          </div>
        )}

        {sups.map(s => (
          <div key={s.id} className="supplier-card">
            <div className="supplier-logo">{(s.shopName || "?").slice(0, 3).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.shopName}</span>
                {s.aiGenerated && <span style={{ fontSize: 10, background: "rgba(88,166,255,0.15)", color: "var(--blue)", padding: "1px 6px", borderRadius: 4 }}>AI</span>}
                {s.sku && <span className="mono" style={{ color: "var(--text2)", fontSize: 11 }}>#{s.sku}</span>}
                {s.price && <span className="price-tag">{s.price.toFixed(2)} {s.currency}</span>}
              </div>
              {s.notes && <div style={{ fontSize: 11, color: "var(--text2)" }}>{s.notes}</div>}
              {s.searchUrl && (
                <a href={s.searchUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                  🔗 {s.searchUrl.slice(0, 55)}{s.searchUrl.length > 55 ? "…" : ""}
                </a>
              )}
            </div>
            <button className="btn btn-danger" onClick={() => deleteSup(s.id)}>✕</button>
          </div>
        ))}

        {addSupForm && (
          <AddSupplierForm form={addSupForm} shops={shops} onChange={setAddSupForm} onSave={saveSup} onCancel={() => setAddSupForm(null)} />
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function AddSupplierForm({ form, shops, onChange, onSave, onCancel }) {
  const set = (k, v) => onChange(f => ({ ...f, [k]: v }));
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>+ Add source</div>
      <div className="form-grid">
        <div className="form-row">
          <label>Shop</label>
          <select value={form.shopId || ""} onChange={e => {
            const sh = shops.find(s => s.id === e.target.value);
            onChange(f => ({ ...f, shopId: e.target.value, shopName: sh?.name || f.shopName }));
          }}>
            <option value="">Custom shop</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Shop name</label>
          <input value={form.shopName} onChange={e => set("shopName", e.target.value)} placeholder="e.g. Reichelt" />
        </div>
        <div className="form-row">
          <label>Order no. / SKU</label>
          <input value={form.sku} onChange={e => set("sku", e.target.value)} className="mono" placeholder="e.g. ATM328P-PU" />
        </div>
        <div className="form-row">
          <label>Price (€)</label>
          <input type="number" step="0.01" value={form.price} onChange={e => set("price", parseFloat(e.target.value) || "")} placeholder="2.50" />
        </div>
      </div>
      <div className="form-row">
        <label>Link to page</label>
        <input value={form.searchUrl} onChange={e => set("searchUrl", e.target.value)} placeholder="https://…" />
      </div>
      <div className="form-row">
        <label>Notes</label>
        <input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Availability, lead time, …" />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  );
}

// ── AI Supplier Suggestion ────────────────────────────────────────────────────
async function suggestBestSupplier(part, suppliers) {
  const supList = suppliers.map(s => `${s.shopName} (SKU: ${s.sku || "unbekannt"}, Preis: ${s.price ? s.price + "€" : "unbekannt"})`).join("\n");
  const prompt = `Du bist ein Elektronik-Einkaufsexperte. Empfehle den besten Shop für dieses Bauteil.

Bauteil: ${part.name}
MPN: ${part.mpn || "unbekannt"}
Kategorie: ${part.category || "unbekannt"}
Gehäuse: ${part.footprint || "unbekannt"}
Beschreibung: ${part.description || ""}

Verfügbare Lieferanten:
${supList}

Wichtige Regeln:
- Hochwertige ICs, MCUs, spezifische Halbleiter → bevorzuge Reichelt, Mouser, DigiKey, LCSC (keine AliExpress-Kopien)
- Passive Bauteile (Widerstände, Kondensatoren) → AliExpress, LCSC oft ok
- Mechanik, Stecker, Kabel → AliExpress, Conrad ok
- Für Hobbyprojekte → günstiger Shop bevorzugen
- Für Serienproduktion → zertifizierter Lieferant bevorzugen

Antworte NUR mit JSON:
{
  "recommendedShopName": "Name des empfohlenen Shops",
  "reason": "1 Satz Begründung",
  "warning": "Optionale Warnung z.B. bei AliExpress-IC-Risiko, sonst null"
}`;

  const text = await callAI([{ role: "user", content: prompt }], 300);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Supplier Dropdown Component ───────────────────────────────────────────────
function SupplierDropdown({ item, part, suppliers, shops, onSelectShop }) {
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");

  if (!part) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;

  const shopId = item.preferredShopId || null;
  const isAli = shopId === "aliexpress";
  const isCustom = shopId?.startsWith("custom:");
  const customLabel = isCustom ? shopId.replace(/^custom:/, "") : "";
  const hasSelection = !!shopId;

  const matchedSupplier = suppliers.find(s => {
    if (s.partId !== part.id) return false;
    if (isAli) return s.shopName?.toLowerCase().includes("aliexpress");
    if (isCustom) return s.shopName?.toLowerCase() === customLabel.toLowerCase();
    const shop = shops.find(sh => sh.id === shopId);
    return s.shopId === shopId || s.shopName?.toLowerCase() === shop?.name?.toLowerCase();
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {!customMode ? (
        <select
          value={shopId || ""}
          onChange={e => {
            const val = e.target.value;
            if (val === "_custom_") { setCustomMode(true); setCustomName(""); }
            else onSelectShop(val || null);
          }}
          style={{
            width: "100%",
            background: hasSelection ? "rgba(57,211,83,0.08)" : "var(--bg3)",
            border: `1px solid ${hasSelection ? "rgba(57,211,83,0.35)" : "var(--border)"}`,
            color: hasSelection ? "var(--text)" : "var(--text3)",
            padding: "4px 7px",
            borderRadius: 5,
            fontSize: 12,
            fontFamily: "IBM Plex Sans",
            cursor: "pointer",
          }}
        >
          <option value="">— No preference —</option>
          {shops.length > 0 && (
            <optgroup label="My shops">
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Other">
            <option value="aliexpress">AliExpress</option>
            <option value="_custom_">Custom shop…</option>
          </optgroup>
          {isCustom && <option value={shopId}>{customLabel}</option>}
        </select>
      ) : (
        <input
          autoFocus
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          placeholder="Shop name or URL…"
          onKeyDown={e => {
            if (e.key === "Enter" && customName.trim()) { onSelectShop(`custom:${customName.trim()}`); setCustomMode(false); }
            if (e.key === "Escape") { setCustomMode(false); }
          }}
          onBlur={() => { if (customName.trim()) onSelectShop(`custom:${customName.trim()}`); setCustomMode(false); }}
          style={{ width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "4px 7px", borderRadius: 5, fontSize: 12, fontFamily: "IBM Plex Sans" }}
        />
      )}
      {hasSelection && matchedSupplier?.price && (
        <div style={{ fontSize: 10, color: "var(--green)" }}>✓ {matchedSupplier.price.toFixed(2)} €{matchedSupplier.sku ? ` · ${matchedSupplier.sku}` : ""}</div>
      )}
      {hasSelection && !matchedSupplier && (
        <div style={{ fontSize: 10, color: "var(--text3)" }}>No price yet — use 🔍 Search</div>
      )}
    </div>
  );
}

// ── BOM Tab ───────────────────────────────────────────────────────────────────
function BomTab({ projects, saveProjects, bomItems, saveBom, parts, saveParts, suppliers, saveSuppliers, shops, initialProjectId = null }) {
  const [activeProject, setActiveProject] = useState(null);

  useEffect(() => {
    if (initialProjectId) {
      const p = projects.find(p => p.id === initialProjectId);
      if (p) setActiveProject(p);
    }
  }, [initialProjectId]);
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [showAddPart, setShowAddPart] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{done:number,total:number,current:string}|null>(null);

  const projectBom = bomItems.filter(b => b.projectId === activeProject?.id);

  const createProject = () => {
    if (!newProjName.trim()) return;
    const p = { id: Date.now().toString(), name: newProjName.trim(), created: new Date().toISOString() };
    saveProjects([...projects, p]);
    setActiveProject(p); setNewProjName(""); setShowNewProj(false);
  };

  const deleteProject = (id) => {
    if (!confirm("Delete project and all BOM entries?")) return;
    saveProjects(projects.filter(p => p.id !== id));
    saveBom(bomItems.filter(b => b.projectId !== id));
    if (activeProject?.id === id) setActiveProject(null);
  };

  const addBomItem = (item) => {
    const exists = projectBom.find(b => b.partId === item.partId);
    if (exists) {
      saveBom(bomItems.map(b => b.id === exists.id ? { ...b, quantity: b.quantity + item.quantity } : b));
    } else {
      saveBom([...bomItems, { ...item, id: Date.now().toString(), projectId: activeProject.id }]);
    }
    setShowAddPart(false);
  };

  const updateItem = (item) => {
    saveBom(bomItems.map(b => b.id === item.id ? item : b));
    setEditItem(null);
  };

  const deleteItem = (id) => {
    saveBom(bomItems.filter(b => b.id !== id));
  };

  const exportCSV = () => {
    if (!activeProject) return;
    const rows = [["Qty", "Reference", "Name", "MPN", "Manufacturer", "Package", "Notes", "Supplier 1", "SKU 1", "Price 1"]];
    projectBom.forEach(item => {
      const part = parts.find(p => p.id === item.partId) || {};
      const sups = suppliers.filter(s => s.partId === item.partId);
      const s1 = sups[0] || {};
      rows.push([item.quantity, item.reference || "", part.name || "", part.mpn || "", part.manufacturer || "", part.footprint || "", item.notes || "", s1.shopName || "", s1.sku || "", s1.price || ""]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOM_${activeProject.name.replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  const getPreferredSupplier = (item, sups) => {
    if (item.preferredShopId) {
      const shopId = item.preferredShopId;
      const isAli = shopId === "aliexpress";
      const isCustom = shopId?.startsWith("custom:");
      const customLabel = isCustom ? shopId.replace(/^custom:/, "") : "";
      const shop = shops.find(s => s.id === shopId);
      return sups.find(s => {
        if (isAli) return s.shopName?.toLowerCase().includes("aliexpress");
        if (isCustom) return s.shopName?.toLowerCase() === customLabel.toLowerCase();
        return s.shopId === shopId || s.shopName?.toLowerCase() === shop?.name?.toLowerCase();
      }) || null;
    }
    return sups.find(s => s.id === item.preferredSupplierId) || null;
  };

  const totalCost = projectBom.reduce((sum, item) => {
    const sups = suppliers.filter(s => s.partId === item.partId);
    const preferred = getPreferredSupplier(item, sups);
    const price = preferred?.price || sups.reduce((m, s) => s.price && s.price < m ? s.price : m, Infinity);
    return sum + (price < Infinity ? price * item.quantity : 0);
  }, 0);

  const searchPrices = async () => {
    const allItems = projectBom.filter(b => b.partId);
    if (!allItems.length) return;
    const hasNexar = !!getNexarId() && !!getNexarSecret();
    const hasTavily = !!getTavilyKey();
    if (!hasNexar && !hasTavily) { alert("Add Nexar or Tavily API keys under 🔑 API Key to enable live price search."); return; }
    setSearching(true);
    const updatedSuppliers = [...suppliers];
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const part = parts.find(p => p.id === item.partId);
      if (!part) continue;
      setSearchProgress({ done: i, total: allItems.length, current: part.name });

      let shopId = item.preferredShopId;

      // Auto-suggest shop if none set
      if (!shopId) {
        if (shops.length > 0) {
          try {
            const fakeSups = shops.map(sh => ({ id: sh.id, shopName: sh.name, partId: part.id }));
            const suggestion = await suggestBestSupplier(part, fakeSups);
            const match = shops.find(sh => sh.name?.toLowerCase().includes(suggestion.recommendedShopName?.toLowerCase()) || suggestion.recommendedShopName?.toLowerCase().includes(sh.name?.toLowerCase()));
            if (match) shopId = match.id;
          } catch {}
        }
        if (!shopId && hasTavily) shopId = "aliexpress";
        if (!shopId) continue;
      }

      const isAli = shopId === "aliexpress";
      const isCustom = shopId?.startsWith("custom:");
      const customLabel = isCustom ? shopId.replace(/^custom:/, "") : "";
      const shop = shops.find(s => s.id === shopId);
      const shopName = isAli ? "AliExpress" : isCustom ? customLabel : (shop?.name || shopId);
      const shopUrl = shop?.url || "";
      try {
        if (!isAli && hasNexar && part.mpn) {
          const offers = await nexarSearchMpn(part.mpn, part.name);
          const match = offers.find(o => shopName && o.distributor?.toLowerCase().includes(shopName.toLowerCase())) || offers[0];
          if (match) {
            const idx = updatedSuppliers.findIndex(s => s.partId === part.id && (s.shopId === shopId || s.shopName?.toLowerCase() === match.distributor?.toLowerCase()));
            const entry = { id: idx >= 0 ? updatedSuppliers[idx].id : (Date.now().toString() + Math.random()), partId: part.id, shopId, shopName: match.distributor, sku: match.sku, price: match.price, currency: match.currency, ai_generated: false, searchUrl: match.url, packQty: 1 };
            if (idx >= 0) updatedSuppliers[idx] = entry; else updatedSuppliers.push(entry);
          }
        } else if ((isAli || !hasNexar) && hasTavily) {
          const query = [part.mpn, part.name].filter(Boolean).join(" ");
          const domain = isAli ? "aliexpress.com" : (shopUrl ? (() => { try { return new URL(shopUrl).hostname.replace(/^www\./, ""); } catch { return null; } })() : null);
          const results = await tavilySearch(query, domain || undefined);
          if (results.length) {
            const parsed = await parseAliExpressResults(part, results);
            if (parsed.length) {
              const s = parsed[0];
              const idx = updatedSuppliers.findIndex(sup => sup.partId === part.id && (sup.shopId === shopId || (isAli && sup.shopName?.toLowerCase().includes("aliexpress"))));
              const entry = { id: idx >= 0 ? updatedSuppliers[idx].id : (Date.now().toString() + Math.random()), partId: part.id, shopId, shopName: s.storeName || shopName, sku: "", price: s.priceEur, currency: "EUR", ai_generated: false, searchUrl: s.productUrl, packQty: s.packQty || 1 };
              if (idx >= 0) updatedSuppliers[idx] = entry; else updatedSuppliers.push(entry);
            }
          }
        }
      } catch {}
    }
    saveSuppliers(updatedSuppliers);
    setSearching(false);
    setSearchProgress(null);
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 BOM Manager</div>
      </div>

      <div className="two-col">
        {/* Projekte */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text2)" }}>PROJECTS</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewProj(true)}>+ New</button>
          </div>

          {showNewProj && (
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <input className="search-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Project name…" value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} autoFocus />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewProj(false)}>✕</button>
                <button className="btn btn-primary btn-sm" onClick={createProject}>Create</button>
              </div>
            </div>
          )}

          {projects.length === 0 && !showNewProj && (
            <div className="empty-state" style={{ padding: 24 }}>
              <h3>No project</h3>
              <p>Create your first project.</p>
            </div>
          )}

          {projects.map(p => {
            const count = bomItems.filter(b => b.projectId === p.id).length;
            return (
              <div key={p.id} className={`project-card ${activeProject?.id === p.id ? "active" : ""}`} onClick={() => setActiveProject(p)}>
                <div className="pc-icon">⚙️</div>
                <div className="pc-info">
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-meta">{count} item{count !== 1 ? "s" : ""} · {new Date(p.created).toLocaleDateString()}</div>
                </div>
                <button className="btn btn-danger" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}>🗑</button>
              </div>
            );
          })}
        </div>

        {/* BOM */}
        <div>
          {!activeProject ? (
            <div className="select-proj-hint">
              <span style={{ fontSize: 32 }}>📋</span>
              <h3>Select project</h3>
              <p>Select a project on the left or create a new one.</p>
            </div>
          ) : (
            <>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{activeProject.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {totalCost > 0 && <span className="price-tag" style={{ fontSize: 13 }}>∑ ~{totalCost.toFixed(2)} €</span>}
                  <button className="export-btn" onClick={exportCSV}>⬇ CSV</button>
                  <button className="export-btn" style={{ color: "var(--orange)", borderColor: "rgba(210,153,34,0.3)" }} onClick={() => setShowCart(true)}>🛒 Cart</button>
                  <button
                    className="btn btn-ai btn-sm"
                    onClick={searchPrices}
                    disabled={searching}
                    title="Search prices for parts with a preferred shop"
                  >
                    {searching
                      ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, marginRight: 4 }} />{searchProgress ? `${searchProgress.done}/${searchProgress.total} ${searchProgress.current}` : "Searching…"}</>
                      : "🔍 Search prices"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddPart(true)}>+ Part</button>
                </div>
              </div>

              {projectBom.length === 0 ? (
                <div className="empty-state">
                  <h3>Empty BOM</h3>
                  <p>Click \"+ Part\" to add items.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Part</th>
                        <th>MPN</th>
                        <th>Reference</th>
                        <th style={{ minWidth: 190 }}>Preferred shop</th>
                        <th>Price</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectBom.map(item => {
                        const part = parts.find(p => p.id === item.partId);
                        const sups = suppliers.filter(s => s.partId === item.partId);
                        const preferred = getPreferredSupplier(item, sups);
                        const prefPrice = preferred?.price;
                        return (
                          <tr key={item.id}>
                            <td><span className="bom-qty">{item.quantity}×</span></td>
                            <td>
                              <div style={{ fontWeight: 500 }}>{part?.name || <span style={{ color: "var(--red)" }}>Deleted</span>}</div>
                              {part?.footprint && <div className="mono" style={{ color: "var(--text3)", fontSize: 11 }}>{part.footprint}</div>}
                            </td>
                            <td><span className="mono">{part?.mpn || "—"}</span></td>
                            <td><span className="mono" style={{ color: "var(--text2)" }}>{item.reference || "—"}</span></td>
                            <td>
                              <SupplierDropdown
                                item={item}
                                part={part}
                                suppliers={sups}
                                shops={shops}
                                onSelectShop={(shopId) => saveBom(bomItems.map(b => b.id === item.id ? { ...b, preferredShopId: shopId } : b))}
                              />
                            </td>
                            <td>
                              {(() => {
                                if (!prefPrice) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;
                                const packQty = preferred?.packQty || 1;
                                const packsNeeded = Math.ceil(item.quantity / packQty);
                                const surplus = packsNeeded * packQty - item.quantity;
                                return (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span className="price-tag">{(packsNeeded * prefPrice).toFixed(2)} €</span>
                                    {packQty > 1 && <span style={{ fontSize: 10, color: "var(--text2)" }}>{packsNeeded}× pack/{packQty}</span>}
                                    {surplus > 0 && (
                                      <button
                                        style={{ fontSize: 10, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                                        title={`Add ${surplus} surplus to parts library stock`}
                                        onClick={() => {
                                          const p = parts.find(pp => pp.id === item.partId);
                                          if (!p) return;
                                          saveParts(parts.map(pp => pp.id === p.id ? { ...pp, stock: (pp.stock || 0) + surplus } : pp));
                                          alert(`Added ${surplus}× ${p.name} to library stock.`);
                                        }}
                                      >
                                        +{surplus} → stock
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditItem(item)}>✏️</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showAddPart && (
        <AddBomItemModal parts={parts} onAdd={addBomItem} onClose={() => setShowAddPart(false)} existingIds={projectBom.map(b => b.partId)} />
      )}

      {editItem && (
        <EditBomItemModal item={editItem} part={parts.find(p => p.id === editItem.partId)} onSave={updateItem} onClose={() => setEditItem(null)} />
      )}
    </div>
  );
}

// ── Cart Logic ────────────────────────────────────────────────────────────────
const SHOP_CART_CONFIGS = {
  reichelt: {
    name: "Reichelt",
    color: "#e8381a",
    logo: "RE",
    cartType: "url_multi",
    // Reichelt Schnellbestellung: ?ACTION=ORDER&ARTICLES[]=SKU;QTY repeated
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
    notes: "Opens product pages/search. Add to cart manually.",
  },
};

function downloadText(content, filename, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── Cart Modal ────────────────────────────────────────────────────────────────
function CartModal({ project, bomItems, parts, suppliers, onClose }) {
  const [activeShop, setActiveShop] = useState(null);
  const [popupWarning, setPopupWarning] = useState(false);

  // Build per-shop item lists — use preferredSupplierId when set, else all suppliers
  const shopGroups = {};
  bomItems.forEach(item => {
    const part = parts.find(p => p.id === item.partId);
    if (!part) return;
    const sups = suppliers.filter(s => s.partId === item.partId);
    const preferred = sups.find(s => s.id === item.preferredSupplierId);
    // Use only preferred if set, otherwise include all
    const toAdd = preferred ? [preferred] : sups;
    toAdd.forEach(sup => {
      const shopId = sup.shopId || sup.shopName?.toLowerCase().replace(/\s+/g, "");
      if (!shopId) return;
      if (!shopGroups[shopId]) shopGroups[shopId] = { shopId, shopName: sup.shopName, items: [] };
      shopGroups[shopId].items.push({
        partId: item.partId,
        name: part.name,
        mpn: part.mpn,
        footprint: part.footprint,
        reference: item.reference,
        qty: item.quantity,
        sku: sup.sku && sup.sku !== "suchen" ? sup.sku : "",
        price: sup.price,
        productUrl: sup.searchUrl,
        isPreferred: !!preferred,
      });
    });
  });

  // Also add items without suppliers as "unassigned"
  const assignedPartIds = new Set(Object.values(shopGroups).flatMap(g => g.items.map(i => i.partId)));
  const unassigned = bomItems.filter(b => !assignedPartIds.has(b.partId)).map(b => {
    const part = parts.find(p => p.id === b.partId);
    return part ? { name: part.name, mpn: part.mpn, qty: b.quantity } : null;
  }).filter(Boolean);

  const shops = Object.values(shopGroups);
  const config = activeShop ? (SHOP_CART_CONFIGS[activeShop.shopId] || SHOP_CART_CONFIGS[activeShop.shopName?.toLowerCase()]) : null;

  const handleCartAction = (shop) => {
    const cfg = SHOP_CART_CONFIGS[shop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === shop.shopName?.toLowerCase());
    if (!cfg) {
      // Fallback: open search URLs
      shop.items.forEach((it, i) => {
        setTimeout(() => window.open(`https://www.google.com/search?q=${encodeURIComponent(it.name + " " + (it.mpn || "") + " " + shop.shopName)}`, "_blank"), i * 300);
      });
      return;
    }

    if (cfg.cartType === "url_multi") {
      const items = shop.items.filter(it => it.sku);
      const noSku = shop.items.filter(it => !it.sku);
      if (items.length > 0) window.open(cfg.buildUrl(items), "_blank");
      if (noSku.length > 0) setPopupWarning(`${noSku.length} items without SKU skipped: ${noSku.map(i => i.name).join(", ")}`);
    } else if (cfg.cartType === "url_single") {
      const urls = cfg.buildUrl(shop.items);
      setPopupWarning(`${urls.length} tabs will be opened — disable popup blocker if needed.`);
      urls.forEach((url, i) => setTimeout(() => window.open(url, "_blank"), i * 400));
    } else if (cfg.cartType === "bom_csv") {
      const csv = cfg.exportCsv(shop.items);
      downloadText(csv, cfg.exportFileName || `${shop.shopName}_bom.csv`);
    }
  };

  const totalItems = bomItems.length;
  const coveredItems = new Set(Object.values(shopGroups).flatMap(g => g.items.map(i => i.partId))).size;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 700, maxHeight: "88vh" }}>
        <div className="modal-title">🛒 Build cart — {project.name}</div>

        {/* Coverage summary */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--green)" }}>{coveredItems}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>of {totalItems} with supplier</div>
          </div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--blue)" }}>{shops.length}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>shops with items</div>
          </div>
          {unassigned.length > 0 && (
            <div style={{ background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.2)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--red)" }}>{unassigned.length}</div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>without supplier</div>
            </div>
          )}
        </div>

        {popupWarning && (
          <div style={{ background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--orange)", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠️ {popupWarning}</span>
            <button style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14 }} onClick={() => setPopupWarning(null)}>×</button>
          </div>
        )}

        {shops.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏪</div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 6 }}>No suppliers added yet</div>
            <div style={{ fontSize: 12 }}>Go to "Parts" → Detail → AI Search or add shops manually.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 300 }}>
            {/* Shop list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.06em", marginBottom: 8 }}>STORES</div>
              {shops.map(shop => {
                const cfg = SHOP_CART_CONFIGS[shop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === shop.shopName?.toLowerCase());
                const withSku = shop.items.filter(i => i.sku).length;
                const isActive = activeShop?.shopId === shop.shopId;
                return (
                  <div key={shop.shopId}
                    onClick={() => setActiveShop(shop)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${isActive ? "var(--green)" : "var(--border)"}`, background: isActive ? "rgba(57,211,83,0.06)" : "var(--bg2)", cursor: "pointer", marginBottom: 6, transition: "all 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: cfg?.color || "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                        {cfg?.logo || shop.shopName?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{shop.shopName}</div>
                        <div style={{ fontSize: 11, color: "var(--text2)" }}>{shop.items.length} items</div>
                      </div>
                    </div>
                    {/* Cart type badge */}
                    {cfg && (
                      <div style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, display: "inline-block", background: cfg.cartType === "url_multi" ? "rgba(57,211,83,0.15)" : cfg.cartType === "bom_csv" ? "rgba(88,166,255,0.15)" : "rgba(210,153,34,0.15)", color: cfg.cartType === "url_multi" ? "var(--green)" : cfg.cartType === "bom_csv" ? "var(--blue)" : "var(--orange)" }}>
                        {cfg.cartType === "url_multi" ? "🛒 Direct" : cfg.cartType === "bom_csv" ? "📄 CSV Upload" : "🔗 Individual links"}
                      </div>
                    )}
                    {withSku > 0 && withSku < shop.items.length && (
                      <div style={{ fontSize: 10, color: "var(--orange)", marginTop: 2 }}>{shop.items.length - withSku} without SKU</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Shop detail */}
            <div>
              {!activeShop ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: 13, flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 24 }}>←</span>Select a shop
                </div>
              ) : (() => {
                const cfg = SHOP_CART_CONFIGS[activeShop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === activeShop.shopName?.toLowerCase());
                const totalPrice = activeShop.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{activeShop.shopName}</div>
                        {cfg?.notes && <div style={{ fontSize: 12, color: "var(--text2)" }}>{cfg.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {totalPrice > 0 && <div className="price-tag" style={{ fontSize: 13 }}>~{totalPrice.toFixed(2)} €</div>}
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 6 }}
                          onClick={() => handleCartAction(activeShop)}
                        >
                          {cfg?.cartType === "bom_csv" ? "📄 Export CSV" :
                           cfg?.cartType === "url_multi" ? "🛒 Open cart" :
                           "🔗 Open items"}
                        </button>
                        {cfg?.cartType === "bom_csv" && cfg?.uploadUrl && (
                          <div style={{ marginTop: 6 }}>
                            <a href={cfg.uploadUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>
                              → Open {cfg.name} BOM tool ↗
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Item list */}
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "6px 10px", background: "var(--bg3)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.04em" }}>
                        <div>Qty</div><div>Part</div><div>SKU</div><div>Price</div>
                      </div>
                      {activeShop.items.map((it, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "7px 10px", borderTop: "1px solid var(--border)", fontSize: 12, alignItems: "center" }}>
                          <div style={{ fontFamily: "IBM Plex Mono", color: "var(--text2)" }}>{it.qty}×</div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{it.name}</div>
                            {it.mpn && <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "IBM Plex Mono" }}>{it.mpn}</div>}
                          </div>
                          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: it.sku ? "var(--text)" : "var(--red)" }}>
                            {it.sku || "missing"}
                          </div>
                          <div className="price-tag" style={{ fontSize: 11 }}>
                            {it.price ? `${(it.price * it.qty).toFixed(2)} €` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div style={{ marginTop: 16, background: "rgba(248,81,73,0.06)", border: "1px solid rgba(248,81,73,0.15)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>Without supplier — not yet orderable:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unassigned.map((u, i) => (
                <span key={i} style={{ fontSize: 12, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", color: "var(--text2)" }}>
                  {u.qty}× {u.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function AddBomItemModal({ parts, onAdd, onClose, existingIds }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = parts.filter(p => {
    const q = query.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.mpn?.toLowerCase().includes(q);
  }).sort((a, b) => (b.stock || 0) - (a.stock || 0));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">➕ Add Part to BOM</div>
        <div className="form-row">
          <label>Search part</label>
          <input value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} placeholder="Name or MPN…" autoFocus />
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 14, border: "1px solid var(--border)", borderRadius: 6 }}>
          {filtered.length === 0 && <div style={{ padding: "12px 14px", color: "var(--text3)", fontSize: 13 }}>No results</div>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              style={{
                padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                background: selected?.id === p.id ? "rgba(57,211,83,0.08)" : "transparent",
                borderLeft: selected?.id === p.id ? "2px solid var(--green)" : "2px solid transparent"
              }}>
              <div style={{ fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {p.name}
                {existingIds.includes(p.id) && <span style={{ fontSize: 10, color: "var(--orange)" }}>(in BOM)</span>}
                {(p.stock || 0) > 0 && <span style={{ fontSize: 10, color: "var(--green)", background: "rgba(57,211,83,0.12)", padding: "1px 5px", borderRadius: 3 }}>{p.stock} in stock</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>{p.mpn} · {p.category} · {p.footprint}</div>
            </div>
          ))}
        </div>
        {selected && (
          <div className="form-grid">
            <div className="form-row">
              <label>Quantity *</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="form-row">
              <label>Reference (e.g. R1, C3)</label>
              <input value={ref} onChange={e => setRef(e.target.value)} className="mono" placeholder="e.g. U1, C12" />
            </div>
          </div>
        )}
        {selected && (selected.stock || 0) > 0 && (
          <div style={{ fontSize: 12, color: "var(--green)", padding: "4px 0" }}>
            ✓ {selected.stock} in stock — you need {qty}
            {(selected.stock || 0) >= qty
              ? <span style={{ color: "var(--green)" }}> (covered)</span>
              : <span style={{ color: "var(--orange)" }}> (need {qty - (selected.stock||0)} more)</span>}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!selected} onClick={() => onAdd({ partId: selected.id, quantity: qty, reference: ref, notes })}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function EditBomItemModal({ item, part, onSave, onClose }) {
  const [qty, setQty] = useState(item.quantity);
  const [ref, setRef] = useState(item.reference || "");
  const [notes, setNotes] = useState(item.notes || "");
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">✏️ Edit {part?.name || "part"}</div>
        <div className="form-grid">
          <div className="form-row">
            <label>Quantity</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
          </div>
          <div className="form-row">
            <label>Reference</label>
            <input value={ref} onChange={e => setRef(e.target.value)} className="mono" />
          </div>
        </div>
        <div className="form-row">
          <label>Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...item, quantity: qty, reference: ref, notes })}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── CSV/Excel Structured Importer ─────────────────────────────────────────────
const BOM_FIELDS = [
  { id: "name",         label: "Name / Designation", required: true },
  { id: "quantity",     label: "Quantity",            required: true },
  { id: "reference",    label: "Reference (R1, C3…)", required: false },
  { id: "mpn",          label: "MPN / Order no.",     required: false },
  { id: "manufacturer", label: "Manufacturer",        required: false },
  { id: "footprint",    label: "Footprint",           required: false },
  { id: "value",        label: "Value (10k, 100nF…)", required: false },
  { id: "description",  label: "Description",         required: false },
  { id: "category",     label: "Category",            required: false },
  { id: "_ignore",      label: "— Ignore —",          required: false },
];

// Auto-detect column → BOM field mapping
function autoDetectMapping(headers) {
  const rules = [
    { field: "name",         patterns: ["name","bezeichnung","bauteil","component","part","description","desc","value","wert","teil","benennung"] },
    { field: "quantity",     patterns: ["qty","quantity","menge","count","anzahl","amount","num","pcs","stück","stk","menge"] },
    { field: "reference",    patterns: ["reference","ref","designator","refdes","referenz","position","pos","designators","positionsnummer","item","lfd"] },
    { field: "mpn",          patterns: ["mpn","sku","ordernr","order","bestell","bestellnummer","teilenr","part number","partnumber","mfr part","mfrpn","lieferantennr","art.nr","artikelnummer"] },
    { field: "manufacturer", patterns: ["manufacturer","mfr","hersteller","vendor","make","brand","lieferant","supplier"] },
    { field: "footprint",    patterns: ["footprint","gehäuse","package","case","housing","pattern","bauform"] },
    { field: "value",        patterns: ["value","wert","val","impedance","kennwert","technischer","nennwert"] },
    { field: "description",  patterns: ["description","desc","comment","bemerkung","notiz","note","text","beschreibung","benennung"] },
    { field: "category",     patterns: ["category","kategorie","type","typ","group","gruppe","bauteil_kategorie"] },
  ];

  // SolidWorks-spezifische Spalten erkennen
  const swRules = [
    { field: "quantity",     patterns: ["anzahl","qty"] },
    { field: "reference",    patterns: ["teilenummer","item no","pos."] },
    { field: "name",         patterns: ["bezeichnung","benennung","description"] },
    { field: "mpn",          patterns: ["bestellnummer","hersteller_teilenummer","art.nr"] },
    { field: "manufacturer", patterns: ["lieferant","hersteller"] },
    { field: "description",  patterns: ["description","notizen"] },
  ];

  const mapping = {};
  const usedFields = new Set();

  headers.forEach(h => {
    const hl = h.toLowerCase().replace(/[\s_\-\.]+/g, "");
    // Try SW rules first
    for (const rule of [...swRules, ...rules]) {
      const patterns = rule.patterns || [];
      if (patterns.some(p => hl.includes(p.replace(/[\s_\-\.]+/g, "")))) {
        if (!usedFields.has(rule.field)) {
          mapping[h] = rule.field;
          usedFields.add(rule.field);
          break;
        }
      }
    }
    if (!mapping[h]) mapping[h] = "_ignore";
  });
  return mapping;
}

// Parse CSV text → rows
function parseCsvText(text) {
  // Detect delimiter
  const firstLine = text.split("\n")[0];
  const delimiters = [",", ";", "\t", "|"];
  const delimiter = delimiters.reduce((best, d) =>
    (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");

  const lines = text.trim().split("\n");
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === delimiter && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
  return { headers, rows };
}

function CsvExcelImporter({ parts, saveParts, projects, saveProjects, bomItems, saveBom }) {
  const [xlsxLib, setXlsxLib] = useState(null);
  const [csvStep, setCsvStep] = useState(1); // 1=upload 2=map 3=preview 4=done
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [editableItems, setEditableItems] = useState([]);
  const [targetProject, setTargetProject] = useState("new");
  const [newProjectName, setNewProjectName] = useState("");
  const [importDone, setImportDone] = useState(null);
  const [importing, setImporting] = useState(false);
  const [loadingXlsx, setLoadingXlsx] = useState(false);

  // Lazy-load SheetJS
  const ensureXlsx = () => new Promise((resolve) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    setLoadingXlsx(true);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => { setLoadingXlsx(false); resolve(window.XLSX); };
    document.head.appendChild(s);
  });

  const processFile = async (file) => {
    setFileName(file.name);
    setNewProjectName(file.name.replace(/\.[^.]+$/, ""));
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    if (isExcel) {
      const XLSX = await ensureXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const hdrs = (json[0] || []).map(String);
      const rows = json.slice(1).filter(r => r.some(c => c != null && c !== "")).map(r => {
        const row = {};
        hdrs.forEach((h, i) => { row[h] = r[i] != null ? String(r[i]) : ""; });
        return row;
      });
      setHeaders(hdrs); setRawRows(rows);
      setMapping(autoDetectMapping(hdrs));
    } else {
      const text = await file.text();
      const { headers: hdrs, rows } = parseCsvText(text);
      setHeaders(hdrs); setRawRows(rows);
      setMapping(autoDetectMapping(hdrs));
    }
    setCsvStep(2);
  };

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  const applyMapping = () => {
    const CATS = ["Resistor","Capacitor","Inductor","IC","Transistor","Diode","LED","Relay","Connector","Switch","Sensor","MCU","MOSFET","Module","Mechanical","Cable","Other"];
    const items = rawRows.map((row, i) => {
      const get = (field) => {
        const col = Object.keys(mapping).find(h => mapping[h] === field);
        return col ? (row[col] || "").trim() : "";
      };
      const name = get("name") || get("description") || `Unbekannt #${i+1}`;
      const qtyRaw = get("quantity");
      const qty = parseInt(qtyRaw) || (get("reference") ? get("reference").split(/[,;]/).filter(Boolean).length : 1);
      return {
        _id: i, _enabled: !!name && name !== `Unbekannt #${i+1}`,
        name,
        quantity: qty,
        reference: get("reference"),
        mpn: get("mpn"),
        manufacturer: get("manufacturer"),
        footprint: get("footprint"),
        value: get("value"),
        description: get("description"),
        category: CATS.includes(get("category")) ? get("category") : "",
      };
    }).filter(it => it.name);
    setEditableItems(items);
    setPreviewItems(items);
    setCsvStep(3);
  };

  const updateItem = (id, field, val) => setEditableItems(its => its.map(it => it._id === id ? {...it, [field]: val} : it));

  const doImport = async () => {
    setImporting(true);
    const enabled = editableItems.filter(i => i._enabled);
    let project;
    if (targetProject === "new") {
      project = { id: Date.now().toString(), name: newProjectName || "Import", created: new Date().toISOString() };
      saveProjects([...projects, project]);
    } else {
      project = projects.find(p => p.id === targetProject);
    }
    const newParts = [...parts];
    const newBom = [...bomItems];
    let addedParts = 0, addedItems = 0;
    for (const item of enabled) {
      let part = newParts.find(p => p.name?.toLowerCase() === item.name?.toLowerCase() &&
        (!item.mpn || !p.mpn || p.mpn?.toLowerCase() === item.mpn?.toLowerCase()));
      if (!part) {
        part = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name: item.name, mpn: item.mpn || "", manufacturer: item.manufacturer || "",
          category: item.category || "", footprint: item.footprint || "",
          description: [item.description, item.value].filter(Boolean).join(" – ") || "",
          notes: `Imported from: ${fileName}`,
        };
        newParts.push(part); addedParts++;
      }
      const exists = newBom.find(b => b.projectId === project.id && b.partId === part.id);
      if (exists) { exists.quantity += item.quantity; }
      else {
        newBom.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), projectId: project.id, partId: part.id, quantity: item.quantity, reference: item.reference || "", notes: item.value ? `Value: ${item.value}` : "" });
        addedItems++;
      }
    }
    saveParts(newParts); saveBom(newBom);
    setImportDone({ project: project.name, projectId: project.id, addedParts, addedItems, total: enabled.length });
    setCsvStep(4); setImporting(false);
  };

  const reset = () => { setCsvStep(1); setHeaders([]); setRawRows([]); setMapping({}); setFileName(""); setEditableItems([]); setImportDone(null); setTargetProject("new"); setNewProjectName(""); };

  const CATS = ["Resistor","Capacitor","Inductor","IC","Transistor","Diode","LED","Relay","Connector","Switch","Sensor","MCU","MOSFET","Module","Mechanical","Cable","Other"];
  const fieldsMapped = Object.values(mapping).filter(v => v !== "_ignore");
  const hasName = fieldsMapped.includes("name");
  const hasQty = fieldsMapped.includes("quantity");

  return (
    <div>
      {/* Steps */}
      <div className="import-steps" style={{ marginBottom: 24 }}>
        {[{n:1,label:"File"},{n:2,label:"Map columns"},{n:3,label:"Review"},{n:4,label:"Done"}].map(s => (
          <div key={s.n} className="import-step">
            <div className={`step-circle ${csvStep > s.n ? "done" : csvStep === s.n ? "active" : ""}`}>{csvStep > s.n ? "✓" : s.n}</div>
            <div className={`step-label ${csvStep > s.n ? "done" : csvStep === s.n ? "active" : ""}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {csvStep === 1 && (
        <div>
          <div className={`drop-zone ${dragOver ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}>
            <input type="file" accept=".csv,.xlsx,.xls,.ods,.tsv,.txt" onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
            <div className="drop-zone-icon">{loadingXlsx ? "⏳" : "📊"}</div>
            <div className="drop-zone-text">{loadingXlsx ? "Loading Excel parser…" : "Upload CSV or Excel file"}</div>
            <div className="drop-zone-sub">.csv · .xlsx · .xls · .ods · .tsv — delimiter auto-detected</div>
          </div>
          <div style={{ marginTop: 20, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--text2)" }}>Compatible with any CAD or PCB tool</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {["SolidWorks","Fusion 360","CATIA","Inventor","FreeCAD","Onshape","KiCad","Altium","Eagle","EasyEDA","OrCAD","Zuken","Excel / Google Sheets","Custom format"].map(h =>
                <span key={h} className="field-chip">{h}</span>)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              Column headers in any language — German, English, French, Japanese, Chinese etc. are auto-detected.
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {csvStep === 2 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{fileName}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{rawRows.length} rows · {headers.length} columns detected</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={reset}>← Back</button>
          </div>

          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, padding: "8px 14px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.05em" }}>
              <div>COLUMN IN FILE</div><div></div><div>FIELD IN BOM</div>
            </div>
            {headers.map(h => {
              const sample = rawRows.slice(0,3).map(r => r[h]).filter(Boolean).join(", ");
              return (
                <div key={h} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 8, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, fontFamily: "IBM Plex Mono, monospace" }}>{h}</div>
                    {sample && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{sample}</div>}
                  </div>
                  <div style={{ color: "var(--text3)", textAlign: "center", fontSize: 16 }}>→</div>
                  <div>
                    <select value={mapping[h] || "_ignore"} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      style={{ width: "100%", background: mapping[h] && mapping[h] !== "_ignore" ? "rgba(57,211,83,0.08)" : "var(--bg3)", border: `1px solid ${mapping[h] && mapping[h] !== "_ignore" ? "rgba(57,211,83,0.4)" : "var(--border2)"}`, color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}>
                      {BOM_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}{f.required ? " *" : ""}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {!hasName && <div style={{ color: "var(--orange)", fontSize: 13, marginBottom: 10 }}>⚠️ Please map at least "Name / Designation".</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text2)", alignSelf: "center" }}>
              {fieldsMapped.filter(f => f !== "_ignore").length} fields mapped
            </div>
            <button className="btn btn-primary" disabled={!hasName} onClick={applyMapping}>
              Preview →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Edit */}
      {csvStep === 3 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {editableItems.filter(i => i._enabled).length} / {editableItems.length} items
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:true})))}>All</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:false})))}>None</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCsvStep(2)}>← Back</button>
            </div>
          </div>

          {/* Target project */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Import into:</div>
            <select style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
              value={targetProject} onChange={e => setTargetProject(e.target.value)}>
              <option value="new">+ New project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetProject === "new" && (
              <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name"
                style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 160 }} />
            )}
          </div>

          <div className="table-wrap" style={{ marginBottom: 14, maxHeight: 420, overflowY: "auto" }}>
            <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em", position: "sticky", top: 0, zIndex: 1 }}>
              <div>✓</div><div>Name</div><div>Qty</div><div>Category</div><div>MPN</div><div>Reference</div><div></div>
            </div>
            {editableItems.map(item => (
              <div key={item._id} className="import-item-row" style={{ opacity: item._enabled ? 1 : 0.4 }}>
                <div><input type="checkbox" checked={item._enabled} onChange={e => updateItem(item._id, "_enabled", e.target.checked)} style={{ width: "auto", cursor: "pointer", accentColor: "var(--green)" }} /></div>
                <div>
                  <input value={item.name || ""} onChange={e => updateItem(item._id, "name", e.target.value)} style={{ fontWeight: 500 }} />
                  {item.value && <div style={{ fontSize: 10, color: "var(--orange)", fontFamily: "IBM Plex Mono", paddingLeft: 6 }}>{item.value}</div>}
                </div>
                <div><input type="number" min="1" value={item.quantity || 1} onChange={e => updateItem(item._id, "quantity", parseInt(e.target.value)||1)} style={{ textAlign: "center", fontFamily: "IBM Plex Mono" }} /></div>
                <div>
                  <select value={item.category || ""} onChange={e => updateItem(item._id, "category", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", color: "var(--text)", fontSize: 12, fontFamily: "IBM Plex Sans", width: "100%", padding: "3px 4px", borderRadius: 4 }}>
                    <option value="">—</option>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><input value={item.mpn || ""} onChange={e => updateItem(item._id, "mpn", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                <div><input value={item.reference || ""} onChange={e => updateItem(item._id, "reference", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                <div><button className="btn btn-danger" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => setEditableItems(its => its.filter(i => i._id !== item._id))}>✕</button></div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-primary" disabled={importing || editableItems.filter(i => i._enabled).length === 0 || (targetProject === "new" && !newProjectName)} onClick={doImport}>
              {importing ? <><span className="spinner" /> Importing…</> : `✅ Import ${editableItems.filter(i => i._enabled).length} items`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {csvStep === 4 && importDone && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import successful!</div>
          <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Project: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong></div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[{val:importDone.total,label:"Items",color:"var(--blue)"},{val:importDone.addedParts,label:"New parts in DB",color:"var(--green)"},{val:importDone.addedItems,label:"BOM entries",color:"var(--purple)"}].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={reset}>Another import</button>
            <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("switchTab", { detail: { tab: "bom", projectId: importDone.projectId } }))}>→ Go to BOM</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Import Tab (Wrapper with mode selector) ───────────────────────────────────
function ImportTab({ parts, saveParts, projects, saveProjects, bomItems, saveBom }) {
  const [mode, setMode] = useState("csv"); // "csv" | "ai"
  const [step, setStep] = useState(1); // 1=upload 2=review 3=import
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [items, setItems] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [targetProject, setTargetProject] = useState("new");
  const [newProjectName, setNewProjectName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawText(e.target.result);
      setFileName(file.name);
      setNewProjectName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) readFile(file);
  };

  const handleParse = async () => {
    if (!rawText.trim()) return;
    setParsing(true); setParseError(""); setParseResult(null);
    try {
      const result = await claudeParseReport(rawText, fileName, getApiKey());
      setParseResult(result);
      setItems((result.items || []).map((it, i) => ({ ...it, _id: i, _enabled: true })));
      if (result.project_name && !newProjectName) setNewProjectName(result.project_name);
      setStep(2);
    } catch (e) {
      setParseError("Analyse fehlgeschlagen: " + e.message);
    }
    setParsing(false);
  };

  const updateItem = (id, field, val) => {
    setItems(items.map(it => it._id === id ? { ...it, [field]: val } : it));
  };

  const handleImport = async () => {
    setImporting(true);
    const enabledItems = items.filter(it => it._enabled);

    // Projekt bestimmen oder erstellen
    let project;
    if (targetProject === "new") {
      project = { id: Date.now().toString(), name: newProjectName || "Import " + new Date().toLocaleDateString("de-DE"), created: new Date().toISOString() };
      saveProjects([...projects, project]);
    } else {
      project = projects.find(p => p.id === targetProject);
    }

    // Bauteile in Parts-DB anlegen (falls nicht vorhanden)
    const newParts = [...parts];
    const newBomEntries = [...bomItems];
    let addedParts = 0, addedItems = 0;

    for (const item of enabledItems) {
      const name = item.name?.trim();
      if (!name) continue;

      // Prüfe ob Bauteil mit gleichem Namen+MPN bereits existiert
      let existing = newParts.find(p =>
        p.name?.toLowerCase() === name.toLowerCase() &&
        (!item.mpn || !p.mpn || p.mpn?.toLowerCase() === item.mpn?.toLowerCase())
      );

      if (!existing) {
        existing = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name,
          mpn: item.mpn || "",
          manufacturer: item.manufacturer || "",
          category: item.category || "",
          footprint: item.footprint || "",
          description: [item.description, item.value].filter(Boolean).join(" – ") || "",
          notes: item.raw ? `Importiert aus: ${fileName}` : "",
        };
        newParts.push(existing);
        addedParts++;
      }

      // BOM-Eintrag
      const bomExisting = newBomEntries.find(b => b.projectId === project.id && b.partId === existing.id);
      if (bomExisting) {
        bomExisting.quantity += (parseInt(item.quantity) || 1);
      } else {
        newBomEntries.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          projectId: project.id,
          partId: existing.id,
          quantity: parseInt(item.quantity) || 1,
          reference: item.reference || "",
          notes: item.value ? `Value: ${item.value}` : "",
        });
        addedItems++;
      }
    }

    saveParts(newParts);
    saveBom(newBomEntries);
    setImportDone({ project: project.name, projectId: project.id, addedParts, addedItems, total: enabledItems.length });
    setStep(3);
    setImporting(false);
  };

  const reset = () => {
    setStep(1); setRawText(""); setFileName(""); setParseResult(null);
    setItems([]); setParseError(""); setImportDone(null); setPasteMode(false);
    setNewProjectName(""); setTargetProject("new");
  };

  const CATS = ["Resistor", "Capacitor", "Inductor", "IC", "Transistor", "Diode", "LED", "Relay", "Connector", "Switch", "Sensor", "MCU", "MOSFET", "Module", "Mechanical", "Cable", "Other"];

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📥 BOM Import</div>
        {step > 1 && mode === "ai" && <button className="btn btn-secondary" onClick={reset}>↺ Start over</button>}
      </div>

      {/* Mode switcher */}
      <div className="tabs-inner" style={{ marginBottom: 24 }}>
        <button className={`tab-inner-btn ${mode === "csv" ? "active" : ""}`} onClick={() => { setMode("csv"); }}>
          📊 CSV / Excel
        </button>
        <button className={`tab-inner-btn ${mode === "ai" ? "active" : ""}`} onClick={() => { setMode("ai"); }}>
          🤖 AI Import (any format)
        </button>
      </div>

      {mode === "csv" && (
        <CsvExcelImporter parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />
      )}

      {mode === "ai" && <>
      {/* Steps */}
      <div className="import-steps">
        {[
          { n: 1, label: "File / Text" },
          { n: 2, label: "Review & Edit" },
          { n: 3, label: "Imported" },
        ].map(s => (
          <div key={s.n} className="import-step">
            <div className={`step-circle ${step > s.n ? "done" : step === s.n ? "active" : ""}`}>
              {step > s.n ? "✓" : s.n}
            </div>
            <div className={`step-label ${step > s.n ? "done" : step === s.n ? "active" : ""}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={`tab-inner-btn ${!pasteMode ? "active" : ""}`} onClick={() => setPasteMode(false)}>📁 Upload file</button>
            <button className={`tab-inner-btn ${pasteMode ? "active" : ""}`} onClick={() => setPasteMode(true)}>📋 Paste text</button>
          </div>

          {!pasteMode ? (
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept=".csv,.json,.txt,.xml,.yaml,.yml,.bom,.net,.kicad_bom,*" onChange={handleFileInput} />
              <div className="drop-zone-icon">{fileName ? "✅" : "📄"}</div>
              {fileName
                ? <div className="drop-zone-text" style={{ color: "var(--green)" }}>{fileName}</div>
                : <>
                    <div className="drop-zone-text">Drag file here or click</div>
                    <div className="drop-zone-sub">CSV, JSON, TXT, XML, KiCad, Eagle, Altium, YAML – any format</div>
                  </>}
            </div>
          ) : (
            <div>
              <textarea
                style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", padding: "12px 14px", borderRadius: 8, fontFamily: "IBM Plex Mono, monospace", fontSize: 12, minHeight: 220, resize: "vertical" }}
                placeholder={"Paste report content here…\n\nExamples:\n- CSV with columns: Qty, Reference, Value, Footprint\n- JSON array of parts\n- Free text like: 2x ATmega328P, 10x 10kΩ 0805…\n- KiCad netlist, Eagle BOM, …"}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
              />
            </div>
          )}

          {rawText && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                {rawText.length.toLocaleString()} chars · {rawText.split("\n").length} lines
              </div>
              <div style={{ marginLeft: "auto" }}>
                <button className="btn btn-ai" onClick={handleParse} disabled={parsing}>
                  {parsing ? <><span className="spinner" /> Analyzing…</> : "🤖 Start AI analysis"}
                </button>
              </div>
            </div>
          )}

          {parseError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{parseError}</div>}

          <div style={{ marginTop: 28, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--text2)" }}>Supported formats</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["KiCad BOM", "Eagle BOM", "Altium BOM", "CSV/Excel-Export", "JSON-Array", "Freitext", "Markdown-Tabelle", "YAML", "FocusPilot Reports", "Eigene Formate"].map(f => (
                <span key={f} className="field-chip">{f}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10 }}>
              The AI detects the format automatically and extracts parts, quantities, MPNs and reference designators.
              Unknown fields are interpreted as best as possible.
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && parseResult && (
        <div>
          {/* Parse-Banner */}
          <div className={`parse-result-banner ${parseResult.confidence === "low" ? "warn" : ""}`}>
            <div style={{ fontSize: 22 }}>{parseResult.confidence === "high" ? "✅" : parseResult.confidence === "medium" ? "🟡" : "⚠️"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Format erkannt: <span style={{ color: "var(--blue)", fontFamily: "IBM Plex Mono, monospace" }}>{parseResult.format_detected}</span>
                <span style={{ marginLeft: 10, fontSize: 11, padding: "1px 8px", borderRadius: 4, background: parseResult.confidence === "high" ? "rgba(63,185,80,0.15)" : "rgba(210,153,34,0.15)", color: parseResult.confidence === "high" ? "var(--green)" : "var(--orange)" }}>
                  {parseResult.confidence === "high" ? "Confident" : parseResult.confidence === "medium" ? "Uncertain" : "Low"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{parseResult.notes}</div>
              <div>
                {(parseResult.fields_found || []).map(f => <span key={f} className="field-chip">{f}</span>)}
              </div>
            </div>
          </div>

          {/* Target project */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Import into:</div>
            <select
              style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
              value={targetProject} onChange={e => setTargetProject(e.target.value)}
            >
              <option value="new">+ New project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetProject === "new" && (
              <input
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 180 }}
              />
            )}
          </div>

          {/* Items Table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {items.filter(i => i._enabled).length} / {items.length} items selected
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: true })))}>Select all</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: false })))}>Deselect all</button>
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            {/* Header */}
            <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em" }}>
              <div>✓</div>
              <div>Name / Description</div>
              <div>Qty</div>
              <div>Category</div>
              <div>MPN</div>
              <div>Reference</div>
              <div></div>
            </div>
            {items.map(item => (
              <div key={item._id} className="import-item-row" style={{ opacity: item._enabled ? 1 : 0.4 }}>
                <div>
                  <input type="checkbox" checked={item._enabled} onChange={e => updateItem(item._id, "_enabled", e.target.checked)}
                    style={{ width: "auto", cursor: "pointer", accentColor: "var(--green)" }} />
                </div>
                <div>
                  <input value={item.name || ""} onChange={e => updateItem(item._id, "name", e.target.value)}
                    style={{ fontWeight: 500 }} />
                  {item.value && <div style={{ fontSize: 10, color: "var(--orange)", fontFamily: "IBM Plex Mono", paddingLeft: 6 }}>{item.value}</div>}
                </div>
                <div>
                  <input type="number" min="1" value={item.quantity || 1}
                    onChange={e => updateItem(item._id, "quantity", parseInt(e.target.value) || 1)}
                    style={{ textAlign: "center", fontFamily: "IBM Plex Mono" }} />
                </div>
                <div>
                  <select value={item.category || ""} onChange={e => updateItem(item._id, "category", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", color: "var(--text)", fontSize: 12, fontFamily: "IBM Plex Sans", width: "100%", padding: "3px 4px", borderRadius: 4 }}>
                    <option value="">—</option>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <input value={item.mpn || ""} onChange={e => updateItem(item._id, "mpn", e.target.value)}
                    style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" />
                </div>
                <div>
                  <input value={item.reference || ""} onChange={e => updateItem(item._id, "reference", e.target.value)}
                    style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" />
                </div>
                <div>
                  <button className="btn btn-danger" style={{ padding: "2px 6px", fontSize: 11 }}
                    onClick={() => setItems(items.filter(i => i._id !== item._id))}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary"
              disabled={importing || items.filter(i => i._enabled).length === 0 || (targetProject === "new" && !newProjectName)}
              onClick={handleImport}>
              {importing ? <><span className="spinner" /> Importing…</> : `✅ Import ${items.filter(i => i._enabled).length} items`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && importDone && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import successful!</div>
          <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>
            Project: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong>
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[
              { val: importDone.total, label: "Items", color: "var(--blue)" },
              { val: importDone.addedParts, label: "New parts in DB", color: "var(--green)" },
              { val: importDone.addedItems, label: "BOM entries", color: "var(--purple)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={reset}>Another import</button>
            <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("switchTab", { detail: { tab: "bom", projectId: importDone.projectId } }))}>→ Go to BOM</button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}


function aggregateStores(searchResults) {
  // Count how many parts each store covers
  const storeMap = {};
  for (const result of searchResults) {
    for (const store of result.stores || []) {
      const key = store.storeName?.toLowerCase().trim() || "unbekannt";
      if (!storeMap[key]) {
        storeMap[key] = {
          storeName: store.storeName,
          storeUrl: store.storeUrl,
          rating: store.rating,
          parts: [],
          totalMinPrice: 0,
        };
      }
      storeMap[key].parts.push({
        partId: result.partId,
        partName: result.partName,
        productUrl: store.productUrl,
        priceEur: store.priceEur,
        minOrder: store.minOrder,
        note: store.note,
      });
      storeMap[key].totalMinPrice += store.priceEur || 0;
    }
  }
  return Object.values(storeMap)
    .sort((a, b) => b.parts.length - a.parts.length || b.rating - a.rating);
}


// ── Shops Tab ─────────────────────────────────────────────────────────────────
function ShopsTab({ shops, saveShops }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRegionSetup, setShowRegionSetup] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", url: "", speciality: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShop = () => {
    if (!form.name) return;
    saveShops([...shops, { ...form, id: Date.now().toString(), categories: [] }]);
    setForm({ name: "", region: "", url: "", speciality: "" });
    setShowAdd(false);
  };

  const deleteShop = (id) => {
    if (DEFAULT_SHOPS.find(s => s.id === id)) { alert("Default shop cannot be deleted."); return; }
    saveShops(shops.filter(s => s.id !== id));
  };

  const globalShops = DEFAULT_SHOPS;
  const userShops = shops.filter(s => !DEFAULT_SHOPS.find(d => d.id === s.id));

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🏪 Shops
          <span className="badge">{shops.length} configured</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ai" onClick={() => setShowRegionSetup(true)}>
            🌍 Find shops for my region
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add manually</button>
        </div>
      </div>

      <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.15)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--text)" }}>Your personal shop list.</strong> Shops vary greatly by region —
        what is Mädler and Reichelt in Germany is McMaster-Carr and Digi-Key in the USA, Misumi and Monotaro in Japan.
        Use <strong style={{ color: "var(--blue)" }}>"Find shops for my region"</strong> to let the AI suggest suitable local suppliers.
      </div>

      {/* Globale Shops */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
        🌐 GLOBAL — always available
      </div>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Shop</th><th>Region</th><th>Speciality</th><th>Website</th></tr></thead>
          <tbody>
            {globalShops.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className="tag tag-cat">{s.region}</span></td>
                <td style={{ fontSize: 12, color: "var(--text2)" }}>General</td>
                <td><a href={s.url} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12, textDecoration: "none" }}>{s.url}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Shops */}
      {userShops.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
            📍 YOUR SHOPS
          </div>
          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Shop</th><th>Region</th><th>Speciality</th><th>Website</th><th></th></tr></thead>
              <tbody>
                {userShops.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span className="tag tag-cat">{s.region || "—"}</span></td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{s.speciality || "—"}</td>
                    <td><a href={s.url} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12, textDecoration: "none" }}>{s.url}</a></td>
                    <td><button className="btn btn-danger" onClick={() => deleteShop(s.id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {userShops.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌍</div>
          <h3>No custom shops yet</h3>
          <p>Click "Find shops for my region" — the AI will recommend suitable local suppliers for your country.</p>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">➕ Add shop</div>
            <div className="form-row"><label>Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Mädler, McMaster-Carr" autoFocus /></div>
            <div className="form-row"><label>Region / Country</label><input value={form.region} onChange={e => set("region", e.target.value)} placeholder="e.g. DE, USA, JP, Global" /></div>
            <div className="form-row"><label>URL</label><input value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://…" /></div>
            <div className="form-row"><label>Speciality</label><input value={form.speciality} onChange={e => set("speciality", e.target.value)} placeholder="e.g. Drive technology, Fasteners, Electronics" /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addShop} disabled={!form.name}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showRegionSetup && (
        <RegionShopSetup
          existingShops={shops}
          onAdd={(newShops) => { saveShops([...shops, ...newShops]); setShowRegionSetup(false); }}
          onClose={() => setShowRegionSetup(false)}
        />
      )}
    </div>
  );
}

// ── Region Shop Setup Modal ───────────────────────────────────────────────────
function RegionShopSetup({ existingShops, onAdd, onClose }) {
  const [country, setCountry] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");

  const CATS = [
    { id: "electronic", label: "Electronics", icon: "⚡" },
    { id: "mechanical", label: "Mechanical / Fasteners", icon: "🔩" },
    { id: "drive",      label: "Drives / Motors", icon: "⚙️" },
    { id: "pneumatic",  label: "Pneumatics / Hydraulics", icon: "💨" },
    { id: "linear",     label: "Linear Motion", icon: "📏" },
    { id: "structure",  label: "Profiles / Structure", icon: "📐" },
  ];

  const toggleCat = (id) => setCategories(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const handleSearch = async () => {
    if (!country.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const suggestions = await suggestShopsForRegion(country, categories.map(c => CATS.find(x => x.id === c)?.label || c), getApiKey());
      // Filter out already existing shops
      const existingUrls = new Set(existingShops.map(s => s.url?.toLowerCase()));
      const fresh = suggestions.filter(s => !existingUrls.has(s.url?.toLowerCase()));
      setResults(fresh);
      const sel = {};
      fresh.forEach(s => { sel[s.id] = true; });
      setSelected(sel);
    } catch (e) {
      setError("Search failed: " + e.message);
    }
    setLoading(false);
  };

  const handleAdd = () => {
    const toAdd = results.filter(s => selected[s.id]);
    onAdd(toAdd.map(s => ({ ...s, id: s.id + "_" + Date.now() })));
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620 }}>
        <div className="modal-title">🌍 Find shops for your region</div>

        {!results ? (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18, lineHeight: 1.6 }}>
              The AI searches for the best local and regional suppliers for your location —
              for electronics as well as mechanical parts, fasteners, and specialty items.
            </div>

            <div className="form-row">
              <label>Your country / region *</label>
              <input value={country} onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Germany, USA, Japan, Australia, Brazil, India…"
                autoFocus onKeyDown={e => e.key === "Enter" && handleSearch()} />
            </div>

            <div className="form-row">
              <label>What parts do you buy? (optional — for better recommendations)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {CATS.map(c => (
                  <button key={c.id} onClick={() => toggleCat(c.id)}
                    className={`btn btn-sm ${categories.includes(c.id) ? "btn-primary" : "btn-secondary"}`}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-ai" disabled={loading || !country.trim()} onClick={handleSearch}>
                {loading ? <><span className="spinner" /> Searching local shops…</> : "🔍 Find shops"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
              <strong style={{ color: "var(--green)" }}>{results.length} shops</strong> found for <strong style={{ color: "var(--text)" }}>{country}</strong>.
              Select the shops you want to add:
            </div>

            <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 16 }}>
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text3)" }}>
                  No new shops found — all suggestions are already in your list.
                </div>
              ) : results.map(s => (
                <div key={s.id} onClick={() => setSelected(sel => ({ ...sel, [s.id]: !sel[s.id] }))}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: selected[s.id] ? "rgba(57,211,83,0.06)" : "var(--bg3)", border: `1px solid ${selected[s.id] ? "rgba(57,211,83,0.3)" : "var(--border)"}`, transition: "all 0.15s" }}>
                  <input type="checkbox" checked={!!selected[s.id]} onChange={() => {}} style={{ accentColor: "var(--green)", marginTop: 3, cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                      <span className="tag tag-cat">{s.region}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 3 }}>{s.speciality}</div>
                    <a href={s.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>{s.url}</a>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResults(null)}>← Back</button>
              <button className="btn btn-primary"
                disabled={Object.values(selected).filter(Boolean).length === 0}
                onClick={handleAdd}>
                ✅ Add {Object.values(selected).filter(Boolean).length} shops
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
