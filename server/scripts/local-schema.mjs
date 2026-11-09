import { readFileSync, writeFileSync } from "node:fs";
// The canonical schema targets PostgreSQL (production). Local development and
// tests use SQLite: same models, without Postgres-only settings.
export function writeLocalSchema(
  from = "prisma/schema.prisma",
  to = "prisma/schema.local.prisma",
) {
  writeFileSync(
    to,
    readFileSync(from, "utf8")
      .replace('provider = "postgresql"', 'provider = "sqlite"')
      .replace(/^\s*directUrl\s*=.*\n/m, "")
      .replace(/ @db\.\w+(\([^)]*\))?/g, ""),
  );
}
