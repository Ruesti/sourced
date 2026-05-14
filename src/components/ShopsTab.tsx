// @ts-nocheck
import { useState } from "react";
import { DEFAULT_SHOPS, suggestShopsForRegion } from "../lib/shop-data";
import { getApiKey } from "../lib/ai-api";

// ── RegionShopSetup ────────────────────────────────────────────────────────────

function RegionShopSetup({ existingShops, onAdd, onClose }) {
  const [country, setCountry] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");

  const CATS = [
    { id: "electronic", label: "Electronics",            icon: "⚡" },
    { id: "mechanical", label: "Mechanical / Fasteners", icon: "🔩" },
    { id: "drive",      label: "Drives / Motors",        icon: "⚙️" },
    { id: "pneumatic",  label: "Pneumatics / Hydraulics", icon: "💨" },
    { id: "linear",     label: "Linear Motion",           icon: "📏" },
    { id: "structure",  label: "Profiles / Structure",    icon: "📐" },
  ];

  const toggleCat = (id) => setCategories(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const handleSearch = async () => {
    if (!country.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const suggestions = await suggestShopsForRegion(country, categories.map(c => CATS.find(x => x.id === c)?.label || c), getApiKey());
      const existingUrls = new Set(existingShops.map(s => s.url?.toLowerCase()));
      const fresh = suggestions.filter(s => !existingUrls.has(s.url?.toLowerCase()));
      setResults(fresh);
      const sel = {};
      fresh.forEach(s => { sel[s.id] = true; });
      setSelected(sel);
    } catch (e) {
      setError("Search failed: " + e.message);
    }
    setLoading(false);
  };

  const handleAdd = () => {
    const toAdd = results.filter(s => selected[s.id]);
    onAdd(toAdd.map(s => ({ ...s, id: s.id + "_" + Date.now() })));
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620 }}>
        <div className="modal-title">🌍 Find shops for your region</div>

        {!results ? (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18, lineHeight: 1.6 }}>
              The AI searches for the best local and regional suppliers for your location —
              for electronics as well as mechanical parts, fasteners, and specialty items.
            </div>

            <div className="form-row">
              <label>Your country / region *</label>
              <input value={country} onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Germany, USA, Japan, Australia, Brazil, India…"
                autoFocus onKeyDown={e => e.key === "Enter" && handleSearch()} />
            </div>

            <div className="form-row">
              <label>What parts do you buy? (optional — for better recommendations)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {CATS.map(c => (
                  <button key={c.id} onClick={() => toggleCat(c.id)}
                    className={`btn btn-sm ${categories.includes(c.id) ? "btn-primary" : "btn-secondary"}`}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-ai" disabled={loading || !country.trim()} onClick={handleSearch}>
                {loading ? <><span className="spinner" /> Searching local shops…</> : "🔍 Find shops"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
              <strong style={{ color: "var(--green)" }}>{results.length} shops</strong> found for <strong style={{ color: "var(--text)" }}>{country}</strong>.
              Select the shops you want to add:
            </div>

            <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 16 }}>
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text3)" }}>
                  No new shops found — all suggestions are already in your list.
                </div>
              ) : results.map(s => (
                <div key={s.id} onClick={() => setSelected(sel => ({ ...sel, [s.id]: !sel[s.id] }))}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: selected[s.id] ? "rgba(57,211,83,0.06)" : "var(--bg3)", border: `1px solid ${selected[s.id] ? "rgba(57,211,83,0.3)" : "var(--border)"}`, transition: "all 0.15s" }}>
                  <input type="checkbox" checked={!!selected[s.id]} onChange={() => {}} style={{ accentColor: "var(--green)", marginTop: 3, cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                      <span className="tag tag-cat">{s.region}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 3 }}>{s.speciality}</div>
                    <a href={s.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>{s.url}</a>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResults(null)}>← Back</button>
              <button className="btn btn-primary"
                disabled={Object.values(selected).filter(Boolean).length === 0}
                onClick={handleAdd}>
                ✅ Add {Object.values(selected).filter(Boolean).length} shops
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ShopsTab ───────────────────────────────────────────────────────────────────

export default function ShopsTab({ shops, saveShops }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRegionSetup, setShowRegionSetup] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", url: "", speciality: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShop = () => {
    if (!form.name) return;
    saveShops([...shops, { ...form, id: Date.now().toString(), categories: [] }]);
    setForm({ name: "", region: "", url: "", speciality: "" });
    setShowAdd(false);
  };

  const deleteShop = (id) => {
    if (DEFAULT_SHOPS.find(s => s.id === id)) { alert("Default shop cannot be deleted."); return; }
    saveShops(shops.filter(s => s.id !== id));
  };

  const globalShops = DEFAULT_SHOPS;
  const userShops = shops.filter(s => !DEFAULT_SHOPS.find(d => d.id === s.id));

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🏪 Shops
          <span className="badge">{shops.length} configured</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ai" onClick={() => setShowRegionSetup(true)}>🌍 Find shops for my region</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add manually</button>
        </div>
      </div>

      <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.15)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--text)" }}>Your personal shop list.</strong> Shops vary greatly by region —
        what is Mädler and Reichelt in Germany is McMaster-Carr and Digi-Key in the USA, Misumi and Monotaro in Japan.
        Use <strong style={{ color: "var(--blue)" }}>"Find shops for my region"</strong> to let the AI suggest suitable local suppliers.
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
        🌐 GLOBAL — always available
      </div>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Shop</th><th>Region</th><th>Speciality</th><th>Website</th></tr></thead>
          <tbody>
            {globalShops.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className="tag tag-cat">{s.region}</span></td>
                <td style={{ fontSize: 12, color: "var(--text2)" }}>General</td>
                <td><a href={s.url} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12, textDecoration: "none" }}>{s.url}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {userShops.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
            📍 YOUR SHOPS
          </div>
          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Shop</th><th>Region</th><th>Speciality</th><th>Website</th><th></th></tr></thead>
              <tbody>
                {userShops.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span className="tag tag-cat">{s.region || "—"}</span></td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{s.speciality || "—"}</td>
                    <td><a href={s.url} target="_blank" rel="noopener" style={{ color: "var(--blue)", fontSize: 12, textDecoration: "none" }}>{s.url}</a></td>
                    <td><button className="btn btn-danger" onClick={() => deleteShop(s.id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {userShops.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌍</div>
          <h3>No custom shops yet</h3>
          <p>Click "Find shops for my region" — the AI will recommend suitable local suppliers for your country.</p>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">➕ Add shop</div>
            <div className="form-row"><label>Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Mädler, McMaster-Carr" autoFocus /></div>
            <div className="form-row"><label>Region / Country</label><input value={form.region} onChange={e => set("region", e.target.value)} placeholder="e.g. DE, USA, JP, Global" /></div>
            <div className="form-row"><label>URL</label><input value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://…" /></div>
            <div className="form-row"><label>Speciality</label><input value={form.speciality} onChange={e => set("speciality", e.target.value)} placeholder="e.g. Drive technology, Fasteners, Electronics" /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addShop} disabled={!form.name}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showRegionSetup && (
        <RegionShopSetup
          existingShops={shops}
          onAdd={(newShops) => { saveShops([...shops, ...newShops]); setShowRegionSetup(false); }}
          onClose={() => setShowRegionSetup(false)}
        />
      )}
    </div>
  );
}
