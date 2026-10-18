import "dotenv/config";
import { createDb } from "../src/db.js";
import { loadCatalog } from "./catalog/load.js";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--catalog-only")) throw new Error("Uso: npm run db:seed:catalog -- [--catalog-only]");
if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
const db = createDb(process.env.DATABASE_URL);
try {
  console.log("Catálogo Mercelume: produtos comuns; preços, estoques e validades demonstrativos. Sem vendas ou descartes fictícios.");
  console.log(JSON.stringify(await loadCatalog(db, { catalogOnly: args.includes("--catalog-only") }), null, 2));
} finally {
  await db.$disconnect();
}
