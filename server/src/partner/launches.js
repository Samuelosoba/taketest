// Launch links let a partner send one student into one exam without a login.
// The partner server creates a single-use URL; the student's browser trades it
// for a session limited to that exam (see the launch rules in core.js auth()).
import { Router } from "express";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { db, fail, hash, random, secret, publicUser } from "../core.js";
import { z, parse } from "../validation.js";

const LAUNCH_TTL_MS = 5 * 60000;
const SESSION_GRACE_S = 30 * 60;

export const launchSchema = z.object({
  examId: z.string().min(1).max(200),
  student: z.object({
    externalId: z.string().trim().min(1).max(190),
    name: z.string().trim().min(1).max(190),
    studentNumber: z.string().max(100).nullable().optional(),
  }),
  returnUrl: z.string().max(2048).optional(),
});

export const originsOf = (institution) =>
  Array.isArray(institution?.allowedOrigins) ? institution.allowedOrigins : [];

// Partner-managed students are matched by external ID and have no email or
// password, so they can only ever enter exams through launches.
export async function upsertExternalStudent(institutionId, input, client = db) {
  const existing = await client.user.findUnique({
    where: {
      institutionId_externalId: { institutionId, externalId: input.externalId },
    },
  });
  if (existing) {
    if (existing.role !== "STUDENT")
      fail(409, "This external ID belongs to a staff account.");
    if (!existing.active) fail(409, "This student has been deactivated.");
    const changes = {};
    if (input.name && input.name !== existing.name) changes.name = input.name;
    if (
      input.studentNumber !== undefined &&
      input.studentNumber !== existing.studentNumber
    )
      changes.studentNumber = input.studentNumber;
    return Object.keys(changes).length
      ? client.user.update({ where: { id: existing.id }, data: changes })
      : existing;
  }
  return client.user.create({
    data: {
      institutionId,
      externalId: input.externalId,
      name: input.name,
      studentNumber: input.studentNumber ?? null,
      email: null,
      password: "",
      role: "STUDENT",
    },
  });
}

export async function createLaunch(institutionId, examId, input) {
  const institution = await db.institution.findUnique({
    where: { id: institutionId },
  });
  let returnUrl = "";
  if (input.returnUrl) {
    let url;
    try {
      url = new URL(input.returnUrl);
    } catch {
      fail(400, "returnUrl must be a valid URL.");
    }
    // Same rule as allowed origins: https, or http on localhost for development.
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
      fail(400, "returnUrl must use https.");
    const origin = url.origin;
    if (!originsOf(institution).includes(origin))
      fail(
        400,
        `Add ${origin} to your allowed origins to use it as a returnUrl.`,
      );
    returnUrl = input.returnUrl;
  }
  const exam = await db.exam.findFirst({
    where: { id: examId, institutionId },
    include: {
      course: { select: { status: true } },
      _count: { select: { questions: true } },
    },
  });
  if (!exam) fail(404, "Exam not found.");
  const now = new Date();
  if (
    exam.status !== "PUBLISHED" ||
    exam.course.status !== "PUBLISHED" ||
    !exam._count.questions ||
    (exam.startsAt && exam.startsAt > now) ||
    (exam.endsAt && exam.endsAt <= now)
  )
    fail(409, "This exam is not currently available.");
  const student = await upsertExternalStudent(institutionId, input.student);
  const previous = await db.examAttempt.findMany({
    where: { examId: exam.id, studentId: student.id },
    select: { status: true },
  });
  if (
    !previous.some((a) => a.status === "STARTED") &&
    previous.length >= exam.maxAttempts
  )
    fail(409, "This student has used all available attempts.");
  const token = random();
  const launch = await db.launchToken.create({
    data: {
      id: hash(token),
      institutionId,
      userId: student.id,
      examId: exam.id,
      returnUrl,
      expiresAt: new Date(now.getTime() + LAUNCH_TTL_MS),
    },
  });
  return {
    id: launch.id.slice(0, 24),
    url: `${process.env.APP_URL}/launch/${token}`,
    expiresAt: launch.expiresAt,
    studentId: student.id,
    examId: exam.id,
  };
}

// Public endpoint: the browser exchanges the single-use token for a session.
export const launchPublic = Router();
launchPublic.post(
  "/exchange",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  async (req, res) => {
    const { token } = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
      req.body,
    );
    const id = hash(token);
    const now = new Date();
    const claimed = await db.launchToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (!claimed.count)
      fail(
        410,
        "This exam link has expired or was already used. Return to your school's dashboard and start the exam again.",
      );
    const launch = await db.launchToken.findUnique({ where: { id } });
    const [user, exam] = await Promise.all([
      db.user.findFirst({
        where: { id: launch.userId, institutionId: launch.institutionId },
        include: { institution: true },
      }),
      db.exam.findFirst({
        where: { id: launch.examId, institutionId: launch.institutionId },
        include: { _count: { select: { questions: true } } },
      }),
    ]);
    if (!user?.active || user.institution.status !== "ACTIVE" || !exam)
      fail(403, "This exam is no longer available.");
    const endsAt = exam.endsAt ? exam.endsAt.getTime() : Infinity;
    const lifetime = Math.max(
      60,
      Math.min(
        exam.duration * 60 + SESSION_GRACE_S,
        Math.ceil((endsAt - now.getTime()) / 1000) + SESSION_GRACE_S,
      ),
    );
    const session = jwt.sign(
      {
        sub: user.id,
        institutionId: user.institutionId,
        examId: exam.id,
        launchId: launch.id.slice(0, 24),
        scope: "launch",
      },
      secret,
      { algorithm: "HS256", expiresIn: lifetime },
    );
    const active = await db.examAttempt.findFirst({
      where: { examId: exam.id, studentId: user.id, status: "STARTED" },
      select: { id: true },
    });
    res.json({
      token: session,
      user: publicUser(user),
      returnUrl: launch.returnUrl || null,
      activeAttemptId: active?.id ?? null,
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        duration: exam.duration,
        passMark: exam.passMark,
        cameraRequired: exam.cameraRequired,
        fullscreen: exam.fullscreen,
        questionCount: exam._count.questions,
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      },
    });
  },
);

// Authenticated with the launch session: the outcome shown after submission.
export async function launchResult(req, res) {
  if (!req.launch) fail(403, "This endpoint is for exam sessions.");
  const a = await db.examAttempt.findFirst({
    where: { examId: req.launch.examId, studentId: req.user.id },
    orderBy: { number: "desc" },
    include: { result: true },
  });
  if (!a) fail(404, "No attempt found.");
  const r = a.result?.released ? a.result : null;
  res.json({
    attemptId: a.id,
    status: a.status,
    submittedAt: a.submittedAt,
    result: r && {
      percentage: r.percentage,
      grade: r.grade,
      passed: r.passed,
      obtainedMarks: r.obtainedMarks,
      totalMarks: r.totalMarks,
    },
  });
}
