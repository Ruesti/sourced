// @ts-nocheck
import { useState } from "react";
import { claudeParseReport, getApiKey } from "../lib/ai-api";

const CONF_COLOR = { high: "var(--green)", medium: "var(--orange)", low: "var(--red)" };
const CONF_LABEL = { high: "High", medium: "Medium", low: "Low" };

// ── BOM field definitions ──────────────────────────────────────────────────────

const BOM_FIELDS = [
  { id: "name",         label: "Name / Designation", required: true },
  { id: "quantity",     label: "Quantity",            required: true },
  { id: "reference",    label: "Reference (R1, C3…)", required: false },
  { id: "mpn",          label: "MPN / Order no.",     required: false },
  { id: "manufacturer", label: "Manufacturer",        required: false },
  { id: "footprint",    label: "Footprint",           required: false },
  { id: "value",        label: "Value (10k, 100nF…)", required: false },
  { id: "description",  label: "Description",         required: false },
  { id: "category",     label: "Category",            required: false },
  { id: "_ignore",      label: "— Ignore —",          required: false },
];

// ── Column header auto-detection ───────────────────────────────────────────────

export function autoDetectMapping(headers) {
  const rules = [
    { field: "name",         patterns: ["name","bezeichnung","bauteil","component","part","description","desc","value","wert","teil","benennung"] },
    { field: "quantity",     patterns: ["qty","quantity","menge","count","anzahl","amount","num","pcs","stück","stk","menge"] },
    { field: "reference",    patterns: ["reference","ref","designator","refdes","referenz","position","pos","designators","positionsnummer","item","lfd"] },
    { field: "mpn",          patterns: ["mpn","sku","ordernr","order","bestell","bestellnummer","teilenr","part number","partnumber","mfr part","mfrpn","lieferantennr","art.nr","artikelnummer"] },
    { field: "manufacturer", patterns: ["manufacturer","mfr","hersteller","vendor","make","brand","lieferant","supplier"] },
    { field: "footprint",    patterns: ["footprint","gehäuse","package","case","housing","pattern","bauform"] },
    { field: "value",        patterns: ["value","wert","val","impedance","kennwert","technischer","nennwert"] },
    { field: "description",  patterns: ["description","desc","comment","bemerkung","notiz","note","text","beschreibung","benennung"] },
    { field: "category",     patterns: ["category","kategorie","type","typ","group","gruppe","bauteil_kategorie"] },
  ];
  const swRules = [
    { field: "quantity",     patterns: ["anzahl","qty"] },
    { field: "reference",    patterns: ["teilenummer","item no","pos."] },
    { field: "name",         patterns: ["bezeichnung","benennung","description"] },
    { field: "mpn",          patterns: ["bestellnummer","hersteller_teilenummer","art.nr"] },
    { field: "manufacturer", patterns: ["lieferant","hersteller"] },
    { field: "description",  patterns: ["description","notizen"] },
  ];

  const mapping = {};
  const usedFields = new Set();
  headers.forEach(h => {
    const hl = h.toLowerCase().replace(/[\s_\-\.]+/g, "");
    for (const rule of [...swRules, ...rules]) {
      const patterns = rule.patterns || [];
      if (patterns.some(p => hl.includes(p.replace(/[\s_\-\.]+/g, "")))) {
        if (!usedFields.has(rule.field)) {
          mapping[h] = rule.field;
          usedFields.add(rule.field);
          break;
        }
      }
    }
    if (!mapping[h]) mapping[h] = "_ignore";
  });
  return mapping;
}

// ── CSV parser ─────────────────────────────────────────────────────────────────

