import "dotenv/config";
import { createDb } from "../db.js";
import { runEtl } from "./service.js";
if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
const db = createDb(process.env.DATABASE_URL);
try {
  console.log(await runEtl(db));
} finally {
  await db.$disconnect();
}
