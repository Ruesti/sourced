// @ts-nocheck
// AI API helpers: callAI (Anthropic/OpenAI proxy), Nexar, Tavily, AliExpress utilities.

// ── API Key & Provider Management ────────────────────────────────────────────

const KEY_STORAGE      = "partsdb-api-key";
const PROVIDER_STORAGE = "partsdb-provider";
const ENDPOINT_STORAGE = "partsdb-endpoint";

export const getApiKey         = () => { try { return localStorage.getItem(KEY_STORAGE)      || ""; } catch { return ""; } };
export const saveApiKey        = (k) => { try { localStorage.setItem(KEY_STORAGE, k);                } catch {} };
export const clearApiKey       = () => { try { localStorage.removeItem(KEY_STORAGE);                 } catch {} };
export const getProvider       = () => { try { return localStorage.getItem(PROVIDER_STORAGE) || "anthropic"; } catch { return "anthropic"; } };
export const saveProvider      = (p) => { try { localStorage.setItem(PROVIDER_STORAGE, p);          } catch {} };
export const getCustomEndpoint = () => { try { return localStorage.getItem(ENDPOINT_STORAGE) || ""; } catch { return ""; } };
export const saveCustomEndpoint= (u) => { try { localStorage.setItem(ENDPOINT_STORAGE, u);          } catch {} };

export const PROVIDERS = {
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

export async function callAI(messages: {role:string,content:string}[], maxTokens: number, apiKey?: string): Promise<string> {
  const key = apiKey ?? getApiKey();
  const provider = getProvider();
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;
  const endpoint = (provider === "compatible" && getCustomEndpoint()) || cfg.endpoint;

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      maxTokens,
      provider,
      model: cfg.model,
      endpoint: provider === "compatible" ? endpoint : undefined,
      apiKey: key || undefined,
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || res.statusText); }
  const data = await res.json();
  return data.text || "";
}

// ── Tavily & Nexar credentials ────────────────────────────────────────────────

const TAVILY_KEY_STORAGE  = "partsdb-tavily-key";
const NEXAR_ID_STORAGE    = "partsdb-nexar-id";
const NEXAR_SEC_STORAGE   = "partsdb-nexar-secret";
const NEXAR_TOKEN_STORAGE = "partsdb-nexar-token";

export const getTavilyKey   = () => { try { return localStorage.getItem(TAVILY_KEY_STORAGE) || ""; } catch { return ""; } };
export const saveTavilyKey  = (k) => { try { localStorage.setItem(TAVILY_KEY_STORAGE, k); } catch {} };
export const getNexarId     = () => { try { return localStorage.getItem(NEXAR_ID_STORAGE) || ""; } catch { return ""; } };
export const saveNexarId    = (k) => { try { localStorage.setItem(NEXAR_ID_STORAGE, k); } catch {} };
export const getNexarSecret = () => { try { return localStorage.getItem(NEXAR_SEC_STORAGE) || ""; } catch { return ""; } };
export const saveNexarSecret= (k) => { try { localStorage.setItem(NEXAR_SEC_STORAGE, k); } catch {} };

export async function getNexarToken(): Promise<string> {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(NEXAR_TOKEN_STORAGE) || "null"); } catch { return null; } })();
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
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

export async function nexarSearchMpn(mpn: string, name: string): Promise<{distributor:string,url:string,sku:string,price:number|null,stock:number|null,currency:string}[]> {
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

export async function nexarBatchSearch(items: {index:number, mpn:string, name:string}[]): Promise<Map<number,{distributor:string,url:string,sku:string,price:number|null,stock:number|null,currency:string}[]>> {
  const token = await getNexarToken();
  const results = new Map<number,any[]>();
  const CHUNK = 20;
  const selFrag = `sellers(authorizedOnly:false){company{name homepage}offers{sku url inventoryLevel prices{quantity price currency}}}`;
  for (let start = 0; start < items.length; start += CHUNK) {
    const chunk = items.slice(start, start + CHUNK);
    const queryBody = chunk.map((p, i) => `p${start+i}:supSearchMpn(q:${JSON.stringify(p.mpn||p.name)},limit:5){results{part{mpn ${selFrag}}}}`).join(" ");
    const res = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ query: `query{${queryBody}}` }),
    });
    if (!res.ok) throw new Error("Nexar API error: " + res.statusText);
    const data = await res.json();
    for (let i = 0; i < chunk.length; i++) {
      const key = start + i;
      const offers: {distributor:string,url:string,sku:string,price:number|null,stock:number|null,currency:string}[] = [];
      for (const r of data.data?.[`p${key}`]?.results || []) {
        for (const seller of r.part?.sellers || []) {
          for (const offer of seller.offers || []) {
            const price1 = offer.prices?.find((p:any) => p.quantity <= 1) || offer.prices?.[0];
            offers.push({
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
      results.set(key, offers);
    }
  }
  return results;
}

// ── Tavily search ─────────────────────────────────────────────────────────────

export async function tavilySearch(query: string, siteFilter?: string): Promise<{title:string,url:string,snippet:string}[]> {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, domain: siteFilter }),
    });
    if (res.ok) { const d = await res.json(); return d.results || []; }
    if (res.status !== 503) { const e = await res.json(); throw new Error(e.error || "Search error"); }
  } catch (e: any) {
    if (!e.message?.includes("503") && !e.message?.includes("Search not configured")) throw e;
  }
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

