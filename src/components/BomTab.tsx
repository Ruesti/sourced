// @ts-nocheck
import { useState, useEffect } from "react";
import {
  callAI,
  getApiKey, getTavilyKey,
  getNexarId, getNexarSecret,
  nexarBatchSearch,
  computeNexarConsolidationDistributor, selectNexarOffer,
  partIsAliExpressBulkCandidate, buildAliExpressSearchQuery,
  tavilySearchAliExpress, sortAliExpressWebResults, dedupeWebSearchResults,
  parseAliExpressResults, tavilyFindDirectAliExpressItem, scoreAliExpressProductUrl,
} from "../lib/ai-api";
import type { AliParsedOffer } from "../lib/ai-api";
import { SHOP_CART_CONFIGS, downloadText } from "../lib/shop-data";
import { computeGapAnalysis, GAP_STATUS_COLOR, GAP_STATUS_LABEL } from "../lib/gap-analysis";
import { SupplierDropdown } from "./PartsTab";

// ── CartModal ──────────────────────────────────────────────────────────────────

function CartModal({ project, bomItems, parts, suppliers, onClose }) {
  const [activeShop, setActiveShop] = useState(null);
  const [popupWarning, setPopupWarning] = useState(false);

  const shopGroups = {};
  bomItems.forEach(item => {
    const part = parts.find(p => p.id === item.partId);
    if (!part) return;
    const sups = suppliers.filter(s => s.partId === item.partId);
    const preferred = sups.find(s => s.id === item.preferredSupplierId);
    const toAdd = preferred ? [preferred] : sups;
    toAdd.forEach(sup => {
      const shopId = sup.shopId || sup.shopName?.toLowerCase().replace(/\s+/g, "");
      if (!shopId) return;
      if (!shopGroups[shopId]) shopGroups[shopId] = { shopId, shopName: sup.shopName, items: [] };
      shopGroups[shopId].items.push({
        partId: item.partId,
        name: part.name,
        mpn: part.mpn,
        footprint: part.footprint,
        reference: item.reference,
        qty: item.quantity,
        sku: sup.sku && sup.sku !== "suchen" ? sup.sku : "",
        price: sup.price,
        productUrl: sup.searchUrl,
        isPreferred: !!preferred,
      });
    });
  });

  const assignedPartIds = new Set(Object.values(shopGroups).flatMap(g => g.items.map(i => i.partId)));
  const unassigned = bomItems.filter(b => !assignedPartIds.has(b.partId)).map(b => {
    const part = parts.find(p => p.id === b.partId);
    return part ? { name: part.name, mpn: part.mpn, qty: b.quantity } : null;
  }).filter(Boolean);

  const shops = Object.values(shopGroups);
  const config = activeShop ? (SHOP_CART_CONFIGS[activeShop.shopId] || SHOP_CART_CONFIGS[activeShop.shopName?.toLowerCase()]) : null;

  const handleCartAction = (shop) => {
    const cfg = SHOP_CART_CONFIGS[shop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === shop.shopName?.toLowerCase());
    if (!cfg) {
      shop.items.forEach((it, i) => {
        setTimeout(() => window.open(`https://www.google.com/search?q=${encodeURIComponent(it.name + " " + (it.mpn || "") + " " + shop.shopName)}`, "_blank"), i * 300);
      });
      return;
    }
    if (cfg.cartType === "url_multi") {
      const items = shop.items.filter(it => it.sku);
      const noSku = shop.items.filter(it => !it.sku);
      if (items.length > 0) window.open(cfg.buildUrl(items), "_blank");
      if (noSku.length > 0) setPopupWarning(`${noSku.length} items without SKU skipped: ${noSku.map(i => i.name).join(", ")}`);
    } else if (cfg.cartType === "url_single") {
      const urls = cfg.buildUrl(shop.items);
      setPopupWarning(`${urls.length} tabs will be opened — disable popup blocker if needed.`);
      urls.forEach((url, i) => setTimeout(() => window.open(url, "_blank"), i * 400));
    } else if (cfg.cartType === "bom_csv") {
      const csv = cfg.exportCsv(shop.items);
      downloadText(csv, cfg.exportFileName || `${shop.shopName}_bom.csv`);
    }
  };

  const totalItems = bomItems.length;
  const coveredItems = new Set(Object.values(shopGroups).flatMap(g => g.items.map(i => i.partId))).size;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 700, maxHeight: "88vh" }}>
        <div className="modal-title">🛒 Build cart — {project.name}</div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--green)" }}>{coveredItems}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>of {totalItems} with supplier</div>
          </div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--blue)" }}>{shops.length}</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>shops with items</div>
          </div>
          {unassigned.length > 0 && (
            <div style={{ background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.2)", borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--red)" }}>{unassigned.length}</div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>without supplier</div>
            </div>
          )}
        </div>

        {popupWarning && (
          <div style={{ background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--orange)", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠️ {popupWarning}</span>
            <button style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14 }} onClick={() => setPopupWarning(null)}>×</button>
          </div>
        )}

        {shops.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏪</div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 6 }}>No suppliers added yet</div>
            <div style={{ fontSize: 12 }}>Go to "Parts" → Detail → AI Search or add shops manually.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 300 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.06em", marginBottom: 8 }}>STORES</div>
              {shops.map(shop => {
                const cfg = SHOP_CART_CONFIGS[shop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === shop.shopName?.toLowerCase());
                const withSku = shop.items.filter(i => i.sku).length;
                const isActive = activeShop?.shopId === shop.shopId;
                return (
                  <div key={shop.shopId}
                    onClick={() => setActiveShop(shop)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${isActive ? "var(--green)" : "var(--border)"}`, background: isActive ? "rgba(57,211,83,0.06)" : "var(--bg2)", cursor: "pointer", marginBottom: 6, transition: "all 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: cfg?.color || "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                        {cfg?.logo || shop.shopName?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{shop.shopName}</div>
                        <div style={{ fontSize: 11, color: "var(--text2)" }}>{shop.items.length} items</div>
                      </div>
                    </div>
                    {cfg && (
                      <div style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, display: "inline-block", background: cfg.cartType === "url_multi" ? "rgba(57,211,83,0.15)" : cfg.cartType === "bom_csv" ? "rgba(88,166,255,0.15)" : "rgba(210,153,34,0.15)", color: cfg.cartType === "url_multi" ? "var(--green)" : cfg.cartType === "bom_csv" ? "var(--blue)" : "var(--orange)" }}>
                        {cfg.cartType === "url_multi" ? "🛒 Direct" : cfg.cartType === "bom_csv" ? "📄 CSV Upload" : "🔗 Individual links"}
                      </div>
                    )}
                    {withSku > 0 && withSku < shop.items.length && (
                      <div style={{ fontSize: 10, color: "var(--orange)", marginTop: 2 }}>{shop.items.length - withSku} without SKU</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              {!activeShop ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: 13, flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 24 }}>←</span>Select a shop
                </div>
              ) : (() => {
                const cfg = SHOP_CART_CONFIGS[activeShop.shopId] || Object.values(SHOP_CART_CONFIGS).find(c => c.name?.toLowerCase() === activeShop.shopName?.toLowerCase());
                const totalPrice = activeShop.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{activeShop.shopName}</div>
                        {cfg?.notes && <div style={{ fontSize: 12, color: "var(--text2)" }}>{cfg.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {totalPrice > 0 && <div className="price-tag" style={{ fontSize: 13 }}>~{totalPrice.toFixed(2)} €</div>}
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 6 }}
                          onClick={() => handleCartAction(activeShop)}
                        >
                          {cfg?.cartType === "bom_csv" ? "📄 Export CSV" :
                           cfg?.cartType === "url_multi" ? "🛒 Open cart" :
                           "🔗 Open items"}
                        </button>
                        {cfg?.cartType === "bom_csv" && cfg?.uploadUrl && (
                          <div style={{ marginTop: 6 }}>
                            <a href={cfg.uploadUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--blue)", textDecoration: "none" }}>
                              → Open {cfg.name} BOM tool ↗
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "6px 10px", background: "var(--bg3)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.04em" }}>
                        <div>Qty</div><div>Part</div><div>SKU</div><div>Price</div>
                      </div>
                      {activeShop.items.map((it, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 80px", padding: "7px 10px", borderTop: "1px solid var(--border)", fontSize: 12, alignItems: "center" }}>
                          <div style={{ fontFamily: "IBM Plex Mono", color: "var(--text2)" }}>{it.qty}×</div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{it.name}</div>
                            {it.mpn && <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "IBM Plex Mono" }}>{it.mpn}</div>}
                          </div>
                          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: it.sku ? "var(--text)" : "var(--red)" }}>
                            {it.sku || "missing"}
                          </div>
                          <div className="price-tag" style={{ fontSize: 11 }}>
                            {it.price ? `${(it.price * it.qty).toFixed(2)} €` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {unassigned.length > 0 && (
          <div style={{ marginTop: 16, background: "rgba(248,81,73,0.06)", border: "1px solid rgba(248,81,73,0.15)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>Without supplier — not yet orderable:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unassigned.map((u, i) => (
                <span key={i} style={{ fontSize: 12, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", color: "var(--text2)" }}>
                  {u.qty}× {u.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── AddBomItemModal ────────────────────────────────────────────────────────────

function AddBomItemModal({ parts, onAdd, onClose, existingIds }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = parts.filter(p => {
    const q = query.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.mpn?.toLowerCase().includes(q);
  }).sort((a, b) => (b.stock || 0) - (a.stock || 0));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">➕ Add Part to BOM</div>
        <div className="form-row">
          <label>Search part</label>
          <input value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} placeholder="Name or MPN…" autoFocus />
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 14, border: "1px solid var(--border)", borderRadius: 6 }}>
          {filtered.length === 0 && <div style={{ padding: "12px 14px", color: "var(--text3)", fontSize: 13 }}>No results</div>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              style={{
                padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                background: selected?.id === p.id ? "rgba(57,211,83,0.08)" : "transparent",
                borderLeft: selected?.id === p.id ? "2px solid var(--green)" : "2px solid transparent"
              }}>
              <div style={{ fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {p.name}
                {existingIds.includes(p.id) && <span style={{ fontSize: 10, color: "var(--orange)" }}>(in BOM)</span>}
                {(p.stock || 0) > 0 && <span style={{ fontSize: 10, color: "var(--green)", background: "rgba(57,211,83,0.12)", padding: "1px 5px", borderRadius: 3 }}>{p.stock} in stock</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>{p.mpn} · {p.category} · {p.footprint}</div>
            </div>
          ))}
        </div>
        {selected && (
          <div className="form-grid">
            <div className="form-row">
              <label>Quantity *</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="form-row">
              <label>Reference (e.g. R1, C3)</label>
              <input value={ref} onChange={e => setRef(e.target.value)} className="mono" placeholder="e.g. U1, C12" />
            </div>
          </div>
        )}
        {selected && (selected.stock || 0) > 0 && (
          <div style={{ fontSize: 12, color: "var(--green)", padding: "4px 0" }}>
            ✓ {selected.stock} in stock — you need {qty}
            {(selected.stock || 0) >= qty
              ? <span style={{ color: "var(--green)" }}> (covered)</span>
              : <span style={{ color: "var(--orange)" }}> (need {qty - (selected.stock || 0)} more)</span>}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!selected} onClick={() => onAdd({ partId: selected.id, quantity: qty, reference: ref, notes })}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditBomItemModal ───────────────────────────────────────────────────────────

function EditBomItemModal({ item, part, onSave, onClose }) {
  const [qty, setQty] = useState(item.quantity);
  const [ref, setRef] = useState(item.reference || "");
  const [notes, setNotes] = useState(item.notes || "");
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">✏️ Edit {part?.name || "part"}</div>
        <div className="form-grid">
          <div className="form-row">
            <label>Quantity</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
          </div>
          <div className="form-row">
            <label>Reference</label>
            <input value={ref} onChange={e => setRef(e.target.value)} className="mono" />
          </div>
        </div>
        <div className="form-row">
          <label>Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...item, quantity: qty, reference: ref, notes })}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── BomTab ─────────────────────────────────────────────────────────────────────

export default function BomTab({ projects, saveProjects, bomItems, saveBom, parts, saveParts, suppliers, saveSuppliers, shops, initialProjectId = null }) {
  const [activeProject, setActiveProject] = useState(null);
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [showAddPart, setShowAddPart] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{done:number,total:number,current:string}|null>(null);
  const [sourcingSummary, setSourcingSummary] = useState<string | null>(null);

  useEffect(() => {
    if (initialProjectId) {
      const p = projects.find(p => p.id === initialProjectId);
      if (p) setActiveProject(p);
    }
  }, [initialProjectId]);

  useEffect(() => {
    setSourcingSummary(null);
  }, [activeProject?.id]);

  const projectBom = bomItems.filter(b => b.projectId === activeProject?.id);

  const createProject = () => {
    if (!newProjName.trim()) return;
    const p = { id: Date.now().toString(), name: newProjName.trim(), created: new Date().toISOString() };
    saveProjects([...projects, p]);
    setActiveProject(p); setNewProjName(""); setShowNewProj(false);
  };

  const deleteProject = (id) => {
    if (!confirm("Delete project and all BOM entries?")) return;
    saveProjects(projects.filter(p => p.id !== id));
    saveBom(bomItems.filter(b => b.projectId !== id));
    if (activeProject?.id === id) setActiveProject(null);
  };

  const addBomItem = (item) => {
    const exists = projectBom.find(b => b.partId === item.partId);
    if (exists) {
      saveBom(bomItems.map(b => b.id === exists.id ? { ...b, quantity: b.quantity + item.quantity } : b));
    } else {
      saveBom([...bomItems, { ...item, id: Date.now().toString(), projectId: activeProject.id }]);
    }
    setShowAddPart(false);
  };

  const updateItem = (item) => {
    saveBom(bomItems.map(b => b.id === item.id ? item : b));
    setEditItem(null);
  };

  const deleteItem = (id) => {
    saveBom(bomItems.filter(b => b.id !== id));
  };

  const exportCSV = () => {
    if (!activeProject) return;
    const rows = [["Qty", "Reference", "Name", "MPN", "Manufacturer", "Package", "Notes", "Supplier 1", "SKU 1", "Price 1"]];
    projectBom.forEach(item => {
      const part = parts.find(p => p.id === item.partId) || {};
      const sups = suppliers.filter(s => s.partId === item.partId);
      const s1 = sups[0] || {};
      rows.push([item.quantity, item.reference || "", part.name || "", part.mpn || "", part.manufacturer || "", part.footprint || "", item.notes || "", s1.shopName || "", s1.sku || "", s1.price || ""]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOM_${activeProject.name.replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  const getPreferredSupplier = (item, sups) => {
    if (item.preferredShopId) {
      const shopId = item.preferredShopId;
      const isAli = shopId === "aliexpress";
      const isCustom = shopId?.startsWith("custom:");
      const customLabel = isCustom ? shopId.replace(/^custom:/, "") : "";
      const shop = shops.find(s => s.id === shopId);
      return sups.find(s => {
        if (isAli) {
          if (s.shopId === "aliexpress") return true;
          return !!(s.shopName?.toLowerCase().includes("aliexpress") && s.shopId !== "aliexpress-bulk");
        }
        if (isCustom) return s.shopName?.toLowerCase() === customLabel.toLowerCase();
        return s.shopId === shopId || s.shopName?.toLowerCase() === shop?.name?.toLowerCase();
      }) || null;
    }
    return sups.find(s => s.id === item.preferredSupplierId) || null;
  };

  const totalCost = projectBom.reduce((sum, item) => {
    const sups = suppliers.filter(s => s.partId === item.partId);
    const preferred = getPreferredSupplier(item, sups);
    const sup = preferred || sups.find(s => s.price);
    if (!sup?.price) return sum;
    const packQty = sup.packQty || 1;
    const packsNeeded = Math.ceil(item.quantity / packQty);
    return sum + packsNeeded * sup.price;
  }, 0);

  const searchPrices = async () => {
    const allItems = projectBom.filter(b => b.partId);
    if (!allItems.length) return;

    const cfg = await fetch("/api/config").then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const hasNexar = !!(getNexarId() && getNexarSecret()) || !!cfg.hasServerNexar;
    const hasAI = !!getApiKey() || !!cfg.hasServerAI;
    const hasTavily = !!(cfg.hasServerTavily || getTavilyKey().trim());
    const wantsAliLive = allItems.some(b => b.preferredShopId === "aliexpress");
    if (!hasNexar && !hasAI) { alert("Add Nexar API keys or an AI API key under 🔑 API Keys."); return; }
    if (wantsAliLive && !hasTavily) {
      alert("Preferred shop AliExpress: for live results add a Tavily key under 🔑 API Keys. Without Tavily only Nexar/AI suppliers are filled — AliExpress is usually missing there.");
    }

    setSearching(true);
    setSourcingSummary(null);
    setSearchProgress({ done: 0, total: allItems.length, current: "Starting search…" });

    const updatedSuppliers = [...suppliers];
    const bomShopUpdates: Record<string, string> = {};

    const resolveShopId = (distributorName: string, prefShopId: string | null) => {
      if (prefShopId) return prefShopId;
      const m = shops.find(s => distributorName.toLowerCase().includes(s.name?.toLowerCase()) || s.name?.toLowerCase().includes(distributorName.toLowerCase()));
      return m?.id || `custom:${distributorName}`;
    };

    const upsertSupplier = (partId: string, shopId: string, entry: object) => {
      const idx = updatedSuppliers.findIndex(s => s.partId === partId && s.shopId === shopId);
      if (idx >= 0) updatedSuppliers[idx] = { ...updatedSuppliers[idx], ...entry };
      else updatedSuppliers.push({ id: Date.now().toString() + Math.random(), partId, shopId, ...entry } as any);
    };

    try {
      // Nexar batch (parts with MPN)
      const nexarItems = allItems.map((item, i) => ({ item, part: parts.find(p => p.id === item.partId), index: i })).filter(x => x.part?.mpn);
      if (hasNexar && nexarItems.length) {
        setSearchProgress({ done: 0, total: allItems.length, current: `Nexar: ${nexarItems.length} parts…` });
        const batchInput = nexarItems.map(x => ({ index: x.index, mpn: x.part!.mpn!, name: x.part!.name }));
        const nexarResults = await nexarBatchSearch(batchInput);
        const consolidatable = nexarItems.filter(x => !x.item.preferredShopId);
        const chosenDistributorNorm = computeNexarConsolidationDistributor(consolidatable, nexarResults);
        for (const { item, part, index } of nexarItems) {
          if (!part) continue;
          const offers = nexarResults.get(index) || [];
          if (!offers.length) continue;
          const { match, notes } = selectNexarOffer(offers, item, shops, chosenDistributorNorm);
          if (!match) continue;
          const prefForResolve = item.preferredShopId === "aliexpress" ? null : (item.preferredShopId || null);
          const shopId = resolveShopId(match.distributor, prefForResolve);
          upsertSupplier(part.id, shopId, {
            shopName: shops.find(s => s.id === shopId)?.name || match.distributor,
            sku: match.sku,
            price: match.price,
            currency: match.currency,
            ai_generated: false,
            searchUrl: match.url,
            packQty: 1,
            stock: match.stock,
            notes: notes || "",
          });
          if (!item.preferredShopId) bomShopUpdates[item.id] = shopId;
          setSearchProgress({ done: index + 1, total: allItems.length, current: part.name });
        }
      }

      // AI batch (parts without MPN, or all when no Nexar)
      const aiItems = allItems.map((item, i) => ({ item, part: parts.find(p => p.id === item.partId), index: i }))
        .filter(x => x.part && (!hasNexar || !x.part.mpn));
      if (hasAI && aiItems.length) {
        setSearchProgress({ done: nexarItems.length, total: allItems.length, current: `AI: ${aiItems.length} parts…` });
        const shopList = shops.length > 0
          ? shops.map(s => `${s.name}${s.region ? ` (${s.region})` : ""}${s.url ? ` – ${s.url}` : ""}`).join("\n")
          : "Reichelt (DE)\nMouser (DE)\nLCSC (global)\nAliExpress (global)";
        const partsText = aiItems.map(({ item, part, index }) => {
          const f = [part!.name, part!.mpn ? `MPN: ${part!.mpn}` : null, part!.manufacturer ? `Manufacturer: ${part!.manufacturer}` : null, part!.value ? `Value: ${part!.value}` : null, part!.footprint ? `Footprint: ${part!.footprint}` : null, part!.category ? `Category: ${part!.category}` : null, `Qty: ${item.quantity}`, item.preferredShopId ? `Preferred shop ID: ${item.preferredShopId}` : `Preferred shop: (none)`].filter(Boolean).join(" | ");
          return `${index + 1}. ${f}`;
        }).join("\n");
        const anyPref = aiItems.some(x => x.item.preferredShopId);
        const noPrefCount = aiItems.filter(x => !x.item.preferredShopId).length;
        const consolidateHint =
          noPrefCount >= 2 && !anyPref
            ? `\n\nIMPORTANT — save on shipping: **All** rows have no preferred shop. Use the **same** shopName for **as many rows as possible** if that shop realistically stocks them. Only use a different shop for rows where the item is not available there. Goal: **few distinct shops**.`
            : noPrefCount >= 2 && anyPref
              ? `\n\nFor rows **without** a preferred shop: use one **common** shopName where possible (fewer shipments). Rows **with** a preferred shop: use that shop; if no match, use an alternative shop and prefix sku with \"ALT:\".`
              : anyPref
                ? `\n\nRows with preferred shop: use that shop where possible. If no realistic match: use an **alternative shop** with a good product URL, prefix sku with \"ALT:\".`
                : "";
        const prompt = `You are an electronics procurement expert. Find the best supplier for each part and estimate the unit price (small batch 1–10 pcs).

Shops (prefer these):
${shopList}

Shop selection by part type:
- Resistor, capacitor, inductor, diode (standard) → LCSC or AliExpress (cheap, acceptable risk)
- IC, MCU, MOSFET, transistor, sensor, module → reliable distributor (Mouser, DigiKey, Reichelt, Farnell, LCSC) — NO AliExpress due to counterfeit risk
- Connector, switch, mechanical → Conrad, Reichelt, AliExpress ok
- If MPN known: use it for SKU and a **direct product URL** (no shop search pages if you know a product page)
- Unknown part: shopName null
${consolidateHint}

BOM:
${partsText}

Reply ONLY with a JSON array (same order):
[{"i":1,"shopName":"Reichelt","sku":"ATM328P-PU","url":"https://...","price":2.50,"currency":"EUR"},{"i":2,"shopName":null,"sku":null,"url":null,"price":null,"currency":"EUR"}]`;
        const text = await callAI([{ role: "user", content: prompt }], 4000);
        const m = text.replace(/```json|```/g, "").match(/\[[\s\S]*\]/);
        const aiResults: {i:number,shopName:string|null,sku:string|null,url:string|null,price:number|null,currency:string}[] = m ? JSON.parse(m[0]) : [];
        for (const res of aiResults) {
          const listIdx = aiItems.findIndex(x => x.index === (res.i - 1));
          if (listIdx < 0 || !res.shopName || !res.price) continue;
          const { item, part } = aiItems[listIdx];
          if (!part) continue;
          const matchedShop = shops.find(s => s.name?.toLowerCase() === res.shopName!.toLowerCase() || s.name?.toLowerCase().includes(res.shopName!.toLowerCase()) || res.shopName!.toLowerCase().includes(s.name?.toLowerCase()));
          const shopId = matchedShop?.id || (res.shopName.toLowerCase().includes("aliexpress") ? "aliexpress" : `custom:${res.shopName}`);
          upsertSupplier(part.id, shopId, {
            shopName: matchedShop?.name || res.shopName,
            sku: res.sku || "",
            price: res.price,
            currency: res.currency || "EUR",
            ai_generated: true,
            searchUrl: res.url || "",
            packQty: 1,
            stock: null,
            notes: res.sku?.startsWith("ALT:") ? "Alternative supplier (preferred shop not available)" : "",
          });
          if (!item.preferredShopId) bomShopUpdates[item.id] = shopId;
        }
      }

      // AliExpress live (Tavily + AI) when AliExpress is preferred — Nexar doesn't list AE
      const aliLiveItems = allItems
        .map((item, i) => ({ item, part: parts.find(p => p.id === item.partId), index: i }))
        .filter(x => x.item.preferredShopId === "aliexpress" && x.part);
      if (hasTavily && hasAI && aliLiveItems.length) {
        setSearchProgress({ done: 0, total: allItems.length, current: `AliExpress (live): ${aliLiveItems.length}…` });
        let aliDone = 0;
        for (const { item, part } of aliLiveItems) {
          aliDone++;
          if (!part) continue;
          setSearchProgress({ done: aliDone, total: allItems.length, current: `AliExpress: ${part.name}` });
          try {
            const passive = partIsAliExpressBulkCandidate(part);
            const q1 = buildAliExpressSearchQuery(part, false);
            let web = await tavilySearchAliExpress(q1);
            if (passive) {
              const q2 = buildAliExpressSearchQuery(part, true);
              const w2 = await tavilySearchAliExpress(q2);
              web = sortAliExpressWebResults(dedupeWebSearchResults([...web, ...w2]));
            } else {
              web = sortAliExpressWebResults(dedupeWebSearchResults(web));
            }
            const parsed = await parseAliExpressResults(part, web, item.quantity || 1, passive);
            const retailCandidates = parsed.filter(o => (o.kind || "retail") !== "bulk" && o.productUrl);
            const bulkCandidates = parsed.filter(o => o.kind === "bulk" && (o.packQty || 0) >= 50 && o.productUrl);
            const pickRetail = retailCandidates.sort((a, b) => (a.packQty || 1) - (b.packQty || 1))[0] || parsed.find(o => o.productUrl);
            const pickBulk = bulkCandidates.sort((a, b) => (b.packQty || 0) - (a.packQty || 0))[0];
            let retailUrl = pickRetail?.productUrl || "";
            if (retailUrl && scoreAliExpressProductUrl(retailUrl) < 80 && hasTavily) {
              const better = await tavilyFindDirectAliExpressItem(part);
              if (better) retailUrl = better;
            }
            let bulkUrl = pickBulk?.productUrl || "";
            if (bulkUrl && scoreAliExpressProductUrl(bulkUrl) < 80 && hasTavily) {
              const betterB = await tavilyFindDirectAliExpressItem(part);
              if (betterB && scoreAliExpressProductUrl(betterB) >= scoreAliExpressProductUrl(bulkUrl)) bulkUrl = betterB;
            }
            const fmtNotes = (o: AliParsedOffer) => {
              const bits = [];
              if (o.shippingEur != null && o.shippingEur > 0) bits.push(`Shipping ~${o.shippingEur.toFixed(2)} €`);
              else if (o.shippingEur === 0) bits.push("Free shipping (per snippet)");
              if (o.note) bits.push(o.note);
              return bits.join(" · ") || "AliExpress (live)";
            };
            if (pickRetail?.productUrl) {
              const pq = Math.max(1, pickRetail.packQty || 1);
              const ship = pickRetail.shippingEur != null && pickRetail.shippingEur > 0 ? pickRetail.shippingEur : 0;
              const total = (pickRetail.priceEur != null ? pickRetail.priceEur : 0) + ship;
              const linkScore = scoreAliExpressProductUrl(retailUrl);
              upsertSupplier(part.id, "aliexpress", {
                shopName: "AliExpress",
                sku: (pickRetail.note || "live").slice(0, 120),
                price: pickRetail.priceEur != null ? total : null,
                currency: "EUR",
                ai_generated: false,
                searchUrl: retailUrl || pickRetail.productUrl,
                packQty: pq,
                stock: null,
                notes: [fmtNotes(pickRetail), linkScore >= 80 ? "" : "Note: link may be a search page — verify in shop."].filter(Boolean).join(" · "),
              });
            }
            const ru = retailUrl || pickRetail?.productUrl || "";
            const bu = bulkUrl || pickBulk?.productUrl || "";
            if (pickBulk && pickBulk.productUrl && (pickBulk.packQty || 0) >= 50 && bu !== ru) {
              const pqB = Math.max(50, pickBulk.packQty || 50);
              const shipB = pickBulk.shippingEur != null && pickBulk.shippingEur > 0 ? pickBulk.shippingEur : 0;
              const totalB = (pickBulk.priceEur != null ? pickBulk.priceEur : 0) + shipB;
              const bScore = scoreAliExpressProductUrl(bulkUrl);
              upsertSupplier(part.id, "aliexpress-bulk", {
                shopName: "AliExpress (bulk reel)",
                sku: `≥${pqB} pcs`,
                price: pickBulk.priceEur != null ? totalB : null,
                currency: "EUR",
                ai_generated: false,
                searchUrl: bulkUrl || pickBulk.productUrl,
                packQty: pqB,
                stock: null,
                notes: [fmtNotes(pickBulk), bScore >= 80 ? "" : "Note: verify link (bulk reel)."].filter(Boolean).join(" · "),
              });
            }
          } catch (e: any) {
            console.warn("AliExpress live search:", part.name, e.message || e);
          }
        }
      }

      const tally: Record<string, number> = {};
      let pricedLines = 0;
      for (const it of allItems) {
        const part = parts.find(p => p.id === it.partId);
        if (!part) continue;
        const sups = updatedSuppliers.filter(s => s.partId === part.id);
        const pref = getPreferredSupplier(it, sups);
        const s = pref || sups.find(x => x.price != null);
        if (!s || s.price == null) continue;
        pricedLines++;
        const label = shops.find(sh => sh.id === s.shopId)?.name || s.shopName || String(s.shopId);
        tally[label] = (tally[label] || 0) + 1;
      }
      const sortedShops = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      if (sortedShops.length && pricedLines > 0) {
        const [topShop, n] = sortedShops[0];
        const extra = sortedShops.slice(1).map(([k, v]) => `${k} (${v})`).join(", ");
        setSourcingSummary(
          `${pricedLines}/${allItems.length} lines with price — most common shop: "${topShop}" (${n})` +
            (extra ? `. Also: ${extra}` : "") +
            ". Tip: 🛒 Cart — bundle items at one distributor to save on shipping."
        );
      } else if (allItems.length) {
        setSourcingSummary("Few or no prices found — check Nexar/AI/Tavily keys, add MPNs, or adjust preferred shop.");
      }
    } catch (e: any) {
      setSourcingSummary(null);
      alert("Search failed: " + e.message);
    }

    saveSuppliers(updatedSuppliers);
    if (Object.keys(bomShopUpdates).length) saveBom(bomItems.map(b => bomShopUpdates[b.id] ? { ...b, preferredShopId: bomShopUpdates[b.id] } : b));
    setSearching(false);
    setSearchProgress(null);
  };

  // Phase 1: gap analysis for active project
  const gapResult = activeProject
    ? computeGapAnalysis(projectBom.map(b => ({ partId: b.partId, quantity: b.quantity })), parts)
    : null;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 BOM Manager</div>
      </div>

      <div className="two-col">
        {/* Project list */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text2)" }}>PROJECTS</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewProj(true)}>+ New</button>
          </div>

          {showNewProj && (
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <input className="search-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Project name…" value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} autoFocus />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewProj(false)}>✕</button>
                <button className="btn btn-primary btn-sm" onClick={createProject}>Create</button>
              </div>
            </div>
          )}

          {projects.length === 0 && !showNewProj && (
            <div className="empty-state" style={{ padding: 24 }}>
              <h3>No project</h3>
              <p>Create your first project.</p>
            </div>
          )}

          {projects.map(p => {
            const pBom = bomItems.filter(b => b.projectId === p.id);
            const gap = pBom.length > 0
              ? computeGapAnalysis(pBom.map(b => ({ partId: b.partId, quantity: b.quantity })), parts)
              : null;
            const count = pBom.length;
            return (
              <div key={p.id} className={`project-card ${activeProject?.id === p.id ? "active" : ""}`} onClick={() => setActiveProject(p)}>
                <div className="pc-icon">⚙️</div>
                <div className="pc-info">
                  <div className="pc-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {p.name}
                    {gap && (
                      <span
                        style={{ width: 8, height: 8, borderRadius: "50%", background: GAP_STATUS_COLOR[gap.status], flexShrink: 0, display: "inline-block" }}
                        title={GAP_STATUS_LABEL[gap.status]}
                      />
                    )}
                  </div>
                  <div className="pc-meta">{count} item{count !== 1 ? "s" : ""} · {new Date(p.created).toLocaleDateString()}</div>
                </div>
                <button className="btn btn-danger" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}>🗑</button>
              </div>
            );
          })}
        </div>

        {/* BOM panel */}
        <div>
          {!activeProject ? (
            <div className="select-proj-hint">
              <span style={{ fontSize: 32 }}>📋</span>
              <h3>Select project</h3>
              <p>Select a project on the left or create a new one.</p>
            </div>
          ) : (
            <>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{activeProject.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {totalCost > 0 && <span className="price-tag" style={{ fontSize: 13 }}>∑ ~{totalCost.toFixed(2)} €</span>}
                  <button className="export-btn" onClick={exportCSV}>⬇ CSV</button>
                  <button className="export-btn" style={{ color: "var(--orange)", borderColor: "rgba(210,153,34,0.3)" }} onClick={() => setShowCart(true)}>🛒 Cart</button>
                  <button
                    className="btn btn-ai btn-sm"
                    onClick={searchPrices}
                    disabled={searching}
                    title="Nexar (MPN), AI (no MPN), no preferred shop: consolidated distributor; AliExpress + Tavily: /item/ product links for cart"
                  >
                    {searching
                      ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, marginRight: 4 }} />{searchProgress ? `${searchProgress.done}/${searchProgress.total} ${searchProgress.current}` : "Searching…"}</>
                      : "🔍 Search prices"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddPart(true)}>+ Part</button>
                </div>
              </div>

              {/* Phase 1: gap analysis panel */}
              {gapResult && gapResult.total > 0 && (
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: `1px solid ${GAP_STATUS_COLOR[gapResult.status]}40`, background: `${GAP_STATUS_COLOR[gapResult.status]}0d`, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: gapResult.missingItems.length > 0 ? 6 : 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: GAP_STATUS_COLOR[gapResult.status], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ color: GAP_STATUS_COLOR[gapResult.status], fontWeight: 600 }}>{GAP_STATUS_LABEL[gapResult.status]}</span>
                    <span style={{ color: "var(--text2)" }}>·</span>
                    <span style={{ color: "var(--green)" }}>{gapResult.fullyInStock} in stock</span>
                    {gapResult.partial > 0 && <><span style={{ color: "var(--text2)" }}>·</span><span style={{ color: "var(--orange)" }}>{gapResult.partial} partial</span></>}
                    {gapResult.missing > 0 && <><span style={{ color: "var(--text2)" }}>·</span><span style={{ color: "var(--red)" }}>{gapResult.missing} missing</span></>}
                  </div>
                  {gapResult.missingItems.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {gapResult.missingItems.map(mi => (
                        <span key={mi.partId} style={{ fontSize: 11, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", color: "var(--text2)" }} title={mi.mpn || undefined}>
                          {mi.missing}× {mi.name}
                          {mi.available > 0 && <span style={{ color: "var(--orange)" }}> ({mi.available} avail)</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {gapResult.missing > 0 && (
                    <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                      onClick={() => window.dispatchEvent(new CustomEvent("switchTab", {
                        detail: {
                          tab: "orders",
                          orderContext: {
                            projectId: activeProject.id,
                            projectName: activeProject.name,
                            missingItems: gapResult.missingItems.map(mi => ({
                              ...mi,
                              suppliers: suppliers
                                .filter(s => s.partId === mi.partId && s.price != null)
                                .map(s => ({ shopId: s.shopId, shopName: s.shopName, price: s.price, moq: s.moq||1, stock: s.stock, sku: s.sku||"" })),
                            })),
                          },
                        },
                      }))}>
                      🛍️ Order missing parts →
                    </button>
                  )}
                </div>
              )}

              {sourcingSummary && (
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(88,166,255,0.25)", background: "rgba(88,166,255,0.06)", fontSize: 12, color: "var(--text2)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--text)" }}>Last search:</strong> {sourcingSummary}
                </div>
              )}

              {projectBom.length === 0 ? (
                <div className="empty-state">
                  <h3>Empty BOM</h3>
                  <p>Click "+ Part" to add items.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Part</th>
                        <th>MPN</th>
                        <th>Reference</th>
                        <th style={{ minWidth: 190 }}>Preferred shop</th>
                        <th>Price</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectBom.map(item => {
                        const part = parts.find(p => p.id === item.partId);
                        if (!part) return (
                          <tr key={item.id} style={{ background: "rgba(248,81,73,0.06)" }}>
                            <td><span className="bom-qty">{item.quantity}×</span></td>
                            <td colSpan={4}>
                              <span style={{ color: "var(--red)", fontSize: 12 }}>⚠ Part deleted from database</span>
                              {item.reference && <span style={{ color: "var(--text3)", fontSize: 11, marginLeft: 8 }}>({item.reference})</span>}
                            </td>
                            <td>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)}>Remove</button>
                            </td>
                          </tr>
                        );
                        const sups = suppliers.filter(s => s.partId === item.partId);
                        const preferred = getPreferredSupplier(item, sups);
                        const prefPrice = preferred?.price;
                        return (
                          <tr key={item.id}>
                            <td><span className="bom-qty">{item.quantity}×</span></td>
                            <td>
                              <div style={{ fontWeight: 500 }}>{part?.name || <span style={{ color: "var(--red)" }}>Deleted</span>}</div>
                              {part?.footprint && <div className="mono" style={{ color: "var(--text3)", fontSize: 11 }}>{part.footprint}</div>}
                            </td>
                            <td><span className="mono">{part?.mpn || "—"}</span></td>
                            <td><span className="mono" style={{ color: "var(--text2)" }}>{item.reference || "—"}</span></td>
                            <td>
                              <SupplierDropdown
                                item={item}
                                part={part}
                                suppliers={sups}
                                shops={shops}
                                onSelectShop={(shopId) => saveBom(bomItems.map(b => b.id === item.id ? { ...b, preferredShopId: shopId } : b))}
                              />
                            </td>
                            <td>
                              {(() => {
                                const bulkAlt = sups.find(s => s.shopId === "aliexpress-bulk" && s.price != null && s.searchUrl);
                                if (!prefPrice) {
                                  if (bulkAlt?.price) {
                                    const pqB = bulkAlt.packQty || 1;
                                    const packsB = Math.ceil(item.quantity / pqB);
                                    return (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                        <span style={{ fontSize: 11, color: "var(--text2)" }}>bulk only</span>
                                        <a className="price-tag" href={bulkAlt.searchUrl} target="_blank" rel="noopener" style={{ textDecoration: "none", fontSize: 12 }}>
                                          {(packsB * bulkAlt.price).toFixed(2)} € · {pqB}/reel
                                        </a>
                                        {bulkAlt.notes && <span style={{ fontSize: 10, color: "var(--text3)" }} title={bulkAlt.notes}>{bulkAlt.notes.slice(0, 70)}{bulkAlt.notes.length > 70 ? "…" : ""}</span>}
                                      </div>
                                    );
                                  }
                                  return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;
                                }
                                const packQty = preferred?.packQty || 1;
                                const packsNeeded = Math.ceil(item.quantity / packQty);
                                const surplus = packsNeeded * packQty - item.quantity;
                                const stock = preferred?.stock ?? null;
                                const stockColor = stock === null ? null : stock === 0 ? "var(--red)" : stock < 10 ? "var(--orange)" : "var(--green)";
                                const stockLabel = stock === null ? null : stock === 0 ? "out of stock" : `${stock.toLocaleString()} in stock`;
                                const bulkPacks = bulkAlt ? Math.ceil(item.quantity / (bulkAlt.packQty || 1)) : 0;
                                const bulkLine = bulkAlt && bulkAlt.price != null && item.preferredShopId === "aliexpress"
                                  ? `${bulkPacks}× lot ${(bulkAlt.packQty || "").toLocaleString()}: ~${(bulkPacks * bulkAlt.price).toFixed(2)} €`
                                  : null;
                                return (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span className="price-tag">{(packsNeeded * prefPrice).toFixed(2)} {preferred?.currency === "USD" ? "$" : "€"}</span>
                                    {bulkLine && (
                                      <a href={bulkAlt.searchUrl} target="_blank" rel="noopener" style={{ fontSize: 10, color: "var(--text2)", textDecoration: "underline dotted" }} title={bulkAlt.notes || "Bulk reel alternative"}>
                                        Alt. {bulkLine}
                                      </a>
                                    )}
                                    {stockLabel && <span style={{ fontSize: 10, color: stockColor }}>{stock === 0 ? "⚠" : "✓"} {stockLabel}</span>}
                                    {packQty > 1 && <span style={{ fontSize: 10, color: "var(--text2)" }}>{packsNeeded}× pack/{packQty}</span>}
                                    {preferred?.notes && item.preferredShopId === "aliexpress" && (
                                      <span style={{ fontSize: 10, color: "var(--text3)" }} title={preferred.notes}>{preferred.notes.slice(0, 55)}{preferred.notes.length > 55 ? "…" : ""}</span>
                                    )}
                                    {surplus > 0 && (
                                      <button
                                        style={{ fontSize: 10, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                                        title={`Add ${surplus} surplus to parts library stock`}
                                        onClick={() => {
                                          const p = parts.find(pp => pp.id === item.partId);
                                          if (!p) return;
                                          saveParts(parts.map(pp => pp.id === p.id ? { ...pp, stock: (pp.stock || 0) + surplus } : pp));
                                          alert(`Added ${surplus}× ${p.name} to library stock.`);
                                        }}
                                      >
                                        +{surplus} → stock
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditItem(item)}>✏️</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showAddPart && (
        <AddBomItemModal parts={parts} onAdd={addBomItem} onClose={() => setShowAddPart(false)} existingIds={projectBom.map(b => b.partId)} />
      )}

      {editItem && (
        <EditBomItemModal item={editItem} part={parts.find(p => p.id === editItem.partId)} onSave={updateItem} onClose={() => setEditItem(null)} />
      )}

      {showCart && activeProject && (
        <CartModal
          project={activeProject}
          bomItems={projectBom}
          parts={parts}
          suppliers={suppliers}
          onClose={() => setShowCart(false)}
        />
      )}
    </div>
  );
}
