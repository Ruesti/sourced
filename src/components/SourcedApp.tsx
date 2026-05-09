// ── Sourced — BOM & Parts Manager ───────────────────────────────────────────
// Supabase credentials are read from environment variables.
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local

import { useState, useEffect, useRef, useCallback } from "react";

// ── Supabase Client — zentral gehostet, kein User-Setup nötig ────────────────
// Deine Supabase-Credentials hier eintragen:
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _sbClient = null;
async function getSb() {
  if (_sbClient) return _sbClient;
  if (!window.supabase) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sbClient;
}

function resetSbClient() { _sbClient = null; }

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

const sbToBomItem = r => ({ id: r.id, projectId: r.project_id, partId: r.part_id, quantity: r.quantity, reference: r.reference||"", notes: r.notes||"", preferredSupplierId: r.preferred_supplier_id||null });
const bomItemToSb = (b, uid) => ({ id: b.id, user_id: uid, project_id: b.projectId, part_id: b.partId, quantity: b.quantity, reference: b.reference||null, notes: b.notes||null, preferred_supplier_id: b.preferredSupplierId||null });

const sbToSupplier = r => ({ id: r.id, partId: r.part_id, shopId: r.shop_id||"", shopName: r.shop_name, sku: r.sku||"", searchUrl: r.search_url||"", price: r.price ? parseFloat(r.price) : null, currency: r.currency||"EUR", notes: r.notes||"", aiGenerated: r.ai_generated||false });
const supplierToSb = (s, uid) => ({ id: s.id, user_id: uid, part_id: s.partId, shop_id: s.shopId||null, shop_name: s.shopName, sku: s.sku||null, search_url: s.searchUrl||null, price: s.price||null, currency: s.currency||"EUR", notes: s.notes||null, ai_generated: s.aiGenerated||false });

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
  { id: "electronic",   label: "Elektronik",     icon: "⚡", color: "#1a5fa3" },
  { id: "drive",        label: "Antrieb",         icon: "⚙️", color: "#e8700a" },
  { id: "linear",       label: "Lineartechnik",   icon: "📏", color: "#9b59b6" },
  { id: "pneumatic",    label: "Pneumatik",       icon: "💨", color: "#1a9fa3" },
  { id: "mechanic",     label: "Mechanik",        icon: "🔧", color: "#27ae60" },
  { id: "normpart",     label: "Normteile",       icon: "🔩", color: "#7f8c8d" },
  { id: "structure",    label: "Konstruktion",    icon: "📐", color: "#16a085" },
  { id: "connection",   label: "Verbindung",      icon: "🔌", color: "#8e44ad" },
  { id: "sensor",       label: "Sensorik",        icon: "📡", color: "#2980b9" },
  { id: "other",        label: "Sonstiges",       icon: "📦", color: "#555" },
];

