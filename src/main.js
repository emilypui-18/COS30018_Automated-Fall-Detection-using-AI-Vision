import {
  db,
  modelEvaluationDemo,
  connectionState,
  loadDatabaseFromApi,
  updateAnomalyStatus,
  getAssetById,
  getAssetByName,
  getAssetContext,
  getLatestAnomalyRows,
  getSensorsForAsset,
  getReading,
  formatShortTime,
  formatTime
} from "./data/dataStore.js";
import { initXeokitViewer, destroyActiveViewer } from "./xeokitViewer.js";

const app = document.getElementById("app");

const state = {
  selectedAssetId: 101,
  selectedBimElement: null,
  aiDrawerOpen: false,
  aiResponse: "",
  sensorAssetId: 101,
  sensorId: 1001,
  assetSearch: "",
  assetFloor: "all",
  anomalyStatus: "all",
  anomalyAsset: "all"
};

const NAV_ITEMS = [
  ["/", "▦", "Dashboard"],
  ["/bim-viewer", "◫", "BIM Viewer"],
  ["/assets", "◇", "Assets"],
  ["/sensor-data", "≋", "Sensor Data"],
  ["/anomalies", "△", "Anomalies / Faults"],
  ["/model-results", "◒", "Model Results"],
  ["assistant", "□", "AI Assistant"],
  ["/settings", "⚙", "Settings"]
];

