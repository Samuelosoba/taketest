import "dotenv/config";
import { PrismaClient } from "@prisma/client";
// Additive SQLite upgrade for the partner integration. Adding the external-ID
// columns and their unique indexes here (all existing values are NULL) avoids
// Prisma's generic data-loss prompt; `db push` then creates the new tables and
// makes User.email optional while preserving rows.
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const columns = async (table) =>
      tx.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
    const add = async (table, name, definition) => {
      const fields = await columns(table);
      if (fields.length && !fields.some((f) => f.name === name))
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`,
        );
    };
    await add("Institution", "allowedOrigins", "JSONB");
    await add("Exam", "accessMode", "TEXT NOT NULL DEFAULT 'OPEN'");
    await add("ExamAttempt", "launchId", "TEXT");
    await add("AuditLog", "apiKeyId", "TEXT");
    for (const table of ["User", "Course", "Exam", "Question"]) {
      await add(table, "externalId", "TEXT");
      if ((await columns(table)).length)
        await tx.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_institutionId_externalId_key" ON "${table}"("institutionId", "externalId")`,
        );
    }
  });
} finally {
  await db.$disconnect();
}
