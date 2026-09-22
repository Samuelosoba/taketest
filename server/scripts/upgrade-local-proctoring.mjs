import "dotenv/config";
import { PrismaClient } from "@prisma/client";
// Additive SQLite upgrade for existing workspaces. Avoids Prisma's generic
// warning about adding a unique index: all pre-existing event IDs are NULL.
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
    await add("Exam", "cameraRequired", "BOOLEAN NOT NULL DEFAULT false");
    await add("ExamAttempt", "lastSeenAt", "DATETIME");
    await add("ExamAttempt", "disconnectedAt", "DATETIME");
    await add("ExamViolation", "clientEventId", "TEXT");
    if ((await columns("ExamViolation")).length) {
      await tx.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ExamViolation_clientEventId_key" ON "ExamViolation"("clientEventId")',
      );
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "ExamViolation_attemptId_createdAt_idx" ON "ExamViolation"("attemptId", "createdAt")',
      );
    }
    if ((await columns("ExamAttempt")).length)
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "ExamAttempt_status_lastSeenAt_idx" ON "ExamAttempt"("status", "lastSeenAt")',
      );
  });
} finally {
  await db.$disconnect();
}
