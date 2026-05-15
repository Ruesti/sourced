// @ts-nocheck
// Pure client-side order optimization — no AI call needed.
// Takes missing BOM items with their supplier price data and computes
// 3 ordering scenarios: cheapest, fastest (in-stock), single shop.

export interface SupplierEntry {
  shopId: string;
  shopName: string;
  price: number;
  moq?: number;
  stock?: number | null;
  sku?: string;
}

export interface MissingItemWithSuppliers {
  partId: string;
  name: string;
  mpn?: string;
  missing: number;
  suppliers: SupplierEntry[];
}

export interface ScenarioItem {
  partId: string;
  name: string;
  mpn: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  sku: string;
}

export interface ScenarioShop {
  shopId: string;
  shopName: string;
  items: ScenarioItem[];
  subtotal: number;
  shipping: number;
}

export interface Scenario {
  type: "cheapest" | "fastest" | "one_shop";
  label: string;
  totalCost: number;
  breakdown: ScenarioShop[];
  explanation: string;
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }

function calcShipping(subtotal: number, shop: any): number {
  if (!shop) return 0;
  if (shop.freeShippingThreshold != null && subtotal >= shop.freeShippingThreshold) return 0;
  return shop.shippingCost || 0;
}

function buildBreakdown(
  assignments: { part: MissingItemWithSuppliers; supplier: SupplierEntry | null }[],
  shopMap: Record<string, any>
): { breakdown: ScenarioShop[]; totalCost: number } {
  const byShop: Record<string, ScenarioShop> = {};

  for (const { part, supplier } of assignments) {
    if (!supplier) continue;
    const key = supplier.shopId || supplier.shopName;
    if (!byShop[key]) byShop[key] = { shopId: supplier.shopId || "", shopName: supplier.shopName, items: [], subtotal: 0, shipping: 0 };
    const qty = Math.max(part.missing || 1, supplier.moq || 1);
    const lineTotal = round4(qty * supplier.price);
    byShop[key].items.push({ partId: part.partId, name: part.name, mpn: part.mpn || "", qty, unitPrice: supplier.price, lineTotal, sku: supplier.sku || "" });
  }

  let totalCost = 0;
  const breakdown = Object.values(byShop).map(sg => {
    const subtotal = round4(sg.items.reduce((s, it) => s + it.lineTotal, 0));
    const shop = shopMap[sg.shopId] || shopMap[sg.shopName];
    const shipping = round2(calcShipping(subtotal, shop));
    totalCost += subtotal + shipping;
    return { ...sg, subtotal, shipping };
  });

  return { breakdown, totalCost: round2(totalCost) };
}

export function computeScenarios(missingItems: MissingItemWithSuppliers[], shops: any[]): Scenario[] {
  // Build shop lookup by id and name
  const shopMap: Record<string, any> = {};
  for (const s of shops || []) {
    if (s.id)   shopMap[s.id]   = s;
    if (s.name) shopMap[s.name] = s;
  }

  const withSups    = (missingItems || []).filter(p => (p.suppliers || []).length > 0);
  const withoutSups = (missingItems || []).filter(p => !(p.suppliers || []).length);

  const noSupNote = withoutSups.length
    ? ` ${withoutSups.length} part(s) without price data excluded: ${withoutSups.map(p => p.name).join(", ")}.`
    : "";

  // ── Cheapest: lowest unit price per part ──────────────────────────────────
  const cheapAssign = withSups.map(part => ({
    part,
    supplier: [...(part.suppliers || [])].sort((a, b) => a.price - b.price)[0] ?? null,
  }));
  const cheap = buildBreakdown(cheapAssign, shopMap);

  // ── Fastest: in-stock first, then cheapest ────────────────────────────────
  const fastAssign = withSups.map(part => {
    const sups = part.suppliers || [];
    const inStock = sups.filter(s => (s.stock ?? -1) > 0).sort((a, b) => a.price - b.price);
    const any     = [...sups].sort((a, b) => a.price - b.price);
    return { part, supplier: inStock[0] ?? any[0] ?? null };
  });
  const fast = buildBreakdown(fastAssign, shopMap);

  // ── One shop: shop covering the most parts, break ties by coverage cost ───
  const shopCov: Record<string, { name: string; count: number; totalCost: number }> = {};
  for (const part of withSups) {
    for (const sup of part.suppliers || []) {
      const k = sup.shopId || sup.shopName;
      if (!shopCov[k]) shopCov[k] = { name: sup.shopName, count: 0, totalCost: 0 };
      shopCov[k].count++;
      shopCov[k].totalCost += sup.price;
    }
  }
  const bestKey = Object.entries(shopCov)
    .sort(([, a], [, b]) => b.count - a.count || a.totalCost - b.totalCost)[0]?.[0] ?? null;

  const oneAssign = withSups.map(part => {
    const fromBest = bestKey ? (part.suppliers || []).find(s => (s.shopId || s.shopName) === bestKey) : null;
    const fallback = [...(part.suppliers || [])].sort((a, b) => a.price - b.price)[0] ?? null;
    return { part, supplier: fromBest ?? fallback };
  });
  const one = buildBreakdown(oneAssign, shopMap);

  return [
    {
      type: "cheapest",
      label: "Cheapest combination",
      totalCost: cheap.totalCost,
      breakdown: cheap.breakdown,
      explanation: `Selects the lowest-priced supplier for each part across all shops.${noSupNote}`,
    },
    {
      type: "fastest",
      label: "Fastest / in-stock",
      totalCost: fast.totalCost,
      breakdown: fast.breakdown,
      explanation: `Prioritizes suppliers with confirmed stock available. May cost slightly more.${noSupNote}`,
    },
    {
      type: "one_shop",
      label: "Single shop",
      totalCost: one.totalCost,
      breakdown: one.breakdown,
      explanation: `Consolidates into as few shops as possible to reduce shipping complexity.${noSupNote}`,
    },
  ];
}