export function parseCsvText(text) {
  const firstLine = text.split("\n")[0];
  const delimiters = [",", ";", "\t", "|"];
  const delimiter = delimiters.reduce((best, d) =>
    (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const lines = text.trim().split("\n");
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === delimiter && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
  return { headers, rows };
}

// ── Store aggregation helper ───────────────────────────────────────────────────

export function aggregateStores(searchResults) {
  const storeMap = {};
  for (const result of searchResults) {
    for (const store of result.stores || []) {
      const key = store.storeName?.toLowerCase().trim() || "unknown";
      if (!storeMap[key]) {
        storeMap[key] = { storeName: store.storeName, storeUrl: store.storeUrl, rating: store.rating, parts: [], totalMinPrice: 0 };
      }
      storeMap[key].parts.push({ partId: result.partId, partName: result.partName, productUrl: store.productUrl, priceEur: store.priceEur, minOrder: store.minOrder, note: store.note });
      storeMap[key].totalMinPrice += store.priceEur || 0;
    }
  }
  return Object.values(storeMap).sort((a, b) => b.parts.length - a.parts.length || b.rating - a.rating);
}

// ── CsvExcelImporter ───────────────────────────────────────────────────────────

function CsvExcelImporter({ parts, saveParts, projects, saveProjects, bomItems, saveBom }) {
  const [csvStep, setCsvStep] = useState(1);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [editableItems, setEditableItems] = useState([]);
  const [targetProject, setTargetProject] = useState("new");
  const [newProjectName, setNewProjectName] = useState("");
  const [importDone, setImportDone] = useState(null);
  const [importing, setImporting] = useState(false);
  const [loadingXlsx, setLoadingXlsx] = useState(false);
  const [matchResults, setMatchResults] = useState([]);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchAccepted, setMatchAccepted] = useState({});

  const ensureXlsx = () => new Promise((resolve) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    setLoadingXlsx(true);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => { setLoadingXlsx(false); resolve(window.XLSX); };
    document.head.appendChild(s);
  });

  const processFile = async (file) => {
    setFileName(file.name);
    setNewProjectName(file.name.replace(/\.[^.]+$/, ""));
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);
    if (isExcel) {
      const XLSX = await ensureXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const hdrs = (json[0] || []).map(String);
      const rows = json.slice(1).filter(r => r.some(c => c != null && c !== "")).map(r => {
        const row = {};
        hdrs.forEach((h, i) => { row[h] = r[i] != null ? String(r[i]) : ""; });
        return row;
      });
      setHeaders(hdrs); setRawRows(rows);
      setMapping(autoDetectMapping(hdrs));
    } else {
      const text = await file.text();
      const { headers: hdrs, rows } = parseCsvText(text);
      setHeaders(hdrs); setRawRows(rows);
      setMapping(autoDetectMapping(hdrs));
    }
    setCsvStep(2);
  };

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  const CATS = ["Resistor","Capacitor","Inductor","IC","Transistor","Diode","LED","Relay","Connector","Switch","Sensor","MCU","MOSFET","Module","Mechanical","Cable","Other"];

  const buildItems = () => rawRows.map((row, i) => {
    const get = (field) => {
      const col = Object.keys(mapping).find(h => mapping[h] === field);
      return col ? (row[col] || "").trim() : "";
    };
    const name = get("name") || get("description") || `Unknown #${i + 1}`;
    const qtyRaw = get("quantity");
    const qty = parseInt(qtyRaw) || (get("reference") ? get("reference").split(/[,;]/).filter(Boolean).length : 1);
    return {
      _id: i, _enabled: !!name && name !== `Unknown #${i + 1}`,
      name, quantity: qty,
      reference: get("reference"), mpn: get("mpn"),
      manufacturer: get("manufacturer"), footprint: get("footprint"),
      value: get("value"), description: get("description"),
      category: CATS.includes(get("category")) ? get("category") : "",
    };
  }).filter(it => it.name);

  const runAiMatch = async (items) => {
    setMatching(true); setMatchError(""); setMatchResults([]);
    try {
      const r = await fetch("/api/ai/match-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(i => ({ _id: i._id, name: i.name, value: i.value, description: i.description, mpn: i.mpn, manufacturer: i.manufacturer, footprint: i.footprint })),
          apiKey: getApiKey(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Match failed");
      const results = data.results || [];
      setMatchResults(results);
      const accepted = {};
      results.forEach(m => { accepted[m._id] = m.confidence === "high" || m.confidence === "medium"; });
      setMatchAccepted(accepted);
    } catch (e) {
      setMatchError(e.message);
    }
    setMatching(false);
  };

  const applyMapping = () => {
    const items = buildItems();
    setEditableItems(items);
    setCsvStep(3);
    runAiMatch(items);
  };

  const applyMatchesToItems = () => {
    setEditableItems(its => its.map(item => {
      const match = matchResults.find(m => m._id === item._id);
      if (!match || !matchAccepted[item._id]) return item;
      return {
        ...item,
        mpn: match.mpn || item.mpn,
        manufacturer: match.manufacturer || item.manufacturer,
        category: match.part_type && CATS.includes(match.part_type) ? match.part_type : item.category,
        footprint: match.footprint || item.footprint,
      };
    }));
    setCsvStep(4);
  };

  const updateItem = (id, field, val) => setEditableItems(its => its.map(it => it._id === id ? { ...it, [field]: val } : it));

  const doImport = async () => {
    setImporting(true);
    const enabled = editableItems.filter(i => i._enabled);
    let project;
    if (targetProject === "new") {
      project = { id: Date.now().toString(), name: newProjectName || "Import", created: new Date().toISOString() };
      saveProjects([...projects, project]);
    } else {
      project = projects.find(p => p.id === targetProject);
    }
    const newParts = [...parts];
    const newBom = [...bomItems];
    let addedParts = 0, addedItems = 0;
    for (const item of enabled) {
      let part = newParts.find(p => p.name?.toLowerCase() === item.name?.toLowerCase() && (!item.mpn || !p.mpn || p.mpn?.toLowerCase() === item.mpn?.toLowerCase()));
      if (!part) {
        part = { id: Date.now().toString() + Math.random().toString(36).slice(2), name: item.name, mpn: item.mpn || "", manufacturer: item.manufacturer || "", category: item.category || "", footprint: item.footprint || "", description: [item.description, item.value].filter(Boolean).join(" – ") || "", notes: `Imported from: ${fileName}` };
        newParts.push(part); addedParts++;
      }
      const exists = newBom.find(b => b.projectId === project.id && b.partId === part.id);
      if (exists) { exists.quantity += item.quantity; }
      else {
        newBom.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), projectId: project.id, partId: part.id, quantity: item.quantity, reference: item.reference || "", notes: item.value ? `Value: ${item.value}` : "" });
        addedItems++;
      }
    }
    saveParts(newParts); saveBom(newBom);
    setImportDone({ project: project.name, projectId: project.id, addedParts, addedItems, total: enabled.length });
    setCsvStep(5); setImporting(false);
  };

  const reset = () => { setCsvStep(1); setHeaders([]); setRawRows([]); setMapping({}); setFileName(""); setEditableItems([]); setImportDone(null); setTargetProject("new"); setNewProjectName(""); setMatchResults([]); setMatchError(""); setMatchAccepted({}); };

  const fieldsMapped = Object.values(mapping).filter(v => v !== "_ignore");
  const hasName = fieldsMapped.includes("name");

  return (
    <div>
      <div className="import-steps" style={{ marginBottom: 24 }}>
        {[{n:1,label:"File"},{n:2,label:"Map columns"},{n:3,label:"AI Match"},{n:4,label:"Review"},{n:5,label:"Done"}].map(s => (
          <div key={s.n} className="import-step">
            <div className={`step-circle ${csvStep > s.n ? "done" : csvStep === s.n ? "active" : ""}`}>{csvStep > s.n ? "✓" : s.n}</div>
            <div className={`step-label ${csvStep > s.n ? "done" : csvStep === s.n ? "active" : ""}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {csvStep === 1 && (
        <div>
          <div className={`drop-zone ${dragOver ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}>
            <input type="file" accept=".csv,.xlsx,.xls,.ods,.tsv,.txt" onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
            <div className="drop-zone-icon">{loadingXlsx ? "⏳" : "📊"}</div>
            <div className="drop-zone-text">{loadingXlsx ? "Loading Excel parser…" : "Upload CSV or Excel file"}</div>
            <div className="drop-zone-sub">.csv · .xlsx · .xls · .ods · .tsv — delimiter auto-detected</div>
          </div>
          <div style={{ marginTop: 20, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--text2)" }}>Compatible with any CAD or PCB tool</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {["SolidWorks","Fusion 360","CATIA","Inventor","FreeCAD","Onshape","KiCad","Altium","Eagle","EasyEDA","OrCAD","Zuken","Excel / Google Sheets","Custom format"].map(h =>
                <span key={h} className="field-chip">{h}</span>)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              Column headers in any language — German, English, French, Japanese, Chinese etc. are auto-detected.
            </div>
          </div>
        </div>
      )}

      {csvStep === 2 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{fileName}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{rawRows.length} rows · {headers.length} columns detected</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={reset}>← Back</button>
          </div>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, padding: "8px 14px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.05em" }}>
              <div>COLUMN IN FILE</div><div></div><div>FIELD IN BOM</div>
            </div>
            {headers.map(h => {
              const sample = rawRows.slice(0, 3).map(r => r[h]).filter(Boolean).join(", ");
              return (
                <div key={h} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 8, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, fontFamily: "IBM Plex Mono, monospace" }}>{h}</div>
                    {sample && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{sample}</div>}
                  </div>
                  <div style={{ color: "var(--text3)", textAlign: "center", fontSize: 16 }}>→</div>
                  <div>
                    <select value={mapping[h] || "_ignore"} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      style={{ width: "100%", background: mapping[h] && mapping[h] !== "_ignore" ? "rgba(57,211,83,0.08)" : "var(--bg3)", border: `1px solid ${mapping[h] && mapping[h] !== "_ignore" ? "rgba(57,211,83,0.4)" : "var(--border2)"}`, color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}>
                      {BOM_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}{f.required ? " *" : ""}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          {!hasName && <div style={{ color: "var(--orange)", fontSize: 13, marginBottom: 10 }}>⚠️ Please map at least "Name / Designation".</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text2)", alignSelf: "center" }}>{fieldsMapped.filter(f => f !== "_ignore").length} fields mapped</div>
            <button className="btn btn-primary" disabled={!hasName} onClick={applyMapping}>Next: AI Match →</button>
          </div>
        </div>
      )}

      {csvStep === 3 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>🤖 AI Part Matching</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>Identifying MPNs, manufacturers, and types for {editableItems.length} components</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCsvStep(2)}>← Back</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCsvStep(4)}>Skip →</button>
            </div>
          </div>

          {matching && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text2)" }}>
              <span className="spinner" style={{ width: 22, height: 22, margin: "0 auto 14px", display: "block" }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Matching components…</div>
              <div style={{ fontSize: 12, marginTop: 8, color: "var(--text3)" }}>Using AI to find MPNs, manufacturers, and part types</div>
            </div>
          )}

          {matchError && !matching && (
            <div style={{ background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.25)", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ color: "var(--red)", fontWeight: 600, marginBottom: 8 }}>⚠️ Matching failed</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>{matchError}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => runAiMatch(editableItems)}>Retry</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCsvStep(4)}>Skip matching →</button>
              </div>
            </div>
          )}

          {!matching && matchResults.length > 0 && (() => {
            const high   = matchResults.filter(m => m.confidence === "high").length;
            const medium = matchResults.filter(m => m.confidence === "medium").length;
            const low    = matchResults.filter(m => m.confidence === "low").length;
            const accepted = Object.values(matchAccepted).filter(Boolean).length;
            return (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  {[
                    { count: high,   label: "High confidence",   color: "var(--green)",  desc: "auto-accepted" },
                    { count: medium, label: "Medium confidence", color: "var(--orange)", desc: "review recommended" },
                    { count: low,    label: "Low confidence",    color: "var(--red)",    desc: "manual edit suggested" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontFamily: "IBM Plex Mono", fontSize: 15, color: s.color }}>{s.count}</span>
                      <span style={{ fontSize: 12, color: "var(--text2)" }}>{s.label}<br /><span style={{ fontSize: 11, color: "var(--text3)" }}>{s.desc}</span></span>
                    </div>
                  ))}
                </div>

                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 120px 60px", gap: 10, padding: "7px 12px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text2)", letterSpacing: "0.04em" }}>
                    <div></div><div>COMPONENT</div><div>MATCHED MPN</div><div>MANUFACTURER</div><div>CONFIDENCE</div>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {matchResults.map(match => {
                      const item = editableItems.find(i => i._id === match._id);
                      const acc  = !!matchAccepted[match._id];
                      const c    = match.confidence;
                      return (
                        <div key={match._id} onClick={() => setMatchAccepted(ma => ({ ...ma, [match._id]: !ma[match._id] }))}
                          style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 120px 60px", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--border)", alignItems: "center", cursor: "pointer", opacity: acc ? 1 : 0.5, background: acc ? "transparent" : "var(--bg3)" }}>
                          <input type="checkbox" checked={acc} onChange={() => {}} style={{ accentColor: "var(--green)", cursor: "pointer" }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.name}</div>
                            {match.notes && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{match.notes}</div>}
                          </div>
                          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "var(--blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.mpn || "—"}</div>
                          <div style={{ fontSize: 12, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.manufacturer || "—"}</div>
                          <div>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: CONF_COLOR[c] + "22", color: CONF_COLOR[c], border: `1px solid ${CONF_COLOR[c]}55` }}>
                              {CONF_LABEL[c]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text2)" }}>
                    <strong style={{ color: "var(--green)" }}>{accepted}</strong> matches will be applied · click a row to toggle
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCsvStep(4)}>Skip →</button>
                    <button className="btn btn-primary" disabled={accepted === 0} onClick={applyMatchesToItems}>
                      ✅ Apply {accepted} matches → Review
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {csvStep === 4 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{editableItems.filter(i => i._enabled).length} / {editableItems.length} items</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:true})))}>All</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditableItems(its => its.map(i => ({...i,_enabled:false})))}>None</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCsvStep(3)}>← Back</button>
            </div>
          </div>

          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Import into:</div>
            <select style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
              value={targetProject} onChange={e => setTargetProject(e.target.value)}>
              <option value="new">+ New project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetProject === "new" && (
              <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name"
                style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 10px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 160 }} />
            )}
          </div>

          <div className="table-wrap" style={{ marginBottom: 14, maxHeight: 420, overflowY: "auto" }}>
            <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em", position: "sticky", top: 0, zIndex: 1 }}>
              <div>✓</div><div>Name</div><div>Qty</div><div>Category</div><div>MPN</div><div>Reference</div><div></div>
            </div>
            {editableItems.map(item => (
              <div key={item._id} className="import-item-row" style={{ opacity: item._enabled ? 1 : 0.4 }}>
                <div><input type="checkbox" checked={item._enabled} onChange={e => updateItem(item._id, "_enabled", e.target.checked)} style={{ width: "auto", cursor: "pointer", accentColor: "var(--green)" }} /></div>
                <div>
                  <input value={item.name || ""} onChange={e => updateItem(item._id, "name", e.target.value)} style={{ fontWeight: 500 }} />
                  {item.value && <div style={{ fontSize: 10, color: "var(--orange)", fontFamily: "IBM Plex Mono", paddingLeft: 6 }}>{item.value}</div>}
                </div>
                <div><input type="number" min="1" value={item.quantity || 1} onChange={e => updateItem(item._id, "quantity", parseInt(e.target.value)||1)} style={{ textAlign: "center", fontFamily: "IBM Plex Mono" }} /></div>
                <div>
                  <select value={item.category || ""} onChange={e => updateItem(item._id, "category", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", color: "var(--text)", fontSize: 12, fontFamily: "IBM Plex Sans", width: "100%", padding: "3px 4px", borderRadius: 4 }}>
                    <option value="">—</option>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><input value={item.mpn || ""} onChange={e => updateItem(item._id, "mpn", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                <div><input value={item.reference || ""} onChange={e => updateItem(item._id, "reference", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                <div><button className="btn btn-danger" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => setEditableItems(its => its.filter(i => i._id !== item._id))}>✕</button></div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-primary" disabled={importing || editableItems.filter(i => i._enabled).length === 0 || (targetProject === "new" && !newProjectName)} onClick={doImport}>
              {importing ? <><span className="spinner" /> Importing…</> : `✅ Import ${editableItems.filter(i => i._enabled).length} items`}
            </button>
          </div>
        </div>
      )}

      {csvStep === 5 && importDone && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import successful!</div>
          <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Project: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong></div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[{val:importDone.total,label:"Items",color:"var(--blue)"},{val:importDone.addedParts,label:"New parts in DB",color:"var(--green)"},{val:importDone.addedItems,label:"BOM entries",color:"var(--purple)"}].map(s => (
              <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={reset}>Another import</button>
            <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("switchTab", { detail: { tab: "bom", projectId: importDone.projectId } }))}>→ Go to BOM</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ImportTab ──────────────────────────────────────────────────────────────────

export default function ImportTab({ parts, saveParts, projects, saveProjects, bomItems, saveBom }) {
  const [mode, setMode] = useState("csv");
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [items, setItems] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [targetProject, setTargetProject] = useState("new");
  const [newProjectName, setNewProjectName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);

  const CATS = ["Resistor","Capacitor","Inductor","IC","Transistor","Diode","LED","Relay","Connector","Switch","Sensor","MCU","MOSFET","Module","Mechanical","Cable","Other"];

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawText(e.target.result);
      setFileName(file.name);
      setNewProjectName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) readFile(file); };
  const handleFileInput = (e) => { const file = e.target.files[0]; if (file) readFile(file); };

  const handleParse = async () => {
    if (!rawText.trim()) return;
    setParsing(true); setParseError(""); setParseResult(null);
    try {
      const result = await claudeParseReport(rawText, fileName, getApiKey());
      setParseResult(result);
      setItems((result.items || []).map((it, i) => ({ ...it, _id: i, _enabled: true })));
      if (result.project_name && !newProjectName) setNewProjectName(result.project_name);
      setStep(2);
    } catch (e) { setParseError("Analysis failed: " + e.message); }
    setParsing(false);
  };

  const updateItem = (id, field, val) => setItems(items.map(it => it._id === id ? { ...it, [field]: val } : it));

  const handleImport = async () => {
    setImporting(true);
    const enabledItems = items.filter(it => it._enabled);
    let project;
    if (targetProject === "new") {
      project = { id: Date.now().toString(), name: newProjectName || "Import " + new Date().toLocaleDateString(), created: new Date().toISOString() };
      saveProjects([...projects, project]);
    } else {
      project = projects.find(p => p.id === targetProject);
    }
    const newParts = [...parts];
    const newBomEntries = [...bomItems];
    let addedParts = 0, addedItems = 0;
    for (const item of enabledItems) {
      const name = item.name?.trim();
      if (!name) continue;
      let existing = newParts.find(p => p.name?.toLowerCase() === name.toLowerCase() && (!item.mpn || !p.mpn || p.mpn?.toLowerCase() === item.mpn?.toLowerCase()));
      if (!existing) {
        existing = { id: Date.now().toString() + Math.random().toString(36).slice(2), name, mpn: item.mpn || "", manufacturer: item.manufacturer || "", category: item.category || "", footprint: item.footprint || "", description: [item.description, item.value].filter(Boolean).join(" – ") || "", notes: item.raw ? `Imported from: ${fileName}` : "" };
        newParts.push(existing); addedParts++;
      }
      const bomExisting = newBomEntries.find(b => b.projectId === project.id && b.partId === existing.id);
      if (bomExisting) {
        bomExisting.quantity += (parseInt(item.quantity) || 1);
      } else {
        newBomEntries.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), projectId: project.id, partId: existing.id, quantity: parseInt(item.quantity) || 1, reference: item.reference || "", notes: item.value ? `Value: ${item.value}` : "" });
        addedItems++;
      }
    }
    saveParts(newParts); saveBom(newBomEntries);
    setImportDone({ project: project.name, projectId: project.id, addedParts, addedItems, total: enabledItems.length });
    setStep(3); setImporting(false);
  };

  const reset = () => { setStep(1); setRawText(""); setFileName(""); setParseResult(null); setItems([]); setParseError(""); setImportDone(null); setPasteMode(false); setNewProjectName(""); setTargetProject("new"); };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📥 BOM Import</div>
        {step > 1 && mode === "ai" && <button className="btn btn-secondary" onClick={reset}>↺ Start over</button>}
      </div>

      <div className="tabs-inner" style={{ marginBottom: 24 }}>
        <button className={`tab-inner-btn ${mode === "csv" ? "active" : ""}`} onClick={() => setMode("csv")}>📊 CSV / Excel</button>
        <button className={`tab-inner-btn ${mode === "ai" ? "active" : ""}`} onClick={() => setMode("ai")}>🤖 AI Import (any format)</button>
      </div>

      {mode === "csv" && (
        <CsvExcelImporter parts={parts} saveParts={saveParts} projects={projects} saveProjects={saveProjects} bomItems={bomItems} saveBom={saveBom} />
      )}

      {mode === "ai" && <>
        <div className="import-steps">
          {[{n:1,label:"File / Text"},{n:2,label:"Review & Edit"},{n:3,label:"Imported"}].map(s => (
            <div key={s.n} className="import-step">
              <div className={`step-circle ${step > s.n ? "done" : step === s.n ? "active" : ""}`}>{step > s.n ? "✓" : s.n}</div>
              <div className={`step-label ${step > s.n ? "done" : step === s.n ? "active" : ""}`}>{s.label}</div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className={`tab-inner-btn ${!pasteMode ? "active" : ""}`} onClick={() => setPasteMode(false)}>📁 Upload file</button>
              <button className={`tab-inner-btn ${pasteMode ? "active" : ""}`} onClick={() => setPasteMode(true)}>📋 Paste text</button>
            </div>

            {!pasteMode ? (
              <div className={`drop-zone ${dragOver ? "drag-over" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}>
                <input type="file" accept=".csv,.json,.txt,.xml,.yaml,.yml,.bom,.net,.kicad_bom,*" onChange={handleFileInput} />
                <div className="drop-zone-icon">{fileName ? "✅" : "📄"}</div>
                {fileName
                  ? <div className="drop-zone-text" style={{ color: "var(--green)" }}>{fileName}</div>
                  : <><div className="drop-zone-text">Drag file here or click</div><div className="drop-zone-sub">CSV, JSON, TXT, XML, KiCad, Eagle, Altium, YAML – any format</div></>}
              </div>
            ) : (
              <textarea
                style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", padding: "12px 14px", borderRadius: 8, fontFamily: "IBM Plex Mono, monospace", fontSize: 12, minHeight: 220, resize: "vertical" }}
                placeholder={"Paste report content here…\n\nExamples:\n- CSV with columns: Qty, Reference, Value, Footprint\n- JSON array of parts\n- Free text like: 2x ATmega328P, 10x 10kΩ 0805…\n- KiCad netlist, Eagle BOM, …"}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
              />
            )}

            {rawText && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{rawText.length.toLocaleString()} chars · {rawText.split("\n").length} lines</div>
                <div style={{ marginLeft: "auto" }}>
                  <button className="btn btn-ai" onClick={handleParse} disabled={parsing}>
                    {parsing ? <><span className="spinner" /> Analyzing…</> : "🤖 Start AI analysis"}
                  </button>
                </div>
              </div>
            )}

            {parseError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{parseError}</div>}

            <div style={{ marginTop: 28, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--text2)" }}>Supported formats</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["KiCad BOM","Eagle BOM","Altium BOM","CSV/Excel","JSON array","Free text","Markdown table","YAML","Custom formats"].map(f => (
                  <span key={f} className="field-chip">{f}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10 }}>
                The AI detects the format automatically and extracts parts, quantities, MPNs and reference designators.
              </div>
            </div>
          </div>
        )}

        {step === 2 && parseResult && (
          <div>
            <div className={`parse-result-banner ${parseResult.confidence === "low" ? "warn" : ""}`}>
              <div style={{ fontSize: 22 }}>{parseResult.confidence === "high" ? "✅" : parseResult.confidence === "medium" ? "🟡" : "⚠️"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Format detected: <span style={{ color: "var(--blue)", fontFamily: "IBM Plex Mono, monospace" }}>{parseResult.format_detected}</span>
                  <span style={{ marginLeft: 10, fontSize: 11, padding: "1px 8px", borderRadius: 4, background: parseResult.confidence === "high" ? "rgba(63,185,80,0.15)" : "rgba(210,153,34,0.15)", color: parseResult.confidence === "high" ? "var(--green)" : "var(--orange)" }}>
                    {parseResult.confidence === "high" ? "Confident" : parseResult.confidence === "medium" ? "Uncertain" : "Low"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{parseResult.notes}</div>
                <div>{(parseResult.fields_found || []).map(f => <span key={f} className="field-chip">{f}</span>)}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>📁 Import into:</div>
              <select style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans" }}
                value={targetProject} onChange={e => setTargetProject(e.target.value)}>
                <option value="new">+ New project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {targetProject === "new" && (
                <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "IBM Plex Sans", flex: 1, minWidth: 180 }} />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{items.filter(i => i._enabled).length} / {items.length} items selected</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: true })))}>Select all</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, _enabled: false })))}>Deselect all</button>
              </div>
            </div>

            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <div className="import-item-row" style={{ background: "var(--bg3)", fontWeight: 600, color: "var(--text2)", fontSize: 11, letterSpacing: "0.04em" }}>
                <div>✓</div><div>Name / Description</div><div>Qty</div><div>Category</div><div>MPN</div><div>Reference</div><div></div>
              </div>
              {items.map(item => (
                <div key={item._id} className="import-item-row" style={{ opacity: item._enabled ? 1 : 0.4 }}>
                  <div><input type="checkbox" checked={item._enabled} onChange={e => updateItem(item._id, "_enabled", e.target.checked)} style={{ width: "auto", cursor: "pointer", accentColor: "var(--green)" }} /></div>
                  <div>
                    <input value={item.name || ""} onChange={e => updateItem(item._id, "name", e.target.value)} style={{ fontWeight: 500 }} />
                    {item.value && <div style={{ fontSize: 10, color: "var(--orange)", fontFamily: "IBM Plex Mono", paddingLeft: 6 }}>{item.value}</div>}
                  </div>
                  <div><input type="number" min="1" value={item.quantity || 1} onChange={e => updateItem(item._id, "quantity", parseInt(e.target.value) || 1)} style={{ textAlign: "center", fontFamily: "IBM Plex Mono" }} /></div>
                  <div>
                    <select value={item.category || ""} onChange={e => updateItem(item._id, "category", e.target.value)}
                      style={{ background: "transparent", border: "1px solid transparent", color: "var(--text)", fontSize: 12, fontFamily: "IBM Plex Sans", width: "100%", padding: "3px 4px", borderRadius: 4 }}>
                      <option value="">—</option>
                      {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><input value={item.mpn || ""} onChange={e => updateItem(item._id, "mpn", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                  <div><input value={item.reference || ""} onChange={e => updateItem(item._id, "reference", e.target.value)} style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} placeholder="—" /></div>
                  <div><button className="btn btn-danger" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => setItems(items.filter(i => i._id !== item._id))}>✕</button></div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary"
                disabled={importing || items.filter(i => i._enabled).length === 0 || (targetProject === "new" && !newProjectName)}
                onClick={handleImport}>
                {importing ? <><span className="spinner" /> Importing…</> : `✅ Import ${items.filter(i => i._enabled).length} items`}
              </button>
            </div>
          </div>
        )}

        {step === 3 && importDone && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import successful!</div>
            <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Project: <strong style={{ color: "var(--text)" }}>{importDone.project}</strong></div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
              {[{val:importDone.total,label:"Items",color:"var(--blue)"},{val:importDone.addedParts,label:"New parts in DB",color:"var(--green)"},{val:importDone.addedItems,label:"BOM entries",color:"var(--purple)"}].map(s => (
                <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 110 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={reset}>Another import</button>
              <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("switchTab", { detail: { tab: "bom", projectId: importDone.projectId } }))}>→ Go to BOM</button>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}
