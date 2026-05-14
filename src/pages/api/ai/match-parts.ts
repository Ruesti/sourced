import type { NextApiRequest, NextApiResponse } from "next";

const BATCH_SIZE = 20;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

interface MatchItem {
  _id: number;
  name: string;
  value?: string;
  description?: string;
  mpn?: string;
  manufacturer?: string;
  footprint?: string;
}

interface MatchResult {
  _id: number;
  mpn: string;
  manufacturer: string;
  part_type: string;
  footprint: string;
  confidence: "high" | "medium" | "low";
  notes: string;
}

async function matchBatch(items: MatchItem[], key: string): Promise<MatchResult[]> {
  const prompt = `You are a component identification expert. For each item below, identify the electronic or mechanical component and return standardized part data.

Items:
${items.map((it, i) => `${i}. name="${it.name}"${it.value ? ` value="${it.value}"` : ""}${it.description ? ` description="${it.description}"` : ""}${it.mpn ? ` mpn="${it.mpn}"` : ""}${it.manufacturer ? ` manufacturer="${it.manufacturer}"` : ""}${it.footprint ? ` footprint="${it.footprint}"` : ""}`).join("\n")}

Return a JSON array with exactly ${items.length} objects, one per item in the same order:
[
  {
    "idx": 0,
    "mpn": "exact MPN string, or empty if unknown",
    "manufacturer": "manufacturer name, or empty",
    "part_type": "one of: Resistor, Capacitor, Inductor, IC, Transistor, Diode, LED, Relay, Connector, Switch, Sensor, MCU, MOSFET, Module, Mechanical, Cable, Other",
    "footprint": "standardized footprint (e.g. 0402, SOT-23, DIP-8), or empty",
    "confidence": "high, medium, or low",
    "notes": "one short sentence explaining the match or the reason for low confidence"
  }
]

Confidence:
- high: unambiguous — clear MPN present, or part is fully described with no reasonable alternatives
- medium: likely correct but some uncertainty remains
- low: too vague, missing key data, or multiple plausible interpretations

Respond with only the JSON array.`;

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
  if (!r.ok) throw new Error(data.error?.message || `Anthropic error ${r.status}`);

  const text: string = (data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text) || []).join("");
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI returned no JSON array");

  const parsed: any[] = JSON.parse(jsonMatch[0]);

  return items.map((item, i) => {
    const found = parsed.find((p: any) => p.idx === i) ?? parsed[i] ?? {};
    return {
      _id: item._id,
      mpn: found.mpn || "",
      manufacturer: found.manufacturer || "",
      part_type: found.part_type || "Other",
      footprint: found.footprint || "",
      confidence: (["high", "medium", "low"].includes(found.confidence) ? found.confidence : "low") as "high" | "medium" | "low",
      notes: found.notes || "",
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { items, apiKey: clientKey } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  const key = process.env.ANTHROPIC_API_KEY || clientKey;
  if (!key) return res.status(503).json({ error: "No Anthropic API key configured" });

  const results: MatchResult[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch: MatchItem[] = items.slice(i, i + BATCH_SIZE);
    const batchResults = await matchBatch(batch, key);
    results.push(...batchResults);
  }

  return res.status(200).json({ results });
}
