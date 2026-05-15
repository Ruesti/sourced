import type { NextApiRequest, NextApiResponse } from "next";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;
// Max parts per AI call — split into batches when exceeded
const BATCH_SIZE = 30;

function extractJson(text: string): any[] | null {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : text.trim();
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;
  try { return JSON.parse(arrayMatch[0]); } catch { return null; }
}

function slimParts(parts: any[]): any[] {
  return parts.map(p => ({
    partId: p.partId,
    name: p.name,
    mpn: p.mpn || "",
    needed: p.missing ?? p.needed ?? 1,
    suppliers: (p.suppliers || [])
      .filter((s: any) => s.price != null)
      .sort((a: any, b: any) => a.price - b.price)
      .slice(0, 3)
      .map((s: any) => ({
        shopId: s.shopId || "",
        shopName: s.shopName,
        price: s.price,
        moq: s.moq || 1,
        stock: s.stock ?? null,
        sku: s.sku || "",
      })),
  }));
}

async function callAI(parts: any[], shops: any[], key: string): Promise<any[]> {
  const partsWithPrices = parts.filter(p => p.suppliers.length > 0);
  const partsNoPrices   = parts.filter(p => p.suppliers.length === 0);

  const noPriceNote = partsNoPrices.length > 0
    ? `\nNote: ${partsNoPrices.length} part(s) have no price data and must be omitted from cost calculations: ${partsNoPrices.map(p => p.name).join(", ")}`
    : "";

  const prompt = `You are a purchasing optimizer for electronic components. Propose optimal ordering combinations for these missing parts.

Missing parts with supplier prices:
${JSON.stringify(partsWithPrices)}

Available shops:
${JSON.stringify(shops)}
${noPriceNote}

Rules:
- Shipping is FREE when a shop's order subtotal >= freeShippingThreshold (null means always charge shippingCost)
- Respect moq: ordered quantity must be >= moq
- For "fastest": prefer suppliers with stock > 0
- Omit parts with no price data from totals; mention them in explanation

Return ONLY a JSON array of exactly 3 scenarios:
[{"type":"cheapest","label":"Cheapest combination","totalCost":0,"breakdown":[{"shopId":"","shopName":"","subtotal":0,"shipping":0,"items":[{"partId":"","name":"","mpn":"","qty":1,"unitPrice":0,"lineTotal":0,"sku":""}]}],"explanation":""},{"type":"fastest","label":"Fastest / in-stock","totalCost":0,"breakdown":[],"explanation":""},{"type":"one_shop","label":"Single shop","totalCost":0,"breakdown":[],"explanation":""}]

Fill in real values. Respond with only the JSON array.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `AI error ${r.status}`);

  const text: string = (data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text) || []).join("");
  const scenarios = extractJson(text);
  if (!scenarios) throw new Error(`AI returned no valid JSON (response length: ${text.length} chars). Response preview: ${text.slice(0, 200)}`);
  return scenarios;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { missingParts, shops, apiKey: clientKey } = req.body || {};
  if (!Array.isArray(missingParts) || missingParts.length === 0) {
    return res.status(400).json({ error: "missingParts array required" });
  }

  const key = process.env.ANTHROPIC_API_KEY || clientKey;
  if (!key) return res.status(503).json({ error: "No Anthropic API key configured" });

  const slim = slimParts(missingParts);
  const shopData = (shops || []).map((s: any) => ({
    id: s.id, name: s.name,
    freeShippingThreshold: s.freeShippingThreshold ?? null,
    shippingCost: s.shippingCost || 0,
  }));

  // If too many parts, use the first BATCH_SIZE (those with prices first)
  const withPrices    = slim.filter(p => p.suppliers.length > 0);
  const withoutPrices = slim.filter(p => p.suppliers.length === 0);
  const batch = [...withPrices.slice(0, BATCH_SIZE), ...withoutPrices.slice(0, Math.max(0, BATCH_SIZE - withPrices.length))];

  const skipped = slim.length - batch.length;

  try {
    const scenarios = await callAI(batch, shopData, key);
    if (skipped > 0) {
      scenarios.forEach((s: any) => {
        s.explanation = (s.explanation || "") + ` (${skipped} additional parts without price data were omitted.)`;
      });
    }
    return res.status(200).json({ scenarios });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
