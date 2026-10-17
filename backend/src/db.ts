import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export function createDb(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 5000,
    }),
  });
}
