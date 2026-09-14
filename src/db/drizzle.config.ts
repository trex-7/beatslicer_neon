import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const neonUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  'postgresql://neondb_owner:npg_NcLUPu1Dq4Xo@ep-damp-sunset-axegat0e-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: neonUrl,
  },
  verbose: true,
});
