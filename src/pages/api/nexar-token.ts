import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { clientId: bodyId, clientSecret: bodySec } = req.body || {};

  const clientId = process.env.NEXAR_CLIENT_ID || bodyId;
  const clientSecret = process.env.NEXAR_CLIENT_SECRET || bodySec;
  if (!clientId || !clientSecret) return res.status(503).json({ error: "Nexar credentials not configured" });

  const r = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error || "Nexar token error" });
  return res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
}
