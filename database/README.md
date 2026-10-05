# PostgreSQL demo database

This project now uses PostgreSQL through the Node.js/Express API in `server/index.js`.
The browser does **not** connect directly to PostgreSQL.

## Files

- `postgres_schema.sql` — creates tables matching the supplied project ERD.
- `postgres_seed.sql` — inserts temporary Snowdon Towers demonstration data.
- `postgres_init.sql` — resets the demo schema and runs both schema + seed data in one command.

## Create and load the database

From the project folder:

```bash
createdb digital_twin
psql -d digital_twin -f database/postgres_init.sql
```

The init script drops and recreates the demo tables, so do not run it against a database containing data you need to keep.

## Connection

Copy `.env.example` to `.env`. The default configuration assumes PostgreSQL is on `localhost:5432` and the database is named `digital_twin`.

If your PostgreSQL account requires a specific username/password, uncomment and edit `PGUSER` and `PGPASSWORD` in `.env`.

All included records are temporary demonstration data. They are not live BMS readings or validated AI performance results.