const BUILTIN_TEMPLATES = [
  { id: "t-resistor",   group: "electronic", name: "Widerstand",           icon: "🟫", color: "#8b6914",
    fields: [
      { key: "value",     label: "Wert",           type: "text",   unit: "Ω",  required: true,  hint: "z.B. 10k, 4.7M" },
      { key: "tolerance", label: "Toleranz",       type: "select", options: ["1%","5%","10%","0.1%","0.5%"] },
      { key: "power",     label: "Leistung",       type: "text",   unit: "W",  hint: "z.B. 0.25, 0.5" },
      { key: "footprint", label: "Gehäuse",        type: "select", options: ["0402","0603","0805","1206","2512","THT axial"] },
    ]},
  { id: "t-capacitor",  group: "electronic", name: "Kondensator",          icon: "🔵", color: "#1a5fa3",
    fields: [
      { key: "value",    label: "Kapazität",       type: "text",   unit: "F",  required: true, hint: "z.B. 100nF, 10µF" },
      { key: "voltage",  label: "Spannungsfestigkeit", type: "text", unit: "V", required: true },
      { key: "type",     label: "Typ",             type: "select", options: ["MLCC","Elektrolyt","Tantal","Folie"] },
      { key: "footprint",label: "Gehäuse",         type: "select", options: ["0402","0603","0805","1206","THT radial"] },
    ]},
  { id: "t-stepper",    group: "drive",      name: "Schrittmotor",         icon: "⚙️", color: "#e8700a",
    fields: [
      { key: "flange",   label: "Flansch",         type: "select", options: ["NEMA8","NEMA11","NEMA14","NEMA17","NEMA23","NEMA34"], required: true },
      { key: "steps",    label: "Schritte/U",      type: "select", options: ["200 (1.8°)","400 (0.9°)","48 (7.5°)"], required: true },
      { key: "torque",   label: "Haltemoment",     type: "number", unit: "Nm" },
      { key: "current",  label: "Phasenstrom",     type: "number", unit: "A" },
      { key: "length",   label: "Motorlänge",      type: "number", unit: "mm" },
      { key: "shaft_d",  label: "Wellendurchm.",   type: "number", unit: "mm" },
      { key: "wiring",   label: "Wicklung",        type: "select", options: ["Bipolar 4-Draht","Unipolar 6-Draht","8-Draht"] },
    ]},
  { id: "t-dcmotor",    group: "drive",      name: "DC-Motor",             icon: "⚡", color: "#e8700a",
    fields: [
      { key: "voltage",  label: "Nennspannung",    type: "number", unit: "V",  required: true },
      { key: "rpm",      label: "Drehzahl",        type: "number", unit: "rpm" },
      { key: "torque",   label: "Nennmoment",      type: "number", unit: "Nm" },
      { key: "current",  label: "Nennstrom",       type: "number", unit: "A" },
      { key: "shaft_d",  label: "Wellendurchm.",   type: "number", unit: "mm" },
      { key: "gearbox",  label: "Getriebe",        type: "text",   hint: "z.B. 1:50" },
    ]},
  { id: "t-pneumatic",  group: "pneumatic",  name: "Pneumatikzylinder",    icon: "💨", color: "#1a9fa3",
    fields: [
      { key: "bore",     label: "Bohrung",         type: "number", unit: "mm", required: true },
      { key: "stroke",   label: "Hub",             type: "number", unit: "mm", required: true },
      { key: "type",     label: "Bauform",         type: "select", options: ["Einfachwirkend","Doppeltwirkend","Kompaktzylinder","Rundzylinder","ISO 15552"], required: true },
      { key: "pressure", label: "Max. Druck",      type: "number", unit: "bar" },
      { key: "port",     label: "Anschluss",       type: "select", options: ["M5","G1/8","G1/4","G3/8","G1/2"] },
      { key: "cushion",  label: "Dämpfung",        type: "select", options: ["Ohne","Einstellbar","Fest"] },
    ]},
  { id: "t-linear",     group: "linear",     name: "Linearführung",        icon: "📏", color: "#9b59b6",
    fields: [
      { key: "series",   label: "Baureihe",        type: "select", options: ["MGN9","MGN12","MGN15","SBR12","SBR16","SBR20","HGR15","HGR20","HGR25","HGR30"], required: true },
      { key: "length",   label: "Schienenlänge",   type: "number", unit: "mm", required: true },
      { key: "carriages",label: "Anz. Wagen",      type: "number" },
      { key: "class",    label: "Genauigkeit",     type: "select", options: ["Normal","H (hoch)","P (präzision)"] },
      { key: "preload",  label: "Vorspannung",     type: "select", options: ["Z0","Z1","Z2","Z3"] },
    ]},
  { id: "t-ballscrew",  group: "linear",     name: "Kugelgewindespindel",  icon: "🔩", color: "#9b59b6",
    fields: [
      { key: "diameter", label: "Nenndurchm.",     type: "number", unit: "mm", required: true },
      { key: "pitch",    label: "Steigung",        type: "number", unit: "mm", required: true, hint: "z.B. 2, 4, 5, 10" },
      { key: "length",   label: "Gesamtlänge",     type: "number", unit: "mm", required: true },
      { key: "nut",      label: "Muttertyp",       type: "select", options: ["Einfach","Doppelt vorgespannt","Flanschmutter"] },
      { key: "accuracy", label: "Genauigkeit",     type: "select", options: ["C7","C5","C3"] },
    ]},
  { id: "t-bearing",    group: "mechanic",   name: "Lager",                icon: "⭕", color: "#27ae60",
    fields: [
      { key: "type",     label: "Lagertyp",        type: "select", options: ["Rillenkugellager","Pendelkugellager","Kegelrollenlager","Nadellager","Linearkugellager","Gleitlager"], required: true },
      { key: "desig",    label: "Bezeichnung",     type: "text",   hint: "z.B. 608, 6205, LM12UU" },
      { key: "id",       label: "Innen-Ø (d)",     type: "number", unit: "mm", required: true },
      { key: "od",       label: "Außen-Ø (D)",     type: "number", unit: "mm" },
      { key: "width",    label: "Breite (B)",      type: "number", unit: "mm" },
      { key: "seal",     label: "Abdichtung",      type: "select", options: ["offen","Z","2Z","RS","2RS"] },
    ]},
  { id: "t-damper",     group: "mechanic",   name: "Dämpfer / Feder",      icon: "🔴", color: "#e74c3c",
    fields: [
      { key: "type",     label: "Typ",             type: "select", options: ["Gummidämpfer","Hydraulisch","Elastomer","Gasdruckfeder","Zugfeder","Druckfeder"], required: true },
      { key: "stroke",   label: "Hub",             type: "number", unit: "mm" },
      { key: "force",    label: "Kraft",           type: "number", unit: "N" },
      { key: "thread",   label: "Gewinde",         type: "text",   hint: "z.B. M10×1.25" },
      { key: "length",   label: "Einbaulänge",     type: "number", unit: "mm" },
    ]},
  { id: "t-screw",      group: "normpart",   name: "Schraube",             icon: "🔩", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Norm",            type: "select", options: ["ISO 4762","ISO 7380","ISO 10642","DIN 933","DIN 931","ISO 4026"], required: true },
      { key: "thread",   label: "Gewinde",         type: "text",   required: true, hint: "z.B. M3, M4, M5" },
      { key: "length",   label: "Länge",           type: "number", unit: "mm", required: true },
      { key: "material", label: "Material",        type: "select", options: ["Stahl 8.8","Stahl 10.9","Edelstahl A2","Edelstahl A4","Messing"] },
      { key: "drive",    label: "Antrieb",         type: "select", options: ["Innensechskant","Torx","Kreuzschlitz","Außensechskant"] },
    ]},
  { id: "t-nut",        group: "normpart",   name: "Mutter",               icon: "⭕", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Norm",            type: "select", options: ["ISO 4032","ISO 4033","DIN 985","ISO 7042","ISO 10511"], required: true },
      { key: "thread",   label: "Gewinde",         type: "text",   required: true, hint: "z.B. M3, M4, M6" },
      { key: "material", label: "Material",        type: "select", options: ["Stahl","Edelstahl A2","Edelstahl A4","Messing"] },
    ]},
  { id: "t-snap",       group: "normpart",   name: "Rastelement",          icon: "🔘", color: "#7f8c8d",
    fields: [
      { key: "norm",     label: "Norm",            type: "text",   required: true, hint: "z.B. DIN 1481, ISO 8752" },
      { key: "size",     label: "Größe",           type: "text",   required: true, hint: "z.B. 3×22" },
      { key: "material", label: "Material",        type: "select", options: ["Federstahl","Edelstahl A2","Edelstahl A4","Messing"] },
    ]},
  { id: "t-profile",    group: "structure",  name: "Profil / Strukturteil",icon: "📐", color: "#16a085",
    fields: [
      { key: "type",     label: "Profiltyp",       type: "select", options: ["Aluprofilsystem","Rechteckrohr","Rundrohr","L-Profil","U-Profil","T-Profil","Flachstahl"], required: true },
      { key: "size",     label: "Abmessung",       type: "text",   required: true, hint: "z.B. 40×40, Ø25×2" },
      { key: "length",   label: "Länge",           type: "number", unit: "mm", required: true },
      { key: "material", label: "Material",        type: "select", options: ["Aluminium","Stahl S235","Edelstahl","Messing","Kunststoff"] },
      { key: "slot",     label: "Nut",             type: "text",   hint: "z.B. Nut 8, Nut 6" },
    ]},
  { id: "t-sensor",     group: "sensor",     name: "Sensor",               icon: "📡", color: "#2980b9",
    fields: [
      { key: "type",     label: "Sensortyp",       type: "select", options: ["Endschalter","Induktiv","Kapazitiv","Optisch","Ultraschall","Temperatursensor","Drucksensor","IMU","Encoder","Hall-Sensor"], required: true },
      { key: "voltage",  label: "Versorgung",      type: "text",   unit: "V" },
      { key: "output",   label: "Ausgang",         type: "select", options: ["Digital NPN","Digital PNP","Analog 0-10V","Analog 4-20mA","I2C","SPI","UART","Quadratur"] },
      { key: "range",    label: "Messbereich",     type: "text",   hint: "z.B. 0-100mm" },
    ]},
  { id: "t-cable",      group: "connection", name: "Kabel / Leitung",      icon: "🔌", color: "#8e44ad",
    fields: [
      { key: "type",     label: "Leitungstyp",     type: "select", options: ["Einzelader","Steuerleitung","Schleppkettenleitung","Koaxial","Netzleitung","Datenkabel"], required: true },
      { key: "cross",    label: "Querschnitt",     type: "text",   unit: "mm²", required: true, hint: "z.B. 0.25, 0.5, 1.5" },
      { key: "cores",    label: "Aderanzahl",      type: "number" },
      { key: "length",   label: "Länge",           type: "number", unit: "m" },
      { key: "shielded", label: "Geschirmt",       type: "select", options: ["Nein","Ja"] },
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "[]";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── API Key Management ────────────────────────────────────────────────────────
const KEY_STORAGE = "partsdb-api-key";
const getApiKey = () => { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } };
const saveApiKey = (k) => { try { localStorage.setItem(KEY_STORAGE, k); } catch {} };
const clearApiKey = () => { try { localStorage.removeItem(KEY_STORAGE); } catch {} };

function apiHeaders(key) {
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "[]";
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "{}";
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
    --green: #3fb950;
    --green2: #238636;
    --green3: #1a7f37;
    --blue: #58a6ff;
    --orange: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
    --accent: #39d353;
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
    font-size: 18px;
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
    background: linear-gradient(135deg, #1a3a4a, #1a2a3a);
    color: var(--blue);
    border-color: #2a4a6a;
  }
  .btn-ai:hover { background: linear-gradient(135deg, #1e4055, #1e3045); }
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
    color: var(--orange);
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
    const sb = await getSb();
    if (!sb) { setErr("Kein Supabase verbunden. Zuerst unter Einstellungen konfigurieren."); setLoading(false); return; }
    try {
      if (tab === "register") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Bestätigungs-E-Mail gesendet! Bitte E-Mail bestätigen dann einloggen.");
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLoggedIn(data.user);
      }
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <div className="auth-modal-tabs">
          <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setErr(""); setMsg(null); }}>Einloggen</button>
          <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setErr(""); setMsg(null); }}>Registrieren</button>
        </div>

        {tab === "register" && (
          <div style={{ background: "rgba(57,211,83,0.06)", border: "1px solid rgba(57,211,83,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
            🎉 <strong style={{ color: "var(--green)" }}>Beta — Cloud-Sync kostenlos.</strong>{" "}
            Early-Access-Nutzer zahlen später dauerhaft weniger als Neukunden.
          </div>
        )}

        <div className="form-row">
          <label>E-Mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        <div className="form-row">
          <label>Passwort {tab === "register" && <span style={{ color: "var(--text3)" }}>(mind. 8 Zeichen)</span>}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>⚠️ {err}</div>}
        {msg && <div style={{ color: "var(--green)", fontSize: 12, marginBottom: 10 }}>✓ {msg}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={loading || !email || !password} onClick={handle}>
            {loading ? <><span className="spinner" /></> : tab === "login" ? "Einloggen" : "Konto erstellen"}
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
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Migration abgeschlossen!</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
                Alle lokalen Daten sind jetzt in der Cloud gesichert.
              </div>
              <button className="btn btn-primary" onClick={onDone}>Los geht's →</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">☁️ Lokale Daten in Cloud übertragen?</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
              Es wurden <strong style={{ color: "var(--text)" }}>{total} lokale Einträge</strong> gefunden
              ({localData.parts?.length || 0} Bauteile, {localData.projects?.length || 0} Projekte).
              Sollen diese in dein Cloud-Konto übertragen werden?
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onSkip}>Überspringen</button>
              <button className="btn btn-primary" disabled={migrating} onClick={migrate}>
                {migrating ? <><span className="spinner" /> Übertrage…</> : "☁️ Jetzt übertragen"}
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
  const [step, setStep] = useState(1);
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testKey = async () => {
    if (!key.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: apiHeaders(key.trim()),
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });
      if (res.ok) {
        setTestResult("ok");
        saveApiKey(key.trim());
        setTimeout(() => onDone(), 800);
      } else {
        const e = await res.json();
        setTestResult("error:" + (e.error?.message || "Ungültiger Key"));
      }
    } catch (e) {
      setTestResult("error:" + e.message);
    }
    setTesting(false);
  };

  const S = { // styles shorthand
    card: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 12 },
    num: { width: 28, height: 28, borderRadius: "50%", background: "var(--green2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
    numDone: { background: "var(--bg3)", color: "var(--text3)" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div className="logo"><span>⚡</span><span>PartsDB</span><span className="logo-badge">v1</span></div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, width: "100%" }}>

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Willkommen bei PartsDB</h1>
            <p style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.7 }}>
              KI-gestützte Bauteil-Datenbank & BOM-Manager mit AliExpress-Händler-Suche.
              <br />Kostenlos. Deine Daten bleiben lokal in deinem Browser.
            </p>
          </div>

          {/* Was brauchst du */}
          <div style={{ background: "rgba(57,211,83,0.06)", border: "1px solid rgba(57,211,83,0.2)", borderRadius: 10, padding: "16px 20px", marginBottom: 24, fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--text)" }}>Warum ein Anthropic API Key?</strong><br />
            Die KI-Funktionen (Händlersuche, BOM-Import, Lieferantensuche) laufen direkt über die Anthropic API.
            Du zahlst nur für das was du nutzt — typisch <strong style={{ color: "var(--text)" }}>€0,01–0,05 pro Suche</strong>.
            Der Key wird ausschließlich lokal in deinem Browser gespeichert, nie an einen Server übertragen.
          </div>

          {/* Steps */}
          <div style={S.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ ...S.num, ...(step > 1 ? S.numDone : {}) }}>{step > 1 ? "✓" : "1"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Anthropic-Konto erstellen</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8, lineHeight: 1.6 }}>
                  Kostenlos unter console.anthropic.com — du bekommst ein Startguthaben das für viele Stunden Nutzung reicht.
                </div>
                <a href="https://console.anthropic.com" target="_blank" rel="noopener"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--blue)", padding: "6px 14px", borderRadius: 6, fontSize: 13, textDecoration: "none", fontWeight: 500 }}>
                  🔗 console.anthropic.com ↗
                </a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ ...S.num, ...(step > 1 ? {} : S.numDone) }}>2</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>API Key erstellen</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
                  Im Anthropic Console: <span style={{ fontFamily: "IBM Plex Mono", background: "var(--bg3)", padding: "1px 6px", borderRadius: 3 }}>API Keys → Create Key</span> → Key kopieren
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ ...S.num }}>3</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Key eintragen & loslegen</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={key}
                    onChange={e => { setKey(e.target.value); setTestResult(null); }}
                    placeholder="sk-ant-api03-…"
                    type="password"
                    style={{ flex: 1, background: "var(--bg3)", border: `1px solid ${testResult === "ok" ? "var(--green)" : testResult?.startsWith("error") ? "var(--red)" : "var(--border2)"}`, color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Mono" }}
                    onKeyDown={e => e.key === "Enter" && testKey()}
                  />
                  <button className="btn btn-primary" onClick={testKey} disabled={testing || !key.trim()}>
                    {testing ? <><span className="spinner" />Prüfe…</> : testResult === "ok" ? "✓ Gültig!" : "Bestätigen"}
                  </button>
                </div>
                {testResult?.startsWith("error:") && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>
                    ⚠️ {testResult.replace("error:", "")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Skip */}
          <div style={{ textAlign: "center" }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--text3)" }} onClick={onDone}>
              Erstmal ohne KI-Funktionen starten →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── API Key Settings Modal ────────────────────────────────────────────────────
function ApiKeyModal({ onClose }) {
  const [key, setKey] = useState(getApiKey());
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const testAndSave = async () => {
    if (!key.trim()) { clearApiKey(); onClose(); return; }
    setTesting(true); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: apiHeaders(key.trim()),
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 10, messages: [{ role: "user", content: "Hi" }] }),
      });
      if (res.ok) { saveApiKey(key.trim()); setResult("ok"); setTimeout(onClose, 700); }
      else { const e = await res.json(); setResult("error:" + (e.error?.message || "Fehler")); }
    } catch (e) { setResult("error:" + e.message); }
    setTesting(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-title">🔑 Anthropic API Key</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
          Dein Key wird nur lokal in deinem Browser gespeichert (localStorage) und nie an Server übertragen.
        </div>
        <div className="form-row">
          <label>API Key</label>
          <input value={key} onChange={e => { setKey(e.target.value); setResult(null); }} type="password"
            placeholder="sk-ant-api03-…" style={{ fontFamily: "IBM Plex Mono" }} onKeyDown={e => e.key === "Enter" && testAndSave()} />
        </div>
        {result === "ok" && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>✓ Key gültig und gespeichert!</div>}
        {result?.startsWith("error:") && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>⚠️ {result.replace("error:", "")}</div>}
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
          Key erstellen: <a href="https://console.anthropic.com" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>console.anthropic.com → API Keys ↗</a>
        </div>
        <div className="modal-actions">
          {getApiKey() && <button className="btn btn-danger" style={{ marginRight: "auto", padding: "6px 12px", fontSize: 13 }} onClick={() => { clearApiKey(); onClose(); }}>Key entfernen</button>}
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={testing} onClick={testAndSave}>
            {testing ? <><span className="spinner" /> Prüfe…</> : "Speichern & testen"}
          </button>
        </div>
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
        const sb = await getSb();
        const { data } = await sb?.auth.getUser() || {};
        cloudUser = data?.user || null;
      } catch {}
      if (cloudUser) {
        setUser(cloudUser); setSyncState("syncing");
        const cloud = await sbLoadAll(cloudUser.id);
        if (cloud) { setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems); setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops); setSyncState("online"); }
        else setSyncState("offline");
      } else {
        const [p, pr, b, s, sh] = await Promise.all([loadLocal(STORAGE_KEYS.parts), loadLocal(STORAGE_KEYS.projects), loadLocal(STORAGE_KEYS.bomItems), loadLocal(STORAGE_KEYS.suppliers), loadLocal(STORAGE_KEYS.shops, DEFAULT_SHOPS)]);
        setParts(p); setProjects(pr); setBomItems(b); setSuppliers(s); setShops(sh);
      }
      setLoaded(true);
      if (!getApiKey()) setShowOnboarding(true);
    })();
  }, []);

  useEffect(() => {
    const handler = (e) => setTab(e.detail);
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

  const handleLogout = async () => { const sb = await getSb(); await sb?.auth.signOut(); setUser(null); setSyncState("offline"); };

  const handleMigrationDone = async () => {
    setShowMigration(false); setSyncState("syncing");
    const cloud = await sbLoadAll(user.id);
    if (cloud) { setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems); setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops); setSyncState("online"); }
  };

  if (!loaded) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117", color:"#58a6ff", fontFamily:"IBM Plex Mono, monospace", fontSize:13 }}>
      <div style={{ textAlign:"center" }}><div className="spinner" style={{ width:24, height:24, margin:"0 auto 12px" }} />Lade…</div>
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
              { id: "bom",      icon: "📋", label: "BOM" },
              { id: "parts",    icon: "🗄️", label: "Bauteile" },
              { id: "sourcing", icon: "🛍️", label: "Sourcing" },
              { id: "shops",    icon: "🏪", label: "Shops" },
              { id: "import",   icon: "📥", label: "Import" },
            ].map(n => (
              <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
                {n.icon} {n.label}
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
              <button className="user-chip" onClick={handleLogout} title="Ausloggen">
                👤 {user.email?.split("@")[0]} ×
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAuthModal(true)}>
              ☁️ Anmelden / Registrieren
            </button>
          )}

          {/* API Key */}
          <button onClick={() => setShowKeyModal(true)}
            style={{ display:"flex", alignItems:"center", gap:6, background: apiKeySet ? "rgba(57,211,83,0.1)" : "rgba(248,81,73,0.1)", border:`1px solid ${apiKeySet ? "rgba(57,211,83,0.3)" : "rgba(248,81,73,0.3)"}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:12, color: apiKeySet ? "var(--green)" : "var(--red)", fontFamily:"IBM Plex Sans" }}>
            {apiKeySet ? "🔑 API Key" : "⚠️ Key fehlt"}
          </button>
        </header>

        {!user && (
          <div className="beta-bar">
            <span className="sync-dot offline" style={{ marginRight:6 }} />
            Lokal gespeichert ·{" "}
            <strong style={{ color:"var(--green)", marginLeft:4, marginRight:8 }}>Cloud-Sync kostenlos während der Beta</strong>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setShowAuthModal(true)}>
              ☁️ Jetzt aktivieren →
            </button>
          </div>
        )}

        <main className="main">
          {tab === "parts"    && <PartsTab    parts={parts} saveParts={saveParts} suppliers={suppliers} saveSuppliers={saveSuppliers} shops={shops} />}
          {tab === "bom"      && <BomTab      projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} parts={parts} suppliers={suppliers} />}
          {tab === "import"   && <ImportTab   parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />}
          {tab === "sourcing" && <SourcingTab projects={projects} bomItems={bomItems} parts={parts} />}
          {tab === "shops"    && <ShopsTab    shops={shops} saveShops={saveShops} />}
        </main>

        {showKeyModal  && <ApiKeyModal onClose={() => { setShowKeyModal(false); setApiKeySet(!!getApiKey()); }} />}
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
    if (!confirm("Bauteil löschen?")) return;
    saveParts(parts.filter(p => p.id !== id));
    saveSuppliers(suppliers.filter(s => s.partId !== id));
  };

  const partSuppliers = (id) => suppliers.filter(s => s.partId === id);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🗄️ Bauteil-Datenbank
          <span className="badge">{parts.length} Einträge</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Bauteil hinzufügen</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Suche nach Name, MPN, Hersteller…" value={query} onChange={e => setQuery(e.target.value)} />
        <select style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", padding: "7px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
          value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {cats.map(c => {
            const g = PART_GROUPS.find(g => g.id === c);
            return <option key={c} value={c}>{g ? `${g.icon} ${g.label}` : c}</option>;
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>Keine Bauteile {parts.length > 0 ? "gefunden" : "vorhanden"}</h3>
          <p>{parts.length === 0 ? "Füge dein erstes Bauteil hinzu." : "Andere Suchbegriffe versuchen."}</p>
        </div>
      ) : (
          <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name / Beschreibung</th>
                    <th>Kategorie</th>
                    <th>MPN</th>
                    <th>Schlüsselwerte</th>
                    <th>Lager</th>
                    <th>Lieferanten</th>
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
                                {stockWarn ? "⚠️" : ""} {p.stock} Stk{p.stockMin > 0 ? ` / min. ${p.stockMin}` : ""}
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
                            <button className="btn btn-ghost btn-sm" onClick={() => setDetailPart(p)}>Details</button>
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
        <div className="modal-title">➕ Neues Bauteil — Kategorie wählen</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          Wähle eine Kategorie für optimale Felder, oder überspringe für ein leeres Formular.
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
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{t.fields.length} Felder</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={handleSkipTemplate} style={{ fontSize: 12, color: "var(--text3)" }}>
            Ohne Kategorie fortfahren →
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
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
          {part ? "Bauteil bearbeiten" : "Neues Bauteil"}
          {!part && <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", fontSize: 11 }} onClick={() => setStep("template")}>← Kategorie ändern</button>}
        </div>

        <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
          {/* Basis-Felder */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 8 }}>ALLGEMEIN</div>
          <div className="form-grid">
            <div className="form-row" style={{ gridColumn: "1 / -1" }}>
              <label>Name / Bezeichnung *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder={selectedTemplate ? `z.B. ${selectedTemplate.name} XYZ` : "Bauteilname"} autoFocus />
            </div>
            <div className="form-row">
              <label>MPN / Hersteller-Nr.</label>
              <input value={form.mpn || ""} onChange={e => set("mpn", e.target.value)} className="mono" placeholder="Bestellnummer / Norm" />
            </div>
            <div className="form-row">
              <label>Hersteller</label>
              <input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} />
            </div>
          </div>

          {/* Template-spezifische Felder */}
          {fields.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>
                {selectedTemplate.icon} {selectedTemplate.name.toUpperCase()} — TECHNISCHE DATEN
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
                        <option value="">— wählen —</option>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>LAGER</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Lagerort / Schublade</label>
              <input value={form.drawer || ""} onChange={e => set("drawer", e.target.value)} placeholder="z.B. A3, Schublade 7, Regal B2" className="mono" />
            </div>
            <div className="form-row">
              <label>Lagerbestand</label>
              <input type="number" min="0" value={form.stock || 0} onChange={e => set("stock", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Mindestbestand</label>
              <input type="number" min="0" value={form.stockMin || 0} onChange={e => set("stockMin", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Datasheet URL</label>
              <input value={form.datasheet || ""} onChange={e => set("datasheet", e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className="form-row">
            <label>Notizen</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} style={{ minHeight: 56 }} placeholder="Interne Notizen, Alternativen…" />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.name}>
            {part ? "Speichern" : "Hinzufügen"}
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
      setAiError("KI-Suche fehlgeschlagen: " + e.message);
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>🏪 Bezugsquellen ({sups.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddSupForm({ shopName: "", sku: "", searchUrl: "", price: "", currency: "EUR", notes: "" })}>+ Manuell</button>
            <button className="btn btn-ai btn-sm" onClick={handleAiSearch} disabled={aiLoading}>
              {aiLoading ? <><span className="spinner" /> Suche…</> : "🤖 KI-Suche"}
            </button>
          </div>
        </div>

        {aiError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{aiError}</div>}

        {sups.length === 0 && !addSupForm && (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text3)", fontSize: 13 }}>
            Noch keine Bezugsquellen. Klicke auf <strong>KI-Suche</strong> um automatisch Shops zu finden.
          </div>
        )}

        {sups.map(s => (
          <div key={s.id} className="supplier-card">
            <div className="supplier-logo">{(s.shopName || "?").slice(0, 3).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.shopName}</span>
                {s.aiGenerated && <span style={{ fontSize: 10, background: "rgba(88,166,255,0.15)", color: "var(--blue)", padding: "1px 6px", borderRadius: 4 }}>KI</span>}
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
          <button className="btn btn-primary" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

function AddSupplierForm({ form, shops, onChange, onSave, onCancel }) {
  const set = (k, v) => onChange(f => ({ ...f, [k]: v }));
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>+ Bezugsquelle hinzufügen</div>
      <div className="form-grid">
        <div className="form-row">
          <label>Shop</label>
          <select value={form.shopId || ""} onChange={e => {
            const sh = shops.find(s => s.id === e.target.value);
            onChange(f => ({ ...f, shopId: e.target.value, shopName: sh?.name || f.shopName }));
          }}>
            <option value="">Eigener Shop</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Shop-Name</label>
          <input value={form.shopName} onChange={e => set("shopName", e.target.value)} placeholder="z.B. Reichelt" />
        </div>
        <div className="form-row">
          <label>Bestell-Nr / SKU</label>
          <input value={form.sku} onChange={e => set("sku", e.target.value)} className="mono" placeholder="z.B. ATM328P-PU" />
        </div>
        <div className="form-row">
          <label>Preis (€)</label>
          <input type="number" step="0.01" value={form.price} onChange={e => set("price", parseFloat(e.target.value) || "")} placeholder="2.50" />
        </div>
      </div>
      <div className="form-row">
        <label>Link zur Seite</label>
        <input value={form.searchUrl} onChange={e => set("searchUrl", e.target.value)} placeholder="https://…" />
      </div>
      <div className="form-row">
        <label>Notizen</label>
        <input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Verfügbarkeit, Lieferzeit, …" />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Abbrechen</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>Speichern</button>
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: apiHeaders(getApiKey()),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("API Fehler");
  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Supplier Dropdown Component ───────────────────────────────────────────────
function SupplierDropdown({ item, part, suppliers, onSelect }) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [showTip, setShowTip] = useState(false);
  const preferred = suppliers.find(s => s.id === item.preferredSupplierId);

  const handleSuggest = async (e) => {
    e.stopPropagation();
    if (!part || suppliers.length === 0) return;
    setSuggesting(true); setSuggestion(null);
    try {
      const result = await suggestBestSupplier(part, suppliers);
      setSuggestion(result);
      // Auto-select if we find a match
      const match = suppliers.find(s => s.shopName?.toLowerCase().includes(result.recommendedShopName?.toLowerCase()) || result.recommendedShopName?.toLowerCase().includes(s.shopName?.toLowerCase()));
      if (match) onSelect(match.id);
      setShowTip(true);
    } catch {}
    setSuggesting(false);
  };

  if (!part) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <select
          value={item.preferredSupplierId || ""}
          onChange={e => { onSelect(e.target.value || null); setSuggestion(null); setShowTip(false); }}
          style={{
            flex: 1,
            background: preferred ? "rgba(57,211,83,0.08)" : "var(--bg3)",
            border: `1px solid ${preferred ? "rgba(57,211,83,0.35)" : "var(--border)"}`,
            color: preferred ? "var(--text)" : "var(--text3)",
            padding: "4px 7px",
            borderRadius: 5,
            fontSize: 12,
            fontFamily: "IBM Plex Sans",
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          <option value="">— Shop wählen —</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>
              {s.shopName}{s.price ? ` · ${s.price.toFixed(2)}€` : ""}
            </option>
          ))}
          {suppliers.length === 0 && <option disabled>Keine Lieferanten hinterlegt</option>}
        </select>

        {/* AI suggest button */}
        {suppliers.length > 1 && (
          <button
            title="KI-Empfehlung"
            onClick={handleSuggest}
            disabled={suggesting}
            style={{ background: "rgba(88,166,255,0.1)", border: "1px solid rgba(88,166,255,0.25)", borderRadius: 5, padding: "4px 7px", cursor: "pointer", color: "var(--blue)", fontSize: 13, lineHeight: 1, flexShrink: 0 }}
          >
            {suggesting ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : "✨"}
          </button>
        )}

        {/* No suppliers → suggest adding */}
        {suppliers.length === 0 && (
          <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>Erst Lieferant hinzufügen</span>
        )}
      </div>

      {/* Suggestion tooltip */}
      {showTip && suggestion && (
        <div style={{ background: "rgba(88,166,255,0.07)", border: "1px solid rgba(88,166,255,0.2)", borderRadius: 5, padding: "5px 8px", fontSize: 11, color: "var(--text2)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--blue)" }}>✨ {suggestion.recommendedShopName}</span> — {suggestion.reason}
          {suggestion.warning && (
            <div style={{ color: "var(--orange)", marginTop: 2 }}>⚠️ {suggestion.warning}</div>
          )}
          <button onClick={() => setShowTip(false)} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", float: "right", fontSize: 12, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}

// ── BOM Tab ───────────────────────────────────────────────────────────────────
function BomTab({ projects, saveProjects, bomItems, saveBom, parts, suppliers }) {
  const [activeProject, setActiveProject] = useState(null);
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [showAddPart, setShowAddPart] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showCart, setShowCart] = useState(false);

  const projectBom = bomItems.filter(b => b.projectId === activeProject?.id);

  const createProject = () => {
    if (!newProjName.trim()) return;
    const p = { id: Date.now().toString(), name: newProjName.trim(), created: new Date().toISOString() };
    saveProjects([...projects, p]);
    setActiveProject(p); setNewProjName(""); setShowNewProj(false);
  };

  const deleteProject = (id) => {
    if (!confirm("Projekt und alle BOM-Einträge löschen?")) return;
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
    const rows = [["Qty", "Referenz", "Name", "MPN", "Hersteller", "Gehäuse", "Notizen", "Lieferant 1", "SKU 1", "Preis 1"]];
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

  const totalCost = projectBom.reduce((sum, item) => {
    const sups = suppliers.filter(s => s.partId === item.partId);
    const preferred = sups.find(s => s.id === item.preferredSupplierId);
    const price = preferred?.price || sups.reduce((m, s) => s.price && s.price < m ? s.price : m, Infinity);
    return sum + (price < Infinity ? price * item.quantity : 0);
  }, 0);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 Stücklisten-Manager</div>
      </div>

      <div className="two-col">
        {/* Projekte */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text2)" }}>PROJEKTE</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewProj(true)}>+ Neu</button>
          </div>

          {showNewProj && (
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <input className="search-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Projektname…" value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} autoFocus />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewProj(false)}>✕</button>
                <button className="btn btn-primary btn-sm" onClick={createProject}>Erstellen</button>
              </div>
            </div>
          )}

          {projects.length === 0 && !showNewProj && (
            <div className="empty-state" style={{ padding: 24 }}>
              <h3>Kein Projekt</h3>
              <p>Erstelle dein erstes Projekt.</p>
            </div>
          )}

          {projects.map(p => {
            const count = bomItems.filter(b => b.projectId === p.id).length;
            return (
              <div key={p.id} className={`project-card ${activeProject?.id === p.id ? "active" : ""}`} onClick={() => setActiveProject(p)}>
                <div className="pc-icon">⚙️</div>
                <div className="pc-info">
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-meta">{count} Position{count !== 1 ? "en" : ""} · {new Date(p.created).toLocaleDateString("de-DE")}</div>
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
              <h3>Projekt wählen</h3>
              <p>Wähle links ein Projekt oder erstelle ein neues.</p>
            </div>
          ) : (
            <>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{activeProject.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {totalCost > 0 && <span className="price-tag" style={{ fontSize: 13 }}>∑ ~{totalCost.toFixed(2)} €</span>}
                  <button className="export-btn" onClick={exportCSV}>⬇ CSV</button>
                  <button className="export-btn" style={{ color: "var(--orange)", borderColor: "rgba(210,153,34,0.3)" }} onClick={() => setShowCart(true)}>🛒 Warenkorb</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddPart(true)}>+ Bauteil</button>
                </div>
              </div>

              {projectBom.length === 0 ? (
                <div className="empty-state">
                  <h3>Leere Stückliste</h3>
                  <p>Klicke auf „+ Bauteil" um Positionen hinzuzufügen.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Bauteil</th>
                        <th>MPN</th>
                        <th>Referenz</th>
                        <th style={{ minWidth: 190 }}>Bevorzugter Shop</th>
                        <th>Preis</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectBom.map(item => {
                        const part = parts.find(p => p.id === item.partId);
                        const sups = suppliers.filter(s => s.partId === item.partId);
                        const preferred = sups.find(s => s.id === item.preferredSupplierId) || null;
                        const prefPrice = preferred?.price;
                        return (
                          <tr key={item.id}>
                            <td><span className="bom-qty">{item.quantity}×</span></td>
                            <td>
                              <div style={{ fontWeight: 500 }}>{part?.name || <span style={{ color: "var(--red)" }}>Gelöscht</span>}</div>
                              {part?.footprint && <div className="mono" style={{ color: "var(--text3)", fontSize: 11 }}>{part.footprint}</div>}
                            </td>
                            <td><span className="mono">{part?.mpn || "—"}</span></td>
                            <td><span className="mono" style={{ color: "var(--text2)" }}>{item.reference || "—"}</span></td>
                            <td>
                              <SupplierDropdown
                                item={item}
                                part={part}
                                suppliers={sups}
                                onSelect={(supId) => saveBom(bomItems.map(b => b.id === item.id ? { ...b, preferredSupplierId: supId } : b))}
                              />
                            </td>
                            <td>
                              {prefPrice
                                ? <span className="price-tag">{(prefPrice * item.quantity).toFixed(2)} €</span>
                                : <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>}
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
    notes: "Öffnet Reichelt-Warenkorb mit allen Artikeln direkt.",
  },
  conrad: {
    name: "Conrad",
    color: "#e8700a",
    logo: "CO",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => `https://www.conrad.de/search.html?search=${encodeURIComponent(it.sku || it.name)}`),
    exportCsv: null,
    notes: "Öffnet Suchergebnisse für jeden Artikel einzeln.",
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
    notes: "CSV exportieren → bei Mouser unter 'BOM Tool' hochladen.",
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
    notes: "CSV exportieren → bei DigiKey unter 'My Lists → Create from BOM' hochladen.",
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
    notes: "CSV exportieren → bei LCSC unter 'BOM Order' hochladen.",
  },
  berrybase: {
    name: "BerryBase",
    color: "#e63946",
    logo: "BB",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => `https://www.berrybase.de/search?sSearch=${encodeURIComponent(it.sku || it.name)}`),
    notes: "Öffnet Suchergebnisse für jeden Artikel.",
  },
  aliexpress: {
    name: "AliExpress",
    color: "#e62e04",
    logo: "AE",
    cartType: "url_single",
    buildUrl: (items) =>
      items.map(it => it.productUrl || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(it.name)}`),
    notes: "Öffnet Produktseiten/Suche. Manuell in den Warenkorb legen.",
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
      if (noSku.length > 0) setPopupWarning(`${noSku.length} Artikel ohne SKU übersprungen: ${noSku.map(i => i.name).join(", ")}`);
    } else if (cfg.cartType === "url_single") {
      const urls = cfg.buildUrl(shop.items);
      setPopupWarning(`${urls.length} Tabs werden geöffnet — Popup-Blocker deaktivieren falls nötig.`);
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
        <div className="modal-title">🛒 Warenkorb befüllen — {project.name}</div>

        {/* Coverage summary */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--green)" }}>{coveredItems}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>von {totalItems} mit Lieferant</div>
          </div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--blue)" }}>{shops.length}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>Shops mit Artikeln</div>
          </div>
          {unassigned.length > 0 && (
            <div style={{ background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.2)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--red)" }}>{unassigned.length}</div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>ohne Lieferant</div>
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
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 6 }}>Noch keine Lieferanten eingetragen</div>
            <div style={{ fontSize: 12 }}>Gehe zu „Bauteile" → Detail → KI-Suche oder manuell Shops hinzufügen.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 300 }}>
            {/* Shop list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.06em", marginBottom: 8 }}>SHOPS</div>
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
                        <div style={{ fontSize: 11, color: "var(--text2)" }}>{shop.items.length} Artikel</div>
                      </div>
                    </div>
                    {/* Cart type badge */}
                    {cfg && (
                      <div style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, display: "inline-block", background: cfg.cartType === "url_multi" ? "rgba(57,211,83,0.15)" : cfg.cartType === "bom_csv" ? "rgba(88,166,255,0.15)" : "rgba(210,153,34,0.15)", color: cfg.cartType === "url_multi" ? "var(--green)" : cfg.cartType === "bom_csv" ? "var(--blue)" : "var(--orange)" }}>
                        {cfg.cartType === "url_multi" ? "🛒 Direkt" : cfg.cartType === "bom_csv" ? "📄 CSV-Upload" : "🔗 Einzellinks"}
                      </div>
                    )}
                    {withSku > 0 && withSku < shop.items.length && (
                      <div style={{ fontSize: 10, color: "var(--orange)", marginTop: 2 }}>{shop.items.length - withSku} ohne SKU</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Shop detail */}
            <div>
              {!activeShop ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: 13, flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 24 }}>←</span>Shop auswählen
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
                          {cfg?.cartType === "bom_csv" ? "📄 CSV exportieren" :
                           cfg?.cartType === "url_multi" ? "🛒 Warenkorb öffnen" :
                           "🔗 Artikel öffnen"}
                        </button>
                        {cfg?.cartType === "bom_csv" && cfg?.uploadUrl && (
                          <div style={{ marginTop: 6 }}>
                            <a href={cfg.uploadUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>
                              → {cfg.name} BOM-Tool öffnen ↗
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Item list */}
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "6px 10px", background: "var(--bg3)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.04em" }}>
                        <div>Qty</div><div>Bauteil</div><div>SKU</div><div>Preis</div>
                      </div>
                      {activeShop.items.map((it, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "7px 10px", borderTop: "1px solid var(--border)", fontSize: 12, alignItems: "center" }}>
                          <div style={{ fontFamily: "IBM Plex Mono", color: "var(--text2)" }}>{it.qty}×</div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{it.name}</div>
                            {it.mpn && <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "IBM Plex Mono" }}>{it.mpn}</div>}
                          </div>
                          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: it.sku ? "var(--text)" : "var(--red)" }}>
                            {it.sku || "fehlt"}
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>Ohne Lieferant — noch nicht bestellbar:</div>
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
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
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
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">➕ Bauteil zur Stückliste hinzufügen</div>
        <div className="form-row">
          <label>Bauteil suchen</label>
          <input value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} placeholder="Name oder MPN…" autoFocus />
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 14, border: "1px solid var(--border)", borderRadius: 6 }}>
          {filtered.length === 0 && <div style={{ padding: "12px 14px", color: "var(--text3)", fontSize: 13 }}>Keine Treffer</div>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              style={{
                padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                background: selected?.id === p.id ? "rgba(57,211,83,0.08)" : "transparent",
                borderLeft: selected?.id === p.id ? "2px solid var(--green)" : "2px solid transparent"
              }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name} {existingIds.includes(p.id) && <span style={{ fontSize: 11, color: "var(--orange)" }}>(bereits in BOM)</span>}</div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>{p.mpn} · {p.category} · {p.footprint}</div>
            </div>
          ))}
        </div>
        {selected && (
          <div className="form-grid">
            <div className="form-row">
              <label>Anzahl *</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="form-row">
              <label>Referenz (z.B. R1, C3)</label>
              <input value={ref} onChange={e => setRef(e.target.value)} className="mono" placeholder="z.B. U1, C12" />
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={!selected} onClick={() => onAdd({ partId: selected.id, quantity: qty, reference: ref, notes })}>
            Hinzufügen
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
        <div className="modal-title">✏️ {part?.name || "Bauteil"} bearbeiten</div>
        <div className="form-grid">
          <div className="form-row">
            <label>Anzahl</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
          </div>
          <div className="form-row">
            <label>Referenz</label>
            <input value={ref} onChange={e => setRef(e.target.value)} className="mono" />
          </div>
        </div>
        <div className="form-row">
          <label>Notizen</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...item, quantity: qty, reference: ref, notes })}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

// ── CSV/Excel Structured Importer ─────────────────────────────────────────────
const BOM_FIELDS = [
  { id: "name",         label: "Name / Bezeichnung", required: true },
  { id: "quantity",     label: "Menge",               required: true },
  { id: "reference",    label: "Referenz (R1, C3…)",  required: false },
  { id: "mpn",          label: "MPN / Bestell-Nr.",    required: false },
  { id: "manufacturer", label: "Hersteller",           required: false },
  { id: "footprint",    label: "Gehäuse / Footprint",  required: false },
  { id: "value",        label: "Wert (10k, 100nF…)",  required: false },
  { id: "description",  label: "Beschreibung",         required: false },
  { id: "category",     label: "Kategorie",            required: false },
  { id: "_ignore",      label: "— Ignorieren —",       required: false },
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
    const CATS = ["Widerstand","Kondensator","Induktivität","IC","Transistor","Diode","LED","Relais","Stecker","Schalter","Sensor","MCU","MOSFET","Modul","Mechanik","Kabel","Sonstiges"];
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
          notes: `Importiert aus: ${fileName}`,
        };
        newParts.push(part); addedParts++;
      }
      const exists = newBom.find(b => b.projectId === project.id && b.partId === part.id);
      if (exists) { exists.quantity += item.quantity; }
      else {
        newBom.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), projectId: project.id, partId: part.id, quantity: item.quantity, reference: item.reference || "", notes: item.value ? `Wert: ${item.value}` : "" });
        addedItems++;
      }
    }
    saveParts(newParts); saveBom(newBom);
    setImportDone({ project: project.name, addedParts, addedItems, total: enabled.length });
    setCsvStep(4); setImporting(false);
  };

  const reset = () => { setCsvStep(1); setHeaders([]); setRawRows([]); setMapping({}); setFileName(""); setEditableItems([]); setImportDone(null); setTargetProject("new"); setNewProjectName(""); };

  const CATS = ["Widerstand","Kondensator","Induktivität","IC","Transistor","Diode","LED","Relais","Stecker","Schalter","Sensor","MCU","MOSFET","Modul","Mechanik","Kabel","Sonstiges"];
  const fieldsMapped = Object.values(mapping).filter(v => v !== "_ignore");
  const hasName = fieldsMapped.includes("name");
  const hasQty = fieldsMapped.includes("quantity");

  return (
    <div>
      {/* Steps */}
      <div className="import-steps" style={{ marginBottom: 24 }}>
        {[{n:1,label:"Datei"},{n:2,label:"Spalten zuordnen"},{n:3,label:"Prüfen"},{n:4,label:"Fertig"}].map(s => (
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
            <div className="drop-zone-text">{loadingXlsx ? "Lade Excel-Parser…" : "CSV oder Excel-Datei hochladen"}</div>
            <div className="drop-zone-sub">.csv · .xlsx · .xls · .ods · .tsv — Trennzeichen wird automatisch erkannt</div>
          </div>
          <div style={{ marginTop: 20, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--text2)" }}>Kompatibel mit jedem CAD- und PCB-Tool</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {["SolidWorks","Fusion 360","CATIA","Inventor","FreeCAD","Onshape","KiCad","Altium","Eagle","EasyEDA","OrCAD","Zuken","Excel / Google Sheets","Eigenes Format"].map(h =>
                <span key={h} className="field-chip">{h}</span>)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              Spaltenbezeichnungen in jeder Sprache — Deutsch, Englisch, Französisch, Japanisch, Chinesisch usw. werden automatisch erkannt.
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
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{rawRows.length} Zeilen · {headers.length} Spalten erkannt</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={reset}>← Zurück</button>
          </div>

          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, padding: "8px 14px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.05em" }}>
              <div>SPALTE IN DATEI</div><div></div><div>FELD IN BOM</div>
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

          {!hasName && <div style={{ color: "var(--orange)", fontSize: 13, marginBottom: 10 }}>⚠️ Bitte mindestens „Name / Bezeichnung" zuordnen.</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text2)", alignSelf: "center" }}>
              {fieldsMapped.filter(f => f !== "_ignore").length} Felder zugeordnet
            </div>
            <button className="btn btn-primary" disabled={!hasName} onClick={applyMapping}>
              Vorschau →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Edit */}
      {csvStep === 3 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {editableItems.filter(i => i._enabled).length} / {editableItems.length} Positionen
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:true})))}>Alle</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:false})))}>Keine</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCsvStep(2)}>← Zurück</button>
            </div>
          </div>

          {/* Target project */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Importieren in:</div>
            <select style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
              value={targetProject} onChange={e => setTargetProject(e.target.value)}>
              <option value="new">+ Neues Projekt</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetProject === "new" && (
              <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Projektname"
                style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 160 }} />
            )}
          </div>

          <div className="table-wrap" style={{ marginBottom: 14, maxHeight: 420, overflowY: "auto" }}>
            <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em", position: "sticky", top: 0, zIndex: 1 }}>
              <div>✓</div><div>Name</div><div>Qty</div><div>Kategorie</div><div>MPN</div><div>Referenz</div><div></div>
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
              {importing ? <><span className="spinner" /> Importiere…</> : `✅ ${editableItems.filter(i => i._enabled).length} Positionen importieren`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {csvStep === 4 && importDone && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import erfolgreich!</div>
          <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Projekt: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong></div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[{val:importDone.total,label:"Positionen",color:"var(--blue)"},{val:importDone.addedParts,label:"Neue Bauteile in DB",color:"var(--green)"},{val:importDone.addedItems,label:"BOM-Einträge",color:"var(--purple)"}].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={reset}>Weiteren Import</button>
            <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("switchTab", { detail: "bom" }))}>→ Zur Stückliste</button>
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
          notes: item.value ? `Wert: ${item.value}` : "",
        });
        addedItems++;
      }
    }

    saveParts(newParts);
    saveBom(newBomEntries);
    setImportDone({ project: project.name, addedParts, addedItems, total: enabledItems.length });
    setStep(3);
    setImporting(false);
  };

  const reset = () => {
    setStep(1); setRawText(""); setFileName(""); setParseResult(null);
    setItems([]); setParseError(""); setImportDone(null); setPasteMode(false);
    setNewProjectName(""); setTargetProject("new");
  };

  const CATS = ["Widerstand", "Kondensator", "Induktivität", "IC", "Transistor", "Diode", "LED", "Relais", "Stecker", "Schalter", "Sensor", "MCU", "MOSFET", "Modul", "Mechanik", "Kabel", "Sonstiges"];

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📥 BOM Import</div>
        {step > 1 && mode === "ai" && <button className="btn btn-secondary" onClick={reset}>↺ Neu starten</button>}
      </div>

      {/* Mode switcher */}
      <div className="tabs-inner" style={{ marginBottom: 24 }}>
        <button className={`tab-inner-btn ${mode === "csv" ? "active" : ""}`} onClick={() => { setMode("csv"); }}>
          📊 CSV / Excel
        </button>
        <button className={`tab-inner-btn ${mode === "ai" ? "active" : ""}`} onClick={() => { setMode("ai"); }}>
          🤖 KI-Import (beliebige Formate)
        </button>
      </div>

      {mode === "csv" && (
        <CsvExcelImporter parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />
      )}

      {mode === "ai" && <>
      {/* Steps */}
      <div className="import-steps">
        {[
          { n: 1, label: "Datei / Text" },
          { n: 2, label: "Prüfen & Bearbeiten" },
          { n: 3, label: "Importiert" },
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
            <button className={`tab-inner-btn ${!pasteMode ? "active" : ""}`} onClick={() => setPasteMode(false)}>📁 Datei hochladen</button>
            <button className={`tab-inner-btn ${pasteMode ? "active" : ""}`} onClick={() => setPasteMode(true)}>📋 Text einfügen</button>
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
                    <div className="drop-zone-text">Datei hierher ziehen oder klicken</div>
                    <div className="drop-zone-sub">CSV, JSON, TXT, XML, KiCad, Eagle, Altium, YAML – jedes Format</div>
                  </>}
            </div>
          ) : (
            <div>
              <textarea
                style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", padding: "12px 14px", borderRadius: 8, fontFamily: "IBM Plex Mono, monospace", fontSize: 12, minHeight: 220, resize: "vertical" }}
                placeholder={"Füge hier den Report-Inhalt ein…\n\nBeispiele:\n- CSV mit Spalten: Qty, Reference, Value, Footprint\n- JSON-Array mit Bauteilen\n- Freitext wie: 2x ATmega328P, 10x 10kΩ 0805…\n- KiCad Netliste, Eagle BOM, …"}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
              />
            </div>
          )}

          {rawText && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                {rawText.length.toLocaleString()} Zeichen · {rawText.split("\n").length} Zeilen
              </div>
              <div style={{ marginLeft: "auto" }}>
                <button className="btn btn-ai" onClick={handleParse} disabled={parsing}>
                  {parsing ? <><span className="spinner" /> Analysiere…</> : "🤖 KI-Analyse starten"}
                </button>
              </div>
            </div>
          )}

          {parseError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{parseError}</div>}

          <div style={{ marginTop: 28, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--text2)" }}>Unterstützte Formate</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["KiCad BOM", "Eagle BOM", "Altium BOM", "CSV/Excel-Export", "JSON-Array", "Freitext", "Markdown-Tabelle", "YAML", "FocusPilot Reports", "Eigene Formate"].map(f => (
                <span key={f} className="field-chip">{f}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10 }}>
              Die KI erkennt das Format automatisch und extrahiert Bauteile, Mengen, MPNs und Referenzbezeichner.
              Unbekannte Felder werden bestmöglich interpretiert.
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
                  {parseResult.confidence === "high" ? "Sicher" : parseResult.confidence === "medium" ? "Unsicher" : "Niedrig"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{parseResult.notes}</div>
              <div>
                {(parseResult.fields_found || []).map(f => <span key={f} className="field-chip">{f}</span>)}
              </div>
            </div>
          </div>

          {/* Ziel-Projekt */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Importieren in:</div>
            <select
              style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
              value={targetProject} onChange={e => setTargetProject(e.target.value)}
            >
              <option value="new">+ Neues Projekt</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetProject === "new" && (
              <input
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Projektname"
                style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 180 }}
              />
            )}
          </div>

          {/* Items Table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {items.filter(i => i._enabled).length} / {items.length} Positionen ausgewählt
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: true })))}>Alle auswählen</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: false })))}>Alle abwählen</button>
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            {/* Header */}
            <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em" }}>
              <div>✓</div>
              <div>Name / Beschreibung</div>
              <div>Qty</div>
              <div>Kategorie</div>
              <div>MPN</div>
              <div>Referenz</div>
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
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Zurück</button>
            <button className="btn btn-primary"
              disabled={importing || items.filter(i => i._enabled).length === 0 || (targetProject === "new" && !newProjectName)}
              onClick={handleImport}>
              {importing ? <><span className="spinner" /> Importiere…</> : `✅ ${items.filter(i => i._enabled).length} Positionen importieren`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && importDone && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import erfolgreich!</div>
          <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>
            Projekt: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong>
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[
              { val: importDone.total, label: "Positionen", color: "var(--blue)" },
              { val: importDone.addedParts, label: "Neue Bauteile in DB", color: "var(--green)" },
              { val: importDone.addedItems, label: "BOM-Einträge", color: "var(--purple)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={reset}>Weiteren Import</button>
            <button className="btn btn-primary" onClick={() => {
              // Dispatch a custom event to switch tab - handled via window
              window.dispatchEvent(new CustomEvent("switchTab", { detail: "bom" }));
            }}>→ Zur Stückliste</button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

// ── Sourcing API (Claude + Web Search) ───────────────────────────────────────
async function findAliExpressStores(parts) {
  // Search for each part individually, collect store mentions
  const results = [];

  for (const part of parts) {
    const query = [part.mpn, part.name, part.value].filter(Boolean).join(" ");
    const prompt = `Suche auf AliExpress nach: "${query}"
Finde 3-5 konkrete AliExpress-Händler/Stores die dieses Bauteil verkaufen.
Antworte NUR mit JSON, kein Markdown:
{
  "part": "${query}",
  "stores": [
    {
      "storeName": "Exact Store Name on AliExpress",
      "storeUrl": "https://www.aliexpress.com/store/...",
      "productUrl": "https://www.aliexpress.com/item/...",
      "priceEur": 1.23,
      "minOrder": 1,
      "rating": 4.8,
      "note": "z.B. Großhändler, schneller Versand"
    }
  ]
}
Falls kein direkter Treffer: gib ähnliche Alternativen. Schätze Preise realistisch.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(c => c.type === "text").map(c => c.text).join("") || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      results.push({ partId: part.id, partName: part.name, query, stores: parsed.stores || [] });
    } catch (e) {
      results.push({ partId: part.id, partName: part.name, query, stores: [], error: e.message });
    }
  }
  return results;
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

