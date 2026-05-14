// @ts-nocheck
import { useState } from "react";
import { BUILTIN_TEMPLATES, PART_GROUPS } from "../lib/shop-data";
import { claudeSearch, getApiKey } from "../lib/ai-api";

// ── Parts Tab ─────────────────────────────────────────────────────────────────

export default function PartsTab({ parts, saveParts, suppliers, saveSuppliers, shops }) {
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [detailPart, setDetailPart] = useState(null);

  const cats = [...new Set(parts.map(p => {
    const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
    return tmpl ? tmpl.group : (p.category || null);
  }).filter(Boolean))];

  const filtered = parts.filter(p => {
    const q = query.toLowerCase();
    const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
    const matchQ = !q || p.name?.toLowerCase().includes(q) || p.mpn?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.manufacturer?.toLowerCase().includes(q);
    const partCat = tmpl ? tmpl.group : p.category;
    const matchC = !catFilter || partCat === catFilter;
    return matchQ && matchC;
  });

  const handleSave = (part) => {
    if (part.id) {
      saveParts(parts.map(p => p.id === part.id ? part : p));
    } else {
      saveParts([...parts, { ...part, id: Date.now().toString() }]);
    }
    setShowAdd(false); setEditPart(null);
  };

  const handleDelete = (id) => {
    if (!confirm("Delete part?")) return;
    saveParts(parts.filter(p => p.id !== id));
    saveSuppliers(suppliers.filter(s => s.partId !== id));
  };

  const partSuppliers = (id) => suppliers.filter(s => s.partId === id);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          🗄️ Parts Database
          <span className="badge">{parts.length} entries</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Part</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by name, MPN, manufacturer…" value={query} onChange={e => setQuery(e.target.value)} />
        <select style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", padding: "7px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
          value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => {
            const g = PART_GROUPS.find(g => g.id === c);
            return <option key={c} value={c}>{g ? `${g.icon} ${g.label}` : c}</option>;
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No parts {parts.length > 0 ? "found" : "yet"}</h3>
          <p>{parts.length === 0 ? "Add your first part." : "Try different search terms."}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name / Description</th>
                <th>Category</th>
                <th>MPN</th>
                <th>Key values</th>
                <th>Stock</th>
                <th>Suppliers</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const tmpl = BUILTIN_TEMPLATES.find(t => t.id === p.templateId);
                const sups = partSuppliers(p.id);
                const lowestPrice = sups.reduce((m, s) => s.price && s.price < m ? s.price : m, Infinity);
                const attrs = p.attributes || {};
                const keyAttrs = tmpl?.fields.slice(0, 2).map(f => attrs[f.key] ? `${f.label}: ${attrs[f.key]}${f.unit ? " " + f.unit : ""}` : null).filter(Boolean) || [];
                const stockWarn = p.stockMin > 0 && (p.stock || 0) <= p.stockMin;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.description}</div>}
                    </td>
                    <td>
                      {tmpl ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${tmpl.color}15`, border: `1px solid ${tmpl.color}40`, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 500, color: tmpl.color }}>
                          {tmpl.icon} {tmpl.name}
                        </span>
                      ) : p.category ? <span className="tag tag-cat">{p.category}</span> : "—"}
                    </td>
                    <td><span className="mono">{p.mpn || "—"}</span></td>
                    <td>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>
                        {keyAttrs.length > 0 ? keyAttrs.map((a, i) => <div key={i}>{a}</div>) : "—"}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {p.drawer && (
                          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, background: "rgba(88,166,255,0.1)", color: "var(--blue)", padding: "1px 6px", borderRadius: 4 }}>
                            📦 {p.drawer}
                          </span>
                        )}
                        {(p.stock !== undefined && p.stock !== null) && (
                          <span style={{ fontSize: 11, color: stockWarn ? "var(--orange)" : "var(--text3)" }}>
                            {stockWarn ? "⚠️" : ""} {p.stock} pcs{p.stockMin > 0 ? ` / min. ${p.stockMin}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: sups.length ? "var(--green)" : "var(--text3)" }}>
                          {sups.length} Shop{sups.length !== 1 ? "s" : ""}
                        </span>
                        {lowestPrice < Infinity && <span className="price-tag">from {lowestPrice.toFixed(2)}€</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetailPart(p)}>Detail</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditPart(p)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editPart) && (
        <PartModal part={editPart} onSave={handleSave} onClose={() => { setShowAdd(false); setEditPart(null); }} />
      )}

      {detailPart && (
        <PartDetailModal
          part={detailPart}
          suppliers={partSuppliers(detailPart.id)}
          shops={shops}
          onClose={() => setDetailPart(null)}
          onSaveSuppliers={(sups) => {
            const other = suppliers.filter(s => s.partId !== detailPart.id);
            saveSuppliers([...other, ...sups]);
          }}
        />
      )}
    </div>
  );
}

