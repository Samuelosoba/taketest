// Course, question and exam logic shared by the app routes and the partner
// API. Functions take an institution ID and validated-or-raw input; they never
// read Express objects.
import { db, fail } from "../core.js";
import {
  parse,
  courseSchema,
  questionSchema,
  examSchema,
} from "../validation.js";

export async function createCourse(institutionId, input, extra = {}) {
  return db.course.create({
    data: { ...parse(courseSchema, input), ...extra, institutionId },
  });
}
export async function updateCourse(institutionId, id, input, extra = {}) {
  const result = await db.course.updateMany({
    where: { id, institutionId },
    data: { ...parse(courseSchema.partial(), input), ...extra },
  });
  if (!result.count) fail(404, "Course not found.");
  return db.course.findUnique({ where: { id } });
}

export async function createQuestion(institutionId, input, extra = {}) {
  return db.question.create({
    data: { ...parse(questionSchema, input), ...extra, institutionId },
  });
}
export async function updateQuestion(institutionId, id, input, extra = {}) {
  const result = await db.question.updateMany({
    where: { id, institutionId },
    data: { ...parse(questionSchema, input), ...extra },
  });
  if (!result.count) fail(404, "Question not found.");
  return db.question.findUnique({ where: { id } });
}
export async function deleteQuestion(institutionId, id) {
  const q = await db.question.findFirst({
    where: { id, institutionId },
    include: { _count: { select: { exams: true } } },
  });
  if (!q) fail(404, "Question not found.");
  if (q._count.exams) fail(409, "Remove this question from its exams first.");
  await db.question.delete({ where: { id: q.id } });
}

// Creates (no id) or fully replaces (id) an exam and its question list.
export async function saveExam(institutionId, input, id, extra = {}) {
  const { questionIds, ...data } = parse(examSchema, input);
  return db.$transaction(async (tx) => {
    if (id && !(await tx.exam.findFirst({ where: { id, institutionId } })))
      fail(404, "Exam not found.");
    if (
      !(await tx.course.findFirst({
        where: { id: data.courseId, institutionId },
      }))
    )
      fail(400, "Choose a course from this institution.");
    const ids = [...new Set(questionIds)];
    if (
      (await tx.question.count({
        where: { id: { in: ids }, institutionId },
      })) !== ids.length
    )
      fail(400, "Question does not belong to this institution.");
    if (data.status === "PUBLISHED" && !ids.length)
      fail(400, "Add at least one question before publishing.");
    if (id) await tx.examQuestion.deleteMany({ where: { examId: id } });
    const record = {
      ...data,
      ...extra,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      questions: { create: ids.map((questionId) => ({ questionId })) },
    };
    return id
      ? tx.exam.update({ where: { id }, data: record })
      : tx.exam.create({ data: { ...record, institutionId } });
  });
}
