// @ts-nocheck
// Phase 1: gap analysis — compares BOM requirements against current stock.

export type GapStatus = "green" | "yellow" | "red";

export interface MissingItem {
  partId: string;
  name: string;
  mpn: string;
  needed: number;
  available: number;
  missing: number;
}

export interface GapResult {
  status: GapStatus;
  total: number;
  fullyInStock: number;
  partial: number;
  missing: number;
  missingItems: MissingItem[];
}

export function computeGapAnalysis(
  bomItems: { partId: string; quantity: number }[],
  parts: { id: string; name: string; mpn?: string; stock: number }[]
): GapResult {
  if (!bomItems.length) {
    return { status: "green", total: 0, fullyInStock: 0, partial: 0, missing: 0, missingItems: [] };
  }

  let fullyInStock = 0;
  let partial = 0;
  let missingCount = 0;
  const missingItems: MissingItem[] = [];

  for (const item of bomItems) {
    const part = parts.find(p => p.id === item.partId);
    const available = part?.stock ?? 0;
    const needed = item.quantity;

    if (available >= needed) {
      fullyInStock++;
    } else if (available > 0) {
      partial++;
      missingItems.push({
        partId: item.partId,
        name: part?.name ?? "(unknown)",
        mpn: part?.mpn ?? "",
        needed,
        available,
        missing: needed - available,
      });
    } else {
      missingCount++;
      missingItems.push({
        partId: item.partId,
        name: part?.name ?? "(unknown)",
        mpn: part?.mpn ?? "",
        needed,
        available: 0,
        missing: needed,
      });
    }
  }

  const total = bomItems.length;
  let status: GapStatus = "green";
  if (missingCount > 0 || partial > 0) {
    const gapRatio = (missingCount + partial) / total;
    status = gapRatio >= 0.5 ? "red" : "yellow";
  }
  if (fullyInStock === total) status = "green";

  return { status, total, fullyInStock, partial, missing: missingCount, missingItems };
}

export const GAP_STATUS_COLOR: Record<GapStatus, string> = {
  green:  "var(--green)",
  yellow: "var(--orange)",
  red:    "var(--red)",
};

export const GAP_STATUS_LABEL: Record<GapStatus, string> = {
  green:  "All in stock",
  yellow: "Partially missing",
  red:    "Mostly missing",
};
