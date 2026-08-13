import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ensureDatabase, resolveDatabaseUrl, runMigrations } from "@slate/db";
import { createVoiceProvider } from "@slate/ai";
import { buildApp } from "./app";
import { createProvider } from "./provider";
import { makeStubVerifyToken, makeVerifyToken } from "./auth";

// Phase 1+2 boot (Task 10): DATABASE_URL is the single source of truth - Docker
// Compose locally (postgres://slate:slate@localhost:5432/slate) or Neon in the
// cloud. resolveDatabaseUrl() throws a clear error when it's missing (no silent
// default: @slate/db's client already validated it at import). ensureDatabase is
// a no-op when the DB already exists (compose/Neon); it only creates the
// hermetic test/demo DBs named by their own URLs.
//
// Known peer divergence: PostgresSaver 0.1.2 peers
// @langchain/langgraph-checkpoint@^0.1.0 but langgraph 0.2.74 pins ~0.0.17 (no
// single version satisfies both) - pnpm nests 0.0.18 inside the saver and it
// works (verified: api 25/25, E2E 11/11). The real fix is upgrading
// @langchain/langgraph to a version whose checkpoint peer aligns; don't change
// the pin blindly.
const url = resolveDatabaseUrl();
await ensureDatabase(url);
await runMigrations();
const checkpointer = PostgresSaver.fromConnString(url);
await checkpointer.setup();

// Task 2 (ADR-022/023): enforced auth when CLERK_SECRET_KEY is present (the
// demo and E2E run local-first without keys - FAKE_PROVIDER=1, no sessions).
// STUB_AUTH=1 (test-only) installs the hermetic stub verifier instead, so the
// auth E2E spec (playwright.auth.config.ts) exercises enforced mode + owner
// isolation with fixed bearer tokens and no Clerk network access.
const verifyToken = process.env.STUB_AUTH === "1"
  ? makeStubVerifyToken()
  : process.env.CLERK_SECRET_KEY
    ? makeVerifyToken()
    : undefined;
const app = buildApp({
  provider: createProvider(),
  // Narration backend for the film's voice track - ElevenLabs when a key is
  // set, else the zero-key edge-tts → Windows SAPI fallback so the exported
  // film always carries narration (never a silent cut).
  voice: createVoiceProvider(),
  checkpointer,
  verifyToken,
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`slate-api listening on :${port}`);
