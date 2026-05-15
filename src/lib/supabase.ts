// @ts-nocheck
// Supabase client, auth helpers, CRUD wrappers, and field mappings.
// All data queries go through the Supabase JS client loaded via CDN.

export const SESS_STORAGE = "partsdb-sb-session";

export const STORAGE_KEYS = {
  parts:      "partsdb-parts",
  projects:   "partsdb-projects",
  bomItems:   "partsdb-bom",
  suppliers:  "partsdb-suppliers",
  shops:      "partsdb-shops",
  templates:  "partsdb-templates",
  attributes: "partsdb-attributes",
};

let _sbClient: any = null;
let _sbUrl = "";
let _sbKey = "";
let _sbConfigPromise: Promise<void> | null = null;

const sanitize = (s: string) => s.trim().replace(/[^\x20-\x7E]/g, "");

export function loadSbConfig(): Promise<void> {
  if (_sbUrl && _sbKey) return Promise.resolve();
  if (_sbConfigPromise) return _sbConfigPromise;
  _sbConfigPromise = fetch("/api/config")
    .then(r => r.ok ? r.json() : {})
    .then(d => { _sbUrl = sanitize(d.supabaseUrl || ""); _sbKey = sanitize(d.supabaseAnonKey || ""); })
    .catch(() => {});
  return _sbConfigPromise;
}