// ── Sourcing Tab ──────────────────────────────────────────────────────────────
function SourcingTab({ projects, bomItems, parts }) {
  const [selectedProject, setSelectedProject] = useState("");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [searchResults, setSearchResults] = useState(null);
  const [aggregated, setAggregated] = useState([]);
  const [expandedStore, setExpandedStore] = useState(null);
  const [error, setError] = useState("");
  const [filterMin, setFilterMin] = useState(1); // min parts coverage

  const projectBom = bomItems.filter(b => b.projectId === selectedProject);
  const projectParts = projectBom.map(b => {
    const part = parts.find(p => p.id === b.partId);
    return part ? { ...part, quantity: b.quantity, reference: b.reference } : null;
  }).filter(Boolean);

  const totalParts = projectParts.length;

  const handleSearch = async () => {
    if (!selectedProject || projectParts.length === 0) return;
    setSearching(true); setError(""); setSearchResults(null); setAggregated([]);
    setProgress({ done: 0, total: projectParts.length, current: "" });

    const results = [];
    for (let i = 0; i < projectParts.length; i++) {
      const part = projectParts[i];
      setProgress({ done: i, total: projectParts.length, current: part.name });
      const query = [part.mpn, part.name, part.value].filter(Boolean).join(" ");
      const prompt = `Suche auf AliExpress nach dem Elektronikbauteil: "${query}"
Finde 3-5 konkrete AliExpress-Händler die dieses Bauteil verkaufen.
Antworte NUR mit einem JSON-Objekt, kein Markdown, kein Text davor oder danach:
{"stores":[{"storeName":"Name des Stores","storeUrl":"https://www.aliexpress.com/store/...","productUrl":"https://www.aliexpress.com/item/...","priceEur":1.23,"minOrder":1,"rating":4.8,"note":"Kurze Notiz"}]}`;

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: apiHeaders(getApiKey()),
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1200,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
        const data = await res.json();
        const textBlocks = data.content?.filter(c => c.type === "text").map(c => c.text) || [];
        const text = textBlocks.join("");
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        results.push({ partId: part.id, partName: part.name, partMpn: part.mpn, query, stores: parsed.stores || [] });
      } catch (e) {
        results.push({ partId: part.id, partName: part.name, partMpn: part.mpn, query, stores: [], error: e.message });
      }
    }

    setProgress({ done: projectParts.length, total: projectParts.length, current: "" });
    setSearchResults(results);
    setAggregated(aggregateStores(results));
    setSearching(false);
  };

  const filteredStores = aggregated.filter(s => s.parts.length >= filterMin);
  const coverageColor = (n) => {
    const pct = n / totalParts;
    if (pct >= 0.7) return "var(--green)";
    if (pct >= 0.4) return "var(--orange)";
    return "var(--text2)";
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🛍️ AliExpress Händler-Optimierer</div>
      </div>

      {/* Beschreibung */}
      <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.15)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
        Wähle ein Projekt. Die KI sucht für jedes Bauteil passende AliExpress-Händler und zeigt dann,
        welche Stores <strong style={{ color: "var(--text)" }}>mehrere Bauteile gleichzeitig</strong> anbieten —
        so minimierst du Bestellungen, Versandkosten und Wartezeit.
      </div>

      {/* Projekt-Auswahl */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 5, fontWeight: 500 }}>Projekt</div>
          <select
            value={selectedProject}
            onChange={e => { setSelectedProject(e.target.value); setSearchResults(null); setAggregated([]); }}
            style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
          >
            <option value="">— Projekt wählen —</option>
            {projects.map(p => {
              const count = bomItems.filter(b => b.projectId === p.id).length;
              return <option key={p.id} value={p.id}>{p.name} ({count} Bauteile)</option>;
            })}
          </select>
        </div>
        {selectedProject && (
          <div style={{ fontSize: 12, color: "var(--text2)", paddingBottom: 10 }}>
            <span style={{ color: "var(--blue)", fontFamily: "IBM Plex Mono", fontSize: 13 }}>{totalParts}</span> Positionen im Projekt
          </div>
        )}
        <button
          className="btn btn-ai"
          style={{ paddingLeft: 18, paddingRight: 18 }}
          disabled={!selectedProject || searching || totalParts === 0}
          onClick={handleSearch}
        >
          {searching
            ? <><span className="spinner" /> Suche läuft…</>
            : "🔍 Händler suchen"}
        </button>
      </div>

      {/* Progress */}
      {searching && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text2)" }}>
              <span className="status-dot" style={{ display: "inline-block", marginRight: 6 }} />
              Suche: <strong style={{ color: "var(--text)" }}>{progress.current}</strong>
            </span>
            <span style={{ fontFamily: "IBM Plex Mono", color: "var(--blue)" }}>{progress.done} / {progress.total}</span>
          </div>
          <div style={{ background: "var(--bg3)", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{ background: "var(--green)", height: "100%", width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.4s ease", borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
            Jedes Bauteil wird einzeln auf AliExpress gesucht — dies dauert einige Sekunden pro Teil.
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Ergebnisse */}
      {aggregated.length > 0 && !searching && (
        <div>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
            {[
              { val: aggregated.length, label: "Stores gefunden", color: "var(--blue)" },
              { val: aggregated.filter(s => s.parts.length >= 2).length, label: "mit ≥2 Bauteilen", color: "var(--green)" },
              { val: aggregated.filter(s => s.parts.length >= Math.ceil(totalParts * 0.5)).length, label: `mit ≥50% Abdeckung`, color: "var(--orange)" },
              { val: searchResults?.filter(r => r.error).length || 0, label: "Fehler", color: "var(--red)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "IBM Plex Mono", color: s.color }}>{s.val}</span>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Mindestens</span>
            {[1, 2, 3].map(n => (
              <button key={n} className={`btn btn-sm ${filterMin === n ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilterMin(n)}>
                {n} Bauteil{n > 1 ? "e" : ""}
              </button>
            ))}
            <span style={{ fontSize: 12, color: "var(--text3)" }}>→ {filteredStores.length} Stores</span>
          </div>

          {/* Store cards */}
          {filteredStores.map((store, idx) => {
            const coverage = store.parts.length / totalParts;
            const isExpanded = expandedStore === store.storeName;
            return (
              <div key={store.storeName} style={{
                background: "var(--bg2)", border: `1px solid ${idx === 0 ? "rgba(57,211,83,0.4)" : "var(--border)"}`,
                borderRadius: 10, marginBottom: 10, overflow: "hidden",
                boxShadow: idx === 0 ? "0 0 0 1px rgba(57,211,83,0.1)" : "none"
              }}>
                {/* Store header */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }}
                  onClick={() => setExpandedStore(isExpanded ? null : store.storeName)}
                >
                  {/* Rank */}
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: idx === 0 ? "var(--green2)" : idx === 1 ? "rgba(88,166,255,0.2)" : "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 13, color: idx === 0 ? "#fff" : idx === 1 ? "var(--blue)" : "var(--text2)", flexShrink: 0 }}>
                    {idx + 1}
                  </div>

                  {/* Store info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{store.storeName}</span>
                      {idx === 0 && <span style={{ fontSize: 10, background: "rgba(57,211,83,0.15)", color: "var(--green)", padding: "1px 8px", borderRadius: 4, fontWeight: 600 }}>BESTE WAHL</span>}
                      {store.rating && <span style={{ fontSize: 12, color: "var(--orange)" }}>★ {store.rating.toFixed(1)}</span>}
                    </div>
                    {/* Coverage bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: "var(--bg3)", borderRadius: 3, height: 5, maxWidth: 200 }}>
                        <div style={{ background: coverageColor(store.parts.length), height: "100%", width: `${coverage * 100}%`, borderRadius: 3, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono", color: coverageColor(store.parts.length) }}>
                        {store.parts.length}/{totalParts} Bauteile
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>({Math.round(coverage * 100)}%)</span>
                    </div>
                  </div>

                  {/* Right side */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {store.totalMinPrice > 0 && (
                      <div className="price-tag" style={{ fontSize: 14, marginBottom: 4 }}>~{store.totalMinPrice.toFixed(2)} €</div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>Gesamt (geschätzt)</div>
                  </div>

                  <div style={{ color: "var(--text3)", fontSize: 16, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</div>
                </div>

                {/* Expanded: Part list */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "0 16px 14px" }}>
                    <div style={{ paddingTop: 12, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>ANGEBOTENE BAUTEILE</span>
                      {store.storeUrl && (
                        <a href={store.storeUrl} target="_blank" rel="noopener"
                          style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                          🏪 Store öffnen ↗
                        </a>
                      )}
                    </div>
                    {store.parts.map(p => (
                      <div key={p.partId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                        <span style={{ color: "var(--green)", fontSize: 11 }}>✓</span>
                        <span style={{ flex: 1, fontWeight: 500 }}>{p.partName}</span>
                        {p.priceEur && <span className="price-tag">{p.priceEur.toFixed(2)} €</span>}
                        {p.minOrder && p.minOrder > 1 && <span style={{ fontSize: 11, color: "var(--text3)" }}>MOQ: {p.minOrder}</span>}
                        {p.productUrl && (
                          <a href={p.productUrl} target="_blank" rel="noopener"
                            style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>↗ Produkt</a>
                        )}
                        {p.note && <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>{p.note}</span>}
                      </div>
                    ))}

                    {/* Missing parts */}
                    {(() => {
                      const foundIds = new Set(store.parts.map(p => p.partId));
                      const missing = projectParts.filter(p => !foundIds.has(p.id));
                      return missing.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>NICHT BEI DIESEM STORE:</div>
                          {missing.map(p => (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12, color: "var(--text3)" }}>
                              <span style={{ color: "var(--red)", fontSize: 11 }}>✗</span>
                              <span>{p.name}</span>
                              {p.mpn && <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}>{p.mpn}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}

          {/* Parts with no results */}
          {searchResults?.some(r => r.stores.length === 0) && (
            <div style={{ background: "rgba(248,81,73,0.06)", border: "1px solid rgba(248,81,73,0.2)", borderRadius: 8, padding: "12px 16px", marginTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--red)" }}>⚠️ Keine Treffer gefunden für:</div>
              {searchResults.filter(r => r.stores.length === 0).map(r => (
                <div key={r.partId} style={{ fontSize: 12, color: "var(--text2)", padding: "3px 0" }}>
                  • {r.partName} {r.partMpn && <span style={{ fontFamily: "IBM Plex Mono", color: "var(--text3)" }}>({r.partMpn})</span>}
                  {r.error && <span style={{ color: "var(--red)", marginLeft: 8 }}>{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searching && !searchResults && (
        <div className="empty-state" style={{ paddingTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
          <h3>Händler-Optimierer</h3>
          <p style={{ maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
            Wähle ein Projekt und starte die Suche. Die KI analysiert jeden Artikel einzeln auf AliExpress
            und zeigt welche Händler das größte Sortiment für dein Projekt haben.
          </p>
        </div>
      )}
    </div>
  );
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
    if (DEFAULT_SHOPS.find(s => s.id === id)) { alert("Standard-Shop kann nicht gelöscht werden."); return; }
    saveShops(shops.filter(s => s.id !== id));
  };

  const globalShops = DEFAULT_SHOPS;
  const userShops = shops.filter(s => !DEFAULT_SHOPS.find(d => d.id === s.id));

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🏪 Shops
          <span className="badge">{shops.length} konfiguriert</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ai" onClick={() => setShowRegionSetup(true)}>
            🌍 Shops für meine Region finden
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Manuell hinzufügen</button>
        </div>
      </div>

      <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.15)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--text)" }}>Deine persönliche Shop-Liste.</strong> Shops sind regional sehr unterschiedlich —
        was in Deutschland Mädler und Reichelt ist, ist in den USA McMaster-Carr und Digi-Key, in Japan Misumi und Monotaro.
        Nutze <strong style={{ color: "var(--blue)" }}>„Shops für meine Region finden"</strong> damit die KI passende lokale Anbieter vorschlägt.
      </div>

      {/* Globale Shops */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
        🌐 GLOBAL — immer verfügbar
      </div>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Shop</th><th>Region</th><th>Spezialisierung</th><th>Website</th></tr></thead>
          <tbody>
            {globalShops.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className="tag tag-cat">{s.region}</span></td>
                <td style={{ fontSize: 12, color: "var(--text2)" }}>Allgemein</td>
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
            📍 DEINE SHOPS
          </div>
          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Shop</th><th>Region</th><th>Spezialisierung</th><th>Website</th><th></th></tr></thead>
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
          <h3>Noch keine eigenen Shops</h3>
          <p>Klicke auf „Shops für meine Region finden" — die KI empfiehlt passende lokale Anbieter für dein Land.</p>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">➕ Shop hinzufügen</div>
            <div className="form-row"><label>Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="z.B. Mädler, McMaster-Carr" autoFocus /></div>
            <div className="form-row"><label>Region / Land</label><input value={form.region} onChange={e => set("region", e.target.value)} placeholder="z.B. DE, USA, JP, Global" /></div>
            <div className="form-row"><label>URL</label><input value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://…" /></div>
            <div className="form-row"><label>Spezialisierung</label><input value={form.speciality} onChange={e => set("speciality", e.target.value)} placeholder="z.B. Antriebstechnik, Normteile, Elektronik" /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={addShop} disabled={!form.name}>Hinzufügen</button>
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
    { id: "electronic", label: "Elektronik", icon: "⚡" },
    { id: "mechanical", label: "Mechanik / Normteile", icon: "🔩" },
    { id: "drive",      label: "Antriebe / Motoren", icon: "⚙️" },
    { id: "pneumatic",  label: "Pneumatik / Hydraulik", icon: "💨" },
    { id: "linear",     label: "Lineartechnik", icon: "📏" },
    { id: "structure",  label: "Profile / Konstruktion", icon: "📐" },
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
      setError("Suche fehlgeschlagen: " + e.message);
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
        <div className="modal-title">🌍 Shops für deine Region finden</div>

        {!results ? (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18, lineHeight: 1.6 }}>
              Die KI sucht die besten lokalen und regionalen Lieferanten für deinen Standort —
              sowohl für Elektronik als auch für Mechanik, Normteile und Spezialteile.
            </div>

            <div className="form-row">
              <label>Dein Land / Region *</label>
              <input value={country} onChange={e => setCountry(e.target.value)}
                placeholder="z.B. Germany, USA, Japan, Australia, Brazil, India…"
                autoFocus onKeyDown={e => e.key === "Enter" && handleSearch()} />
            </div>

            <div className="form-row">
              <label>Welche Bauteile kaufst du? (optional — für bessere Empfehlungen)</label>
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
              <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
              <button className="btn btn-ai" disabled={loading || !country.trim()} onClick={handleSearch}>
                {loading ? <><span className="spinner" /> Suche lokale Shops…</> : "🔍 Shops finden"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
              <strong style={{ color: "var(--green)" }}>{results.length} Shops</strong> für <strong style={{ color: "var(--text)" }}>{country}</strong> gefunden.
              Wähle die Shops die du hinzufügen möchtest:
            </div>

            <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 16 }}>
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text3)" }}>
                  Keine neuen Shops gefunden — alle Vorschläge sind bereits in deiner Liste.
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
              <button className="btn btn-secondary" onClick={() => setResults(null)}>← Zurück</button>
              <button className="btn btn-primary"
                disabled={Object.values(selected).filter(Boolean).length === 0}
                onClick={handleAdd}>
                ✅ {Object.values(selected).filter(Boolean).length} Shops hinzufügen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