const ROUTE_TITLES = {
  "/": "Building Asset Monitoring",
  "/bim-viewer": "BIM Viewer",
  "/assets": "Assets",
  "/sensor-data": "Sensor Data",
  "/anomalies": "Anomalies / Faults",
  "/model-results": "Model Results",
  "/settings": "Settings"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pathName() {
  return window.location.pathname || "/";
}

function go(path) {
  if (path === pathName()) {
    render();
    return;
  }
  history.pushState({}, "", path);
  render();
}

function currentNavPath(path) {
  if (path.startsWith("/assets")) return "/assets";
  return path;
}

function statusClass(value) {
  const s = String(value || "").toLowerCase();
  if (["normal", "running", "open", "online", "completed"].includes(s)) return "normal";
  if (["review", "medium", "warning", "scheduled"].includes(s)) return "review";
  if (["new", "anomaly", "high"].includes(s)) return "anomaly";
  if (["critical", "fault", "offline"].includes(s)) return "critical";
  if (["closed", "acknowledged"].includes(s)) return "closed";
  return "closed";
}

function statusPill(value, label = value) {
  return `<span class="status-pill ${statusClass(value)}"><span class="status-dot ${statusClass(value) === "normal" ? "green" : statusClass(value) === "critical" ? "red" : "orange"}"></span>${escapeHtml(label)}</span>`;
}

function shell(pageHtml, { activePath = pathName(), breadcrumb = ROUTE_TITLES[pathName()] || "Workspace", noScroll = false } = {}) {
  const navPath = currentNavPath(activePath);
  const activeAlerts = db.Alerts.filter((a) => ["New", "Review"].includes(a.alert_status)).length;
  const nav = NAV_ITEMS.map(([path, glyph, label]) => {
    const isAssistant = path === "assistant";
    const active = isAssistant ? state.aiDrawerOpen : navPath === path;
    const badge = label === "Anomalies / Faults" && activeAlerts ? `<span class="nav-badge">${activeAlerts}</span>` : "";
    return `<button class="nav-item ${active ? "active" : ""}" data-nav="${path}">
      <span class="nav-glyph">${glyph}</span><span class="nav-text">${label}</span>${badge}
    </button>`;
  }).join("");

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <div class="brand-copy">
            <div class="brand-title">Asset Intelligence</div>
            <div class="brand-subtitle">AI-Driven Digital Twin</div>
          </div>
        </div>
        <div class="sidebar-label">Workspace</div>
        <nav class="nav" aria-label="Primary navigation">${nav}</nav>
        <div class="sidebar-divider"></div>
        <div class="system-status">
          <div class="status-heading">System Status</div>
          <div class="status-row-mini"><span><span class="status-dot green"></span>Digital Twin Online</span><strong>DEMO</strong></div>
          <div class="status-row-mini"><span>Database</span><strong>${connectionState.status === "connected" ? "PostgreSQL" : "Offline"}</strong></div>
          <div class="status-row-mini"><span>Data Stream</span><strong>Simulated</strong></div>
          <div class="status-row-mini"><span>AI Model</span><strong>Demo</strong></div>
        </div>
      </aside>

      <header class="topbar">
        <div class="breadcrumb">Dashboard &nbsp;/&nbsp; <strong>${escapeHtml(breadcrumb)}</strong></div>
        <div class="search-wrap"><input class="global-search" id="globalSearch" placeholder="Search asset, sensor or location…" /></div>
        <div class="top-actions">
          <span class="live-chip"><span class="status-dot green"></span>Live <span class="demo-label">Demo</span></span>
          <button class="icon-button" id="notificationButton" title="Alerts">⚠</button>
          <button class="user-button" id="userButton"><span class="avatar">FM</span><span>Facility Manager</span><span>⌄</span></button>
        </div>
      </header>

      <main class="content ${noScroll ? "no-scroll" : ""}" id="mainContent">${pageHtml}</main>
    </div>
    ${state.aiDrawerOpen ? assistantDrawerHtml() : ""}
  `;

  bindShellEvents();
}

function bindShellEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.nav;
      if (target === "assistant") {
        state.aiDrawerOpen = true;
        render();
      } else {
        go(target);
      }
    });
  });

  document.getElementById("notificationButton")?.addEventListener("click", () => go("/anomalies"));
  document.getElementById("userButton")?.addEventListener("click", () => go("/login"));

  const search = document.getElementById("globalSearch");
  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const q = search.value.trim().toUpperCase();
    const asset = db.Assets.find((a) => a.asset_name.toUpperCase().includes(q));
    if (asset) {
      state.selectedAssetId = asset.asset_id;
      go(`/assets/${asset.asset_id}`);
    }
  });

  bindAssistantDrawer();
}

function pageHeading({ eyebrow, title, subtitle, actions = "" }) {
  return `<div class="page-heading-row">
    <div>
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <p class="page-subtitle">${escapeHtml(subtitle)}</p>
    </div>
    <div class="page-actions">${actions}</div>
  </div>`;
}

function selectedAssetContext() {
  return getAssetContext(getAssetById(state.selectedAssetId)) || getAssetContext(db.Assets[0]);
}

function assetAnomalyStatus(assetId) {
  const context = getAssetContext(getAssetById(assetId));
  const active = context?.anomalies?.find((a) => ["New", "Review", "Acknowledged"].includes(a.anomaly_status));
  if (!active) return "Normal";
  return active.anomaly_status === "Review" ? "Review" : "Anomaly";
}

function readingByType(context, type) {
  const item = context?.readings?.find((r) => r.sensor_type === type);
  return item?.reading ? `${item.reading.value} ${item.unit}` : "—";
}

function latestReadingTimestamp(context = null) {
  const rows = context
    ? context.readings.map((r) => r.reading).filter(Boolean)
    : db.Sensor_Readings;
  const timestamps = rows.map((r) => r.latest_update).filter(Boolean).sort();
  return timestamps.at(-1) || null;
}

function assetInspectorHtml({ detailed = false } = {}) {
  const context = selectedAssetContext();
  const { asset, space, floor, anomalies } = context;
  const latestAnomaly = anomalies[0] || null;
  const status = latestAnomaly && latestAnomaly.anomaly_status !== "Closed" ? "Anomaly" : "Normal";

  return `<section class="panel asset-inspector">
    <div class="panel-header">
      <div class="section-title">Selected Asset</div>
      <div class="section-meta"><span class="status-dot green"></span>LIVE <span class="demo-label">DEMO</span></div>
    </div>
    <div class="asset-inspector-body">
      <div class="asset-title-row">
        <div class="asset-icon-box">⇄</div>
        <div class="asset-title-copy">
          <div class="asset-name">${escapeHtml(asset.asset_name)}</div>
          <div class="asset-type">${escapeHtml(asset.asset_type)}</div>
        </div>
        ${statusPill(status)}
      </div>

      <div class="info-section">
        <div class="info-heading">Identification</div>
        <div class="info-row"><span class="info-key">Asset ID</span><span class="info-value">AST-${String(asset.asset_id).padStart(4,"0")}</span></div>
        <div class="info-row"><span class="info-key">BIM Element ID</span><span class="info-value mono">${escapeHtml(state.selectedBimElement?.entityId || asset.ifc_global_id)}</span></div>
        <div class="info-row"><span class="info-key">Location</span><span class="info-value">${escapeHtml(space?.space_name || floor?.floor_name || "—")}</span></div>
        <div class="info-row"><span class="info-key">System</span><span class="info-value">HVAC</span></div>
      </div>

      <div class="info-section">
        <div class="info-heading">Live Condition</div>
        <div class="info-row"><span class="info-key">Supply Air Temperature</span><span class="info-value">${readingByType(context,"Supply Air Temperature")}</span></div>
        <div class="info-row"><span class="info-key">Return Air Temperature</span><span class="info-value">${readingByType(context,"Return Air Temperature")}</span></div>
        <div class="info-row"><span class="info-key">Airflow</span><span class="info-value">${readingByType(context,"Airflow")}</span></div>
        <div class="info-row"><span class="info-key">Static Pressure</span><span class="info-value">${readingByType(context,"Static Pressure")}</span></div>
        <div class="info-row"><span class="info-key">Fan State</span><span class="info-value">${escapeHtml(asset.status)}</span></div>
        <div class="info-row"><span class="info-key">Valve Position</span><span class="info-value">${readingByType(context,"Valve Position")}</span></div>
      </div>

      ${detailed ? `<div class="info-section">
        <div class="info-heading">Sync Status</div>
        <div class="info-row"><span class="info-key">Last Updated</span><span class="info-value">${formatTime(latestReadingTimestamp(context))}</span></div>
        <div class="info-row"><span class="info-key">Data Source</span><span class="info-value">PostgreSQL demo records</span></div>
        <div class="info-row"><span class="info-key">Synchronisation Latency</span><span class="info-value">Not measured</span></div>
      </div>` : ""}

      <div class="ai-box">
        <div class="ai-head"><div class="ai-label">AI Analysis</div><span class="demo-label">DEMO</span></div>
        <div class="ai-score-row">
          <div class="ai-state">${latestAnomaly ? "Anomalous" : "Normal"}</div>
          <div class="ai-score">${latestAnomaly ? Number(latestAnomaly.anomaly_score).toFixed(2) : "—"}<small>Anomaly Score</small></div>
        </div>
        <div style="margin-top:9px">
          <div class="info-row"><span class="info-key">Detection Model</span><span class="info-value">Multivariate Autoencoder</span></div>
          <div class="info-row"><span class="info-key">Model Version</span><span class="info-value">AE-v1.3</span></div>
          <div class="info-row"><span class="info-key">Detected</span><span class="info-value">${latestAnomaly ? formatTime(latestAnomaly.timestamp) : "—"}</span></div>
          <div class="info-row"><span class="info-key">Detection Evidence</span><span class="info-value">${latestAnomaly ? escapeHtml(latestAnomaly.description) : "No active anomaly"}</span></div>
        </div>
        <div style="height:1px;background:#334650;margin:8px 0"></div>
        <div class="info-row"><span class="info-key">Fault Classification</span><span class="info-value">Not connected</span></div>
        <div class="section-meta">Anomaly detection is kept separate from any future supervised fault classifier.</div>
      </div>
    </div>
    <div class="asset-actions">
      <button class="btn btn-primary btn-wide" data-open-asset="${asset.asset_id}">Open Asset Detail ↗</button>
      <div class="asset-actions-row">
        <button class="btn" data-explain-anomaly>□ Explain Anomaly</button>
        <button class="btn" data-acknowledge="${latestAnomaly?.anomaly_id || ""}" ${!latestAnomaly || ["Acknowledged","Closed"].includes(latestAnomaly.anomaly_status) ? "disabled" : ""}>${latestAnomaly?.anomaly_status === "Acknowledged" ? "✓ Acknowledged" : "✓ Acknowledge"}</button>
      </div>
    </div>
  </section>`;
}

function bindAssetInspector() {
  document.querySelector("[data-open-asset]")?.addEventListener("click", (event) => go(`/assets/${event.currentTarget.dataset.openAsset}`));
  document.querySelector("[data-explain-anomaly]")?.addEventListener("click", () => {
    state.aiDrawerOpen = true;
    state.aiResponse = "";
    render();
  });
  document.querySelector("[data-acknowledge]")?.addEventListener("click", async (event) => {
    const anomalyId = Number(event.currentTarget.dataset.acknowledge);
    if (!anomalyId) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Updating…";
    try {
      await updateAnomalyStatus(anomalyId, "Acknowledged");
      render();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Retry Acknowledge";
      console.error(error);
    }
  });
}

function viewerPanelHtml({ stageId, detailed = false } = {}) {
  return `<section class="panel viewer-panel">
    <div class="panel-header">
      <div>
        <div class="section-title">◫ Digital Twin BIM Viewer</div>
        <div class="section-meta" style="margin-top:4px">18 floors &nbsp;•&nbsp; Live asset state &nbsp; <span class="demo-label">SIMULATION</span></div>
      </div>
      <div class="viewer-tools-row">
        <select class="select" data-floor-select aria-label="Select floor"><option value="-1">All Floors</option></select>
        <button class="btn" data-viewer-mode="3d">3D View</button>
        ${detailed ? `<select class="select"><option>All Assets</option><option>HVAC</option></select><select class="select"><option>All Statuses</option><option>Anomaly</option><option>Normal</option></select>` : ""}
      </div>
    </div>
    <div class="viewer-stage" id="${stageId}">
      <canvas class="viewer-canvas" data-xeokit-canvas></canvas>
      <canvas class="nav-cube-canvas" data-navcube-canvas></canvas>
      <div class="viewer-overlay-top"><span>● Snowdon Towers &nbsp;/&nbsp; 3D View</span><span>● Selected Element &nbsp; <strong data-selected-element>${escapeHtml(state.selectedBimElement?.entityId || "BIM-AHU-L2-001")}</strong></span></div>
      <div class="viewer-toolbar" aria-label="BIM viewer tools">
        <button class="viewer-tool" title="Reset / Home" data-viewer-action="home">⌂</button>
        <button class="viewer-tool" title="Plan view" data-viewer-action="plan">⌗</button>
        <button class="viewer-tool" title="3D floor view" data-viewer-action="threeD">◉</button>
        <button class="viewer-tool" title="Fit model" data-viewer-action="fit">⌕</button>
        <button class="viewer-tool" title="Show all floors" data-viewer-action="all">▦</button>
        <button class="viewer-tool active" title="BIM selection active">◇</button>
      </div>
      <div class="viewer-floor-control">
        <button class="btn" data-viewer-action="up">↑</button>
        <span class="viewer-floor-label" data-floor-label>All Floors</span>
        <button class="btn" data-viewer-action="down">↓</button>
        <button class="btn" data-viewer-action="all">Show All</button>
      </div>
      <div class="viewer-loading" data-viewer-loading>
        <div class="viewer-loading-card">
          <div class="viewer-loading-icon"></div>
          <div class="viewer-loading-title">Loading BIM model</div>
          <div class="viewer-loading-sub">Snowdon Towers · xeokit</div>
        </div>
      </div>
    </div>
    <div class="viewer-statusbar">
      <div class="legend">
        <span class="legend-item"><span class="legend-dot" style="background:#35d07f"></span>Normal</span>
        <span class="legend-item"><span class="legend-dot" style="background:#ffd447"></span>Warning</span>
        <span class="legend-item"><span class="legend-dot" style="background:#ff7a00"></span>Anomaly</span>
        <span class="legend-item"><span class="legend-dot" style="background:#ff5154"></span>Critical</span>
        <span class="legend-item"><span class="legend-dot" style="background:#55b7ff"></span>Selected</span>
      </div>
      <span>Affected elements only</span>
    </div>
  </section>`;
}

function initViewer(stageId) {
  return initXeokitViewer({
    stageId,
    onSelection: (selection) => {
      state.selectedBimElement = selection;
      const label = document.querySelector("[data-selected-element]");
      if (label) label.textContent = selection.entityId;
      const bimId = document.querySelector(".asset-inspector .info-value.mono");
      if (bimId) bimId.textContent = selection.entityId;
    }
  });
}

function trendSvg(sensorId = 1001) {
  const data = db.Historical_Sensor_Readings
    .filter((r) => r.sensor_id === Number(sensorId))
    .slice()
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  if (!data.length) {
    return `<div class="empty-chart">No historical readings are stored for this sensor yet.</div>`;
  }

  const sensor = db.Sensors.find((s) => s.sensor_id === Number(sensorId));
  const values = data.map((d) => Number(d.value)).filter(Number.isFinite);
  const width = 700, height = 125, px = 34, py = 13;
  let min = Math.min(...values), max = Math.max(...values);
  const isSupplyTemp = sensor?.sensor_type === "Supply Air Temperature";
  if (isSupplyTemp) {
    min = Math.min(min, 20.0);
    max = Math.max(max, 20.8);
  }
  const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.05);
  const pad = span * 0.16;
  min -= pad;
  max += pad;
  const x = (i) => px + (i / Math.max(1, values.length - 1)) * (width - px * 2);
  const y = (v) => py + ((max - v) / Math.max(0.0001, max - min)) * (height - py * 2 - 14);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${px},${height - 18} ${points} ${width - px},${height - 18}`;
  const ticks = Array.from({ length: 5 }, (_, i) => max - (i * (max - min) / 4));
  const decimals = sensor?.unit === "Pa" || sensor?.unit === "%" ? 0 : 1;
  const grid = ticks.map((t) => `<line class="chart-grid" x1="${px}" x2="${width-px}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-label" x="1" y="${y(t)+3}">${t.toFixed(decimals)}</text>`).join("");
  const labelIndices = [...new Set([0, Math.floor((data.length-1)*0.25), Math.floor((data.length-1)*0.5), Math.floor((data.length-1)*0.75), data.length-1])];
  const labels = labelIndices.map((i) => `<text class="chart-label" x="${x(i)}" y="${height-2}" text-anchor="middle">${String(data[i]?.timestamp || "").slice(11,16)}</text>`).join("");
  const references = isSupplyTemp
    ? `<line class="chart-threshold" x1="${px}" x2="${width-px}" y1="${y(20)}" y2="${y(20)}"/><line class="chart-line-secondary" x1="${px}" x2="${width-px}" y1="${y(20.8)}" y2="${y(20.8)}"/>`
    : "";
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(sensor?.sensor_type || "Sensor")} trend">
    <defs><linearGradient id="trendFill-${sensorId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff7a00" stop-opacity=".18"/><stop offset="100%" stop-color="#ff7a00" stop-opacity="0"/></linearGradient></defs>
    ${grid}${references}
    <polygon class="chart-area" style="fill:url(#trendFill-${sensorId})" points="${area}"/>
    <polyline class="chart-line" points="${points}"/>
    ${labels}
  </svg>`;
}

function trendPanelHtml() {
  const sensor = db.Sensors.find((s) => s.sensor_id === 1001) || db.Sensors[0];
  const asset = sensor ? getAssetById(sensor.asset_id) : null;
  const reading = sensor ? getReading(sensor.sensor_id) : null;
  const current = reading ? Number(reading.value) : null;
  const expected = 21.0;
  const delta = current == null ? null : current - expected;
  return `<section class="panel trend-panel">
    <div class="panel-header compact-header"><div class="section-title">≋ Sensor Trend</div><div class="section-meta">${escapeHtml(asset?.asset_name || "Asset")} · POSTGRESQL DEMO</div></div>
    <div class="trend-body">
      <div class="trend-controls">
        <select class="select" style="height:26px"><option>Supply Air Temperature</option><option>Airflow</option><option>Static Pressure</option></select>
        <div style="display:flex;align-items:center;gap:12px"><div class="segmented"><button>1H</button><button>6H</button><button class="active">24H</button><button>7D</button></div><div class="trend-value"><strong>${current == null ? "—" : current.toFixed(1)} <span style="font-size:9px;color:#8798a4">${escapeHtml(sensor?.unit || "")}</span></strong><div class="trend-delta">${delta == null ? "No reading" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} °C from demo reference`}</div></div></div>
      </div>
      <div class="chart-wrap">${trendSvg()}</div>
    </div>
  </section>`;
}

