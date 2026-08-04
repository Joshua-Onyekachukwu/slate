import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { runMigrations, resolveDatabasePath } from "@slate/db";
import { buildApp } from "./app";
import { createProvider } from "./provider";

await runMigrations();
const checkpointer = SqliteSaver.fromConnString(resolveDatabasePath(process.env.DATABASE_PATH));
const app = buildApp({ provider: createProvider(), checkpointer });
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`slate-api listening on :${port}`);
