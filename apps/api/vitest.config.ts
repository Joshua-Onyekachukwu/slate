import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { env: { DATABASE_PATH: "./data/test-api.db" } },
});