// ── Part Modal (template-aware) ───────────────────────────────────────────────

function PartModal({ part, onSave, onClose }) {
  const [step, setStep] = useState(part ? "form" : "template");
  const [selectedTemplate, setSelectedTemplate] = useState(
    part?.templateId ? BUILTIN_TEMPLATES.find(t => t.id === part.templateId) || null : null
  );
  const [form, setForm] = useState(part || {
    name: "", mpn: "", manufacturer: "", description: "",
    notes: "", datasheet: "", drawer: "", stock: 0, stockMin: 0,
    templateId: null, partType: "other",
  });
  const [attrs, setAttrs] = useState(part?.attributes || {});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAttr = (k, v) => setAttrs(a => ({ ...a, [k]: v }));

  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    setForm(f => ({ ...f, templateId: tmpl.id, partType: tmpl.group }));
    setStep("form");
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    setForm(f => ({ ...f, templateId: null, partType: "other" }));
    setStep("form");
  };

  const handleSave = () => {
    if (!form.name) return;
    onSave({ ...form, attributes: attrs });
  };

  const groupedTemplates = PART_GROUPS.map(g => ({
    ...g,
    templates: BUILTIN_TEMPLATES.filter(t => t.group === g.id),
  })).filter(g => g.templates.length > 0);

  if (step === "template") return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxHeight: "88vh" }}>
        <div className="modal-title">➕ New Part — Choose Category</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          Select a category for optimal fields, or skip for a blank form.
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", marginBottom: 14 }}>
          {groupedTemplates.map(g => (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{g.icon}</span> {g.label.toUpperCase()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {g.templates.map(t => (
                  <div key={t.id} onClick={() => handleSelectTemplate(t)}
                    style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 5 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = `${t.color}15`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg3)"; }}>
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{t.fields.length} fields</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={handleSkipTemplate} style={{ fontSize: 12, color: "var(--text3)" }}>
            Continue without category →
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );

  const fields = selectedTemplate?.fields || [];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620, maxHeight: "90vh" }}>
        <div className="modal-title" style={{ gap: 10 }}>
          {selectedTemplate && (
            <span style={{ background: `${selectedTemplate.color}20`, border: `1px solid ${selectedTemplate.color}50`, borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>
              {selectedTemplate.icon} {selectedTemplate.name}
            </span>
          )}
          {part ? "Edit Part" : "New Part"}
          {!part && <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", fontSize: 11 }} onClick={() => setStep("template")}>← Change category</button>}
        </div>

        <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 8 }}>GENERAL</div>
          <div className="form-grid">
            <div className="form-row" style={{ gridColumn: "1 / -1" }}>
              <label>Name / Designation *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder={selectedTemplate ? `e.g. ${selectedTemplate.name} XYZ` : "Part name"} autoFocus />
            </div>
            <div className="form-row">
              <label>MPN / Part number</label>
              <input value={form.mpn || ""} onChange={e => set("mpn", e.target.value)} className="mono" placeholder="Order number / Standard" />
            </div>
            <div className="form-row">
              <label>Manufacturer</label>
              <input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} />
            </div>
          </div>

          {fields.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>
                {selectedTemplate.icon} {selectedTemplate.name.toUpperCase()} — TECHNICAL DATA
              </div>
              <div className="form-grid">
                {fields.map(f => (
                  <div className="form-row" key={f.key}>
                    <label>
                      {f.label}
                      {f.unit && <span style={{ color: "var(--text3)", marginLeft: 4 }}>({f.unit})</span>}
                      {f.required && <span style={{ color: "var(--red)", marginLeft: 3 }}>*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)}>
                        <option value="">— select —</option>
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "number" ? (
                      <input type="number" step="any" value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)} placeholder={f.hint || ""} />
                    ) : (
                      <input value={attrs[f.key] || ""} onChange={e => setAttr(f.key, e.target.value)} placeholder={f.hint || ""} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", margin: "16px 0 8px" }}>INVENTORY</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Storage location / Drawer</label>
              <input value={form.drawer || ""} onChange={e => set("drawer", e.target.value)} placeholder="e.g. A3, Drawer 7, Shelf B2" className="mono" />
            </div>
            <div className="form-row">
              <label>Stock quantity</label>
              <input type="number" min="0" value={form.stock || 0} onChange={e => set("stock", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Minimum stock</label>
              <input type="number" min="0" value={form.stockMin || 0} onChange={e => set("stockMin", parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-row">
              <label>Datasheet URL</label>
              <input value={form.datasheet || ""} onChange={e => set("datasheet", e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} style={{ minHeight: 56 }} placeholder="Internal notes, alternatives…" />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.name}>
            {part ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Part Detail Modal ─────────────────────────────────────────────────────────

function PartDetailModal({ part, suppliers, shops, onClose, onSaveSuppliers }) {
  const [sups, setSups] = useState(suppliers.map(s => ({ ...s })));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [addSupForm, setAddSupForm] = useState(null);

  const handleAiSearch = async () => {
    setAiLoading(true); setAiError("");
    try {
      const results = await claudeSearch(part, shops, getApiKey());
      const newSups = results.map(r => ({
        id: Date.now().toString() + Math.random(),
        partId: part.id,
        shopId: r.shopId || "",
        shopName: r.shopName || "",
        sku: r.sku || "",
        searchUrl: r.searchUrl || "",
        price: r.estimatedPrice || null,
        currency: r.currency || "EUR",
        notes: r.notes || "",
        aiGenerated: true,
      }));
      const merged = [...sups.filter(s => !s.aiGenerated), ...newSups];
      setSups(merged);
      onSaveSuppliers(merged);
    } catch (e) { setAiError("AI search failed: " + e.message); }
    setAiLoading(false);
  };

  const deleteSup = (id) => {
    const updated = sups.filter(s => s.id !== id);
    setSups(updated); onSaveSuppliers(updated);
  };

  const saveSup = (sup) => {
    let updated;
    if (sup.id && sups.find(s => s.id === sup.id)) {
      updated = sups.map(s => s.id === sup.id ? sup : s);
    } else {
      updated = [...sups, { ...sup, id: Date.now().toString(), partId: part.id, aiGenerated: false }];
    }
    setSups(updated); onSaveSuppliers(updated); setAddSupForm(null);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 660 }}>
        <div className="modal-title">
          🔍 {part.name}
          {part.mpn && <span className="mono" style={{ color: "var(--text2)", fontSize: 13 }}>({part.mpn})</span>}
        </div>

        <div style={{ background: "var(--bg3)", borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 12, color: "var(--text2)" }}>
          <div className="info-row">
            {part.manufacturer && <span className="info-chip">🏭 {part.manufacturer}</span>}
            {part.category && <span className="info-chip">📦 {part.category}</span>}
            {part.footprint && <span className="info-chip">📐 {part.footprint}</span>}
          </div>
          {part.description && <div style={{ marginTop: 6, fontSize: 12 }}>{part.description}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>🏪 Sources ({sups.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddSupForm({ shopName: "", sku: "", searchUrl: "", price: "", currency: "EUR", notes: "" })}>+ Manual</button>
            <button className="btn btn-ai btn-sm" onClick={handleAiSearch} disabled={aiLoading}>
              {aiLoading ? <><span className="spinner" /> Searching…</> : "🤖 AI Search"}
            </button>
          </div>
        </div>

        {aiError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{aiError}</div>}

        {sups.length === 0 && !addSupForm && (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text3)", fontSize: 13 }}>
            No sources yet. Click <strong>AI Search</strong> to find shops automatically.
          </div>
        )}

        {sups.map(s => (
          <div key={s.id} className="supplier-card">
            <div className="supplier-logo">{(s.shopName || "?").slice(0, 3).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.shopName}</span>
                {s.aiGenerated && <span style={{ fontSize: 10, background: "rgba(88,166,255,0.15)", color: "var(--blue)", padding: "1px 6px", borderRadius: 4 }}>AI</span>}
                {s.sku && <span className="mono" style={{ color: "var(--text2)", fontSize: 11 }}>#{s.sku}</span>}
                {s.price && <span className="price-tag">{s.price.toFixed(2)} {s.currency}</span>}
              </div>
              {s.notes && <div style={{ fontSize: 11, color: "var(--text2)" }}>{s.notes}</div>}
              {s.searchUrl && (
                <a href={s.searchUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                  🔗 {s.searchUrl.slice(0, 55)}{s.searchUrl.length > 55 ? "…" : ""}
                </a>
              )}
            </div>
            <button className="btn btn-danger" onClick={() => deleteSup(s.id)}>✕</button>
          </div>
        ))}

        {addSupForm && (
          <AddSupplierForm form={addSupForm} shops={shops} onChange={setAddSupForm} onSave={saveSup} onCancel={() => setAddSupForm(null)} />
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Supplier Form ─────────────────────────────────────────────────────────

function AddSupplierForm({ form, shops, onChange, onSave, onCancel }) {
  const set = (k, v) => onChange(f => ({ ...f, [k]: v }));
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>+ Add source</div>
      <div className="form-grid">
        <div className="form-row">
          <label>Shop</label>
          <select value={form.shopId || ""} onChange={e => {
            const sh = shops.find(s => s.id === e.target.value);
            onChange(f => ({ ...f, shopId: e.target.value, shopName: sh?.name || f.shopName }));
          }}>
            <option value="">Custom shop</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Shop name</label>
          <input value={form.shopName} onChange={e => set("shopName", e.target.value)} placeholder="e.g. Reichelt" />
        </div>
        <div className="form-row">
          <label>Order no. / SKU</label>
          <input value={form.sku} onChange={e => set("sku", e.target.value)} className="mono" placeholder="e.g. ATM328P-PU" />
        </div>
        <div className="form-row">
          <label>Price (€)</label>
          <input type="number" step="0.01" value={form.price} onChange={e => set("price", parseFloat(e.target.value) || "")} placeholder="2.50" />
        </div>
      </div>
      <div className="form-row">
        <label>Link to page</label>
        <input value={form.searchUrl} onChange={e => set("searchUrl", e.target.value)} placeholder="https://…" />
      </div>
      <div className="form-row">
        <label>Notes</label>
        <input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Availability, lead time, …" />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  );
}

// ── Supplier Dropdown ─────────────────────────────────────────────────────────

export function SupplierDropdown({ item, part, suppliers, shops, onSelectShop }) {
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");

  if (!part) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;

  const shopId = item.preferredShopId || null;
  const isAli = shopId === "aliexpress";
  const isCustom = shopId?.startsWith("custom:");
  const customLabel = isCustom ? shopId.replace(/^custom:/, "") : "";
  const hasSelection = !!shopId;

  const matchedSupplier = (() => {
    const list = suppliers.filter(s => s.partId === part.id);
    if (!list.length) return null;
    if (isAli) {
      const primary = list.find(s => s.shopId === "aliexpress");
      if (primary) return primary;
      return list.find(s => s.shopName?.toLowerCase().includes("aliexpress") && s.shopId !== "aliexpress-bulk") || null;
    }
    if (isCustom) return list.find(s => s.shopName?.toLowerCase() === customLabel.toLowerCase()) || null;
    const shop = shops.find(sh => sh.id === shopId);
    return list.find(s => s.shopId === shopId || s.shopName?.toLowerCase() === shop?.name?.toLowerCase()) || null;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {!customMode ? (
        <select
          value={shopId || ""}
          onChange={e => {
            const val = e.target.value;
            if (val === "_custom_") { setCustomMode(true); setCustomName(""); }
            else onSelectShop(val || null);
          }}
          style={{
            width: "100%",
            background: hasSelection ? "rgba(57,211,83,0.08)" : "var(--bg3)",
            border: `1px solid ${hasSelection ? "rgba(57,211,83,0.35)" : "var(--border)"}`,
            color: hasSelection ? "var(--text)" : "var(--text3)",
            padding: "4px 7px", borderRadius: 5, fontSize: 12, fontFamily: "IBM Plex Sans", cursor: "pointer",
          }}
        >
          <option value="">— No preference —</option>
          {shops.length > 0 && (
            <optgroup label="My shops">
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Other">
            <option value="aliexpress">AliExpress</option>
            <option value="_custom_">Custom shop…</option>
          </optgroup>
          {isCustom && <option value={shopId}>{customLabel}</option>}
        </select>
      ) : (
        <input
          autoFocus
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          placeholder="Shop name or URL…"
          onKeyDown={e => {
            if (e.key === "Enter" && customName.trim()) { onSelectShop(`custom:${customName.trim()}`); setCustomMode(false); }
            if (e.key === "Escape") { setCustomMode(false); }
          }}
          onBlur={() => { if (customName.trim()) onSelectShop(`custom:${customName.trim()}`); setCustomMode(false); }}
          style={{ width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "4px 7px", borderRadius: 5, fontSize: 12, fontFamily: "IBM Plex Sans" }}
        />
      )}
      {hasSelection && matchedSupplier?.price && (
        <div style={{ fontSize: 10, color: "var(--green)" }}>✓ {matchedSupplier.price.toFixed(2)} €{matchedSupplier.sku ? ` · ${matchedSupplier.sku}` : ""}</div>
      )}
      {hasSelection && !matchedSupplier && (
        <div style={{ fontSize: 10, color: "var(--text3)" }}>No price yet — use 🔍 Search</div>
      )}
    </div>
  );
}
