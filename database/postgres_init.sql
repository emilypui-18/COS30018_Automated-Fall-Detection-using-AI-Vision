BEGIN;

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

INSERT INTO bim_models VALUES
(1, 'Snowdon Towers Sample Architectural', 'Snowdon Towers Sample Architectural.xkt', '1.0');

INSERT INTO buildings VALUES
(1, 1, 'Snowdon Towers', 'Demonstration BIM-linked building used by the Asset Intelligence PoC.');

INSERT INTO building_floors VALUES
(1,1,'Ground Floor',1),(2,1,'Level 2',2),(3,1,'Level 3',3),(4,1,'Level 4',4),
(5,1,'Level 5',5),(6,1,'Level 6',6),(7,1,'Level 7',7),(8,1,'Level 8',8),
(9,1,'Level 9',9),(10,1,'Level 10',10),(11,1,'Level 11',11),(12,1,'Level 12',12),
(13,1,'Level 13',13),(14,1,'Level 14',14),(15,1,'Level 15',15),(16,1,'Level 16',16),
(17,1,'Level 17',17),(18,1,'Level 18',18);

INSERT INTO spaces VALUES
(201,2,'Plant Room L2','Mechanical Plant Room'),
(501,5,'Mechanical Service Zone L5','Mechanical Service'),
(601,6,'Plant Room L6','Mechanical Plant Room'),
(202,2,'Valve Service Bay L2','Service Area');

INSERT INTO assets VALUES
(101,201,'BIM-AHU-L2-001','AHU-01','Air Handling Unit','Running','2021-06-18'),
(102,601,'BIM-AHU-L6-002','AHU-02','Air Handling Unit','Running','2021-06-18'),
(103,501,'BIM-FAN-L5-003','FAN-03','Supply Fan','Running','2022-03-04'),
(104,202,'BIM-VALVE-L2-001','VALVE-01','Control Valve','Open','2022-03-04');

INSERT INTO maintenance_events VALUES
(1,101,'Inspection','2026-09-18','Routine AHU inspection; filter differential pressure checked.','Completed'),
(2,103,'Bearing Check','2026-09-29','Fan bearing vibration reviewed after operator observation.','Completed'),
(3,102,'Scheduled Service','2026-10-10','Upcoming scheduled air handling unit service.','Scheduled');

INSERT INTO sensors VALUES
(1001,201,101,'Supply Air Temperature','°C','AHU-01 supply air temperature','Online'),
(1002,201,101,'Return Air Temperature','°C','AHU-01 return air temperature','Online'),
(1003,201,101,'Airflow','m³/s','AHU-01 supply airflow','Online'),
(1004,201,101,'Static Pressure','Pa','AHU-01 duct static pressure','Online'),
(1005,201,101,'Valve Position','%','AHU-01 cooling valve position','Online'),
(2001,601,102,'Supply Air Temperature','°C','AHU-02 supply air temperature','Online'),
(2002,601,102,'Airflow','m³/s','AHU-02 supply airflow','Online'),
(3001,501,103,'Airflow','m³/s','FAN-03 airflow','Online'),
(3002,501,103,'Static Pressure','Pa','FAN-03 pressure','Online'),
(4001,202,104,'Valve Position','%','VALVE-01 commanded position','Online');

INSERT INTO sensor_readings VALUES
(1001,'2026-10-04 10:42:00',18.6,'Good'),
(1002,'2026-10-04 10:42:00',24.2,'Good'),
(1003,'2026-10-04 10:42:00',4.8,'Good'),
(1004,'2026-10-04 10:42:00',425,'Good'),
(1005,'2026-10-04 10:42:00',67,'Good'),
(2001,'2026-10-04 10:42:00',21.0,'Good'),
(2002,'2026-10-04 10:42:00',5.2,'Good'),
(3001,'2026-10-04 10:42:00',3.7,'Good'),
(3002,'2026-10-04 10:42:00',392,'Good'),
(4001,'2026-10-04 10:42:00',67,'Good');

