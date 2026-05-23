import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

// Create a lazy database connection for build time compatibility
const createDb = () => {
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
};

// Export a proxy that creates the connection on first access
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(target, prop) {
    if (!connectionString) {
      // During build, return a mock that won't be called
      return () => Promise.resolve([]);
    }
    const realDb = createDb();
    return (realDb as unknown as Record<string, unknown>)[prop as string];
  },
});

export * from './schema';
