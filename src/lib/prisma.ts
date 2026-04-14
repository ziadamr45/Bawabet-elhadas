import { PrismaClient } from '@prisma/client';

// ============ PRISMA CLIENT CONFIGURATION ============
// On Vercel: DATABASE_URL is set in Vercel environment variables (Neon PostgreSQL)
// On local dev: .env file contains the correct DATABASE_URL
// The shell environment on the dev machine may set DATABASE_URL to a SQLite path,
// so we validate and override if needed.

const NEON_DB_URL = 'postgresql://neondb_owner:npg_FyAGi9RSm3wZ@ep-restless-hall-an8qdqc7.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL || '';

  // Check if the URL is a valid PostgreSQL connection string
  if (envUrl.startsWith('postgresql://') || envUrl.startsWith('postgres://')) {
    return envUrl;
  }

  // Fallback to hardcoded Neon URL (for local dev where shell overrides .env)
  console.warn('[Prisma] DATABASE_URL is not a valid PostgreSQL URL, using Neon fallback');
  return NEON_DB_URL;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDatabaseUrl(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
