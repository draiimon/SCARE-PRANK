---
name: Managed database environment
description: How the managed PostgreSQL connection appears inside artifact workflows
---

Artifact-owned workflows can receive the managed PostgreSQL connection through the standard PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE variables without a DATABASE_URL value. Database clients should prefer DATABASE_URL when present but fall back to node-postgres defaults so the app works in both environments.

**Why:** The database was reachable and schema-backed, but the API crashed at startup because it required only DATABASE_URL even though the workflow had the PG* settings.

**How to apply:** When wiring database clients in artifact services, support both an explicit connection string and the managed PG* environment variables; never log or expose credential values.