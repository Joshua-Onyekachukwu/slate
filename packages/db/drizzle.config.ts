import { defineConfig } from "drizzle-kit";
import { resolveDatabasePath } from "./src/path";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: resolveDatabasePath(process.env.DATABASE_PATH) },
});
