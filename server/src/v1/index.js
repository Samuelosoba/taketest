// Partner REST API, version 1. Server-to-server only: authenticate with an
// API key (Authorization: Bearer sk_live_...). Never call it from a browser.
//
// Conventions: every object has `id` and `externalId`. Path IDs accept either
// our ID or `ext_<externalId>`. PUT on `ext_<externalId>` creates or replaces.
// Lists use ?limit=&cursor= and return { data, nextCursor }.
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { db, fail, hash, audit } from "../core.js";
import { z, parse, courseSchema } from "../validation.js";
import { apiKeyAuth, requireScope, hasScope } from "../partner/api-keys.js";
import {
  createLaunch,
  launchSchema,
  upsertExternalStudent,
} from "../partner/launches.js";
import { attemptEvent } from "../partner/webhooks.js";
import {
  createCourse,
  updateCourse,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  saveExam,
} from "../services/content.js";
import { releaseResult, gradeResult } from "../services/results.js";
import {
  issueCertificate,
  sendCertificatePdf,
  certificatePdfInclude,
} from "../certificate-routes.js";

export const v1 = Router();
const scope = requireScope;
const tenantOf = (req) => req.actor.institutionId;

// ---------------------------------------------------------------- middleware
v1.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});
v1.use(apiKeyAuth);
v1.use(
  rateLimit({
    windowMs: 60000,
    limit: () => Number(process.env.API_RATE_LIMIT_PER_MINUTE || 600),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => req.actor.id,
    handler: (req, res) =>
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many requests." },
      }),
  }),
);
// Idempotency-Key: a repeated POST with the same key and body returns the
// stored response instead of repeating the action (kept for 24 hours).
const IDEMPOTENCY_TTL_MS = 86400000;
v1.use(async (req, res, next) => {
  const key = req.headers["idempotency-key"];
  if (req.method !== "POST" || !key) return next();
  if (typeof key !== "string" || key.length > 190)
    fail(400, "Idempotency-Key must be at most 190 characters.");
  const requestHash = hash(
    `${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? null)}`,
  );
  const id = { institutionId: tenantOf(req), key };
  const stored = await db.idempotencyKey.findUnique({
    where: { institutionId_key: id },
  });
  if (stored && Date.now() - stored.createdAt.getTime() < IDEMPOTENCY_TTL_MS) {
    if (stored.requestHash !== requestHash)
      throw coded(
        409,
        "idempotency_conflict",
        "This Idempotency-Key was used with a different request.",
      );
    res.setHeader("Idempotent-Replayed", "true");
    return res.status(stored.status).json(stored.response);
  }
  // Store the response before sending it, so a quick retry sees the record.
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500) return json(body);
    const row = { requestHash, status: res.statusCode, response: body };
    db.idempotencyKey
      .upsert({
        where: { institutionId_key: id },
        create: { ...id, ...row },
        update: { ...row, createdAt: new Date() },
      })
      .catch((e) => console.error("Idempotency store failed:", e.message))
      .finally(() => json(body));
    return res;
  };
  next();
});

