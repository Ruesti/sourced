import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { query, domain } = req.body || {};
  if (!query) return res.status(400).json({ error: "query required" });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Search not configured on server" });

  const fullQuery = domain ? `${query} site:${domain}` : query;
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query: fullQuery, search_depth: "basic", max_results: 5 }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Search error" });
    const results = (data.results || []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content || "" }));
    return res.status(200).json({ results });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
