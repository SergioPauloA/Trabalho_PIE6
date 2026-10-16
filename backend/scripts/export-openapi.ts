import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db.js";

const db = createDb(
  process.env.DATABASE_URL ?? "postgresql://localhost/supervalidade",
);
const app = await buildApp({ db });
try {
  await app.ready();
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/openapi.json",
    JSON.stringify(app.swagger(), null, 2) + "\n",
  );
  console.log("Contrato exportado para docs/openapi.json");
} finally {
  await app.close();
  await db.$disconnect();
}
