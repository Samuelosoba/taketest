// Result release and manual grading shared by the app routes and partner API.
import { db, fail } from "../core.js";
import { z, parse } from "../validation.js";
import { summarize } from "../grading.js";
import { emit, resultEvent } from "../partner/webhooks.js";

const attemptForEvent = {
  include: {
    exam: { select: { externalId: true, releaseResults: true } },
    student: { select: { externalId: true } },
  },
};

export async function releaseResult(institutionId, id) {
  return db.$transaction(async (tx) => {
    const row = await tx.result.updateMany({
      where: { id, institutionId, status: "GRADED", released: false },
      data: { released: true },
    });
    const r = await tx.result.findFirst({
      where: { id, institutionId, status: "GRADED" },
      include: { attempt: attemptForEvent },
    });
    if (!r) fail(404, "A completed result was not found.");
    if (row.count)
      await emit(
        tx,
        institutionId,
        "result.released",
        resultEvent(r, r.attempt),
      );
    return r;
  });
}

export const gradeSchema = z.object({
  grades: z
    .array(
      z.object({
        questionId: z.string(),
        awarded: z.number().min(0),
        comment: z.string().max(2000).default(""),
      }),
    )
    .min(1),
});

export async function gradeResult(institutionId, id, input) {
  const { grades } = parse(gradeSchema, input);
  return db.$transaction(async (tx) => {
    const r = await tx.result.findFirst({
      where: { id, institutionId, status: "UNDER_REVIEW" },
      include: { attempt: attemptForEvent },
    });
    if (!r) fail(404, "Pending result not found.");
    const lock = await tx.examAttempt.updateMany({
      where: { id: r.attemptId, version: r.attempt.version },
      data: { version: { increment: 1 } },
    });
    if (!lock.count) fail(409, "This result changed. Refresh and retry.");
    const breakdown = r.breakdown.map((b) => ({ ...b }));
    for (const g of grades) {
      const q = r.attempt.snapshot.questions.find((q) => q.id === g.questionId);
      if (!q || q.type !== "ESSAY" || g.awarded > q.marks)
        fail(400, "Marks must be within the essay question maximum.");
      Object.assign(
        breakdown.find((b) => b.questionId === q.id),
        g,
      );
    }
    const summary = summarize(
      breakdown,
      r.attempt.snapshot.passMark,
      r.attempt.snapshot.gradingBands,
    );
    let attempt = r.attempt;
    if (summary.status === "GRADED")
      attempt = {
        ...attempt,
        ...(await tx.examAttempt.update({
          where: { id: r.attemptId },
          data: { status: "GRADED" },
        })),
      };
    const updated = await tx.result.update({
      where: { id: r.id },
      data: {
        ...summary,
        released: summary.status === "GRADED" && r.attempt.exam.releaseResults,
      },
    });
    if (updated.status === "GRADED")
      await emit(
        tx,
        institutionId,
        "result.graded",
        resultEvent(updated, attempt),
      );
    return updated;
  });
}