function anomalyRowsHtml({ compact = false } = {}) {
  let rows = getLatestAnomalyRows();
  if (state.anomalyStatus !== "all") rows = rows.filter((r) => r.anomaly_status === state.anomalyStatus);
  if (state.anomalyAsset !== "all") rows = rows.filter((r) => r.asset?.asset_name === state.anomalyAsset);
  return rows.map((r) => {
    const result = r.description || "Anomalous behaviour detected";
    const score = Number(r.anomaly_score).toFixed(2);
    if (compact) {
      return `<tr data-anomaly-asset="${r.asset?.asset_id}" data-anomaly-id="${r.anomaly_id}"><td>${formatShortTime(r.timestamp)}</td><td class="primary">${escapeHtml(r.asset?.asset_name || "—")}</td><td>${escapeHtml(r.space?.space_name || r.floor?.floor_name || "—")}</td><td>${escapeHtml(result)}</td><td>${statusPill(r.anomaly_status)}</td><td class="accent">${score}</td></tr>`;
    }
    return `<tr data-anomaly-asset="${r.asset?.asset_id}" data-anomaly-id="${r.anomaly_id}"><td class="primary">${formatShortTime(r.timestamp)}</td><td class="primary">${escapeHtml(r.asset?.asset_name || "—")}</td><td>${escapeHtml(r.sensor?.sensor_type || "—")}</td><td class="accent">${score}</td><td>${escapeHtml(result)}</td><td>${statusPill(r.severity)}</td><td>AE-v1.3</td><td>${statusPill(r.anomaly_status)}</td></tr>`;
  }).join("");
}