export async function sbAuth(action: string, payload: object = {}): Promise<any> {
  const r = await fetch("/api/supabase-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  return r.json();
}

export function getSbSession() { try { return JSON.parse(localStorage.getItem(SESS_STORAGE) || "null"); } catch { return null; } }
export function setSbSession(s: any) { try { if (s) localStorage.setItem(SESS_STORAGE, JSON.stringify(s)); else localStorage.removeItem(SESS_STORAGE); } catch {} }

export async function getSb() {
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
  const session = getSbSession();
  _sbClient = window.supabase.createClient(_sbUrl, _sbKey, {
    global: { headers: session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {} }
  });
  return _sbClient;
}

export function resetSbClient() { _sbClient = null; _sbConfigPromise = null; }

// ── localStorage / artifact storage fallback ──────────────────────────────────

export async function loadLocal(key, fallback = []) {
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : fallback;
    }
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export async function saveLocal(key, val) {
  try {
    if (window.storage) { await window.storage.set(key, JSON.stringify(val)); return; }
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function sbLoadAll(userId) {
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

export async function sbUpsert(table, rows) {
  const sb = await getSb(); if (!sb) return;
  await sb.from(table).upsert(rows, { onConflict: "id" });
}

export async function sbDelete(table, id) {
  const sb = await getSb(); if (!sb) return;
  await sb.from(table).delete().eq("id", id);
}

// ── Field mappings: Supabase snake_case ↔ App camelCase ──────────────────────
// Phase 1 columns: part_type, reel_qty, used_in_projects on bm_parts;
//                  ali_ok, trusted, free_shipping_threshold, shipping_cost, supports_csv_import on bm_shops

export const sbToPart = r => ({
  id: r.id, name: r.name, mpn: r.mpn||"", manufacturer: r.manufacturer||"",
  category: r.category||"", footprint: r.footprint||"", description: r.description||"",
  notes: r.notes||"", datasheet: r.datasheet||"", drawer: r.drawer||"",
  stock: r.stock||0, stockMin: r.stock_min||0,
  partType: r.part_type||"", reelQty: r.reel_qty||null, usedInProjects: r.used_in_projects||0,
});

export const partToSb = (p, uid) => ({
  id: p.id, user_id: uid, name: p.name, mpn: p.mpn||null, manufacturer: p.manufacturer||null,
  category: p.category||null, footprint: p.footprint||null, description: p.description||null,
  notes: p.notes||null, datasheet: p.datasheet||null, drawer: p.drawer||null,
  stock: p.stock||0, stock_min: p.stockMin||0,
  part_type: p.partType||null, reel_qty: p.reelQty||null, used_in_projects: p.usedInProjects||0,
});

export const sbToProject = r => ({ id: r.id, name: r.name, description: r.description||"", created: r.created_at });
export const projectToSb = (p, uid) => ({ id: p.id, user_id: uid, name: p.name, description: p.description||null });

export const sbToBomItem = r => ({
  id: r.id, projectId: r.project_id, partId: r.part_id, quantity: r.quantity,
  reference: r.reference||"", notes: r.notes||"",
  preferredSupplierId: r.preferred_supplier_id||null, preferredShopId: r.preferred_shop_id||null,
});
export const bomItemToSb = (b, uid) => ({
  id: b.id, user_id: uid, project_id: b.projectId, part_id: b.partId, quantity: b.quantity,
  reference: b.reference||null, notes: b.notes||null,
  preferred_supplier_id: b.preferredSupplierId||null, preferred_shop_id: b.preferredShopId||null,
});

export const sbToSupplier = r => ({
  id: r.id, partId: r.part_id, shopId: r.shop_id||"", shopName: r.shop_name,
  sku: r.sku||"", searchUrl: r.search_url||"", price: r.price ? parseFloat(r.price) : null,
  currency: r.currency||"EUR", notes: r.notes||"", aiGenerated: r.ai_generated||false,
  packQty: r.pack_qty||1, stock: r.stock ?? null,
  moq: r.moq||1, priceBreakQty: r.price_break_qty||null, priceBreakPrice: r.price_break_price ? parseFloat(r.price_break_price) : null,
});
export const supplierToSb = (s, uid) => ({
  id: s.id, user_id: uid, part_id: s.partId, shop_id: s.shopId||null, shop_name: s.shopName,
  sku: s.sku||null, search_url: s.searchUrl||null, price: s.price||null,
  currency: s.currency||"EUR", notes: s.notes||null, ai_generated: s.aiGenerated||false,
  pack_qty: s.packQty||1, stock: s.stock ?? null,
  moq: s.moq||1, price_break_qty: s.priceBreakQty||null, price_break_price: s.priceBreakPrice||null,
});

export const sbToShop = r => ({
  id: r.id, name: r.name, region: r.region||"", url: r.url||"",
  aliOk: r.ali_ok||false, trusted: r.trusted !== false,
  freeShippingThreshold: r.free_shipping_threshold ? parseFloat(r.free_shipping_threshold) : null,
  shippingCost: r.shipping_cost ? parseFloat(r.shipping_cost) : 0,
  supportsCsvImport: r.supports_csv_import||false,
});
export const shopToSb = (s, uid) => ({
  id: s.id, user_id: uid, name: s.name, region: s.region||null, url: s.url||null,
  ali_ok: s.aliOk||false, trusted: s.trusted !== false,
  free_shipping_threshold: s.freeShippingThreshold||null,
  shipping_cost: s.shippingCost||0,
  supports_csv_import: s.supportsCsvImport||false,
});

// ── Order list helpers ────────────────────────────────────────────────────────

export const sbToOrderList = r => ({
  id: r.id, projectId: r.project_id||null, shopId: r.shop_id||null,
  name: r.name||"", status: r.status||"draft",
  totalPrice: r.total_price ? parseFloat(r.total_price) : null,
  currency: r.currency||"EUR", notes: r.notes||"",
  orderedAt: r.ordered_at||null, receivedAt: r.received_at||null, createdAt: r.created_at,
});

export const sbToOrderItem = r => ({
  id: r.id, orderListId: r.order_list_id, partId: r.part_id,
  quantity: r.quantity, unitPrice: r.unit_price ? parseFloat(r.unit_price) : null,
  sku: r.sku||"", receivedQty: r.received_qty||0,
});

export async function sbSaveOrderLists(lists: any[], items: any[], userId: string) {
  const sb = await getSb();
  if (!sb) throw new Error("Not connected to Supabase");
  const dbLists = lists.map(l => ({
    id: l.id, user_id: userId, project_id: l.projectId||null, shop_id: l.shopId||null,
    name: l.name||null, status: l.status||"draft",
    total_price: l.totalPrice||null, currency: l.currency||"EUR", notes: l.notes||null,
  }));
  const dbItems = items.map(i => ({
    id: i.id, order_list_id: i.orderListId, part_id: i.partId,
    quantity: i.quantity, unit_price: i.unitPrice||null, sku: i.sku||null, received_qty: 0,
  }));
  const { error: le } = await sb.from("bm_order_lists").upsert(dbLists, { onConflict: "id" });
  if (le) throw new Error(le.message);
  if (dbItems.length > 0) {
    const { error: ie } = await sb.from("bm_order_items").upsert(dbItems, { onConflict: "id" });
    if (ie) throw new Error(ie.message);
  }
}

export async function sbLoadOrderLists(userId: string) {
  const sb = await getSb();
  if (!sb) return [];
  const { data } = await sb.from("bm_order_lists").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return (data || []).map(sbToOrderList);
}

export async function sbDeleteOrderList(id: string) {
  const sb = await getSb();
  if (!sb) return;
  await sb.from("bm_order_lists").delete().eq("id", id);
}

export async function sbLoadOrderItems(orderListId: string) {
  const sb = await getSb();
  if (!sb) return [];
  const { data } = await sb.from("bm_order_items").select("*").eq("order_list_id", orderListId);
  return (data || []).map(sbToOrderItem);
}

export async function sbUpdateOrderReceived(listId: string, items: any[], status: string) {
  const sb = await getSb();
  if (!sb) throw new Error("Not connected");
  const receivedAt = status === "received" ? new Date().toISOString() : null;
  await sb.from("bm_order_lists").update({ status, received_at: receivedAt }).eq("id", listId);
  for (const item of items) {
    await sb.from("bm_order_items").update({ received_qty: item.receivedQty }).eq("id", item.id);
  }
}
