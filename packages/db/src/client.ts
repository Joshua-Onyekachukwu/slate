import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { createPgPool } from "./pg";

// Phase 1+2 Postgres client (Task 4, ADR-011/013): DATABASE_URL is the single
// connection-string source of truth - Docker Compose locally or Neon in the cloud.
// createPgPool() validates the URL and builds the lazy pool WITHOUT connecting
// (fail-fast on a malformed/missing DATABASE_URL at boot, no connection until
// the first query - same contract the API and worker rely on).
const pool = createPgPool();
export const db = drizzle(pool, { schema });
export { pool };
