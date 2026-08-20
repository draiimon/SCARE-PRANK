import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString && !process.env.PGHOST) {
  throw new Error(
    "Database connection settings must be provided. Did you forget to provision a database?",
  );
}

// Replit's managed database exposes PG* variables to artifact workflows.
// Prefer an explicit DATABASE_URL when available, and otherwise let node-postgres
// read the managed PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE settings.
export const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool();
export const db = drizzle(pool, { schema });

export * from "./schema";
