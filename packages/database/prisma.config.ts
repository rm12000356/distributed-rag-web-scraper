import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", "..", ".env");

if (existsSync(envPath)) {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: envPath });
  } catch {
    // dotenv not installed — env vars come from environment (Docker)
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
