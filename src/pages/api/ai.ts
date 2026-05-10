import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { messages, maxTokens, provider, model, endpoint, apiKey: clientKey } = req.body || {};
  if (!messages?.length) return res.status(400).json({ error: "messages required" });

  const useProvider = provider || "anthropic";

  if (useProvider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY || clientKey;
    if (!key) return res.status(503).json({ error: "Anthropic API key not configured" });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-haiku-4-5-20251001", max_tokens: maxTokens || 1000, messages }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "Anthropic error" });
    const text = (data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text) || []).join("");
    return res.status(200).json({ text });
  }

  // OpenAI or compatible
  const key = clientKey || process.env.OPENAI_API_KEY;
  const url = endpoint || "https://api.openai.com/v1/chat/completions";
  if (!key && !endpoint) return res.status(503).json({ error: "OpenAI API key not configured" });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key || "none"}` },
    body: JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: maxTokens || 1000, messages }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "OpenAI error" });
  return res.status(200).json({ text: data.choices?.[0]?.message?.content || "" });
}
