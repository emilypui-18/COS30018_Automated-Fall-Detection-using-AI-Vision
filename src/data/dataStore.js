// PostgreSQL-backed client-side data cache.
// The dashboard loads these arrays from GET /api/bootstrap at startup.

export const db = {
  BIM_Models: [],
  Buildings: [],
  Building_Floors: [],
  Spaces: [],
  Assets: [],
  Maintenance_Events: [],
  Sensors: [],
  Sensor_Readings: [],
  Historical_Sensor_Readings: [],
  Anomaly_Results: [],
  Alerts_Status: [],
  Alerts_Severity: [],
  Alerts: []
};

export const connectionState = {
  status: "connecting",
  source: "PostgreSQL",
  database: "digital_twin",
  loadedAt: null,
  error: null
};

export async function loadDatabaseFromApi() {
  connectionState.status = "connecting";
  connectionState.error = null;

  const response = await fetch("/api/bootstrap", {
    headers: { Accept: "application/json" }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail || payload.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  for (const key of Object.keys(db)) {
    db[key] = Array.isArray(payload.data?.[key]) ? payload.data[key] : [];
  }

  connectionState.status = "connected";
  connectionState.source = payload.meta?.source || "PostgreSQL";
  connectionState.database = payload.meta?.database || "digital_twin";
  connectionState.loadedAt = payload.meta?.loaded_at || new Date().toISOString();
  return payload;
}

export async function updateAnomalyStatus(anomalyId, status) {
  const response = await fetch(`/api/anomalies/${Number(anomalyId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  await loadDatabaseFromApi();
  return payload;
}

export const modelEvaluationDemo = {
  deployed: {
    name: "Multivariate Autoencoder",
    version: "AE-v1.3",
    purpose: "Multivariate sensor anomaly detection",
    status: "Demo configuration"
  },
  metrics: [
    { label: "Accuracy", value: "—", note: "Awaiting labelled evaluation" },
    { label: "Precision", value: "—", note: "Awaiting labelled evaluation" },
    { label: "Recall", value: "—", note: "Awaiting labelled evaluation" },
    { label: "F1", value: "—", note: "Awaiting labelled evaluation" },
    { label: "False Alarms", value: "—", note: "Awaiting labelled evaluation" },
    { label: "Detection Delay", value: "—", note: "Awaiting labelled evaluation" }
  ],
  comparison: [
    { model: "Autoencoder", purpose: "Anomaly detection", version: "AE-v1.3", precision: "—", recall: "—", f1: "—", deployment: "Demo configuration" },
    { model: "BOCPD", purpose: "Change-point detection", version: "—", precision: "—", recall: "—", f1: "—", deployment: "Not connected" },
    { model: "ANN", purpose: "Fault classification", version: "—", precision: "—", recall: "—", f1: "—", deployment: "Not connected" },
    { model: "SVM", purpose: "Fault classification", version: "—", precision: "—", recall: "—", f1: "—", deployment: "Not connected" }
  ]
};

export function getSpace(spaceId) {
  return db.Spaces.find((row) => row.space_id === Number(spaceId)) || null;
}

export function getFloor(floorId) {
  return db.Building_Floors.find((row) => row.floor_id === Number(floorId)) || null;
}

export function getAssetById(assetId) {
  return db.Assets.find((row) => row.asset_id === Number(assetId)) || null;
}

export function getAssetByName(name) {
  return db.Assets.find((row) => row.asset_name === name) || null;
}

export function getSensorsForAsset(assetId) {
  return db.Sensors.filter((row) => row.asset_id === Number(assetId));
}

export function getReading(sensorId) {
  return db.Sensor_Readings.find((row) => row.sensor_id === Number(sensorId)) || null;
}

export function getAssetCurrentValues(assetId) {
  return getSensorsForAsset(assetId).map((sensor) => ({
    ...sensor,
    reading: getReading(sensor.sensor_id)
  }));
}

export function getAnomaliesForAsset(assetId) {
  const sensorIds = new Set(getSensorsForAsset(assetId).map((sensor) => sensor.sensor_id));
  return db.Anomaly_Results.filter((row) => sensorIds.has(row.sensor_id));
}

export function getAssetContext(asset) {
  if (!asset) return null;
  const space = getSpace(asset.space_id);
  const floor = space ? getFloor(space.floor_id) : null;
  const readings = getAssetCurrentValues(asset.asset_id);
  const anomalies = getAnomaliesForAsset(asset.asset_id)
    .slice()
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return { asset, space, floor, readings, anomalies };
}

export function getLatestAnomalyRows() {
  return db.Anomaly_Results.map((anomaly) => {
    const sensor = db.Sensors.find((s) => s.sensor_id === Number(anomaly.sensor_id));
    const asset = sensor ? getAssetById(sensor.asset_id) : null;
    const space = asset ? getSpace(asset.space_id) : null;
    const floor = space ? getFloor(space.floor_id) : null;
    return { ...anomaly, sensor, asset, space, floor };
  }).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function parseTimestamp(timestamp) {
  if (!timestamp) return null;
  // PostgreSQL TIMESTAMP values are intentionally treated as local demonstration times.
  const normalized = String(timestamp).includes("T") ? String(timestamp) : String(timestamp).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(timestamp) {
  const date = parseTimestamp(timestamp);
  return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : (timestamp || "—");
}

export function formatShortTime(timestamp) {
  const date = parseTimestamp(timestamp);
  return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (timestamp || "—");
}