export async function tavilySearchAliExpress(query: string): Promise<{title:string,url:string,snippet:string}[]> {
  return tavilySearch(query, "aliexpress.com");
}

// ── AliExpress helpers ────────────────────────────────────────────────────────

export function partIsAliExpressBulkCandidate(part: { templateId?: string; category?: string; footprint?: string; name?: string } | null | undefined): boolean {
  if (!part) return false;
  const tid = part.templateId || "";
  if (tid === "t-resistor" || tid === "t-capacitor") return true;
  const c = (part.category || "").toLowerCase();
  if (/widerstand|resistor|kondensator|capacitor|cap |induct|spule|ferrite|bead|keramik|mlcc/i.test(c)) return true;
  const fp = (part.footprint || "").toLowerCase();
  if (/0402|0603|0805|1206|2512|smd|chip/i.test(fp)) return true;
  const n = (part.name || "").toLowerCase();
  if (/\b(r|c|l)[0-9]{2,4}\b|resistor|capacitor|widerstand|kondensator/i.test(n)) return true;
  return false;
}

export function buildAliExpressSearchQuery(part: { mpn?: string; name?: string; value?: string; footprint?: string; manufacturer?: string }, bulkLotHint: boolean): string {
  const bits = [part.mpn, part.name, part.value, part.footprint, part.manufacturer].filter(Boolean);
  let q = bits.join(" ").trim().replace(/\s+/g, " ");
  if (bulkLotHint) q += " SMD reel tape 1000pcs 5000pcs full reel wholesale lot";
  return q.slice(0, 420);
}

export function dedupeWebSearchResults(rows: { title: string; url: string; snippet: string }[]): { title: string; url: string; snippet: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string; snippet: string }[] = [];
  for (const r of rows) {
    try {
      const u = new URL(r.url);
      const key = u.hostname + u.pathname.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    } catch {
      if (!seen.has(r.url)) { seen.add(r.url); out.push(r); }
    }
  }
  return out;
}

