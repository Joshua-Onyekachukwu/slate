import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "videogen-api", version: "0.0.0" }));

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
