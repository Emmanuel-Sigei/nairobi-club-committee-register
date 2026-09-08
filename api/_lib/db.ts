import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

let prisma: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const adapter = new PrismaNeon({
    connectionString,
  });

  return new PrismaClient({ adapter });
}

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }

  return prisma;
}
