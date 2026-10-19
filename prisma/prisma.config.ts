import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "migrations"),
  },
  datasource: {
    // Use a direct/session connection for migrations; the app/worker may use
    // Supabase's transaction pooler through DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgres://feed2040:feed2040@localhost:5432/feed2040",
  },
});