export function normalizeDistName(d: string | undefined): string {
  return (d || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeNexarConsolidationDistributor(
  consolidatable: { index: number }[],
  nexarResults: Map<number, { distributor: string }[]>
): string | null {
  if (consolidatable.length < 2) return null;
  const counts = new Map<string, number>();
  for (const { index } of consolidatable) {
    const offers = nexarResults.get(index) || [];
    const seen = new Set<string>();
    for (const o of offers) {
      const nd = normalizeDistName(o.distributor);
      if (!nd || nd === "?") continue;
      if (seen.has(nd)) continue;
      seen.add(nd);
      counts.set(nd, (counts.get(nd) || 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [nd, c] of counts) {
    if (c > bestCount) { bestCount = c; best = nd; }
  }
  return bestCount >= 2 ? best : null;
}

export function pickCheapestOffer(offers: { stock?: number | null; price?: number | null }[]) {
  const inStock = offers.filter(o => (o.stock ?? 0) > 0).sort((a, b) => (a.price ?? 999) - (b.price ?? 999))[0];
  if (inStock) return inStock;
  return offers.sort((a, b) => (a.price ?? 999) - (b.price ?? 999))[0];
}

export function selectNexarOffer(
  offers: { distributor: string; url: string; sku: string; price: number | null; stock: number | null; currency: string }[],
  item: { preferredShopId?: string | null },
  shops: { id: string; name: string }[],
  chosenDistributorNorm: string | null
): { match: (typeof offers)[0] | null; notes: string } {
  if (!offers.length) return { match: null, notes: "" };
  const prefShopName =
    item.preferredShopId && item.preferredShopId !== "aliexpress" && !String(item.preferredShopId).startsWith("custom:")
      ? shops.find(s => s.id === item.preferredShopId)?.name || null
      : null;
  if (prefShopName) {
    const pref = offers.find(
      o =>
        o.distributor?.toLowerCase().includes(prefShopName.toLowerCase()) ||
        prefShopName.toLowerCase().includes(o.distributor?.toLowerCase() || "")
    );
    if (pref) return { match: pref, notes: "" };
    const fb = pickCheapestOffer(offers);
    return {
      match: fb || null,
      notes: fb ? `No match at "${prefShopName}" — fallback: ${fb.distributor}` : "",
    };
  }
  if (chosenDistributorNorm) {
    const cons = offers.find(o => normalizeDistName(o.distributor) === chosenDistributorNorm);
    if (cons) return { match: cons, notes: `Consolidated at ${cons.distributor} (fewer shipments)` };
  }
  const m = pickCheapestOffer(offers);
  return { match: m || null, notes: "" };
}

export function scoreAliExpressProductUrl(url: string): number {
  if (!url || typeof url !== "string") return 0;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("aliexpress.com")) return 0;
  } catch { return 0; }
  if (/\/item\/\d+\.html(\?|$)/i.test(url)) return 100;
  if (/\/item\/\d+/i.test(url)) return 85;
  if (/\/p\/\d+/i.test(url)) return 70;
  if (/\.aliexpress\.com\/item\//i.test(url)) return 75;
  if (/\/(wholesale|af\/|category\/)/i.test(url) || /[?&]SearchText=/i.test(url)) return 5;
  return 25;
}

export function sortAliExpressWebResults(rows: { title: string; url: string; snippet: string }[]) {
  return [...rows].sort((a, b) => scoreAliExpressProductUrl(b.url) - scoreAliExpressProductUrl(a.url));
}

export async function tavilyFindDirectAliExpressItem(part: {
  mpn?: string;
  name?: string;
  value?: string;
}): Promise<string | null> {
  const q = [part.mpn, part.name, part.value, "aliexpress.com/item"].filter(Boolean).join(" ").trim().slice(0, 400);
  if (q.length < 6) return null;
  try {
    const rows = await tavilySearch(q);
    const sorted = sortAliExpressWebResults(rows);
    for (const r of sorted) {
      if (scoreAliExpressProductUrl(r.url) >= 80) return r.url;
    }
  } catch { return null; }
  return null;
}

export type AliParsedOffer = {
  kind?: "retail" | "bulk";
  storeName: string;
  productUrl: string;
  priceEur: number | null;
  packQty?: number;
  shippingEur?: number | null;
  note?: string;
};

export async function parseAliExpressResults(
  part: { name: string; mpn?: string; value?: string; footprint?: string; category?: string },
  webResults: { title: string; url: string; snippet: string }[],
  bomQty: number,
  suggestBulk: boolean
): Promise<AliParsedOffer[]> {
  if (!webResults.length) return [];
  const bulkHint = suggestBulk
    ? `Also extract a separate BULK / reel offer if the snippets mention lots of 100+ pcs (typical 1000pcs reel for SMD passives). Use kind \"bulk\" with packQty = full reel/lot count. If no bulk offer appears, omit bulk rows.`
    : "Only small/medium consumer packs; kind should be \"retail\".";
  const prompt = `From these AliExpress-oriented search results for electronic part "${part.mpn || part.name}" (BOM qty needed: ${bomQty}):
${webResults.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n")}

Extract 1–4 purchase options as JSON. Rules:
- priceEur = total pack/lot price in EUR (not per piece), estimate from title/snippet if needed.
- packQty = pieces in one purchase (e.g. 10, 100, 1000). Default 1.
- shippingEur = estimated shipping to EU in EUR if mentioned ("free shipping" → 0); null if unknown.
- kind: "retail" for normal packs; "bulk" for manufacturer reels / 500+ pcs lots / "1000pcs" listings.
- productUrl: MUST prefer a **direct product page** URL from the list: path like \`/item/1234567890.html\` on *.aliexpress.com. Do NOT use search/wholesale/category URLs if any /item/… link exists in the results. If only bad URLs exist, pick the closest /item/… link anyway.
${bulkHint}

Reply ONLY with JSON array, no markdown:
[{"kind":"retail","storeName":"…","productUrl":"https://…","priceEur":1.2,"packQty":100,"shippingEur":0,"note":"…"},{"kind":"bulk","storeName":"…","productUrl":"https://…","priceEur":8.5,"packQty":1000,"shippingEur":1.5,"note":"full reel"}]`;
  const text = await callAI([{ role: "user", content: prompt }], 1200);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as AliParsedOffer[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => x && x.productUrl)
      .sort((a, b) => scoreAliExpressProductUrl(b.productUrl) - scoreAliExpressProductUrl(a.productUrl));
  } catch { return []; }
}

// ── Claude-powered search helpers ─────────────────────────────────────────────

export async function claudeSearch(part, shops, apiKey) {
  const shopList = shops.map(s => `${s.name} (${s.region}, ${s.url})`).join(", ");
  const prompt = `You are an electronics sourcing assistant. Find suppliers for this part.

Part: ${part.name}
MPN: ${part.mpn || "unknown"}
Manufacturer: ${part.manufacturer || "unknown"}
Description: ${part.description || ""}
Category: ${part.category || ""}

Available shops: ${shopList}

Return realistic suppliers as a JSON array. IMPORTANT: Reply with ONLY a valid JSON array, no markdown, no explanation.

Format:
[
  {
    "shopId": "reichelt",
    "shopName": "Reichelt",
    "sku": "e.g. ATM328P-PU",
    "searchUrl": "https://www.reichelt.de/search/...",
    "estimatedPrice": 2.50,
    "currency": "EUR",
    "notes": "e.g. also available as SMD"
  }
]

If you don't know the SKU, write "search". Provide 2-4 realistic entries.`;

  const text = await callAI([{ role: "user", content: prompt }], 1000, apiKey);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export async function claudeParseReport(rawText, fileName, apiKey) {
  const prompt = `You are an expert in electronics bill of materials (BOM). You are given a report or file.
Filename: "${fileName || "unknown"}"

Your task: Extract only real, orderable parts from the report and return them as JSON.
Auto-detect the format (CSV, JSON, netlist, YAML, free text, KiCad, Eagle, Altium, custom format, etc.).

EXCLUDE — do NOT include these in "items":
- Net-tie symbols (Net-Tie, NetTie, Net_Tie, NET_TIE, NT_*)
- Test points (TP, TestPoint, Test_Point, TEST_POINT, TP_*)
- Power symbols / flags (PWR_FLAG, +3.3V, +5V, +12V, GND, VCC, VDD, AGND, PGND, DGND etc.) when they appear as standalone schematic symbols without MPN
- Mounting holes (MountingHole, Mounting_Hole, MH, H*)
- Fiducials (Fiducial, FID)
- Comments, notes, disclaimers, logo symbols
- Empty lines or entries without a part name

IMPORTANT: Reply ONLY with a valid JSON object, no markdown, no explanation.

Return format:
{
  "format_detected": "e.g. KiCad BOM CSV / free text / JSON / Eagle netlist / …",
  "confidence": "high|medium|low",
  "project_name": "If recognizable from the report, else null",
  "notes": "Brief description of what was detected (1 sentence)",
  "fields_found": ["Which fields were present in the report"],
  "items": [
    {
      "name": "Part name/designation",
      "mpn": "Manufacturer part number or null",
      "manufacturer": "Manufacturer or null",
      "quantity": 1,
      "reference": "Reference designator e.g. R1,R2 or null",
      "footprint": "Package or null",
      "description": "Description or null",
      "category": "Resistor|Capacitor|IC|Transistor|Diode|LED|Relay|Connector|Switch|Sensor|MCU|MOSFET|Module|Mechanical|Cable|Other or null",
      "value": "Value e.g. 10k, 100nF or null",
      "raw": "Original line/entry from the report"
    }
  ]
}

If quantity is not given, count reference designators (R1,R2,R3 = 3) or default to 1.
Group identical parts (same name+value) into one line and sum quantities.

Report content:
---
${rawText.slice(0, 8000)}
---`;

  const text = await callAI([{ role: "user", content: prompt }], 4000, apiKey);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