// ------------------------------------------------------------------- helpers
function coded(status, code, message, details) {
  const e = new Error(message);
  Object.assign(e, { status, code, details });
  return e;
}
const isExt = (value) => value.startsWith("ext_");
const extOf = (value) => value.slice(4);
// Finds a record by our ID or `ext_<externalId>` within the key's institution.
async function find(model, req, value, options = {}) {
  const institutionId = tenantOf(req);
  const where = isExt(value)
    ? { institutionId, externalId: extOf(value) }
    : { institutionId, id: value };
  return db[model].findFirst({ where, ...options });
}
async function mustFind(model, req, value, options, label) {
  const row = await find(model, req, value, options);
  if (!row) fail(404, `${label} not found.`);
  return row;
}
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});
async function page(model, req, where, options = {}) {
  const { limit, cursor } = parse(listQuery, {
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  const rows = await db[model].findMany({
    where: { ...where, institutionId: tenantOf(req) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    ...options,
  });
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  return { data, nextCursor: more ? data[data.length - 1].id : null };
}
const externalId = z.string().trim().min(1).max(190);
const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// --------------------------------------------------------------- serializers
const course = (c) => ({
  id: c.id,
  externalId: c.externalId,
  title: c.title,
  code: c.code,
  description: c.description,
  status: c.status,
  createdAt: c.createdAt,
});
const question = (req) => (q) => {
  const answers = hasScope(req, "questions:answers");
  return {
    id: q.id,
    externalId: q.externalId,
    text: q.text,
    type: q.type,
    marks: q.marks,
    difficulty: q.difficulty,
    subject: q.subject,
    imageUrl: q.imageUrl,
    options: answers ? q.options : q.options.map(({ correct, ...o }) => o),
    ...(answers ? { acceptedAnswers: q.acceptedAnswers } : {}),
    createdAt: q.createdAt,
  };
};
const examInclude = {
  questions: { select: { question: { select: { id: true, marks: true } } } },
  course: { select: { externalId: true } },
};
const exam = (e) => ({
  id: e.id,
  externalId: e.externalId,
  courseId: e.courseId,
  courseExternalId: e.course?.externalId ?? null,
  title: e.title,
  description: e.description,
  status: e.status,
  accessMode: e.accessMode,
  duration: e.duration,
  passMark: e.passMark,
  price: e.price,
  currency: e.currency,
  maxAttempts: e.maxAttempts,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  shuffleQuestions: e.shuffleQuestions,
  shuffleOptions: e.shuffleOptions,
  releaseResults: e.releaseResults,
  fullscreen: e.fullscreen,
  cameraRequired: e.cameraRequired,
  questionIds: e.questions?.map((q) => q.question.id) ?? [],
  totalMarks: e.questions?.reduce((s, q) => s + q.question.marks, 0) ?? 0,
  createdAt: e.createdAt,
});
const student = (u) => ({
  id: u.id,
  externalId: u.externalId,
  name: u.name,
  studentNumber: u.studentNumber,
  active: u.active,
  createdAt: u.createdAt,
});
const attemptInclude = {
  exam: { select: { externalId: true } },
  student: { select: { externalId: true } },
};
const attempt = (a) => ({
  id: a.id,
  number: a.number,
  ...attemptEvent(a),
  lastSeenAt: a.lastSeenAt,
  disconnectedAt: a.disconnectedAt,
});
const resultInclude = {
  attempt: { include: attemptInclude },
  certificate: true,
};
const result = (r, detail = false) => ({
  id: r.id,
  attemptId: r.attemptId,
  examId: r.attempt.examId,
  examExternalId: r.attempt.exam.externalId,
  studentId: r.attempt.studentId,
  studentExternalId: r.attempt.student.externalId,
  status: r.status,
  totalMarks: r.totalMarks,
  obtainedMarks: r.obtainedMarks,
  percentage: r.percentage,
  grade: r.grade,
  passed: r.passed,
  released: r.released,
  certificateId: r.certificate?.id ?? null,
  createdAt: r.createdAt,
  ...(detail ? { breakdown: r.breakdown } : {}),
});

// ------------------------------------------------------------------ identity
v1.get("/me", async (req, res) => {
  const i = await db.institution.findUnique({ where: { id: tenantOf(req) } });
  res.json({
    institution: { id: i.id, name: i.name, slug: i.slug },
    apiKeyId: req.actor.id,
    scopes: req.actor.scopes,
  });
});

// ------------------------------------------------------------------- courses
const courseInput = courseSchema.extend({ externalId: externalId.optional() });
v1.get("/courses", scope("courses:read"), async (req, res) => {
  const p = await page("course", req, {});
  res.json({ ...p, data: p.data.map(course) });
});
v1.post("/courses", scope("courses:write"), async (req, res) => {
  const { externalId: ext, ...input } = parse(courseInput, req.body);
  const row = await createCourse(tenantOf(req), input, {
    externalId: ext ?? null,
  });
  await audit(req.actor, "COURSE_CREATED", row.id);
  res.status(201).json(course(row));
});
v1.get("/courses/:id", scope("courses:read"), async (req, res) =>
  res.json(course(await mustFind("course", req, req.params.id, {}, "Course"))),
);
v1.patch("/courses/:id", scope("courses:write"), async (req, res) => {
  const c = await mustFind("course", req, req.params.id, {}, "Course");
  const row = await updateCourse(tenantOf(req), c.id, req.body);
  await audit(req.actor, "COURSE_UPDATED", c.id);
  res.json(course(row));
});
v1.put("/courses/:id", scope("courses:write"), async (req, res) => {
  const existing = await find("course", req, req.params.id);
  if (!existing && !isExt(req.params.id)) fail(404, "Course not found.");
  const input = parse(courseSchema, req.body);
  const row = existing
    ? await updateCourse(tenantOf(req), existing.id, input)
    : await createCourse(tenantOf(req), input, {
        externalId: extOf(req.params.id),
      });
  await audit(
    req.actor,
    existing ? "COURSE_UPDATED" : "COURSE_CREATED",
    row.id,
  );
  res.status(existing ? 200 : 201).json(course(row));
});

// ----------------------------------------------------------------- questions
v1.get("/questions", scope("questions:read"), async (req, res) => {
  const p = await page("question", req, {});
  res.json({ ...p, data: p.data.map(question(req)) });
});
v1.post("/questions", scope("questions:write"), async (req, res) => {
  const { externalId: ext, ...input } = req.body || {};
  const row = await createQuestion(tenantOf(req), input, {
    externalId: ext == null ? null : parse(externalId, ext),
  });
  await audit(req.actor, "QUESTION_CREATED", row.id);
  res.status(201).json(question(req)(row));
});
v1.post("/questions/bulk", scope("questions:write"), async (req, res) => {
  const { questions } = parse(
    z.object({
      questions: z.array(z.record(z.string(), z.any())).min(1).max(500),
    }),
    req.body,
  );
  const results = [];
  for (const [index, item] of questions.entries()) {
    const { externalId: ext, ...input } = item;
    try {
      const extId = ext == null ? null : parse(externalId, ext);
      const existing = extId
        ? await find("question", req, `ext_${extId}`)
        : null;
      const row = existing
        ? await updateQuestion(tenantOf(req), existing.id, input)
        : await createQuestion(tenantOf(req), input, { externalId: extId });
      results.push({
        index,
        ok: true,
        id: row.id,
        externalId: row.externalId,
        created: !existing,
      });
    } catch (e) {
      results.push({
        index,
        ok: false,
        error:
          e.name === "ZodError"
            ? e.issues.map((i) => i.message).join("; ")
            : e.message,
      });
    }
  }
  await audit(
    req.actor,
    "QUESTIONS_BULK_UPSERTED",
    `${results.filter((r) => r.ok).length}`,
  );
  res.json({ results });
});
v1.get("/questions/:id", scope("questions:read"), async (req, res) =>
  res.json(
    question(req)(
      await mustFind("question", req, req.params.id, {}, "Question"),
    ),
  ),
);
v1.put("/questions/:id", scope("questions:write"), async (req, res) => {
  const existing = await find("question", req, req.params.id);
  if (!existing && !isExt(req.params.id)) fail(404, "Question not found.");
  const { externalId: _ignored, ...input } = req.body || {};
  const row = existing
    ? await updateQuestion(tenantOf(req), existing.id, input)
    : await createQuestion(tenantOf(req), input, {
        externalId: extOf(req.params.id),
      });
  await audit(
    req.actor,
    existing ? "QUESTION_UPDATED" : "QUESTION_CREATED",
    row.id,
  );
  res.status(existing ? 200 : 201).json(question(req)(row));
});
v1.delete("/questions/:id", scope("questions:write"), async (req, res) => {
  const q = await mustFind("question", req, req.params.id, {}, "Question");
  await deleteQuestion(tenantOf(req), q.id);
  await audit(req.actor, "QUESTION_DELETED", q.id);
  res.status(204).end();
});

// --------------------------------------------------------------------- exams
// Resolves ext_ references for the course and questions, then reuses saveExam.
async function examPayload(req) {
  const body = req.body || {};
  const { accessMode } = parse(
    z.object({
      accessMode: z.enum(["OPEN", "LAUNCH_ONLY"]).default("LAUNCH_ONLY"),
    }),
    { accessMode: body.accessMode },
  );
  const input = { ...body };
  delete input.externalId;
  delete input.accessMode;
  if (typeof input.courseId === "string" && isExt(input.courseId))
    input.courseId = (
      await mustFind("course", req, input.courseId, {}, "Course")
    ).id;
  if (Array.isArray(input.questionIds))
    input.questionIds = await Promise.all(
      input.questionIds.map(async (id) =>
        typeof id === "string" && isExt(id)
          ? (await mustFind("question", req, id, {}, `Question ${id}`)).id
          : id,
      ),
    );
  return { input, accessMode };
}
const loadExam = (id) =>
  db.exam.findUnique({ where: { id }, include: examInclude });
v1.get("/exams", scope("exams:read"), async (req, res) => {
  const p = await page("exam", req, {}, { include: examInclude });
  res.json({ ...p, data: p.data.map(exam) });
});
v1.post("/exams", scope("exams:write"), async (req, res) => {
  const ext =
    req.body?.externalId == null
      ? null
      : parse(externalId, req.body.externalId);
  const { input, accessMode } = await examPayload(req);
  const row = await saveExam(tenantOf(req), input, undefined, {
    externalId: ext,
    accessMode,
  });
  await audit(req.actor, "EXAM_CREATED", row.id);
  res.status(201).json(exam(await loadExam(row.id)));
});
v1.get("/exams/:id", scope("exams:read"), async (req, res) =>
  res.json(
    exam(
      await mustFind(
        "exam",
        req,
        req.params.id,
        { include: examInclude },
        "Exam",
      ),
    ),
  ),
);
v1.put("/exams/:id", scope("exams:write"), async (req, res) => {
  const existing = await find("exam", req, req.params.id);
  if (!existing && !isExt(req.params.id)) fail(404, "Exam not found.");
  const { input, accessMode } = await examPayload(req);
  const row = await saveExam(tenantOf(req), input, existing?.id, {
    accessMode,
    ...(existing ? {} : { externalId: extOf(req.params.id) }),
  });
  await audit(req.actor, existing ? "EXAM_UPDATED" : "EXAM_CREATED", row.id);
  res.status(existing ? 200 : 201).json(exam(await loadExam(row.id)));
});

// ------------------------------------------------------------------ students
const studentWhere = { role: "STUDENT" };
v1.get("/students", scope("students:read"), async (req, res) => {
  const p = await page("user", req, studentWhere);
  res.json({ ...p, data: p.data.map(student) });
});
async function mustFindStudent(req, value) {
  const u = await find("user", req, value);
  if (!u || u.role !== "STUDENT") fail(404, "Student not found.");
  return u;
}
v1.get("/students/:id", scope("students:read"), async (req, res) =>
  res.json(student(await mustFindStudent(req, req.params.id))),
);
v1.put("/students/:id", scope("students:write"), async (req, res) => {
  if (!isExt(req.params.id))
    fail(
      400,
      "Use PUT /students/ext_<externalId> to create or update a student.",
    );
  const data = parse(
    z.object({
      name: z.string().trim().min(1).max(190),
      studentNumber: z.string().max(100).nullable().optional(),
    }),
    req.body,
  );
  const existed = await find("user", req, req.params.id);
  const row = await upsertExternalStudent(tenantOf(req), {
    ...data,
    externalId: parse(externalId, extOf(req.params.id)),
  });
  if (!existed) await audit(req.actor, "STUDENT_CREATED", row.id);
  res.status(existed ? 200 : 201).json(student(row));
});
for (const [action, active] of [
  ["deactivate", false],
  ["reactivate", true],
])
  v1.post(
    `/students/:id/${action}`,
    scope("students:write"),
    async (req, res) => {
      const u = await mustFindStudent(req, req.params.id);
      const row = await db.user.update({
        where: { id: u.id },
        data: { active },
      });
      await audit(
        req.actor,
        active ? "STUDENT_REACTIVATED" : "STUDENT_DEACTIVATED",
        u.id,
      );
      res.json(student(row));
    },
  );

// ------------------------------------------------------------------ launches
v1.post("/launches", scope("launches:write"), async (req, res) => {
  const input = parse(launchSchema, req.body);
  const e = await mustFind("exam", req, input.examId, {}, "Exam");
  const launch = await createLaunch(tenantOf(req), e.id, input);
  await audit(req.actor, "LAUNCH_CREATED", launch.id);
  res.status(201).json(launch);
});

// ------------------------------------------------------------------ attempts
const attemptFilters = (req) =>
  parse(
    z.object({
      examId: z.string().max(200).optional(),
      studentId: z.string().max(200).optional(),
    }),
    { examId: req.query.examId, studentId: req.query.studentId },
  );
async function resolveFilterIds(req, q) {
  const where = {};
  if (q.examId)
    where.examId = (await mustFind("exam", req, q.examId, {}, "Exam")).id;
  if (q.studentId)
    where.studentId = (await mustFindStudent(req, q.studentId)).id;
  return where;
}
// Attempts are ordered by start time; the cursor is an attempt ID.
v1.get("/attempts", scope("attempts:read"), async (req, res) => {
  const { status } = parse(
    z.object({
      status: z
        .enum(["STARTED", "SUBMITTED", "GRADING", "GRADED", "EXPIRED"])
        .optional(),
    }),
    { status: req.query.status },
  );
  const where = {
    ...(await resolveFilterIds(req, attemptFilters(req))),
    ...(status ? { status } : {}),
  };
  const { limit, cursor } = parse(listQuery, {
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  const rows = await db.examAttempt.findMany({
    where: { ...where, institutionId: tenantOf(req) },
    include: attemptInclude,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const more = rows.length > limit;
  const data = (more ? rows.slice(0, limit) : rows).map(attempt);
  res.json({ data, nextCursor: more ? data[data.length - 1].id : null });
});
v1.get("/attempts/:id", scope("attempts:read"), async (req, res) => {
  const a = await db.examAttempt.findFirst({
    where: { id: req.params.id, institutionId: tenantOf(req) },
    include: attemptInclude,
  });
  if (!a) fail(404, "Attempt not found.");
  res.json(attempt(a));
});
v1.get("/attempts/:id/integrity", scope("attempts:read"), async (req, res) => {
  const a = await db.examAttempt.findFirst({
    where: { id: req.params.id, institutionId: tenantOf(req) },
    include: { violations: { orderBy: { createdAt: "asc" } } },
  });
  if (!a) fail(404, "Attempt not found.");
  res.json({
    attemptId: a.id,
    status: a.status,
    lastSeenAt: a.lastSeenAt,
    disconnectedAt: a.disconnectedAt,
    events: a.violations.map((v) => ({ type: v.type, createdAt: v.createdAt })),
  });
});

// ------------------------------------------------------------------- results
v1.get("/results", scope("results:read"), async (req, res) => {
  const q = attemptFilters(req);
  const extra = parse(
    z.object({
      released: bool,
      status: z.enum(["GRADED", "UNDER_REVIEW"]).optional(),
    }),
    { released: req.query.released, status: req.query.status },
  );
  const where = {
    attempt: await resolveFilterIds(req, q),
    ...(extra.released === undefined ? {} : { released: extra.released }),
    ...(extra.status ? { status: extra.status } : {}),
  };
  const p = await page("result", req, where, { include: resultInclude });
  res.json({ ...p, data: p.data.map((r) => result(r)) });
});
const loadResult = async (req) => {
  const r = await db.result.findFirst({
    where: { id: req.params.id, institutionId: tenantOf(req) },
    include: resultInclude,
  });
  if (!r) fail(404, "Result not found.");
  return r;
};
v1.get("/results/:id", scope("results:read"), async (req, res) =>
  res.json(result(await loadResult(req), true)),
);
v1.post("/results/:id/release", scope("results:write"), async (req, res) => {
  const r = await releaseResult(tenantOf(req), req.params.id);
  await audit(req.actor, "RESULT_RELEASED", r.id);
  res.json(result(await loadResult(req), true));
});
v1.get("/grading", scope("results:read"), async (req, res) => {
  const p = await page(
    "result",
    req,
    { status: "UNDER_REVIEW" },
    { include: resultInclude },
  );
  res.json({ ...p, data: p.data.map((r) => result(r, true)) });
});
v1.post("/results/:id/grade", scope("results:write"), async (req, res) => {
  await gradeResult(tenantOf(req), req.params.id, req.body);
  await audit(req.actor, "ESSAY_GRADED", req.params.id);
  res.json(result(await loadResult(req), true));
});

// -------------------------------------------------------------- certificates
v1.post(
  "/results/:id/certificate",
  scope("certificates:read"),
  async (req, res) => {
    const r = await loadResult(req);
    if (!(r.released && r.passed && r.status === "GRADED"))
      fail(409, "A released passing result is required.");
    const c = await issueCertificate(r, req.actor);
    res.json({
      id: c.id,
      resultId: r.id,
      code: c.code,
      createdAt: c.createdAt,
      verifyUrl: `${process.env.APP_URL}/verify/${c.code}`,
    });
  },
);
v1.get(
  "/certificates/:id/pdf",
  scope("certificates:read"),
  async (req, res) => {
    const c = await db.certificate.findFirst({
      where: {
        id: req.params.id,
        result: { institutionId: tenantOf(req), released: true },
      },
      include: certificatePdfInclude,
    });
    if (!c) fail(404, "Certificate not found.");
    await sendCertificatePdf(res, c);
  },
);

// ------------------------------------------------------------ 404 and errors
v1.use((req, res) =>
  res
    .status(404)
    .json({ error: { code: "not_found", message: "Endpoint not found." } }),
);
const codes = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  429: "rate_limited",
};
v1.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.name === "ZodError")
    return res.status(400).json({
      error: {
        code: "validation_failed",
        message: "The request body is invalid.",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  if (error.type === "entity.parse.failed")
    return res
      .status(400)
      .json({ error: { code: "invalid_json", message: "Invalid JSON." } });
  if (error.code === "P2002")
    return res.status(409).json({
      error: {
        code: "conflict",
        message: "A record with this externalId or code already exists.",
      },
    });
  if (error.code === "P2025")
    return res
      .status(404)
      .json({ error: { code: "not_found", message: "Record not found." } });
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({
    error: {
      code:
        typeof error.code === "string" && !error.code.startsWith("P")
          ? error.code
          : codes[status] || "server_error",
      message:
        status === 500
          ? "Something went wrong. Please try again."
          : error.message,
      requestId: req.id,
    },
  });
});
