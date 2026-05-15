import type { NextApiRequest, NextApiResponse } from "next";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { missingParts, shops, apiKey: clientKey } = req.body || {};
  if (!Array.isArray(missingParts) || missingParts.length === 0) {
    return res.status(400).json({ error: "missingParts array required" });
  }

  const key = process.env.ANTHROPIC_API_KEY || clientKey;
  if (!key) return res.status(503).json({ error: "No Anthropic API key configured" });

  const prompt = `You are a purchasing optimizer for electronic components. Analyze these missing parts and available supplier prices to propose optimal ordering combinations.

Missing parts (quantity = units still needed after stock):
${JSON.stringify(missingParts, null, 2)}

Available shops:
${JSON.stringify(shops, null, 2)}

Rules:
- Shipping is FREE when a shop's subtotal >= freeShippingThreshold (null = always add shippingCost)
- Respect moq: order at least moq units per line
- Prefer suppliers with stock > 0 when the "fastest" scenario is computed
- If a part has no priced supplier, omit it from the scenario and mention it in explanation

Create exactly 3 scenarios and return ONLY a JSON array:

[
  {
    "type": "cheapest",
    "label": "Cheapest combination",
    "totalCost": <total parts + shipping, number>,
    "breakdown": [
      {
        "shopId": "<id>",
        "shopName": "<name>",
        "subtotal": <parts cost, number>,
        "shipping": <shipping cost, number>,
        "items": [
          {
            "partId": "<id>",
            "name": "<part name>",
            "mpn": "<mpn or empty string>",
            "qty": <ordered quantity, integer>,
            "unitPrice": <number>,
            "lineTotal": <qty * unitPrice, number>,
            "sku": "<sku or empty string>"
          }
        ]
      }
    ],
    "explanation": "<1-2 sentences: why this is cheapest, any trade-offs>"
  },
  {
    "type": "fastest",
    "label": "Fastest / in-stock",
    ...same structure...
  },
  {
    "type": "one_shop",
    "label": "Single shop",
    ...same structure...
  }
]

Respond with only the JSON array, no other text.`;

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
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || `AI error ${r.status}` });

  const text: string = (data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text) || []).join("");
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return res.status(500).json({ error: "AI returned no JSON array" });

  const scenarios = JSON.parse(jsonMatch[0]);
  return res.status(200).json({ scenarios });
}
