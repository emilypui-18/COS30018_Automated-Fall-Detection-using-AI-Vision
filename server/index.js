import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

dotenv.config();

const { Pool, types } = pg;
// Keep PostgreSQL TIMESTAMP WITHOUT TIME ZONE values as plain ISO-like strings.
types.setTypeParser(1114, (value) => value?.replace(" ", "T"));

const poolOptions = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "digital_twin",
      ...(process.env.PGUSER ? { user: process.env.PGUSER } : {}),
      ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {})
    };

if (process.env.PGSSL === "true") {
  poolOptions.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolOptions);
const app = express();
const port = Number(process.env.SERVER_PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function rows(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT current_database() AS database, NOW() AS server_time");
    res.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: "PostgreSQL connection failed",
      detail: error.message
    });
  }
});

app.get("/api/bootstrap", async (_req, res) => {
  try {
    const [
      BIM_Models,
      Buildings,
      Building_Floors,
      Spaces,
      Assets,
      Maintenance_Events,
      Sensors,
      Sensor_Readings,
      Historical_Sensor_Readings,
      Anomaly_Results,
      Alerts_Status,
      Alerts_Severity,
      Alerts
    ] = await Promise.all([
      rows("SELECT * FROM bim_models ORDER BY model_id"),
      rows("SELECT * FROM buildings ORDER BY building_id"),
      rows("SELECT * FROM building_floors ORDER BY floor_level, floor_id"),
      rows("SELECT * FROM spaces ORDER BY space_id"),
      rows("SELECT * FROM assets ORDER BY asset_id"),
      rows("SELECT * FROM maintenance_events ORDER BY event_date DESC, maintenance_id"),
      rows("SELECT * FROM sensors ORDER BY sensor_id"),
      rows("SELECT * FROM sensor_readings ORDER BY sensor_id"),
      rows("SELECT * FROM historical_sensor_readings ORDER BY timestamp, sensor_id"),
      rows("SELECT * FROM anomaly_results ORDER BY timestamp DESC, anomaly_id DESC"),
      rows("SELECT * FROM alerts_status ORDER BY status_id"),
      rows("SELECT * FROM alerts_severity ORDER BY severity_id"),
      rows("SELECT * FROM alerts ORDER BY created_at DESC, alert_id DESC")
    ]);

    res.json({
      meta: {
        source: "PostgreSQL",
        database: poolOptions.database || "DATABASE_URL",
        loaded_at: new Date().toISOString(),
        demo_data: true
      },
      data: {
        BIM_Models,
        Buildings,
        Building_Floors,
        Spaces,
        Assets,
        Maintenance_Events,
        Sensors,
        Sensor_Readings,
        Historical_Sensor_Readings,
        Anomaly_Results,
        Alerts_Status,
        Alerts_Severity,
        Alerts
      }
    });
  } catch (error) {
    res.status(503).json({
      error: "Unable to load Digital Twin data from PostgreSQL",
      detail: error.message,
      hint: "Create the digital_twin database, run database/postgres_init.sql, and check your .env connection settings."
    });
  }
});

app.get("/api/assets", async (_req, res) => {
  try {
    const data = await rows(`
      SELECT a.*, s.space_name, s.space_type, f.floor_id, f.floor_name, f.floor_level
      FROM assets a
      JOIN spaces s ON s.space_id = a.space_id
      JOIN building_floors f ON f.floor_id = s.floor_id
      ORDER BY a.asset_id
    `);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/assets/:id", async (req, res) => {
  try {
    const assetId = Number(req.params.id);
    if (!Number.isInteger(assetId)) return res.status(400).json({ error: "Invalid asset id" });

    const assetRows = await rows(`
      SELECT a.*, s.space_name, s.space_type, f.floor_id, f.floor_name, f.floor_level
      FROM assets a
      JOIN spaces s ON s.space_id = a.space_id
      JOIN building_floors f ON f.floor_id = s.floor_id
      WHERE a.asset_id = $1
    `, [assetId]);
    if (!assetRows.length) return res.status(404).json({ error: "Asset not found" });

    const [sensors, maintenance, anomalies] = await Promise.all([
      rows(`
        SELECT s.*, sr.latest_update, sr.value, sr.quality
        FROM sensors s
        LEFT JOIN sensor_readings sr ON sr.sensor_id = s.sensor_id
        WHERE s.asset_id = $1
        ORDER BY s.sensor_id
      `, [assetId]),
      rows("SELECT * FROM maintenance_events WHERE asset_id = $1 ORDER BY event_date DESC", [assetId]),
      rows(`
        SELECT ar.*
        FROM anomaly_results ar
        JOIN sensors s ON s.sensor_id = ar.sensor_id
        WHERE s.asset_id = $1
        ORDER BY ar.timestamp DESC
      `, [assetId])
    ]);

    res.json({ asset: assetRows[0], sensors, maintenance, anomalies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sensors/:sensorId/history", async (req, res) => {
  try {
    const sensorId = Number(req.params.sensorId);
    if (!Number.isInteger(sensorId)) return res.status(400).json({ error: "Invalid sensor id" });
    const data = await rows(
      "SELECT * FROM historical_sensor_readings WHERE sensor_id = $1 ORDER BY timestamp",
      [sensorId]
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/anomalies", async (_req, res) => {
  try {
    const data = await rows(`
      SELECT ar.*, s.sensor_type, s.asset_id, a.asset_name,
             sp.space_name, f.floor_name
      FROM anomaly_results ar
      LEFT JOIN sensors s ON s.sensor_id = ar.sensor_id
      LEFT JOIN assets a ON a.asset_id = s.asset_id
      LEFT JOIN spaces sp ON sp.space_id = a.space_id
      LEFT JOIN building_floors f ON f.floor_id = sp.floor_id
      ORDER BY ar.timestamp DESC
    `);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/anomalies/:id/status", async (req, res) => {
  const anomalyId = Number(req.params.id);
  const allowed = new Set(["New", "Review", "Acknowledged", "Closed"]);
  const status = String(req.body?.status || "");
  if (!Number.isInteger(anomalyId)) return res.status(400).json({ error: "Invalid anomaly id" });
  if (!allowed.has(status)) return res.status(400).json({ error: "Unsupported status" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE anomaly_results SET anomaly_status = $1 WHERE anomaly_id = $2 RETURNING *",
      [status, anomalyId]
    );
    if (!updated.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Anomaly not found" });
    }
    await client.query(
      "UPDATE alerts SET alert_status = $1 WHERE anomaly_id = $2",
      [status, anomalyId]
    );
    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, () => {
  console.log(`Asset Intelligence API listening on http://localhost:${port}`);
  console.log(`PostgreSQL database: ${poolOptions.database || "DATABASE_URL"}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
