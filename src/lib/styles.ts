// @ts-nocheck
// Global CSS injected via <style> tag.

export const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --border2: #484f58;
    --text: #e6edf3;
    --text2: #8b949e;
    --text3: #6e7681;
    --green: #2ea043;
    --green2: #238636;
    --green3: #1a7f37;
    --blue: #4493f8;
    --orange: #bb8009;
    --red: #f85149;
    --purple: #a371f7;
    --accent: #2ea043;
  }

  body { background: var(--bg); color: var(--text); font-family: 'IBM Plex Sans', sans-serif; }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--bg2);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .logo {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
    font-size: 15px;
    color: var(--accent);
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-badge {
    background: var(--green2);
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
    letter-spacing: 0.08em;
  }

  .nav {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .nav-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--text2);
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav-btn:hover { color: var(--text); background: var(--bg3); }
  .nav-btn.active {
    color: var(--text);
    background: var(--bg3);
    border-color: var(--border2);
  }

  .main { flex: 1; padding: 24px; max-width: 1400px; margin: 0 auto; width: 100%; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    gap: 12px;
  }

  .section-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    padding: 2px 8px;
    border-radius: 20px;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--green2);
    color: #fff;
    border-color: var(--green3);
  }
  .btn-primary:hover { background: var(--green3); }

  .btn-secondary {
    background: var(--bg3);
    color: var(--text);
    border-color: var(--border2);
  }
  .btn-secondary:hover { background: var(--border); }

  .btn-ghost {
    background: none;
    color: var(--text2);
    border-color: transparent;
  }
  .btn-ghost:hover { color: var(--text); background: var(--bg3); }

  .btn-danger {
    background: none;
    color: var(--red);
    border-color: transparent;
    padding: 4px 8px;
    font-size: 12px;
  }
  .btn-danger:hover { background: rgba(248,81,73,0.1); }

  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-ai {
    background: #1c2d3f;
    color: #4493f8;
    border-color: #2d4a6b;
  }
  .btn-ai:hover { background: #243548; }
  .btn-ai:disabled { opacity: 0.5; cursor: not-allowed; }

  .table-wrap {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg2);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    background: var(--bg3);
    color: var(--text2);
    font-weight: 500;
    padding: 10px 14px;
    text-align: left;
    font-size: 12px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }

  .mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    font-family: 'IBM Plex Mono', monospace;
  }

  .tag-cat { background: rgba(88,166,255,0.1); color: var(--blue); border: 1px solid rgba(88,166,255,0.2); }
  .tag-shop { background: rgba(63,185,80,0.1); color: var(--green); border: 1px solid rgba(63,185,80,0.2); }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    backdrop-filter: blur(3px);
  }

  .modal {
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 10px;
    padding: 24px;
    width: 580px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-row { margin-bottom: 14px; }
  .form-row label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 5px; font-weight: 500; }
  .form-row input, .form-row select, .form-row textarea {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: border-color 0.15s;
  }
  .form-row input:focus, .form-row select:focus, .form-row textarea:focus {
    outline: none;
    border-color: var(--green);
  }
  .form-row textarea { resize: vertical; min-height: 72px; }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

  .supplier-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 8px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .supplier-card:hover { border-color: var(--border2); }

  .supplier-logo {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: var(--text2);
    flex-shrink: 0;
  }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--text3);
  }

  .empty-state h3 { font-size: 15px; color: var(--text2); margin-bottom: 6px; }
  .empty-state p { font-size: 13px; }

  .search-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .search-input {
    flex: 1;
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .search-input:focus { outline: none; border-color: var(--border2); }

  .project-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .project-card:hover, .project-card.active { border-color: var(--green); }
  .project-card.active { background: rgba(57,211,83,0.04); }

  .pc-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--bg3);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .pc-info { flex: 1 }
  .pc-name { font-weight: 600; font-size: 14px; }
  .pc-meta { font-size: 12px; color: var(--text2); margin-top: 2px; }

  .two-col { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }

  .bom-qty {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 2px 6px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
  }

  .price-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(88,166,255,0.3);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .ai-result {
    background: rgba(88,166,255,0.06);
    border: 1px solid rgba(88,166,255,0.2);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .ai-result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .tabs-inner {
    display: flex;
    gap: 1px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    margin-bottom: 18px;
    width: fit-content;
  }

  .tab-inner-btn {
    background: none;
    border: none;
    color: var(--text2);
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: all 0.15s;
  }

  .tab-inner-btn.active {
    background: var(--bg2);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
    cursor: pointer;
    background: var(--bg3);
    color: var(--text2);
    border: 1px solid var(--border);
    transition: all 0.15s;
  }
  .export-btn:hover { color: var(--text); border-color: var(--border2); }

  .info-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .info-chip {
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: var(--text3);
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .drop-zone {
    border: 2px dashed var(--border2);
    border-radius: 10px;
    padding: 40px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg2);
    position: relative;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--green);
    background: rgba(57,211,83,0.04);
  }
  .drop-zone input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .drop-zone-icon { font-size: 32px; margin-bottom: 10px; }
  .drop-zone-text { font-size: 14px; color: var(--text2); margin-bottom: 4px; }
  .drop-zone-sub { font-size: 12px; color: var(--text3); }

  .parse-result-banner {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: rgba(57,211,83,0.06);
    border: 1px solid rgba(57,211,83,0.2);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .parse-result-banner.warn {
    background: rgba(210,153,34,0.08);
    border-color: rgba(210,153,34,0.3);
  }

  .field-chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    background: rgba(188,140,255,0.1);
    color: var(--purple);
    border: 1px solid rgba(188,140,255,0.2);
    font-family: 'IBM Plex Mono', monospace;
    margin: 2px 3px;
  }

  .import-item-row {
    display: grid;
    grid-template-columns: 40px 1fr 80px 80px 80px 80px 40px;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .import-item-row:last-child { border-bottom: none; }
  .import-item-row:hover { background: rgba(255,255,255,0.02); }

  .import-item-row input {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text);
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'IBM Plex Sans', sans-serif;
    width: 100%;
  }
  .import-item-row input:focus {
    outline: none;
    border-color: var(--border2);
    background: var(--bg3);
  }

  .import-steps {
    display: flex;
    gap: 0;
    margin-bottom: 28px;
    position: relative;
  }

  .import-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
    z-index: 1;
  }

  .import-step::before {
    content: '';
    position: absolute;
    top: 16px;
    left: -50%;
    right: 50%;
    height: 2px;
    background: var(--border);
    z-index: -1;
  }
  .import-step:first-child::before { display: none; }

  .step-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    border: 2px solid var(--border);
    background: var(--bg2);
    color: var(--text3);
    transition: all 0.3s;
  }

  .step-circle.done { border-color: var(--green); background: var(--green2); color: #fff; }
  .step-circle.active { border-color: var(--blue); color: var(--blue); background: rgba(88,166,255,0.1); }

  .step-label { font-size: 11px; color: var(--text3); margin-top: 5px; text-align: center; }
  .step-label.active { color: var(--blue); }
  .step-label.done { color: var(--green); }

  .select-proj-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: var(--text3);
    text-align: center;
    gap: 8px;
  }
  .select-proj-hint h3 { color: var(--text2); font-size: 15px; }
  .sync-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block; margin-right: 5px;
    flex-shrink: 0;
  }
  .sync-dot.online  { background: var(--green); animation: pulse 3s ease-in-out infinite; }
  .sync-dot.offline { background: var(--text3); }
  .sync-dot.syncing { background: var(--blue);  animation: spin 1s linear infinite; border-radius: 0; clip-path: circle(50%); }

  .user-chip {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg3); border: 1px solid var(--border2);
    border-radius: 6px; padding: 4px 10px; cursor: pointer;
    font-size: 12px; color: var(--text2); transition: all 0.15s;
  }
  .user-chip:hover { color: var(--text); border-color: var(--border2); }

  .auth-modal-tabs {
    display: flex; border-bottom: 1px solid var(--border); margin-bottom: 20px;
  }
  .auth-tab {
    flex: 1; padding: 10px; text-align: center; cursor: pointer;
    font-size: 13px; font-weight: 500; color: var(--text2);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    background: none; border-top: none; border-left: none; border-right: none;
    font-family: 'IBM Plex Sans', sans-serif; transition: all 0.15s;
  }
  .auth-tab.active { color: var(--green); border-bottom-color: var(--green); }

  .migration-card {
    background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.2);
    border-radius: 8px; padding: 14px 16px; margin-top: 16px; font-size: 13px;
  }

  .beta-bar {
    background: linear-gradient(90deg, rgba(57,211,83,0.08), rgba(88,166,255,0.06));
    border-bottom: 1px solid rgba(57,211,83,0.15);
    padding: 6px 24px; display: flex; align-items: center; gap: 10;
    font-size: 12px; color: var(--text2);
  }

  .creator-strip {
    background: linear-gradient(90deg, rgba(163,113,247,0.12), rgba(88,166,255,0.08));
    border-bottom: 1px solid rgba(163,113,247,0.22);
    padding: 8px 24px; display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--text2);
  }
  .creator-strip-text { flex: 1; min-width: 200px; line-height: 1.45; }
  .creator-strip-text strong { color: var(--text); font-weight: 600; }
  .creator-strip-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .creator-strip-icon { font-size: 14px; flex-shrink: 0; }
`;
