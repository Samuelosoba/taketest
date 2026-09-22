import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
// Always use a unique disposable database, never the developer's database.
const file = `test-${randomUUID()}.db`;
process.env.DATABASE_URL = `file:./${file}`;
process.env.JWT_SECRET = "test-secret-which-is-longer-than-32-characters";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYSTACK_SECRET_KEY = "";
writeFileSync(`prisma/${file}`, "");
writeFileSync(
  "prisma/schema.local.prisma",
  readFileSync("prisma/schema.prisma", "utf8")
    .replace('provider = "mysql"', 'provider = "sqlite"')
    .replace(/ @db\.\w+(\([^)]*\))?/g, ""),
);
execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "db",
    "push",
    "--schema",
    "prisma/schema.local.prisma",
    "--skip-generate",
  ],
  { stdio: "pipe", env: process.env },
);
const { app } = await import("../src/app.js");
const { db, defaultSettings } = await import("../src/core.js");
const { markQuestions, expireAttempts } = await import("../src/grading.js");
const { applyVerifiedPayment } = await import("../src/payment-routes.js");
let server,
  base,
  admin,
  other,
  student,
  examiner,
  course,
  exam,
  paidExam,
  questions,
  studentUser;
const request = async (path, method = "GET", body, token) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = r.headers.get("content-type") || "";
  return {
    status: r.status,
    data: contentType.includes("application/json")
      ? await r.json()
      : await r.arrayBuffer(),
    headers: r.headers,
  };
};
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const a = await request("/auth/register", "POST", {
    name: "Test Admin",
    email: "admin@test.example",
    password: "Assessment123!",
    institutionName: "Test Academy",
    slug: "test-academy",
  });
  assert.equal(a.status, 201);
  admin = a.data.token;
  const b = await request("/auth/register", "POST", {
    name: "Other Admin",
    email: "other@test.example",
    password: "Assessment123!",
    institutionName: "Other Academy",
    slug: "other-academy",
  });
  other = b.data.token;
  const s = await request("/auth/register", "POST", {
    name: "Test Student",
    email: "student@test.example",
    password: "Assessment123!",
    slug: "test-academy",
  });
  student = s.data.token;
  studentUser = s.data.user;
  await request(
    "/users",
    "POST",
    {
      name: "Test Examiner",
      email: "examiner@test.example",
      password: "Assessment123!",
      role: "EXAMINER",
    },
    admin,
  );
  examiner = (
    await request("/auth/login", "POST", {
      email: "examiner@test.example",
      password: "Assessment123!",
    })
  ).data.token;
  course = (
    await request(
      "/courses",
      "POST",
      { title: "Algebra", code: "ALG", description: "A test course" },
      admin,
    )
  ).data;
  questions = [];
  for (const q of [
    {
      text: "Choose the correct answer",
      type: "SINGLE",
      marks: 5,
      options: [
        { id: "a", text: "Yes", correct: true },
        { id: "b", text: "No", correct: false },
      ],
    },
    {
      text: "Select the complete set",
      type: "MULTIPLE",
      marks: 5,
      options: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: true },
        { id: "c", text: "C", correct: false },
      ],
    },
  ])
    questions.push((await request("/questions", "POST", q, admin)).data);
  const data = {
    title: "Test exam",
    description: "Test",
    courseId: course.id,
    duration: 30,
    passMark: 50,
    price: 0,
    maxAttempts: 3,
    status: "PUBLISHED",
    questionIds: questions.map((q) => q.id),
    shuffleQuestions: true,
    shuffleOptions: true,
    releaseResults: true,
    fullscreen: false,
  };
  exam = (await request("/exams", "POST", data, admin)).data;
  paidExam = (
    await request(
      "/exams",
      "POST",
      { ...data, title: "Paid exam", price: 250000 },
      admin,
    )
  ).data;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.$disconnect();
  for (const path of [`prisma/${file}`, `prisma/${file}-journal`])
    if (existsSync(path)) unlinkSync(path);
});
test("tenant isolation and backend roles prevent unauthorized access", async () => {
  assert.equal((await request("/courses", "GET", null, other)).data.length, 0);
  assert.equal(
    (
      await request(
        `/courses/${course.id}`,
        "PATCH",
        { title: "Hacked" },
        other,
      )
    ).status,
    404,
  );
  assert.equal((await request("/questions", "GET", null, student)).status, 403);
  assert.equal((await request("/users", "GET", null, examiner)).status, 403);
  assert.equal((await request("/platform", "GET", null, admin)).status, 403);
  assert.equal((await request("/exams", "GET")).status, 401);
  assert.equal(
    (await request("/exams", "POST", { title: "Invalid" }, admin)).status,
    400,
  );
  assert.equal(
    (await request(`/exams/${exam.id}/start`, "POST", {}, other)).status,
    403,
  );
});
test("payment gate rejects unpaid starts and fake confirmations", async () => {
  assert.equal(
    (await request(`/exams/${paidExam.id}/start`, "POST", {}, student)).status,
    402,
  );
  assert.equal(
    (
      await request(
        "/payments/initialize",
        "POST",
        { examId: paidExam.id },
        student,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await request(
        "/payments/verify",
        "POST",
        { reference: "forged" },
        student,
      )
    ).status,
    404,
  );
  process.env.PAYSTACK_SECRET_KEY = "test-webhook-secret";
  assert.equal(
    (
      await request("/payments/webhook", "POST", {
        event: "charge.success",
        data: { reference: "forged" },
      })
    ).status,
    401,
  );
  process.env.PAYSTACK_SECRET_KEY = "";
});
test("payment processing checks amount/customer and remains idempotent", async () => {
  const p = await db.payment.create({
    data: {
      institutionId: studentUser.institutionId,
      studentId: studentUser.id,
      examId: paidExam.id,
      reference: "verified-test-reference",
      amount: 250000,
    },
  });
  const data = {
    reference: p.reference,
    status: "success",
    amount: p.amount,
    currency: "NGN",
    customer: { email: studentUser.email },
  };
  await assert.rejects(applyVerifiedPayment({ ...data, amount: 1 }));
  await assert.rejects(applyVerifiedPayment({ ...data, currency: "USD" }));
  await assert.rejects(
    applyVerifiedPayment({
      ...data,
      customer: { email: "attacker@test.example" },
    }),
  );
  await applyVerifiedPayment(data);
  await applyVerifiedPayment(data);
  assert.equal(
    await db.payment.count({
      where: { reference: p.reference, status: "SUCCESS" },
    }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { targetId: p.id, action: "PAYMENT_VERIFIED" },
    }),
    1,
  );
  assert.equal(
    (await request(`/exams/${paidExam.id}/start`, "POST", {}, student)).status,
    200,
  );
});
test("answers stay secret, saves recover, and grades use backend answers", async () => {
  const start = await request(`/exams/${exam.id}/start`, "POST", {}, student);
  assert.equal(start.status, 200);
  const a = start.data;
  assert.ok(
    a.questions.every(
      (q) =>
        !("acceptedAnswers" in q) && q.options.every((o) => !("correct" in o)),
    ),
  );
  assert.equal(
    (await request(`/exams/${exam.id}/start`, "POST", {}, student)).data.id,
    a.id,
  );
  assert.equal(
    (await request(`/attempts/${a.id}`, "GET", null, other)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/answers`,
        "PUT",
        { answers: { foreign: ["a"] } },
        student,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/answers`,
        "PUT",
        { answers: { [questions[0].id]: ["forged"] } },
        student,
      )
    ).status,
    400,
  );
  const answers = { [questions[0].id]: ["a"], [questions[1].id]: ["b", "a"] };
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/answers`,
        "PUT",
        { answers, score: 0 },
        student,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await request(`/attempts/${a.id}`, "GET", null, student)).data.answers,
    answers,
  );
  const submitted = await request(
    `/attempts/${a.id}/submit`,
    "POST",
    { percentage: 0 },
    student,
  );
  assert.equal(submitted.status, 200);
  const result = await db.result.findUnique({
    where: { id: submitted.data.id },
  });
  assert.equal(result.percentage, 100);
  assert.equal(result.passed, true);
  assert.equal(
    (await request(`/attempts/${a.id}/submit`, "POST", {}, student)).data.id,
    result.id,
  );
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/answers`,
        "PUT",
        { answers: {} },
        student,
      )
    ).status,
    409,
  );
  const c = await request(`/certificates/${result.id}`, "POST", {}, student);
  assert.equal(c.status, 200);
  const verified = await request(`/public/certificates/${c.data.code}`);
  assert.equal(verified.data.student, "Test Student");
  assert.ok(!("email" in verified.data));
  const pdf = await request(
    `/certificates/${c.data.id}/pdf`,
    "GET",
    null,
    student,
  );
  assert.equal(pdf.status, 200);
  assert.ok(Buffer.from(pdf.data).subarray(0, 4).toString() === "%PDF");
});
test("late saves are rejected and expired attempts are auto-graded", async () => {
  const a = (await request(`/exams/${exam.id}/start`, "POST", {}, student))
    .data;
  await db.examAttempt.update({
    where: { id: a.id },
    data: { expectedEndAt: new Date(Date.now() - 10000) },
  });
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/answers`,
        "PUT",
        { answers: { [questions[0].id]: ["a"] } },
        student,
      )
    ).status,
    410,
  );
  const saved = await db.examAttempt.findUnique({
    where: { id: a.id },
    include: { result: true },
  });
  assert.equal(saved.status, "EXPIRED");
  assert.equal(saved.result.percentage, 0);
  const next = (await request(`/exams/${exam.id}/start`, "POST", {}, student))
    .data;
  await db.examAttempt.update({
    where: { id: next.id },
    data: { expectedEndAt: new Date(Date.now() - 10000) },
  });
  await expireAttempts();
  assert.equal(
    (await db.examAttempt.findUnique({ where: { id: next.id } })).status,
    "EXPIRED",
  );
  assert.equal(
    (await request(`/exams/${exam.id}/start`, "POST", {}, student)).status,
    403,
  );
});
test("manual grading holds results, enforces marks, and recalculates outcomes", async () => {
  const question = (
    await request(
      "/questions",
      "POST",
      { text: "Explain your reasoning", type: "ESSAY", marks: 10, options: [] },
      examiner,
    )
  ).data;
  const e = (
    await request(
      "/exams",
      "POST",
      {
        title: "Essay test",
        description: "",
        courseId: course.id,
        duration: 10,
        passMark: 50,
        price: 0,
        maxAttempts: 1,
        status: "PUBLISHED",
        questionIds: [question.id],
        releaseResults: false,
      },
      examiner,
    )
  ).data;
  const a = (await request(`/exams/${e.id}/start`, "POST", {}, student)).data;
  await request(
    `/attempts/${a.id}/answers`,
    "PUT",
    { answers: { [question.id]: "A thoughtful response" } },
    student,
  );
  const r = (await request(`/attempts/${a.id}/submit`, "POST", {}, student))
    .data;
  assert.equal(r.status, "UNDER_REVIEW");
  assert.equal(r.released, false);
  assert.equal(
    (
      await request(
        `/grading/${r.id}`,
        "POST",
        { grades: [{ questionId: question.id, awarded: 11 }] },
        examiner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/grading/${r.id}`,
        "POST",
        {
          grades: [
            { questionId: question.id, awarded: 8, comment: "Well reasoned." },
          ],
        },
        other,
      )
    ).status,
    404,
  );
  const grade = await request(
    `/grading/${r.id}`,
    "POST",
    {
      grades: [
        { questionId: question.id, awarded: 8, comment: "Well reasoned." },
      ],
    },
    examiner,
  );
  assert.equal(grade.status, 200);
  assert.equal(grade.data.percentage, 80);
  assert.equal(grade.data.released, false);
  assert.ok(
    !(await request("/results", "GET", null, student)).data.some(
      (x) => x.id === r.id,
    ),
  );
  await request(`/results/${r.id}/release`, "POST", {}, examiner);
  assert.ok(
    (await request("/results", "GET", null, student)).data.some(
      (x) => x.id === r.id,
    ),
  );
});
test("multiple answer grading requires exact sets; short answers normalize text", () => {
  const qs = [
    {
      id: "1",
      type: "MULTIPLE",
      marks: 3,
      options: [
        { id: "a", correct: true },
        { id: "b", correct: true },
      ],
    },
    {
      id: "2",
      type: "SHORT",
      marks: 2,
      options: [],
      acceptedAnswers: ["Central Processing Unit"],
    },
  ];
  const result = markQuestions(qs, {
    1: ["a"],
    2: "  CENTRAL   processing unit ",
  });
  assert.equal(result[0].awarded, 0);
  assert.equal(result[1].awarded, 2);
});
test("camera checks, event integrity, and examiner access are enforced", async () => {
  const config = {
    title: "Proctored examination",
    description: "",
    courseId: course.id,
    duration: 30,
    passMark: 50,
    price: 0,
    maxAttempts: 2,
    status: "PUBLISHED",
    cameraRequired: true,
    questionIds: questions.map((q) => q.id),
  };
  const examResponse = await request("/exams", "POST", config, admin);
  assert.equal(examResponse.status, 201);
  const id = examResponse.data.id;
  assert.equal(
    (await request(`/exams/${id}/start`, "POST", {}, student)).status,
    400,
  );
  const started = await request(
    `/exams/${id}/start`,
    "POST",
    { cameraReady: true },
    student,
  );
  assert.equal(started.status, 200);
  const a = started.data;
  assert.equal(a.cameraRequired, true);
  assert.ok(a.monitoringToken);
  const event = { type: "FACE_ABSENT", eventId: randomUUID() };
  assert.equal(
    (await request(`/attempts/${a.id}/events`, "POST", event, student)).status,
    200,
  );
  await request(`/attempts/${a.id}/events`, "POST", event, student);
  assert.equal(
    await db.examViolation.count({
      where: { attemptId: a.id, type: "FACE_ABSENT" },
    }),
    1,
  );
  assert.equal(
    (
      await request(
        `/attempts/${a.id}/events`,
        "POST",
        { type: "CONNECTION_LOST" },
        student,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/attempts/${a.id}/integrity`, "GET", null, other)).status,
    404,
  );
  assert.equal(
    (await request("/monitoring", "GET", null, student)).status,
    403,
  );
  const report = await request(
    `/attempts/${a.id}/integrity`,
    "GET",
    null,
    examiner,
  );
  assert.equal(report.status, 200);
  assert.equal(report.data.violations[0].type, "FACE_ABSENT");
  assert.ok(!report.data.snapshot);
  const beacon = {
    token: a.monitoringToken,
    type: "PAGE_EXIT",
    eventId: randomUUID(),
  };
  assert.equal(
    (await request(`/attempts/${a.id}/exit-beacon`, "POST", beacon)).status,
    204,
  );
  await request(`/attempts/${a.id}/exit-beacon`, "POST", beacon);
  assert.equal(
    await db.examViolation.count({
      where: { attemptId: a.id, type: "PAGE_EXIT" },
    }),
    1,
  );
  assert.equal(
    (
      await request(`/attempts/${a.id}/exit-beacon`, "POST", {
        ...beacon,
        token: "forged",
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/attempts/wrong-id/exit-beacon", "POST", beacon)).status,
    403,
  );
  assert.equal(
    (
      await request(`/attempts/${a.id}/exit-beacon`, "POST", {
        ...beacon,
        type: "FACE_ABSENT",
      })
    ).status,
    400,
  );
  // The exit-only token must not work as a general authentication credential.
  assert.equal(
    (await request("/courses", "GET", null, a.monitoringToken)).status,
    401,
  );
  await request(`/attempts/${a.id}/submit`, "POST", {}, student);
  assert.equal(
    (
      await request(`/attempts/${a.id}/exit-beacon`, "POST", {
        ...beacon,
        eventId: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/attempts/${a.id}/heartbeat`, "POST", {}, student)).status,
    404,
  );
});
test("server detects silent disconnections once and records restoration", async () => {
  const { detectDisconnectedAttempts, HEARTBEAT_GRACE_MS } =
    await import("../src/proctoring.js");
  const a = await db.examAttempt.findFirst({
    where: {
      examId: paidExam.id,
      studentId: studentUser.id,
      status: "STARTED",
    },
  });
  const now = new Date();
  await db.examAttempt.update({
    where: { id: a.id },
    data: { lastSeenAt: new Date(now.getTime() - HEARTBEAT_GRACE_MS - 1000) },
  });
  await detectDisconnectedAttempts(now);
  await detectDisconnectedAttempts(now);
  assert.equal(
    await db.examViolation.count({
      where: { attemptId: a.id, type: "CONNECTION_LOST" },
    }),
    1,
  );
  assert.ok(
    (await db.examAttempt.findUnique({ where: { id: a.id } })).disconnectedAt,
  );
  assert.equal(
    (await request(`/attempts/${a.id}/heartbeat`, "POST", {}, student)).status,
    200,
  );
  await request(`/attempts/${a.id}/heartbeat`, "POST", {}, student);
  assert.equal(
    await db.examViolation.count({
      where: { attemptId: a.id, type: "CONNECTION_RESTORED" },
    }),
    1,
  );
  assert.equal(
    (await db.examAttempt.findUnique({ where: { id: a.id } })).disconnectedAt,
    null,
  );
});
test("refresh rotation and tenant suspension invalidate access", async () => {
  const login = await request("/auth/login", "POST", {
    email: "admin@test.example",
    password: "Assessment123!",
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const refresh = await fetch(base + "/auth/refresh", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(refresh.status, 200);
  assert.equal(
    (
      await fetch(base + "/auth/refresh", {
        method: "POST",
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
  await db.institution.update({
    where: { id: studentUser.institutionId },
    data: { status: "SUSPENDED" },
  });
  assert.equal((await request("/courses", "GET", null, student)).status, 403);
});
