// @ts-nocheck
import { useState } from "react";
import { css } from "../lib/styles";
import {
  callAI, getApiKey, saveApiKey, clearApiKey, getProvider, saveProvider,
  getCustomEndpoint, saveCustomEndpoint,
  getTavilyKey, saveTavilyKey, getNexarId, saveNexarId, getNexarSecret, saveNexarSecret,
  getNexarToken, PROVIDERS,
} from "../lib/ai-api";
import {
  sbAuth, getSb, getSbSession, setSbSession, resetSbClient,
  sbUpsert, partToSb, projectToSb, supplierToSb, bomItemToSb, shopToSb,
} from "../lib/supabase";

// ── Auth Modal ────────────────────────────────────────────────────────────────

export function AuthModal({ onClose, onLoggedIn }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");

  const handle = async () => {
    setLoading(true); setErr(""); setMsg(null);
    try {
      if (tab === "register") {
        const d = await sbAuth("signup", { email, password });
        if (d.error) throw new Error(d.error);
        setMsg("Confirmation email sent! Please confirm your email then sign in.");
      } else {
        const d = await sbAuth("signin", { email, password });
        if (d.error) throw new Error(d.error);
        setSbSession(d.session);
        resetSbClient();
        onLoggedIn(d.user);
      }
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <div className="auth-modal-tabs">
          <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setErr(""); setMsg(null); }}>Sign in</button>
          <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setErr(""); setMsg(null); }}>Register</button>
        </div>

        {tab === "register" && (
          <div style={{ background: "rgba(57,211,83,0.06)", border: "1px solid rgba(57,211,83,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
            🎉 <strong style={{ color: "var(--green)" }}>Beta — Cloud sync is free.</strong>{" "}
            Early access users will pay less permanently compared to new customers.
          </div>
        )}

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        <div className="form-row">
          <label>Password {tab === "register" && <span style={{ color: "var(--text3)" }}>(min. 8 characters)</span>}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>⚠️ {err}</div>}
        {msg && <div style={{ color: "var(--green)", fontSize: 12, marginBottom: 10 }}>✓ {msg}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !email || !password} onClick={handle}>
            {loading ? <><span className="spinner" /></> : tab === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Migration Modal ───────────────────────────────────────────────────────────

export function MigrationModal({ localData, userId, onDone, onSkip }) {
  const [migrating, setMigrating] = useState(false);
  const [done, setDone] = useState(false);

  const migrate = async () => {
    setMigrating(true);
    const sb = await getSb();
    if (!sb) { onSkip(); return; }
    try {
      if (localData.parts?.length)     await sbUpsert("bm_parts",     localData.parts.map(p => partToSb(p, userId)));
      if (localData.projects?.length)  await sbUpsert("bm_projects",  localData.projects.map(p => projectToSb(p, userId)));
      if (localData.suppliers?.length) await sbUpsert("bm_suppliers", localData.suppliers.map(s => supplierToSb(s, userId)));
      if (localData.bomItems?.length)  await sbUpsert("bm_bom_items", localData.bomItems.map(b => bomItemToSb(b, userId)));
      if (localData.shops?.length)     await sbUpsert("bm_shops",     localData.shops.map(s => shopToSb(s, userId)));
      setDone(true);
    } catch (e) { console.error(e); }
    setMigrating(false);
  };

  const total = (localData.parts?.length || 0) + (localData.projects?.length || 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 460 }}>
        {done ? (
          <>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>☁️</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Migration complete!</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
                All local data has been backed up to the cloud.
              </div>
              <button className="btn btn-primary" onClick={onDone}>Let&apos;s go →</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">☁️ Upload local data?</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, lineHeight: 1.6 }}>
              You have <strong style={{ color: "var(--text)" }}>{total} local entries</strong> (parts + projects).
              Upload them to the cloud for sync across devices?
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onSkip}>Use cloud data instead</button>
              <button className="btn btn-primary" disabled={migrating} onClick={migrate}>
                {migrating ? <><span className="spinner" /> Uploading…</> : "Upload local data"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Onboarding Screen ─────────────────────────────────────────────────────────

export function OnboardingScreen({ onDone, creatorPromo }) {
  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;

  const testKey = async () => {
    if (!key.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      saveProvider(provider);
      if (provider === "compatible") saveCustomEndpoint(endpoint.trim());
      await callAI([{ role: "user", content: "Hi" }], 5, key.trim());
      saveApiKey(key.trim());
      setTestResult("ok");
      setTimeout(() => onDone(), 800);
    } catch (e) { setTestResult("error:" + e.message); }
    setTesting(false);
  };

  const card = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column" }}>
      <style>{css}</style>

      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div className="logo"><span>⚡</span><span>Sourced</span><span className="logo-badge">v1</span></div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, width: "100%" }}>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to Sourced</h1>
            <p style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.7 }}>
              AI-powered parts database &amp; BOM manager. Your data stays local in the browser.
            </p>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>1. Choose AI provider</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <button key={id} onClick={() => { setProvider(id); setTestResult(null); }}
                  className={provider === id ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ fontSize: 12, padding: "5px 12px" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7, background: "var(--bg3)", borderRadius: 6, padding: "10px 12px" }}>
              {provider === "anthropic" && <><strong style={{ color: "var(--text)" }}>Recommended.</strong> Start free with credits. Approx. <strong style={{ color: "var(--text)" }}>€0.01–0.05 per search</strong>.</>}
              {provider === "openai" && <><strong style={{ color: "var(--text)" }}>OpenAI GPT-4o-mini.</strong> Cheap and fast. Comparable quality for BOM import.</>}
              {provider === "compatible" && <><strong style={{ color: "var(--text)" }}>Groq, Ollama, etc.</strong> Groq has a free tier with very fast latencies.</>}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>2. Create API key</div>
            {cfg.guideSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13, color: "var(--text2)" }}>
                <span style={{ color: "var(--blue)", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
            {cfg.guideUrl && (
              <a href={cfg.guideUrl} target="_blank" rel="noopener"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--blue)", padding: "6px 14px", borderRadius: 6, fontSize: 13, textDecoration: "none", fontWeight: 500, marginTop: 8 }}>
                🔗 {cfg.guideUrl} ↗
              </a>
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>3. Enter key &amp; get started</div>
            {provider === "compatible" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Endpoint URL</div>
                <input value={endpoint} onChange={e => { setEndpoint(e.target.value); setTestResult(null); }}
                  placeholder="https://api.groq.com/openai/v1/chat/completions"
                  style={{ width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono", marginBottom: 8 }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={key} onChange={e => { setKey(e.target.value); setTestResult(null); }}
                placeholder={cfg.keyPlaceholder} type="password"
                style={{ flex: 1, background: "var(--bg3)", border: `1px solid ${testResult === "ok" ? "var(--green)" : testResult?.startsWith("error") ? "var(--red)" : "var(--border2)"}`, color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Mono" }}
                onKeyDown={e => e.key === "Enter" && testKey()} />
              <button className="btn btn-primary" onClick={testKey} disabled={testing || !key.trim()}>
                {testing ? <><span className="spinner" />Checking…</> : testResult === "ok" ? "✓ Valid!" : "Confirm"}
              </button>
            </div>
            {testResult?.startsWith("error:") && (
              <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>⚠️ {testResult.replace("error:", "")}</div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--text3)" }} onClick={onDone}>
              Start without AI features →
            </button>
          </div>

          {creatorPromo && (creatorPromo.url || creatorPromo.downloadUrl) && (
            <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>From the author?</div>
              {creatorPromo.stripNote && <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10, lineHeight: 1.5 }}>{creatorPromo.stripNote}</div>}
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
                {creatorPromo.downloadUrl && (
                  <a href={creatorPromo.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Download / Setup</a>
                )}
                {creatorPromo.url && (
                  <a href={creatorPromo.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>{creatorPromo.label || "Author website"}</a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Help Modal ────────────────────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    title: "Parts", icon: "🔩",
    items: [
      { q: "How do I add a part?", a: "In the \"Parts\" tab click \"+ Add Part\". Enter name, MPN, and category." },
      { q: "What is the AI supplier search?", a: "Click on a part → \"AI Search\" finds matching shops from your shop list and suggests SKU and price." },
      { q: "How do I select a preferred supplier?", a: "In the part detail under \"Suppliers\" add an entry or save it via the Sourcing search. The preferred supplier will then appear in the BOM." },
    ],
  },
  {
    title: "BOM (Bill of Materials)", icon: "📋",
    items: [
      { q: "How do I create a project?", a: "In the BOM tab click \"+\" or a new project is automatically created during CSV/AI import." },
      { q: "How do I add parts to the BOM?", a: "Select a project → \"+ Add Part\" → choose from the parts database and enter quantity/reference." },
      { q: "Can I export the BOM?", a: "Yes: select a project → \"CSV Export\" in the top right." },
    ],
  },
  {
    title: "Import", icon: "📥",
    items: [
      { q: "Which formats are supported?", a: "CSV Import: KiCad, Eagle, Altium, generic CSV. AI Import: any text files, PDF text, free text — the AI detects the format automatically." },
      { q: "How does AI import work?", a: "In the Import tab select \"AI Analysis\", upload a file or paste text. The AI extracts all parts and shows a preview. Review and then import." },
      { q: "Import shows an empty project?", a: "After importing click \"→ Go to BOM\" — the newly created project will be automatically selected." },
    ],
  },
  {
    title: "Sourcing (AliExpress)", icon: "🛍️",
    items: [
      { q: "How does the vendor search work?", a: "In the Sourcing tab select a project → \"Start Search\". The AI suggests AliExpress vendors for each part." },
      { q: "How do I save a vendor as a supplier?", a: "After searching expand a store → \"Save as Supplier\". The entries then appear in the Parts database as suppliers." },
      { q: "Prices are not current?", a: "The AI estimates prices from training knowledge — these are estimates, not live prices. Always verify on AliExpress." },
    ],
  },
  {
    title: "Shops", icon: "🏪",
    items: [
      { q: "What is the shop list?", a: "In the \"Shops\" tab you manage your preferred suppliers. The AI search uses this list." },
      { q: "How do I add a shop?", a: "In the Shops tab click \"+ Add Shop\" → enter name, region and URL." },
      { q: "Can AI suggest shops for my region?", a: "Yes: \"Find shops for my region\" → enter your country → the AI suggests regional suppliers." },
    ],
  },
  {
    title: "API Key & AI", icon: "🔑",
    items: [
      { q: "Which provider is recommended?", a: "Anthropic Claude is most reliable for structured JSON output and BOM parsing. OpenAI GPT-4o-mini is slightly cheaper." },
      { q: "What does AI usage cost?", a: "Anthropic: ~€0.01–0.05 per search. OpenAI: similar. Groq: free rate limits." },
      { q: "Where is the key stored?", a: "Exclusively in your browser's localStorage. No server receives your key." },
    ],
  },
];

export function HelpModal({ onClose, creatorPromo }) {
  const [openSection, setOpenSection] = useState(null);
  const showPromo = creatorPromo && (creatorPromo.url || creatorPromo.downloadUrl);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: "80vh", overflowY: "auto" }}>
        <div className="modal-title">? User Guide</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>
          Sourced — AI-powered parts database &amp; BOM manager
        </div>
        {showPromo && (
          <div style={{ background: "rgba(163,113,247,0.08)", border: "1px solid rgba(163,113,247,0.25)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Distribution &amp; updates</div>
            <div style={{ marginBottom: 10 }}>{creatorPromo.stripNote || "Use the author's links for downloads, updates, and other tools they publish."}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {creatorPromo.downloadUrl && (
                <a href={creatorPromo.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Download / setup</a>
              )}
              {creatorPromo.url && (
                <a href={creatorPromo.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>{creatorPromo.label || "Author website"}</a>
              )}
            </div>
          </div>
        )}
        {HELP_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 8 }}>
            <button onClick={() => setOpenSection(openSection === section.title ? null : section.title)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: openSection === section.title ? "8px 8px 0 0" : 8, padding: "10px 14px", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{section.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{section.title}</span>
              <span style={{ color: "var(--text3)", fontSize: 12 }}>{openSection === section.title ? "▲" : "▼"}</span>
            </button>
            {openSection === section.title && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "0 14px 10px" }}>
                {section.items.map((item, i) => (
                  <div key={i} style={{ padding: "12px 0", borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--blue)" }}>{item.q}</div>
                    <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{item.a}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── API Key Settings Modal ────────────────────────────────────────────────────

export function ApiKeyModal({ onClose }) {
  const [section, setSection] = useState<"ai"|"sourcing">("ai");
  const [provider, setProvider] = useState(getProvider());
  const [key, setKey] = useState(getApiKey());
  const [endpoint, setEndpoint] = useState(getCustomEndpoint());
  const [tavilyKey, setTavilyKey] = useState(getTavilyKey());
  const [nexarId, setNexarId] = useState(getNexarId());
  const [nexarSecret, setNexarSecret] = useState(getNexarSecret());
  const [testing, setTesting] = useState(false);
  const [testingSourcing, setTestingSourcing] = useState(false);
  const [result, setResult] = useState(null);
  const [sourcingResult, setSourcingResult] = useState(null);
  const cfg = PROVIDERS[provider] || PROVIDERS.anthropic;

  const testAndSave = async () => {
    if (!key.trim()) { clearApiKey(); saveProvider(provider); onClose(); return; }
    setTesting(true); setResult(null);
    try {
      saveProvider(provider);
      if (provider === "compatible") saveCustomEndpoint(endpoint.trim());
      await callAI([{ role: "user", content: "Hi" }], 5, key.trim());
      saveApiKey(key.trim());
      setResult("ok");
      setTimeout(onClose, 700);
    } catch (e) { setResult("error:" + e.message); }
    setTesting(false);
  };

  const saveSourcingKeys = async () => {
    setTestingSourcing(true); setSourcingResult(null);
    try {
      if (tavilyKey.trim()) saveTavilyKey(tavilyKey.trim());
      if (nexarId.trim()) saveNexarId(nexarId.trim());
      if (nexarSecret.trim()) saveNexarSecret(nexarSecret.trim());
      if (nexarId.trim() && nexarSecret.trim()) await getNexarToken();
      setSourcingResult("ok");
    } catch (e: any) { setSourcingResult("error:" + e.message); }
    setTestingSourcing(false);
  };

  const rowStyle = { marginBottom: 12 };
  const labelStyle = { fontSize: 12, color: "var(--text2)", marginBottom: 4, display: "block" as const };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 540, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="modal-title">🔑 API Keys</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
          All keys are stored locally in your browser (localStorage) only, never transmitted to any server.
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <button onClick={() => setSection("ai")} className={section === "ai" ? "btn btn-primary" : "btn btn-secondary"} style={{ fontSize: 13 }}>
            🤖 AI Provider
          </button>
          <button onClick={() => setSection("sourcing")} className={section === "sourcing" ? "btn btn-primary" : "btn btn-secondary"} style={{ fontSize: 13 }}>
            🛍️ Live Sourcing
            {(getNexarId() || getTavilyKey()) && <span style={{ marginLeft: 4, fontSize: 10, color: "var(--green)" }}>✓</span>}
          </button>
        </div>

        {section === "ai" && <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <button key={id} onClick={() => { setProvider(id); setResult(null); }}
                className={provider === id ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: 12, padding: "5px 12px" }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text2)" }}>How to get your API key:</div>
            {cfg.guideSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, color: "var(--text2)" }}>
                <span style={{ color: "var(--blue)", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
            {cfg.guideUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={cfg.guideUrl} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12 }}>
                  → {cfg.guideUrl} ↗
                </a>
              </div>
            )}
          </div>

          {provider === "compatible" && (
            <div style={rowStyle}>
              <label style={labelStyle}>Endpoint URL</label>
              <input value={endpoint} onChange={e => { setEndpoint(e.target.value); setResult(null); }}
                placeholder="https://api.groq.com/openai/v1/chat/completions"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
            </div>
          )}

          <div style={rowStyle}>
            <label style={labelStyle}>API Key ({cfg.keyHint})</label>
            <input value={key} onChange={e => { setKey(e.target.value); setResult(null); }} type="password"
              placeholder={cfg.keyPlaceholder} style={{ fontFamily: "IBM Plex Mono", width: "100%" }}
              onKeyDown={e => e.key === "Enter" && testAndSave()} />
          </div>

          {result === "ok" && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>✓ Key valid and saved!</div>}
          {result?.startsWith("error:") && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>⚠️ {result.replace("error:", "")}</div>}

          <div className="modal-actions">
            {getApiKey() && <button className="btn btn-danger" style={{ marginRight: "auto", padding: "6px 12px", fontSize: 13 }}
              onClick={() => { clearApiKey(); onClose(); }}>Remove key</button>}
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={testing} onClick={testAndSave}>
              {testing ? <><span className="spinner" /> Checking…</> : "Save & test"}
            </button>
          </div>
        </>}

        {section === "sourcing" && <>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🏭 Nexar / Octopart</div>
            <div style={{ color: "var(--text2)", marginBottom: 8 }}>Real stock levels from Mouser, DigiKey, LCSC, Farnell and others.</div>
            <div style={{ color: "var(--text3)", lineHeight: 1.6 }}>
              1. <a href="https://nexar.com/sign-up" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>nexar.com/sign-up ↗</a><br />
              2. Sign in → <strong>Applications</strong> → <strong>New Application</strong><br />
              3. Copy Client ID and Client Secret
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Nexar Client ID</label>
            <input value={nexarId} onChange={e => { setNexarId(e.target.value); setSourcingResult(null); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Nexar Client Secret</label>
            <input value={nexarSecret} onChange={e => { setNexarSecret(e.target.value); setSourcingResult(null); }} type="password"
              placeholder="Client Secret" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />

          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🔍 Tavily (AliExpress live search)</div>
            <div style={{ color: "var(--text2)", marginBottom: 8 }}>Searches live on AliExpress — 1,000 searches/month free.</div>
            <div style={{ color: "var(--text3)", lineHeight: 1.6 }}>
              1. <a href="https://app.tavily.com" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>app.tavily.com ↗</a><br />
              2. Create account → Copy API key
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Tavily API Key</label>
            <input value={tavilyKey} onChange={e => { setTavilyKey(e.target.value); setSourcingResult(null); }}
              placeholder="tvly-…" style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: "100%" }} />
          </div>

          {sourcingResult === "ok" && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>✓ Keys saved{nexarId && nexarSecret ? " — Nexar token successfully retrieved!" : "!"}</div>}
          {sourcingResult?.startsWith("error:") && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>⚠️ {sourcingResult.replace("error:", "")}</div>}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={testingSourcing} onClick={saveSourcingKeys}>
              {testingSourcing ? <><span className="spinner" /> Checking…</> : "Save"}
            </button>
          </div>
        </>}

      </div>
    </div>
  );
}