function recentAnomaliesPanelHtml() {
  return `<section class="panel anomaly-panel">
    <div class="panel-header compact-header"><div class="section-title">△ Recent Anomalies / Faults</div><button class="btn btn-ghost" style="height:26px;min-height:26px" data-view-all-anomalies>View all ↗</button></div>
    <div class="panel-body">
      <div class="anomaly-filters">
        <select class="select" id="dashStatusFilter"><option value="all">All Status</option><option>New</option><option>Review</option><option>Acknowledged</option><option>Closed</option></select>
        <select class="select" id="dashAssetFilter"><option value="all">All Assets</option>${db.Assets.map(a=>`<option>${a.asset_name}</option>`).join("")}</select>
      </div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Asset</th><th>Location</th><th>AI Result</th><th>Status</th><th>Score</th></tr></thead><tbody>${anomalyRowsHtml({compact:true})}</tbody></table></div>
    </div>
  </section>`;
}

function bindAnomalyRows() {
  document.querySelectorAll("[data-anomaly-asset]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = Number(row.dataset.anomalyAsset);
      if (id) state.selectedAssetId = id;
      if (pathName() === "/") render();
      else go(`/assets/${id}`);
    });
  });
}

function renderDashboard() {
  destroyActiveViewer();
  const html = `<div class="page dashboard-page">
    <div class="dashboard-heading">
      <div><div class="eyebrow">Digital Twin Operations</div><h1 class="page-title">Building Asset Monitoring</h1><p class="page-subtitle">Live BIM-linked asset and AI status overview</p></div>
      <div class="dashboard-controls"><span style="color:#7d909c;font-size:9px">▥</span><select class="select"><option>Snowdon Towers</option></select><select class="select"><option>All Floors</option></select><button class="btn" data-go-bim>View BIM Model ↗</button></div>
    </div>
    <div class="summary-strip">
      <div class="summary-item"><div class="summary-label">Monitored Assets</div><div class="summary-value">${db.Assets.length} <small>PILOT ASSETS</small></div></div>
      <div class="summary-item"><div class="summary-label"><span class="status-dot green"></span>Normal</div><div class="summary-value">${db.Assets.filter(a => assetAnomalyStatus(a.asset_id) === "Normal").length}</div></div>
      <div class="summary-item alert"><div class="summary-label"><span class="status-dot orange"></span>Active Anomalies</div><div class="summary-value" style="color:#ffb25f">${db.Anomaly_Results.filter(a => a.anomaly_status !== "Closed").length}</div></div>
      <div class="summary-item"><div class="summary-label"><span class="status-dot red"></span>Critical Faults</div><div class="summary-value">${db.Anomaly_Results.filter(a => a.severity === "Critical" && a.anomaly_status !== "Closed").length}</div></div>
      <div class="summary-sync"><span><span class="status-dot green"></span>PostgreSQL Demo</span><span style="color:#445661">|</span><span>Last update</span><strong class="mono">${formatTime(latestReadingTimestamp())}</strong></div>
    </div>
    <div class="dashboard-upper">${viewerPanelHtml({stageId:"dashboardViewer"})}${assetInspectorHtml()}</div>
    <div class="dashboard-lower">${trendPanelHtml()}${recentAnomaliesPanelHtml()}</div>
    <div class="page-footer-line" style="margin-top:6px"><span>SNOWDON TOWERS &nbsp;•&nbsp; BIM-INTEGRATED ASSET MONITORING</span><span>Demonstration data · Not connected to a live BMS</span></div>
  </div>`;
  shell(html, { activePath: "/", breadcrumb: "Building Asset Monitoring", noScroll: true });
  document.querySelector("[data-go-bim]")?.addEventListener("click", () => go("/bim-viewer"));
  document.querySelector("[data-view-all-anomalies]")?.addEventListener("click", () => go("/anomalies"));
  bindAssetInspector();
  bindAnomalyRows();
  requestAnimationFrame(() => initViewer("dashboardViewer"));
}

function renderBimViewer() {
  destroyActiveViewer();
  const html = `<div class="page" style="height:100%;display:flex;flex-direction:column;overflow:hidden;padding:14px 16px">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;min-height:0;flex:1">${viewerPanelHtml({stageId:"mainViewer", detailed:true})}${assetInspectorHtml({detailed:true})}</div>
    <div class="page-footer-line"><span>SNOWDON TOWERS &nbsp;•&nbsp; BIM VIEWER</span><span>Click a BIM element to select and inspect it</span></div>
  </div>`;
  shell(html, { activePath: "/bim-viewer", breadcrumb: "BIM Viewer", noScroll: true });
  bindAssetInspector();
  requestAnimationFrame(() => initViewer("mainViewer"));
}

function assetsTableRows() {
  const q = state.assetSearch.trim().toLowerCase();
  return db.Assets.filter((asset) => {
    const context = getAssetContext(asset);
    const floorMatch = state.assetFloor === "all" || String(context?.floor?.floor_id) === state.assetFloor;
    const searchMatch = !q || [asset.asset_name, asset.asset_type, context?.space?.space_name, context?.floor?.floor_name].some((v) => String(v || "").toLowerCase().includes(q));
    return floorMatch && searchMatch;
  }).map((asset) => {
    const context = getAssetContext(asset);
    const status = assetAnomalyStatus(asset.asset_id);
    const latest = context.readings[0]?.reading?.latest_update;
    return `<tr data-asset-row="${asset.asset_id}"><td class="primary" style="color:#ffb25f">${asset.asset_name}</td><td>${asset.asset_type}</td><td>${context.floor?.floor_name || "—"}</td><td>HVAC</td><td>${statusPill(asset.status)}</td><td>${statusPill(status)}</td><td class="mono">${formatTime(latest)}</td><td>↗</td></tr>`;
  }).join("");
}

