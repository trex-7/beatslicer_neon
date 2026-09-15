import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const neonUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  '';

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
