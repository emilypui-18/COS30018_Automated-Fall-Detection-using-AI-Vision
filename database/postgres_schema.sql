DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS alerts_severity CASCADE;
DROP TABLE IF EXISTS alerts_status CASCADE;
DROP TABLE IF EXISTS anomaly_results CASCADE;
DROP TABLE IF EXISTS historical_sensor_readings CASCADE;
DROP TABLE IF EXISTS sensor_readings CASCADE;
DROP TABLE IF EXISTS sensors CASCADE;
DROP TABLE IF EXISTS maintenance_events CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS spaces CASCADE;
DROP TABLE IF EXISTS building_floors CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS bim_models CASCADE;

CREATE TABLE bim_models (
  model_id INTEGER PRIMARY KEY,
  model_name VARCHAR(255),
  file_name VARCHAR(255),
  version VARCHAR(50)
);

CREATE TABLE buildings (
  building_id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES bim_models(model_id),
  building_name VARCHAR(255),
  description TEXT
);

CREATE TABLE building_floors (
  floor_id INTEGER PRIMARY KEY,
  building_id INTEGER NOT NULL REFERENCES buildings(building_id),
  floor_name VARCHAR(100),
  floor_level INTEGER
);

CREATE TABLE spaces (
  space_id INTEGER PRIMARY KEY,
  floor_id INTEGER NOT NULL REFERENCES building_floors(floor_id),
  space_name VARCHAR(100),
  space_type VARCHAR(100)
);

CREATE TABLE assets (
  asset_id INTEGER PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES spaces(space_id),
  ifc_global_id VARCHAR(255),
  asset_name VARCHAR(255),
  asset_type VARCHAR(100),
  status VARCHAR(50),
  installation_date DATE
);

CREATE TABLE maintenance_events (
  maintenance_id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(asset_id),
  event_type VARCHAR(100),
  event_date DATE,
  description TEXT,
  maintenance_status VARCHAR(50)
);

CREATE TABLE sensors (
  sensor_id INTEGER PRIMARY KEY,
  space_id INTEGER REFERENCES spaces(space_id),
  asset_id INTEGER NOT NULL REFERENCES assets(asset_id),
  sensor_type VARCHAR(100),
  unit VARCHAR(255),
  description TEXT,
  sensor_status VARCHAR(50)
);

CREATE TABLE sensor_readings (
  sensor_id INTEGER PRIMARY KEY REFERENCES sensors(sensor_id),
  latest_update TIMESTAMP,
  value DOUBLE PRECISION,
  quality VARCHAR(50)
);

CREATE TABLE historical_sensor_readings (
  sensor_id INTEGER NOT NULL REFERENCES sensors(sensor_id),
  timestamp TIMESTAMP NOT NULL,
  value DOUBLE PRECISION,
  quality VARCHAR(50),
  PRIMARY KEY (sensor_id, timestamp)
);

CREATE TABLE anomaly_results (
  anomaly_id INTEGER PRIMARY KEY,
  sensor_id INTEGER REFERENCES sensors(sensor_id),
  timestamp TIMESTAMP,
  anomaly_score DOUBLE PRECISION,
  anomaly_status VARCHAR(50),
  severity VARCHAR(50),
  description TEXT
);

CREATE TABLE alerts_status (
  status_id INTEGER PRIMARY KEY,
  status_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE alerts_severity (
  severity_id INTEGER PRIMARY KEY,
  severity_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE alerts (
  alert_id INTEGER PRIMARY KEY,
  anomaly_id INTEGER NOT NULL REFERENCES anomaly_results(anomaly_id),
  alert_type VARCHAR(50),
  message TEXT,
  alert_severity VARCHAR(50),
  alert_status VARCHAR(50),
  created_at TIMESTAMP
);

CREATE INDEX idx_floors_building ON building_floors(building_id);
CREATE INDEX idx_spaces_floor ON spaces(floor_id);
CREATE INDEX idx_assets_space ON assets(space_id);
CREATE INDEX idx_sensors_asset ON sensors(asset_id);
CREATE INDEX idx_history_sensor_time ON historical_sensor_readings(sensor_id, timestamp);
CREATE INDEX idx_anomaly_sensor_time ON anomaly_results(sensor_id, timestamp);