function renderAssets() {
  destroyActiveViewer();
  const floorOptions = db.Building_Floors.map(f=>`<option value="${f.floor_id}">${f.floor_name}</option>`).join("");
  const html = `<div class="page">
    ${pageHeading({eyebrow:"Asset Register", title:"Assets", subtitle:"Snowdon Towers · BIM-linked HVAC pilot assets", actions:'<span class="demo-label" style="border:1px solid #34454f;padding:7px 9px;border-radius:6px">DEMONSTRATION DATA</span>'})}
    <section class="panel">
      <div class="search-panel"><input id="assetSearch" class="field" placeholder="⌕  Search assets…" value="${escapeHtml(state.assetSearch)}"><select id="assetFloor" class="select"><option value="all">All Floors</option>${floorOptions}</select></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Asset</th><th>Type</th><th>Floor</th><th>System</th><th>Live Status</th><th>Anomaly Status</th><th>Last Update</th><th></th></tr></thead><tbody id="assetsBody">${assetsTableRows()}</tbody></table></div>
      <div class="table-foot">4 pilot assets · BMS simulation</div>
    </section>
    <div class="page-footer-line"><span>SNOWDON TOWERS &nbsp;•&nbsp; BIM-INTEGRATED ASSET MONITORING</span><span>Demonstration data · Not connected to a live BMS</span></div>
  </div>`;
  shell(html, { activePath: "/assets", breadcrumb: "Assets" });
  const search = document.getElementById("assetSearch");
  const floor = document.getElementById("assetFloor");
  if (floor) floor.value = state.assetFloor;
  const refresh = () => {
    document.getElementById("assetsBody").innerHTML = assetsTableRows();
    bindAssetRows();
  };
  search?.addEventListener("input", () => { state.assetSearch = search.value; refresh(); });
  floor?.addEventListener("change", () => { state.assetFloor = floor.value; refresh(); });
  bindAssetRows();
}

function bindAssetRows() {
  document.querySelectorAll("[data-asset-row]").forEach((row) => row.addEventListener("click", () => {
    state.selectedAssetId = Number(row.dataset.assetRow);
    go(`/assets/${row.dataset.assetRow}`);
  }));
}

function renderAssetDetail(assetId) {
  destroyActiveViewer();
  const asset = getAssetById(assetId) || db.Assets[0];
  state.selectedAssetId = asset.asset_id;
  const context = getAssetContext(asset);
  const anomaly = context.anomalies[0];
  const maintenance = db.Maintenance_Events.filter((m) => m.asset_id === asset.asset_id);
  const rows = context.readings.map(({sensor_type,unit,reading})=>`<tr><td class="primary">${sensor_type}</td><td>${reading?.value ?? "—"}</td><td>${unit}</td><td>${reading?.quality ?? "—"}</td><td class="mono">${formatTime(reading?.latest_update)}</td></tr>`).join("");
  const html = `<div class="page">
    ${pageHeading({eyebrow:"Asset Detail", title:asset.asset_name, subtitle:`${asset.asset_type} · ${context.space?.space_name || ""}`, actions:`${statusPill(asset.status)} ${statusPill(assetAnomalyStatus(asset.asset_id))} <button class="btn btn-primary" data-locate-bim>Locate in BIM ↗</button>`})}
    <div class="card-grid two">
      <section class="panel"><div class="panel-header"><div class="section-title">Asset Overview</div></div><div class="panel-body">
        <div class="info-row"><span class="info-key">Asset ID</span><span class="info-value">AST-${String(asset.asset_id).padStart(4,"0")}</span></div>
        <div class="info-row"><span class="info-key">BIM Element ID</span><span class="info-value mono">${asset.ifc_global_id}</span></div>
        <div class="info-row"><span class="info-key">Floor</span><span class="info-value">${context.floor?.floor_name || "—"}</span></div>
        <div class="info-row"><span class="info-key">Space</span><span class="info-value">${context.space?.space_name || "—"}</span></div>
        <div class="info-row"><span class="info-key">Installed</span><span class="info-value">${asset.installation_date}</span></div>
        <div class="info-row"><span class="info-key">Data Source</span><span class="info-value">BMS Simulation</span></div>
      </div></section>
      <section class="panel"><div class="panel-header"><div class="section-title">Current AI Summary</div></div><div class="panel-body">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px"><div><div class="eyebrow">Latest status</div><div style="font-size:20px;font-weight:900;color:${anomaly ? '#ffad55' : '#6fe3a4'}">${anomaly ? 'Anomaly detected' : 'Normal'}</div></div><div class="ai-score">${anomaly ? Number(anomaly.anomaly_score).toFixed(2) : '—'}<small>Anomaly Score</small></div></div>
        <div class="info-row"><span class="info-key">Detection Model</span><span class="info-value">Multivariate Autoencoder</span></div>
        <div class="info-row"><span class="info-key">Interpretation</span><span class="info-value">${anomaly ? anomaly.description : 'No active abnormal behaviour'}</span></div>
        <div style="margin-top:12px"><button class="btn btn-primary" data-explain-anomaly>Explain with AI</button></div>
      </div></section>
    </div>
    <section class="panel" style="margin-top:12px"><div class="panel-header"><div class="section-title">Current Sensor Values</div><div class="section-meta">Demo readings</div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Quality</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="panel" style="margin-top:12px"><div class="panel-header"><div class="section-title">Maintenance Events</div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>${maintenance.length ? maintenance.map(m=>`<tr><td>${m.event_date}</td><td class="primary">${m.event_type}</td><td>${statusPill(m.maintenance_status)}</td><td>${m.description}</td></tr>`).join('') : '<tr><td colspan="4">No maintenance records in demo data.</td></tr>'}</tbody></table></div></section>
  </div>`;
  shell(html, { activePath: "/assets", breadcrumb: `Assets / ${asset.asset_name}` });
  document.querySelector("[data-locate-bim]")?.addEventListener("click", () => go("/bim-viewer"));
  document.querySelector("[data-explain-anomaly]")?.addEventListener("click", () => { state.aiDrawerOpen = true; render(); });
}

function sensorOptions(assetId) {
  return getSensorsForAsset(assetId).map((s)=>`<option value="${s.sensor_id}">${s.sensor_type}</option>`).join("");
}

function sensorHistoryRows() {
  const rows = db.Historical_Sensor_Readings
    .filter((r) => r.sensor_id === Number(state.sensorId))
    .slice()
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const sensor = db.Sensors.find((s)=>s.sensor_id===Number(state.sensorId));
  const asset = sensor ? getAssetById(sensor.asset_id) : null;
  if (!rows.length) return `<tr><td colspan="7" class="empty-table-cell">No historical PostgreSQL readings are stored for this sensor.</td></tr>`;
  return rows.map((r)=>`<tr><td class="mono">${String(r.timestamp).replace('T',' ')}</td><td>${sensor?.sensor_id || '—'}</td><td class="primary">${asset?.asset_name || '—'}</td><td>${sensor?.sensor_type || '—'}</td><td class="primary">${Number(r.value).toFixed(sensor?.unit==='Pa'?0:2)}</td><td>${sensor?.unit || '—'}</td><td><span class="status-dot ${r.quality === 'Good' ? 'green' : 'orange'}"></span>${escapeHtml(r.quality)}</td></tr>`).join('');
}