INSERT INTO historical_sensor_readings VALUES
(1001,'2026-10-03 10:42:00',20.80,'Good'),
(1001,'2026-10-03 11:42:00',21.00,'Good'),
(1001,'2026-10-03 12:42:00',21.10,'Good'),
(1001,'2026-10-03 13:42:00',20.90,'Good'),
(1001,'2026-10-03 14:42:00',20.60,'Good'),
(1001,'2026-10-03 15:42:00',20.40,'Good'),
(1001,'2026-10-03 16:42:00',20.30,'Good'),
(1001,'2026-10-03 17:42:00',20.20,'Good'),
(1001,'2026-10-03 18:42:00',20.40,'Good'),
(1001,'2026-10-03 19:42:00',20.60,'Good'),
(1001,'2026-10-03 20:42:00',20.80,'Good'),
(1001,'2026-10-03 21:42:00',20.90,'Good'),
(1001,'2026-10-03 22:42:00',20.70,'Good'),
(1001,'2026-10-03 23:42:00',20.50,'Good'),
(1001,'2026-10-04 00:42:00',20.40,'Good'),
(1001,'2026-10-04 01:42:00',20.60,'Good'),
(1001,'2026-10-04 02:42:00',20.80,'Good'),
(1001,'2026-10-04 03:42:00',21.00,'Good'),
(1001,'2026-10-04 04:42:00',20.60,'Good'),
(1001,'2026-10-04 05:42:00',20.00,'Good'),
(1001,'2026-10-04 06:42:00',19.50,'Good'),
(1001,'2026-10-04 07:42:00',19.10,'Good'),
(1001,'2026-10-04 08:42:00',18.90,'Good'),
(1001,'2026-10-04 09:42:00',18.75,'Good'),
(1001,'2026-10-04 10:42:00',18.60,'Good'),
(1002,'2026-10-04 03:42:00',23.90,'Good'),
(1002,'2026-10-04 04:42:00',24.00,'Good'),
(1002,'2026-10-04 05:42:00',24.10,'Good'),
(1002,'2026-10-04 06:42:00',24.00,'Good'),
(1002,'2026-10-04 07:42:00',24.10,'Good'),
(1002,'2026-10-04 08:42:00',24.20,'Good'),
(1002,'2026-10-04 09:42:00',24.10,'Good'),
(1002,'2026-10-04 10:42:00',24.20,'Good'),
(1003,'2026-10-04 03:42:00',5.50,'Good'),
(1003,'2026-10-04 04:42:00',5.45,'Good'),
(1003,'2026-10-04 05:42:00',5.40,'Good'),
(1003,'2026-10-04 06:42:00',5.30,'Good'),
(1003,'2026-10-04 07:42:00',5.20,'Good'),
(1003,'2026-10-04 08:42:00',5.05,'Good'),
(1003,'2026-10-04 09:42:00',4.90,'Good'),
(1003,'2026-10-04 10:42:00',4.80,'Good'),
(1004,'2026-10-04 03:42:00',409.00,'Good'),
(1004,'2026-10-04 04:42:00',412.00,'Good'),
(1004,'2026-10-04 05:42:00',414.00,'Good'),
(1004,'2026-10-04 06:42:00',416.00,'Good'),
(1004,'2026-10-04 07:42:00',419.00,'Good'),
(1004,'2026-10-04 08:42:00',421.00,'Good'),
(1004,'2026-10-04 09:42:00',423.00,'Good'),
(1004,'2026-10-04 10:42:00',425.00,'Good'),
(1005,'2026-10-04 03:42:00',58.00,'Good'),
(1005,'2026-10-04 04:42:00',59.00,'Good'),
(1005,'2026-10-04 05:42:00',60.00,'Good'),
(1005,'2026-10-04 06:42:00',61.00,'Good'),
(1005,'2026-10-04 07:42:00',63.00,'Good'),
(1005,'2026-10-04 08:42:00',64.00,'Good'),
(1005,'2026-10-04 09:42:00',66.00,'Good'),
(1005,'2026-10-04 10:42:00',67.00,'Good'),
(2001,'2026-10-04 03:42:00',20.70,'Good'),
(2001,'2026-10-04 04:42:00',20.80,'Good'),
(2001,'2026-10-04 05:42:00',20.90,'Good'),
(2001,'2026-10-04 06:42:00',20.90,'Good'),
(2001,'2026-10-04 07:42:00',21.00,'Good'),
(2001,'2026-10-04 08:42:00',21.00,'Good'),
(2001,'2026-10-04 09:42:00',21.00,'Good'),
(2001,'2026-10-04 10:42:00',21.00,'Good'),
(2002,'2026-10-04 03:42:00',5.00,'Good'),
(2002,'2026-10-04 04:42:00',5.00,'Good'),
(2002,'2026-10-04 05:42:00',5.10,'Good'),
(2002,'2026-10-04 06:42:00',5.10,'Good'),
(2002,'2026-10-04 07:42:00',5.10,'Good'),
(2002,'2026-10-04 08:42:00',5.20,'Good'),
(2002,'2026-10-04 09:42:00',5.20,'Good'),
(2002,'2026-10-04 10:42:00',5.20,'Good'),
(3001,'2026-10-04 03:42:00',4.10,'Good'),
(3001,'2026-10-04 04:42:00',4.05,'Good'),
(3001,'2026-10-04 05:42:00',4.00,'Good'),
(3001,'2026-10-04 06:42:00',3.95,'Good'),
(3001,'2026-10-04 07:42:00',3.90,'Good'),
(3001,'2026-10-04 08:42:00',3.85,'Good'),
(3001,'2026-10-04 09:42:00',3.75,'Good'),
(3001,'2026-10-04 10:42:00',3.70,'Good'),
(3002,'2026-10-04 03:42:00',384.00,'Good'),
(3002,'2026-10-04 04:42:00',386.00,'Good'),
(3002,'2026-10-04 05:42:00',387.00,'Good'),
(3002,'2026-10-04 06:42:00',388.00,'Good'),
(3002,'2026-10-04 07:42:00',389.00,'Good'),
(3002,'2026-10-04 08:42:00',390.00,'Good'),
(3002,'2026-10-04 09:42:00',391.00,'Good'),
(3002,'2026-10-04 10:42:00',392.00,'Good'),
(4001,'2026-10-04 03:42:00',60.00,'Good'),
(4001,'2026-10-04 04:42:00',61.00,'Good'),
(4001,'2026-10-04 05:42:00',62.00,'Good'),
(4001,'2026-10-04 06:42:00',63.00,'Good'),
(4001,'2026-10-04 07:42:00',64.00,'Good'),
(4001,'2026-10-04 08:42:00',65.00,'Good'),
(4001,'2026-10-04 09:42:00',66.00,'Good'),
(4001,'2026-10-04 10:42:00',67.00,'Good');

INSERT INTO anomaly_results VALUES
(1,1003,'2026-10-04 10:42:00',0.87,'New','High','Airflow deviation detected across AHU-01 airflow, pressure and temperature signals.'),
(2,3001,'2026-10-04 10:17:00',0.71,'Review','Medium','Unclassified anomaly detected in FAN-03 airflow and pressure behaviour.'),
(3,2001,'2026-10-04 09:58:00',0.63,'Closed','Low','Transient temperature anomaly reviewed and closed.');

INSERT INTO alerts_status VALUES
(1,'New'),(2,'Review'),(3,'Acknowledged'),(4,'Closed');

INSERT INTO alerts_severity VALUES
(1,'Low'),(2,'Medium'),(3,'High'),(4,'Critical');

INSERT INTO alerts VALUES
(1,1,'AI Anomaly','AHU-01 requires review: abnormal airflow pattern detected.','High','New','2026-10-04 10:42:00'),
(2,2,'AI Anomaly','FAN-03 anomaly is awaiting technical review.','Medium','Review','2026-10-04 10:17:00'),
(3,3,'AI Anomaly','AHU-02 temperature anomaly was reviewed and closed.','Low','Closed','2026-10-04 09:58:00');

COMMIT;
