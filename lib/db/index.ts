import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One `pg` Pool shared by Drizzle and Better Auth.
 *
 * Better Auth needs a `pg` Pool, and sharing it with Drizzle is the point:
 * two drivers would mean two connection pools and two sources of truth.
 * Do not swap this for `@neondatabase/serverless`.
 */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