function renderSensorData() {
  destroyActiveViewer();
  const assets = db.Assets.map((a)=>`<option value="${a.asset_id}">${a.asset_name}</option>`).join("");
  const sensor = db.Sensors.find((s) => s.sensor_id === Number(state.sensorId)) || getSensorsForAsset(state.sensorAssetId)[0];
  if (sensor) state.sensorId = sensor.sensor_id;
  const reading = sensor ? getReading(sensor.sensor_id) : null;
  const current = reading ? Number(reading.value) : null;
  const isTemp = sensor?.sensor_type === "Supply Air Temperature";
  const reference = 21.0;
  const delta = isTemp && current != null ? current - reference : null;
  const html = `<div class="page">
    ${pageHeading({eyebrow:"Historical Monitoring", title:"Sensor Data", subtitle:"Time-series signals · PostgreSQL demo records · Quality-controlled demonstration readings"})}
    <section class="panel filters-bar">
      <div class="filter-group"><label class="label">Building</label><select class="select"><option>Snowdon Towers</option></select></div>
      <div class="filter-group"><label class="label">Floor</label><select class="select"><option>All Floors</option>${db.Building_Floors.map(f=>`<option>${f.floor_name}</option>`).join('')}</select></div>
      <div class="filter-group"><label class="label">Asset</label><select class="select" id="sensorAsset">${assets}</select></div>
      <div class="filter-group"><label class="label">Sensor</label><select class="select" id="sensorSelect">${sensorOptions(state.sensorAssetId)}</select></div>
      <div class="filter-group"><label class="label">Date Range</label><select class="select"><option>24H</option><option>7D</option><option>30D</option></select></div>
    </section>
    <section class="panel" style="height:315px;margin-bottom:12px"><div class="panel-header"><div class="section-title">≋ Sensor Trend</div><div class="section-meta">PostgreSQL demonstration data</div></div><div class="panel-body" style="height:calc(100% - 46px);display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between"><span class="section-meta">${escapeHtml(sensor?.sensor_type || 'Sensor')} ${isTemp ? '&nbsp; ··· Expected Reference' : ''}</span><div class="trend-value"><strong>${current == null ? '—' : current.toFixed(sensor?.unit === 'Pa' ? 0 : 1)} <span style="font-size:9px;color:#8798a4">${escapeHtml(sensor?.unit || '')}</span></strong><div class="trend-delta">${delta == null ? 'Latest PostgreSQL reading' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} °C from demo reference`}</div></div></div><div class="chart-wrap">${trendSvg(state.sensorId)}</div></div></section>
    <section class="panel"><div class="panel-header"><div class="section-title">Sensor Readings</div><div class="section-meta">PostgreSQL rows for sensor ${escapeHtml(sensor?.sensor_id || '—')}</div></div><div class="table-wrap" style="max-height:330px"><table class="data-table"><thead><tr><th>Timestamp</th><th>Sensor ID</th><th>Asset</th><th>Parameter</th><th>Value</th><th>Unit</th><th>Quality</th></tr></thead><tbody id="sensorReadingsBody">${sensorHistoryRows()}</tbody></table></div></section>
  </div>`;
  shell(html, { activePath: "/sensor-data", breadcrumb: "Sensor Data" });
  const assetSel = document.getElementById("sensorAsset");
  const sensorSel = document.getElementById("sensorSelect");
  assetSel.value = String(state.sensorAssetId);
  sensorSel.value = String(state.sensorId);
  assetSel.addEventListener("change", () => {
    state.sensorAssetId = Number(assetSel.value);
    const sensors = getSensorsForAsset(state.sensorAssetId);
    state.sensorId = sensors[0]?.sensor_id || state.sensorId;
    renderSensorData();
  });
  sensorSel.addEventListener("change", () => {
    state.sensorId = Number(sensorSel.value);
    renderSensorData();
  });
}

function renderAnomalies() {
  destroyActiveViewer();
  const html = `<div class="page">
    ${pageHeading({eyebrow:"AI Investigation", title:"Anomalies / Faults", subtitle:"Detection evidence and review workflow · Acknowledgement does not indicate repair", actions:'<span class="demo-label" style="border:1px solid #34454f;padding:7px 9px;border-radius:6px">DEMONSTRATION DATA</span>'})}
    <section class="panel filters-bar six">
      <div class="filter-group"><label class="label">Date Range</label><select class="select"><option>Today</option><option>7 Days</option><option>30 Days</option></select></div>
      <div class="filter-group"><label class="label">Asset</label><select class="select" id="anomalyAsset"><option value="all">All Assets</option>${db.Assets.map(a=>`<option value="${a.asset_name}">${a.asset_name}</option>`).join('')}</select></div>
      <div class="filter-group"><label class="label">Floor</label><select class="select"><option>All Floors</option></select></div>
      <div class="filter-group"><label class="label">Status</label><select class="select" id="anomalyStatus"><option value="all">All Status</option><option>New</option><option>Review</option><option>Acknowledged</option><option>Closed</option></select></div>
      <div class="filter-group"><label class="label">Model</label><select class="select"><option>All Models</option><option>AE-v1.3</option><option>SVM-v2.1</option></select></div>
      <div class="filter-group"><label class="label">Severity</label><select class="select"><option>All Severities</option><option>High</option><option>Medium</option><option>Low</option></select></div>
    </section>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Detected</th><th>Asset</th><th>Sensor</th><th>Anomaly Score</th><th>Detection Result</th><th>Severity</th><th>Model</th><th>Status</th></tr></thead><tbody id="anomalyBody">${anomalyRowsHtml()}</tbody></table></div></section>
    <div class="page-footer-line"><span>Click an anomaly to open the associated asset</span><span>Anomaly records are loaded from PostgreSQL demonstration data</span></div>
  </div>`;
  shell(html, { activePath: "/anomalies", breadcrumb: "Anomalies / Faults" });
  const status = document.getElementById("anomalyStatus");
  const asset = document.getElementById("anomalyAsset");
  status.value = state.anomalyStatus;
  asset.value = state.anomalyAsset;
  const refresh = () => { document.getElementById("anomalyBody").innerHTML = anomalyRowsHtml(); bindAnomalyRows(); };
  status.addEventListener("change", () => { state.anomalyStatus = status.value; refresh(); });
  asset.addEventListener("change", () => { state.anomalyAsset = asset.value; refresh(); });
  bindAnomalyRows();
}

function renderModelResults() {
  destroyActiveViewer();
  const m = modelEvaluationDemo;
  const metrics = m.metrics.map(x=>`<div class="metric-cell"><div class="metric-label">${x.label}</div><div class="metric-value">${x.value}</div><div class="metric-note">${x.note}</div></div>`).join('');
  const rows = m.comparison.map(x=>`<tr><td class="primary">${x.model}</td><td>${x.purpose}</td><td>${x.version}</td><td>${x.precision}</td><td>${x.recall}</td><td>${x.f1}</td><td>${x.deployment}</td></tr>`).join('');
  const html = `<div class="page">
    ${pageHeading({eyebrow:"Model Evaluation", title:"Model Results", subtitle:"Evaluation workspace · Validation metrics are intentionally not fabricated", actions:'<span class="demo-label" style="border:1px solid #34454f;padding:7px 9px;border-radius:6px">DEMONSTRATION CONFIGURATION</span>'})}
    <section class="panel">
      <div class="model-hero"><div class="model-id"><div class="model-icon">⌘</div><div><div class="model-name">${m.deployed.name}</div><div class="model-sub">${m.deployed.version} &nbsp;·&nbsp; ${m.deployed.purpose}</div></div></div>${statusPill('normal','Demo Active')}</div>
      <div class="metrics-grid">${metrics}</div>
    </section>
    <section class="panel" style="margin-top:12px"><div class="panel-header"><div class="section-title">Model Comparison</div><div class="section-meta">No fabricated performance metrics</div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Model</th><th>Purpose</th><th>Version</th><th>Precision</th><th>Recall</th><th>F1</th><th>Deployment</th></tr></thead><tbody>${rows}</tbody></table></div><div class="table-foot">Metrics should be supplied from a labelled evaluation dataset before operational use.</div></section>
  </div>`;
  shell(html, { activePath: "/model-results", breadcrumb: "Model Results" });
}

function renderSettings() {
  destroyActiveViewer();
  const cards = [
    ["▱ Data Sources", [["Current source","BMS Simulation"],["Mode","Demonstration · static snapshots"]]],
    ["⌁ MQTT Connection", [["Connection","Not configured"],["Credentials","Managed securely outside this interface"]]],
    ["▤ Database Connection", [["Engine", connectionState.status === "connected" ? "PostgreSQL · Connected" : "PostgreSQL · Offline"],["Database", connectionState.database],["Pilot data","Temporary records loaded through REST API"]]],
    ["▥ Digital Twin Configuration", [["Building","Snowdon Towers"],["Floors","18"],["Viewer","xeokit integration active"],["Model","Snowdon Towers Sample Architectural.xkt"]]],
    ["⌘ AI Model Configuration", [["Detector","Multivariate Autoencoder · AE-v1.3"],["Classifier","Not connected"],["Assistant","Explanations grounded in PostgreSQL demo context"]]],
    ["⬡ User / Security", [["Access","Prototype workspace"],["Secrets","Never displayed in this interface"]]],
    ["ⓘ System Information", [["Application","Asset Intelligence — AI-Driven Building Digital Twin"],["Version","PoC v1.2 · PostgreSQL API"],["Operational readiness","Demonstration only"]]]
  ];
  const html = `<div class="page">
    ${pageHeading({eyebrow:"Workspace Configuration", title:"Settings", subtitle:"Read-only connection overview · No credentials are exposed"})}
    <div class="settings-grid">${cards.map(([title, rows])=>`<section class="panel settings-card"><div class="panel-header"><div class="section-title">${title}</div></div><div class="setting-list">${rows.map(([k,v])=>`<div class="setting-row"><span class="setting-key">${k}</span><span class="setting-value">${v}</span></div>`).join('')}</div></section>`).join('')}</div>
    <div class="page-footer-line"><span>SNOWDON TOWERS &nbsp;•&nbsp; BIM-INTEGRATED ASSET MONITORING</span><span>Demonstration data · Not connected to a live BMS</span></div>
  </div>`;
  shell(html, { activePath: "/settings", breadcrumb: "Settings" });
}

function assistantDrawerHtml() {
  const context = selectedAssetContext();
  const anomaly = context.anomalies[0];
  return `<div class="drawer-backdrop" data-close-assistant></div>
    <aside class="drawer" aria-label="Asset Intelligence Assistant">
      <div class="drawer-header"><div><div class="drawer-title">□ Asset Intelligence Assistant</div><div class="drawer-subtitle">Grounded asset and engineering explanation</div></div><button class="icon-button" data-close-assistant>✕</button></div>
      <div class="drawer-body">
        <div class="context-chips"><span class="context-chip">${context.asset.asset_name}</span><span class="context-chip">${context.space?.space_name || 'Location'}</span><span class="context-chip">Anomaly Score ${anomaly?.anomaly_score?.toFixed(2) || '—'}</span></div>
        <div class="assistant-intro"><div class="assistant-intro-icon">□</div><h3>Understand the asset context</h3><p>Explore the demonstration signals and detection evidence. Responses are grounded in the temporary sensor and anomaly records loaded from PostgreSQL. Engineering documents and live BMS readings are not connected.</p></div>
        <div class="suggestions">
          <button class="suggestion-btn" data-ai-question="What changed before this anomaly?">What changed before this anomaly? <span>↑</span></button>
          <button class="suggestion-btn" data-ai-question="Why was this asset flagged?">Why was this asset flagged? <span>↑</span></button>
          <button class="suggestion-btn" data-ai-question="Show the recent sensor trend.">Show the recent sensor trend. <span>↑</span></button>
          <button class="suggestion-btn" data-ai-question="What does this airflow pattern mean?">What does this airflow pattern mean? <span>↑</span></button>
        </div>
        ${state.aiResponse ? `<div class="assistant-response">${escapeHtml(state.aiResponse)}</div>` : ""}
      </div>
      <div class="drawer-compose"><div class="compose-box"><textarea id="assistantInput" placeholder="Ask about this asset, its sensor behaviour, or the detected anomaly…"></textarea><button class="send-btn" id="assistantSend">↑</button></div><div class="assistant-disclaimer">ⓘ AI-generated explanation. Verify maintenance decisions using engineering procedures.</div></div>
    </aside>`;
}

function assistantAnswer(question) {
  const q = question.toLowerCase();
  const context = selectedAssetContext();
  const anomaly = context.anomalies[0];
  if (q.includes("changed") || q.includes("trend")) {
    const tempSensor = context.readings.find((r) => r.sensor_type === "Supply Air Temperature");
    const currentTemp = tempSensor?.reading?.value;
    return `In the PostgreSQL demonstration history, the supply-air temperature trend changes over the monitored period${currentTemp != null ? ` and the latest stored value is ${currentTemp} ${tempSensor.unit}` : ""}. Review the airflow, static-pressure and temperature records over the same time window before treating the anomaly as a maintenance diagnosis.`;
  }
  if (q.includes("why") || q.includes("flag")) return `The demonstration detector flagged ${context.asset.asset_name} because its multivariate signal pattern produced an anomaly score of ${anomaly?.anomaly_score?.toFixed(2) || '0.87'}. This score indicates deviation from the learned or configured normal pattern; it is not, by itself, a confirmed fault diagnosis.`;
  if (q.includes("airflow")) return "The current PostgreSQL anomaly record describes an airflow deviation. No supervised fault-classification result is connected in this build, so this should remain an anomaly requiring technical review rather than a confirmed diagnosis.";
  return `For ${context.asset.asset_name}, the current demo state is ${assetAnomalyStatus(context.asset.asset_id)}. The latest readings and anomaly evidence can be reviewed in the Sensor Data and Anomalies / Faults pages.`;
}

function bindAssistantDrawer() {
  document.querySelectorAll("[data-close-assistant]").forEach((el)=>el.addEventListener("click",()=>{ state.aiDrawerOpen=false; state.aiResponse=""; render(); }));
  document.querySelectorAll("[data-ai-question]").forEach((el)=>el.addEventListener("click",()=>{ state.aiResponse=assistantAnswer(el.dataset.aiQuestion); render(); }));
  const input = document.getElementById("assistantInput");
  const send = document.getElementById("assistantSend");
  const submit = () => {
    const q = input?.value.trim();
    if (!q) return;
    state.aiResponse = assistantAnswer(q);
    render();
  };
  send?.addEventListener("click", submit);
  input?.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && !e.shiftKey){e.preventDefault();submit();} });
}

function renderAuth(kind) {
  destroyActiveViewer();
  const isRegister = kind === "register";
  app.innerHTML = `<div class="auth-page">
    <section class="auth-visual">
      <div class="auth-brand"><div class="brand-mark"></div><div><div style="font-weight:900">Asset Intelligence</div><div class="brand-subtitle" style="color:#9da8af">AI-Driven Digital Twin</div></div></div>
      <div><h2>Building operations with <span>clear safety status.</span></h2><p>A high-contrast BIM and asset-monitoring workspace designed for facility teams, technical staff and site users. Safety orange, amber, red and green states make abnormal conditions easier to recognise at a glance.</p></div>
      <div class="auth-safety-note">Prototype environment — alerts and sensor values shown in this project are demonstration data, not live building-control commands.</div>
    </section>
    <main class="auth-main"><div class="auth-wrap">
      <div class="auth-icon">${isRegister ? "♙+" : "↪"}</div>
      <h1 class="auth-heading">${isRegister ? "Create your account" : "Welcome back"}</h1>
      <p class="auth-sub">${isRegister ? "Sign up to get started" : "Log in to your account"}</p>
      <section class="auth-card">
        <button class="auth-btn google" id="googleAuth"><span style="color:#dd6200;font-weight:900">G</span> &nbsp; Continue with Google</button>
        <div class="auth-divider">OR</div>
        <form class="auth-form" id="authForm">
          <div><label class="label">Email</label><input class="field" id="authEmail" type="email" placeholder="you@example.com" required></div>
          <div><div class="auth-helper"><label class="label">Password</label>${!isRegister ? '<span class="auth-link" style="font-size:10px">Forgot password?</span>' : ''}</div><input class="field" id="authPassword" type="password" placeholder="••••••••" minlength="6" required></div>
          ${isRegister ? '<div><label class="label">Confirm Password</label><input class="field" id="authConfirm" type="password" placeholder="••••••••" minlength="6" required></div>' : ''}
          <div class="auth-error" id="authError"></div>
          <button class="auth-btn primary" type="submit">${isRegister ? "Create account" : "Log in"}</button>
        </form>
      </section>
      <div class="auth-bottom">${isRegister ? 'Already have an account? <span class="auth-link" data-auth-link="/login">Log in</span>' : 'Don\'t have an account? <span class="auth-link" data-auth-link="/register">Create one</span>'}</div>
    </div></main>
  </div>`;

  document.querySelectorAll("[data-auth-link]").forEach(el=>el.addEventListener("click",()=>go(el.dataset.authLink)));
  document.getElementById("googleAuth")?.addEventListener("click",()=>go("/"));
  document.getElementById("authForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const error = document.getElementById("authError");
    if (isRegister) {
      const confirm = document.getElementById("authConfirm").value;
      if (password !== confirm) { error.textContent = "Passwords do not match."; return; }
      localStorage.setItem("assetIntelligenceDemoUser", JSON.stringify({email}));
    }
    if (!email || password.length < 6) { error.textContent = "Enter a valid email and a password of at least 6 characters."; return; }
    go("/");
  });
}

function renderNotFound() {
  destroyActiveViewer();
  shell(`<div class="page"><section class="panel" style="max-width:620px;margin:70px auto;padding:30px"><div class="eyebrow">404</div><h1 class="page-title">Page not found</h1><p class="page-subtitle" style="margin-bottom:18px">The requested prototype route does not exist.</p><button class="btn btn-primary" id="home404">Return to Dashboard</button></section></div>`, {breadcrumb:"Not Found"});
  document.getElementById("home404")?.addEventListener("click",()=>go("/"));
}

function render() {
  const path = pathName();
  if (path === "/login") return renderAuth("login");
  if (path === "/register") return renderAuth("register");
  if (path === "/") return renderDashboard();
  if (path === "/bim-viewer") return renderBimViewer();
  if (path === "/assets") return renderAssets();
  if (path.startsWith("/assets/")) return renderAssetDetail(path.split("/")[2]);
  if (path === "/sensor-data") return renderSensorData();
  if (path === "/anomalies") return renderAnomalies();
  if (path === "/model-results") return renderModelResults();
  if (path === "/settings") return renderSettings();
  return renderNotFound();
}

function renderDatabaseError(error) {
  destroyActiveViewer();
  app.innerHTML = `<div class="database-error-page"><section class="database-error-card"><div class="eyebrow">Database Connection</div><h1>PostgreSQL is not available</h1><p>The frontend is ready, but it could not load the temporary Digital Twin records from the backend API.</p><div class="database-error-detail">${escapeHtml(error?.message || "Unknown connection error")}</div><ol><li>Make sure PostgreSQL is running.</li><li>Create the <strong>digital_twin</strong> database.</li><li>Run <code>psql -d digital_twin -f database/postgres_init.sql</code>.</li><li>Check <code>.env</code> if your PostgreSQL user or password is different.</li><li>Restart <code>npm run dev</code>.</li></ol><button class="btn btn-primary" id="retryDatabase">Retry connection</button></section></div>`;
  document.getElementById("retryDatabase")?.addEventListener("click", initialize);
}

async function initialize() {
  app.innerHTML = `<div class="database-loading"><div class="database-loading-mark"></div><h1>Connecting to Digital Twin data</h1><p>Loading Snowdon Towers assets, sensors, readings and anomalies from PostgreSQL…</p></div>`;
  try {
    await loadDatabaseFromApi();
    if (!db.Assets.length) throw new Error("PostgreSQL connected, but no asset records were returned. Run database/postgres_init.sql.");
    if (!getAssetById(state.selectedAssetId)) state.selectedAssetId = db.Assets[0].asset_id;
    const firstSensor = getSensorsForAsset(state.selectedAssetId)[0];
    if (firstSensor && !db.Sensors.some(s => s.sensor_id === Number(state.sensorId))) state.sensorId = firstSensor.sensor_id;
    render();
  } catch (error) {
    connectionState.status = "error";
    connectionState.error = error?.message || String(error);
    renderDatabaseError(error);
  }
}

window.addEventListener("popstate", render);
initialize();
