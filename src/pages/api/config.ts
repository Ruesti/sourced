import type { NextApiRequest, NextApiResponse } from "next";

/** Only allow https URLs for public promo links (avoid javascript: etc.). */
function safePublicUrl(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const t = raw.trim();
  if (!/^https:\/\//i.test(t)) return "";
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return "";
    return t.slice(0, 800);
  } catch {
    return "";
  }
}

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
    hasServerAI: !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY),
    hasServerTavily: !!process.env.TAVILY_API_KEY,
    hasServerNexar: !!process.env.NEXAR_CLIENT_ID,
    creatorSiteUrl: safePublicUrl(process.env.NEXT_PUBLIC_CREATOR_SITE_URL),
    creatorSiteLabel: (process.env.NEXT_PUBLIC_CREATOR_SITE_LABEL || "").trim().slice(0, 80),
    downloadPageUrl: safePublicUrl(process.env.NEXT_PUBLIC_DOWNLOAD_PAGE_URL),
    creatorStripNote: (process.env.NEXT_PUBLIC_CREATOR_STRIP_NOTE || "").trim().slice(0, 220),
  });
}
