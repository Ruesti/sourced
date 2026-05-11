import type { NextApiRequest, NextApiResponse } from "next";

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/[^\x20-\x7E]/g, "");
const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim().replace(/[^\x20-\x7E]/g, "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, email, password, refreshToken, accessToken, userId } = req.body || {};

  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: "Supabase not configured" });

  const headers = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` };

  try {
    if (action === "signup") {
      const r = await fetch(`${SB_URL}/auth/v1/signup`, { method: "POST", headers, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.msg || d.error_description || d.message || "Signup failed" });
      return res.status(200).json({ user: d.user, session: d.session });
    }

    if (action === "signin") {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error_description || d.message || "Sign in failed" });
      return res.status(200).json({ user: d.user, session: { access_token: d.access_token, refresh_token: d.refresh_token } });
    }

    if (action === "getuser") {
      if (!accessToken) return res.status(200).json({ user: null });
      const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { ...headers, "Authorization": `Bearer ${accessToken}` } });
      if (!r.ok) return res.status(200).json({ user: null });
      const d = await r.json();
      return res.status(200).json({ user: d });
    }

    if (action === "signout") {
      if (accessToken) await fetch(`${SB_URL}/auth/v1/logout`, { method: "POST", headers: { ...headers, "Authorization": `Bearer ${accessToken}` } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
