import "dotenv/config";
import { z } from "zod";
import { buildApp } from "./app.js";
import { createDb } from "./db.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://127.0.0.1:5173"),
  })
  .parse(process.env);
const db = createDb(env.DATABASE_URL);
const app = await buildApp({
  db,
  logger: true,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
});
app.addHook("onClose", async () => db.$disconnect());
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void app.close());
try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
