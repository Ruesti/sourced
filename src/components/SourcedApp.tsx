// @ts-nocheck
// ── Sourced — BOM & Parts Manager ─────────────────────────────────────────────
// Supabase credentials are read from environment variables.
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local

import { useState, useEffect } from "react";
import { css } from "../lib/styles";
import {
  STORAGE_KEYS, loadLocal, saveLocal,
  sbAuth, getSbSession, setSbSession, resetSbClient,
  sbLoadAll, sbUpsert,
  partToSb, projectToSb, bomItemToSb, supplierToSb, shopToSb,
} from "../lib/supabase";
import { getApiKey } from "../lib/ai-api";
import { DEFAULT_SHOPS } from "../lib/shop-data";
import { computeScenarios } from "../lib/order-optimizer";
import PartsTab from "./PartsTab";
import BomTab from "./BomTab";
import ImportTab from "./ImportTab";
import ShopsTab from "./ShopsTab";
import OrderTab from "./OrderTab";
import { AuthModal, MigrationModal, HelpModal, ApiKeyModal, OnboardingScreen } from "./Modals";

export default function SourcedApp() {
  const [tab, setTab] = useState("bom");
  const [parts, setParts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [bomItems, setBomItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [shops, setShops] = useState(DEFAULT_SHOPS);
  const [loaded, setLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(!!getApiKey());
  const [user, setUser] = useState(null);
  const [syncState, setSyncState] = useState("offline");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [localDataForMigration, setLocalDataForMigration] = useState(null);
  const [creatorPromo, setCreatorPromo] = useState({ url: "", label: "", downloadUrl: "", stripNote: "" });

  useEffect(() => {
    (async () => {
      let cfg: Record<string, string> = {};
      try {
        cfg = await fetch("/api/config").then(r => (r.ok ? r.json() : {})).catch(() => ({}));
      } catch {}
      setCreatorPromo({
        url: cfg.creatorSiteUrl || "",
        label: cfg.creatorSiteLabel || "",
        downloadUrl: cfg.downloadPageUrl || "",
        stripNote: cfg.creatorStripNote || "",
      });

      let cloudUser = null;
      try {
        const session = getSbSession();
        if (session?.access_token) {
          const d = await sbAuth("getuser", { accessToken: session.access_token });
          cloudUser = d?.user || null;
          if (!cloudUser) setSbSession(null);
        }
      } catch {}

      const [lp, lpr, lb, ls, lsh] = await Promise.all([
        loadLocal(STORAGE_KEYS.parts), loadLocal(STORAGE_KEYS.projects),
        loadLocal(STORAGE_KEYS.bomItems), loadLocal(STORAGE_KEYS.suppliers),
        loadLocal(STORAGE_KEYS.shops, DEFAULT_SHOPS),
      ]);
      setParts(lp); setProjects(lpr); setBomItems(lb); setSuppliers(ls); setShops(lsh);

      if (cloudUser) {
        setUser(cloudUser); setSyncState("syncing");
        const cloud = await sbLoadAll(cloudUser.id);
        if (cloud) {
          setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems);
          setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops);
          setSyncState("online");
        } else {
          setSyncState("offline");
        }
      }
      setLoaded(true);
      if (!getApiKey()) {
        const serverHasAI = !!cfg.hasServerAI;
        if (!serverHasAI) setShowOnboarding(true);
        else setApiKeySet(true);
      }
    })().catch(() => setLoaded(true));
  }, []);

  const [pendingBomProjectId, setPendingBomProjectId] = useState<string|null>(null);
  const [orderContext, setOrderContext]     = useState(null);
  const [orderScenarios, setOrderScenarios] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail;
      if (d && typeof d === "object") {
        setTab(d.tab);
        if (d.projectId) setPendingBomProjectId(d.projectId);
        if (d.orderContext) {
          setOrderContext(d.orderContext);
          // Compute immediately — no AI call, no token limit, survives tab switches
          setOrderScenarios(computeScenarios(d.orderContext.missingItems, shops));
        }
      } else {
        setTab(d);
      }
    };
    window.addEventListener("switchTab", handler);
    return () => window.removeEventListener("switchTab", handler);
  }, [shops]); // shops needed for shipping calc

  const sync = (table, rows, mapper) => {
    if (!user) return;
    setSyncState("syncing");
    sbUpsert(table, rows.map(r => mapper(r, user.id)))
      .then(() => setSyncState("online"))
      .catch(() => setSyncState("offline"));
  };

  const saveParts     = (v) => { setParts(v);     saveLocal(STORAGE_KEYS.parts,     v); sync("bm_parts",     v, partToSb); };
  const saveProjects  = (v) => { setProjects(v);  saveLocal(STORAGE_KEYS.projects,  v); sync("bm_projects",  v, projectToSb); };
  const saveBom       = (v) => { setBomItems(v);  saveLocal(STORAGE_KEYS.bomItems,  v); sync("bm_bom_items", v, bomItemToSb); };
  const saveSuppliers = (v) => { setSuppliers(v); saveLocal(STORAGE_KEYS.suppliers, v); sync("bm_suppliers", v, supplierToSb); };
  const saveShops     = (v) => { setShops(v);     saveLocal(STORAGE_KEYS.shops,     v); sync("bm_shops",     v, shopToSb); };

  const handleLoggedIn = async (u) => {
    setUser(u); setShowAuthModal(false);
    const [p, pr, b, s, sh] = await Promise.all([
      loadLocal(STORAGE_KEYS.parts), loadLocal(STORAGE_KEYS.projects),
      loadLocal(STORAGE_KEYS.bomItems), loadLocal(STORAGE_KEYS.suppliers),
      loadLocal(STORAGE_KEYS.shops, []),
    ]);
    if (p.length > 0 || pr.length > 0) {
      setLocalDataForMigration({ parts: p, projects: pr, bomItems: b, suppliers: s, shops: sh });
      setShowMigration(true);
    } else {
      setSyncState("syncing");
      const cloud = await sbLoadAll(u.id);
      if (cloud) {
        setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems);
        setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops);
        setSyncState("online");
      }
    }
  };

  const handleLogout = async () => {
    const session = getSbSession();
    if (session?.access_token) sbAuth("signout", { accessToken: session.access_token }).catch(() => {});
    setSbSession(null); resetSbClient(); setUser(null); setSyncState("offline");
  };

  const handleMigrationDone = async () => {
    setShowMigration(false); setSyncState("syncing");
    const cloud = await sbLoadAll(user.id);
    if (cloud) {
      setParts(cloud.parts); setProjects(cloud.projects); setBomItems(cloud.bomItems);
      setSuppliers(cloud.suppliers); if (cloud.shops) setShops(cloud.shops);
      setSyncState("online");
    }
  };

  if (!loaded) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117", color:"#4493f8", fontFamily:"IBM Plex Mono, monospace", fontSize:13 }}>
      <div style={{ textAlign:"center" }}><div className="spinner" style={{ width:24, height:24, margin:"0 auto 12px" }} />Loading…</div>
    </div>
  );

  if (showOnboarding) return (
    <OnboardingScreen
      onDone={() => { setShowOnboarding(false); setApiKeySet(!!getApiKey()); }}
      creatorPromo={creatorPromo}
    />
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <header className="header">
          <div className="logo"><span>⚡</span><span>Sourced</span><span className="logo-badge">v1</span></div>
          <nav className="nav">
            {(() => {
              const lowStockCount = parts.filter(p => p.stockMin > 0 && (p.stock || 0) < p.stockMin).length;
              return [
                { id: "bom",    label: "BOM" },
                { id: "parts",  label: "Parts", badge: lowStockCount || null },
                { id: "orders", label: "Orders" },
                { id: "shops",  label: "Shops" },
                { id: "import", label: "Import" },
              ].map(n => (
                <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
                  {n.label}
                  {n.badge ? <span style={{ marginLeft: 5, background: "var(--red)", color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 700, padding: "1px 5px", fontFamily: "IBM Plex Mono", lineHeight: 1.4 }}>{n.badge}</span> : null}
                </button>
              ));
            })()}
          </nav>

          {user ? (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color: syncState==="online" ? "var(--green)" : syncState==="syncing" ? "var(--blue)" : "var(--text3)" }}>
                <span className={`sync-dot ${syncState}`} />
                {syncState === "online" ? "Sync ✓" : syncState === "syncing" ? "Sync…" : "Offline"}
              </div>
              <button className="user-chip" onClick={handleLogout} title="Sign out">
                👤 {user.email?.split("@")[0]} ×
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAuthModal(true)}>
              ☁️ Sign in / Register
            </button>
          )}

          <button onClick={() => setShowHelpModal(true)}
            style={{ display:"flex", alignItems:"center", gap:4, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:12, color:"var(--text2)", fontFamily:"IBM Plex Sans" }}>
            ? Help
          </button>

          <button onClick={() => setShowKeyModal(true)}
            style={{ display:"flex", alignItems:"center", gap:6, background: apiKeySet ? "rgba(57,211,83,0.1)" : "rgba(248,81,73,0.1)", border:`1px solid ${apiKeySet ? "rgba(57,211,83,0.3)" : "rgba(248,81,73,0.3)"}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:12, color: apiKeySet ? "var(--green)" : "var(--red)", fontFamily:"IBM Plex Sans" }}>
            {apiKeySet ? "🔑 API Key" : "⚠️ Key missing"}
          </button>
        </header>

        {(creatorPromo.url || creatorPromo.downloadUrl) && (
          <div className="creator-strip" role="region" aria-label="Author">
            <span className="creator-strip-icon" aria-hidden>🔗</span>
            <div className="creator-strip-text">
              <strong>Sourced</strong>
              {creatorPromo.stripNote ? (
                <span> — {creatorPromo.stripNote}</span>
              ) : (
                <span> — If you came from the author's website: find downloads, updates, and more projects there.</span>
              )}
            </div>
            <div className="creator-strip-actions">
              {creatorPromo.downloadUrl && (
                <a href={creatorPromo.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
                  Download / Setup
                </a>
              )}
              {creatorPromo.url && (
                <a href={creatorPromo.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                  {creatorPromo.label || "More from author"}
                </a>
              )}
            </div>
          </div>
        )}

        {!user && (
          <div className="beta-bar">
            <span className="sync-dot offline" style={{ marginRight:6 }} />
            Stored locally ·{" "}
            <strong style={{ color:"var(--green)", marginLeft:4, marginRight:8 }}>Cloud sync free during beta</strong>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setShowAuthModal(true)}>
              ☁️ Activate now →
            </button>
          </div>
        )}

        <main className="main">
          {tab === "parts"  && <PartsTab  parts={parts} saveParts={saveParts} suppliers={suppliers} saveSuppliers={saveSuppliers} shops={shops} bomItems={bomItems} />}
          {tab === "bom"    && <BomTab    projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} parts={parts} saveParts={saveParts} suppliers={suppliers} saveSuppliers={saveSuppliers} shops={shops} initialProjectId={pendingBomProjectId} />}
          {tab === "orders" && <OrderTab  shops={shops} user={user} parts={parts} saveParts={saveParts} orderContext={orderContext} scenarios={orderScenarios} onRerun={() => orderContext && setOrderScenarios(computeScenarios(orderContext.missingItems, shops))} />}
          {tab === "import" && <ImportTab parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />}
          {tab === "shops"  && <ShopsTab  shops={shops} saveShops={saveShops} />}
        </main>

        {showKeyModal  && <ApiKeyModal  onClose={() => { setShowKeyModal(false); setApiKeySet(!!getApiKey()); }} />}
        {showHelpModal && <HelpModal    onClose={() => setShowHelpModal(false)} creatorPromo={creatorPromo} />}
        {showAuthModal && <AuthModal    onClose={() => setShowAuthModal(false)} onLoggedIn={handleLoggedIn} />}
        {showMigration && localDataForMigration && user && (
          <MigrationModal localData={localDataForMigration} userId={user.id} onDone={handleMigrationDone} onSkip={() => setShowMigration(false)} />
        )}
      </div>
    </>
  );
}
