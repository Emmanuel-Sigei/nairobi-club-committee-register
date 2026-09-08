import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../src/generated/prisma/client";

let prisma: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (prisma) {
    return prisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const adapter = new PrismaNeon({
    connectionString,
  });

  prisma = new PrismaClient({
    adapter,
  });

  return prisma;
}