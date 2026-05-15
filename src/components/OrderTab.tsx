// @ts-nocheck
import { useState, useEffect } from "react";
import { sbSaveOrderLists, sbLoadOrderLists, sbDeleteOrderList, sbLoadOrderItems, sbUpdateOrderReceived } from "../lib/supabase";

const SCENARIO_META = {
  cheapest:  { icon: "💰", label: "Cheapest" },
  fastest:   { icon: "⚡", label: "Fastest / In-Stock" },
  one_shop:  { icon: "🏪", label: "Single Shop" },
};

// ── CSV helpers ────────────────────────────────────────────────────────────────

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildGenericCsv(shopName: string, items: any[]) {
  const rows = [["Name", "MPN", "SKU", "Quantity", "Unit Price (EUR)", "Line Total (EUR)"]];
  items.forEach(it => rows.push([it.name, it.mpn||"", it.sku||"", it.qty, it.unitPrice?.toFixed(4)||"", it.lineTotal?.toFixed(4)||""]));
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function buildMouserCsv(items: any[]) {
  const rows = [["Mouser Part Number", "Quantity", "Customer Part Number"]];
  items.forEach(it => rows.push([it.sku||it.mpn||"", it.qty, it.name]));
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function buildReicheltCsv(items: any[]) {
  const rows = [["Bestellnummer", "Menge", "Kommentar"]];
  items.forEach(it => rows.push([it.sku||it.mpn||"", it.qty, it.name]));
  return rows.map(r => `${r[0]};${r[1]};${r[2]}`).join("\n");
}

// ── ScenarioView ───────────────────────────────────────────────────────────────

function ScenarioView({ scenario, onSave, saving, user }) {
  const [exportShop, setExportShop] = useState(null);

  const handleExport = (shop, format) => {
    const safeName = shop.shopName.replace(/[^a-zA-Z0-9]/g, "_");
    if (format === "mouser")   downloadCsv(`order_${safeName}_mouser.csv`,   buildMouserCsv(shop.items));
    if (format === "reichelt") downloadCsv(`order_${safeName}_reichelt.csv`,  buildReicheltCsv(shop.items));
    if (format === "generic")  downloadCsv(`order_${safeName}.csv`,           buildGenericCsv(shop.shopName, shop.items));
    setExportShop(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{scenario.explanation}</div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "IBM Plex Mono", color: "var(--green)" }}>
            €{scenario.totalCost?.toFixed(2) ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>total incl. shipping</div>
        </div>
      </div>

      {(scenario.breakdown || []).map(shop => (
        <div key={shop.shopId || shop.shopName} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{shop.shopName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                Parts: <strong style={{ color: "var(--text)", fontFamily: "IBM Plex Mono" }}>€{shop.subtotal?.toFixed(2)}</strong>
                {shop.shipping > 0
                  ? <> · Shipping: <strong style={{ color: "var(--orange)", fontFamily: "IBM Plex Mono" }}>€{shop.shipping?.toFixed(2)}</strong></>
                  : <> · <strong style={{ color: "var(--green)" }}>Free shipping</strong></>}
              </div>
              <div style={{ position: "relative" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setExportShop(exportShop === shop.shopName ? null : shop.shopName)}>
                  ⬇ CSV
                </button>
                {exportShop === shop.shopName && (
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 6, zIndex: 20, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                    {["Mouser", "Reichelt", "Generic CSV"].map((fmt, i) => (
                      <button key={fmt} className="btn btn-ghost btn-sm" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: i < 2 ? 2 : 0 }}
                        onClick={() => handleExport(shop, ["mouser","reichelt","generic"][i])}>
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg3)", fontSize: 11, color: "var(--text2)" }}>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: 600 }}>Part</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>MPN</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>SKU</th>
                <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Qty</th>
                <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Unit €</th>
                <th style={{ padding: "6px 14px", textAlign: "right", fontWeight: 600 }}>Total €</th>
              </tr>
            </thead>
            <tbody>
              {(shop.items || []).map((it, idx) => (
                <tr key={it.partId || idx} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 14px", fontWeight: 500 }}>{it.name}</td>
                  <td style={{ padding: "7px 8px", fontFamily: "IBM Plex Mono", fontSize: 11, color: "var(--blue)" }}>{it.mpn || "—"}</td>
                  <td style={{ padding: "7px 8px", fontFamily: "IBM Plex Mono", fontSize: 11, color: "var(--text3)" }}>{it.sku || "—"}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "IBM Plex Mono" }}>{it.qty}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "IBM Plex Mono" }}>{it.unitPrice?.toFixed(4) ?? "—"}</td>
                  <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>{it.lineTotal?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        {user ? (
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(scenario)}>
            {saving ? <><span className="spinner" /> Saving…</> : "💾 Save order list"}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>Sign in to save order lists</div>
        )}
      </div>
    </div>
  );
}

// ── ReceiveModal ───────────────────────────────────────────────────────────────

function ReceiveModal({ list, parts, onDone, onClose }) {
  const [orderItems, setOrderItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    sbLoadOrderItems(list.id).then(items => {
      setOrderItems(items);
      const init = {};
      items.forEach(it => { init[it.id] = it.receivedQty || it.quantity; });
      setReceived(init);
    }).catch(() => setError("Failed to load order items.")).finally(() => setLoading(false));
  }, [list.id]);

  const handleConfirm = async () => {
    setSaving(true); setError("");
    try {
      const updatedItems = (orderItems || []).map(it => ({ ...it, receivedQty: parseInt(received[it.id]) || 0 }));
      const allFull = updatedItems.every(it => it.receivedQty >= it.quantity);
      const anyReceived = updatedItems.some(it => it.receivedQty > 0);
      const status = allFull ? "received" : anyReceived ? "partial" : "ordered";
      await sbUpdateOrderReceived(list.id, updatedItems, status);
      onDone(list.id, updatedItems, status);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-title">📦 Receive delivery — {list.name || "Order list"}</div>

        {loading && <div style={{ textAlign: "center", padding: 24 }}><span className="spinner" /></div>}

        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

        {!loading && orderItems && (
          <>
            <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14, lineHeight: 1.5 }}>
              Enter the quantity actually received for each item. Stock will be updated accordingly.
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", gap: 8, padding: "6px 14px", background: "var(--bg3)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.04em" }}>
                <div>PART</div><div style={{ textAlign: "right" }}>ORDERED</div><div style={{ textAlign: "right" }}>RECEIVED</div>
              </div>
              {orderItems.length === 0 && (
                <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--text3)", textAlign: "center" }}>No items found for this order list.</div>
              )}
              {orderItems.map(it => {
                const part = parts?.find(p => p.id === it.partId);
                return (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{part?.name || it.partId}</div>
                      {it.sku && <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "IBM Plex Mono" }}>SKU: {it.sku}</div>}
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13, color: "var(--text3)" }}>{it.quantity}</div>
                    <div>
                      <input type="number" min="0" max={it.quantity * 2} value={received[it.id] ?? it.quantity}
                        onChange={e => setReceived(r => ({ ...r, [it.id]: e.target.value }))}
                        style={{ width: "100%", textAlign: "right", fontFamily: "IBM Plex Mono", background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "4px 8px", borderRadius: 5, fontSize: 13 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || orderItems.length === 0} onClick={handleConfirm}>
                {saving ? <><span className="spinner" /> Updating…</> : "✅ Confirm receipt & update stock"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── SavedListRow ───────────────────────────────────────────────────────────────

function SavedListRow({ list, onDelete, onReceive }) {
  const STATUS_COLOR = { draft: "var(--text3)", ordered: "var(--blue)", partial: "var(--orange)", received: "var(--green)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{list.name || "Unnamed list"}</span>
        {list.shopName && <span style={{ color: "var(--text2)", marginLeft: 8 }}>· {list.shopName}</span>}
      </div>
      <span style={{ color: STATUS_COLOR[list.status] || "var(--text3)", fontWeight: 600, fontSize: 11 }}>{list.status}</span>
      {list.totalPrice != null && <span style={{ fontFamily: "IBM Plex Mono", color: "var(--green)" }}>€{list.totalPrice.toFixed(2)}</span>}
      <span style={{ color: "var(--text3)", fontSize: 11 }}>{list.createdAt ? new Date(list.createdAt).toLocaleDateString() : ""}</span>
      {list.status !== "received" && (
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, whiteSpace: "nowrap" }} onClick={() => onReceive(list)}>
          📦 Receive
        </button>
      )}
      <button className="btn btn-danger" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => onDelete(list.id)}>🗑</button>
    </div>
  );
}

// ── OrderTab ───────────────────────────────────────────────────────────────────

export default function OrderTab({ shops, user, parts, saveParts, orderContext, scenarios, onRerun }) {
  const [activeTab, setActiveTab]     = useState("cheapest");
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [savedLists, setSavedLists]   = useState([]);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [receivingList, setReceivingList] = useState(null);

  useEffect(() => {
    if (user && !listsLoaded) {
      sbLoadOrderLists(user.id).then(lists => { setSavedLists(lists); setListsLoaded(true); }).catch(() => {});
    }
  }, [user, listsLoaded]);

  const handleSave = async (scenario) => {
    if (!user) return;
    setSaving(true); setSaveError("");
    try {
      const ts = Date.now();
      const lists = (scenario.breakdown || []).map((shop, i) => ({
        id: `${ts}_${i}`,
        projectId: orderContext?.projectId || null,
        shopId: shop.shopId || null,
        name: `${scenario.label} — ${shop.shopName}`,
        status: "draft",
        totalPrice: (shop.subtotal || 0) + (shop.shipping || 0),
        currency: "EUR",
        notes: scenario.explanation || "",
      }));
      const items = (scenario.breakdown || []).flatMap((shop, i) =>
        (shop.items || []).map((it, j) => ({
          id: `${ts}_${i}_${j}`,
          orderListId: `${ts}_${i}`,
          partId: it.partId,
          quantity: it.qty,
          unitPrice: it.unitPrice,
          sku: it.sku || "",
        }))
      );
      await sbSaveOrderLists(lists, items, user.id);
      setSavedLists(prev => [...lists.map(l => ({ ...l, shopName: (scenario.breakdown.find((_, i2) => `${ts}_${i2}` === l.id) || {}).shopName })), ...prev]);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  };

  const handleDeleteList = async (id) => {
    if (!confirm("Delete this order list?")) return;
    await sbDeleteOrderList(id).catch(() => {});
    setSavedLists(prev => prev.filter(l => l.id !== id));
  };

  const handleReceiveDone = (listId, updatedItems, newStatus) => {
    // Update saved list status in local state
    setSavedLists(prev => prev.map(l => l.id === listId ? { ...l, status: newStatus } : l));
    // Update parts stock
    if (saveParts && parts) {
      const updatedParts = parts.map(p => {
        const received = updatedItems.filter(it => it.partId === p.id);
        if (!received.length) return p;
        const addedQty = received.reduce((sum, it) => sum + (it.receivedQty || 0), 0);
        return { ...p, stock: (p.stock || 0) + addedQty };
      });
      saveParts(updatedParts);
    }
    setReceivingList(null);
  };

  const activeScenario = scenarios?.find(s => s.type === activeTab);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🛍️ Order Optimization</div>
      </div>

      {!orderContext && !scenarios && (
        <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.15)", borderRadius: 8, padding: "16px 20px", marginBottom: 24, fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>How to use:</strong> Open a project in the BOM tab, let the gap analysis identify missing parts, then click{" "}
          <strong style={{ color: "var(--blue)" }}>🛍️ Order missing parts →</strong> to get an AI-powered ordering suggestion here.
        </div>
      )}

      {orderContext && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>Project: </span>
            <strong style={{ fontSize: 13 }}>{orderContext.projectName}</strong>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>·</div>
          <div style={{ fontSize: 12, color: "var(--red)" }}>
            {orderContext.missingItems?.length} parts · {orderContext.missingItems?.filter(m => m.suppliers?.length > 0).length} with prices
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn btn-secondary btn-sm" onClick={onRerun}>🔄 Recalculate</button>
          </div>
        </div>
      )}

      {saveError && (
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>Save failed: {saveError}</div>
      )}

      {scenarios && scenarios.length > 0 && (
        <div>
          <div className="tabs-inner" style={{ marginBottom: 20 }}>
            {scenarios.map(s => {
              const meta = SCENARIO_META[s.type] || { icon: "📋", label: s.label || s.type };
              return (
                <button key={s.type} className={`tab-inner-btn ${activeTab === s.type ? "active" : ""}`} onClick={() => setActiveTab(s.type)}>
                  {meta.icon} {meta.label}
                  <span style={{ marginLeft: 8, fontSize: 12, fontFamily: "IBM Plex Mono", color: activeTab === s.type ? "inherit" : "var(--text3)" }}>
                    €{s.totalCost?.toFixed(2) ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {activeScenario && (
            <ScenarioView scenario={activeScenario} onSave={handleSave} saving={saving} user={user} />
          )}
        </div>
      )}

      {user && savedLists.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", marginBottom: 10 }}>
            💾 SAVED ORDER LISTS
          </div>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {savedLists.map(l => (
              <SavedListRow key={l.id} list={l} onDelete={handleDeleteList} onReceive={setReceivingList} />
            ))}
          </div>
        </div>
      )}

      {receivingList && (
        <ReceiveModal
          list={receivingList}
          parts={parts}
          onDone={handleReceiveDone}
          onClose={() => setReceivingList(null)}
        />
      )}
    </div>
  );
}
