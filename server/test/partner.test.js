import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { writeLocalSchema } from "../scripts/local-schema.mjs";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
// Unique disposable database, never the developer's database.
const file = `test-${randomUUID()}.db`;
process.env.DATABASE_URL = `file:./${file}`;
process.env.JWT_SECRET = "test-secret-which-is-longer-than-32-characters";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYSTACK_SECRET_KEY = "";
process.env.WEBHOOK_ALLOW_PRIVATE = "true";
writeFileSync(`prisma/${file}`, "");
writeLocalSchema();
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
const { db } = await import("../src/core.js");
const { expireAttempts } = await import("../src/grading.js");
const { deliverWebhooks, assertDeliverable, checkWebhookUrl, RETRY_DELAYS_MS } =
  await import("../src/partner/webhooks.js");
const { SCOPES } = await import("../src/partner/api-keys.js");

let server, base, admin, otherAdmin, nativeStudent, keyA, keyB, readOnlyKey;
let hook, hookUrl;
const received = [];
let hookStatus = 200;

const request = async (path, method = "GET", body, token, headers = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const type = r.headers.get("content-type") || "";
  return {
    status: r.status,
    headers: r.headers,
    data: type.includes("application/json")
      ? await r.json()
      : r.status === 204
        ? null
        : await r.arrayBuffer(),
  };
};
const api = (path, method, body, key = keyA, headers) =>
  request(`/v1${path}`, method, body, key, headers);
const single = (ext, correct = "a") => ({
  externalId: ext,
  text: `Question ${ext}`,
  type: "SINGLE",
  marks: 5,
  options: [
    { id: "a", text: "A", correct: correct === "a" },
    { id: "b", text: "B", correct: correct === "b" },
  ],
});
const examBody = (overrides = {}) => ({
  title: "Partner final",
  description: "",
  courseId: "ext_MATH101",
  duration: 30,
  passMark: 50,
  price: 0,
  maxAttempts: 2,
  status: "PUBLISHED",
  questionIds: ["ext_Q1", "ext_Q2"],
  shuffleQuestions: false,
  shuffleOptions: false,
  releaseResults: true,
  ...overrides,
});
const tokenOf = (url) => new URL(url).pathname.split("/").pop();
async function launch(examId, externalId = "S-1", extra = {}) {
  const r = await api("/launches", "POST", {
    examId,
    student: { externalId, name: `Student ${externalId}` },
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function exchange(url) {
  return request("/launch/exchange", "POST", { token: tokenOf(url) });
}

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  hook = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = hookStatus;
      res.end("ok");
    });
  });
  hook.listen(0, "127.0.0.1");
  await new Promise((resolve) => hook.once("listening", resolve));
  hookUrl = `http://127.0.0.1:${hook.address().port}/hooks`;

  const register = async (name, email, slug) =>
    (
      await request("/auth/register", "POST", {
        name,
        email,
        password: "Assessment123!",
        institutionName: `${name} Institute`,
        slug,
      })
    ).data.token;
  admin = await register("Klar", "admin@klar.example", "klar");
  otherAdmin = await register("Other", "admin@other.example", "other-school");
  nativeStudent = (
    await request("/auth/register", "POST", {
      name: "Native Student",
      email: "native@klar.example",
      password: "Assessment123!",
      slug: "klar",
    })
  ).data.token;
  const createKey = async (token, scopes) => {
    const r = await request(
      "/developer/keys",
      "POST",
      { name: "Server", scopes },
      token,
    );
    assert.equal(r.status, 201);
    return r.data.key;
  };
  keyA = await createKey(admin, SCOPES);
  keyB = await createKey(otherAdmin, SCOPES);
  readOnlyKey = await createKey(admin, ["courses:read", "questions:read"]);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => hook.close(resolve));
  await db.$disconnect();
  for (const path of [`prisma/${file}`, `prisma/${file}-journal`])
    if (existsSync(path)) unlinkSync(path);
});

test("API keys authenticate, are scoped, and can be revoked", async () => {
  assert.equal((await api("/me", "GET", undefined, null)).status, 401);
  const bad = await api("/me", "GET", undefined, "sk_live_notarealkey");
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.code, "unauthorized");
  const me = await api("/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.institution.slug, "klar");
  assert.ok(me.headers.get("x-request-id"));
  const denied = await api(
    "/courses",
    "POST",
    { title: "X", code: "X" },
    readOnlyKey,
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.data.error.code, "insufficient_scope");
  // A user access token is not an API key, and an API key is not a user token.
  assert.equal((await api("/me", "GET", undefined, admin)).status, 401);
  assert.equal((await request("/courses", "GET", undefined, keyA)).status, 401);
  // Only admins manage keys; the full key is never listed again.
  assert.equal(
    (await request("/developer/keys", "GET", undefined, nativeStudent)).status,
    403,
  );
  const keys = (await request("/developer/keys", "GET", undefined, admin)).data;
  assert.ok(keys.every((k) => !("key" in k) && !("hash" in k)));
  const temp = await request(
    "/developer/keys",
    "POST",
    { name: "Temp", scopes: ["courses:read"] },
    admin,
  );
  assert.equal((await api("/me", "GET", undefined, temp.data.key)).status, 200);
  await request(`/developer/keys/${temp.data.id}/revoke`, "POST", {}, admin);
  assert.equal((await api("/me", "GET", undefined, temp.data.key)).status, 401);
});

test("content is created with external IDs, upserted, and isolated per institution", async () => {
  const c1 = await api("/courses/ext_MATH101", "PUT", {
    title: "Maths",
    code: "MATH101",
  });
  assert.equal(c1.status, 201);
  assert.equal(c1.data.externalId, "MATH101");
  const c2 = await api("/courses/ext_MATH101", "PUT", {
    title: "Mathematics",
    code: "MATH101",
  });
  assert.equal(c2.status, 200);
  assert.equal(c2.data.id, c1.data.id);
  assert.equal(c2.data.title, "Mathematics");

  assert.equal((await api("/questions", "POST", single("Q1"))).status, 201);
  const bulk = await api("/questions/bulk", "POST", {
    questions: [
      single("Q2", "b"),
      single("Q1"),
      { externalId: "BAD", text: "?" },
    ],
  });
  assert.equal(bulk.status, 200);
  assert.deepEqual(
    bulk.data.results.map((r) => r.ok),
    [true, true, false],
  );
  assert.deepEqual(
    bulk.data.results.map((r) => r.created),
    [true, false, undefined],
  );

  // Correct answers stay hidden without the questions:answers scope.
  const hidden = await api("/questions/ext_Q1", "GET", undefined, readOnlyKey);
  assert.ok(hidden.data.options.every((o) => !("correct" in o)));
  const shown = await api("/questions/ext_Q1");
  assert.equal(shown.data.options.find((o) => o.id === "a").correct, true);

  const e = await api("/exams", "POST", { ...examBody(), externalId: "FINAL" });
  assert.equal(e.status, 201, JSON.stringify(e.data));
  assert.equal(e.data.accessMode, "LAUNCH_ONLY");
  assert.equal(e.data.courseExternalId, "MATH101");
  assert.equal(e.data.questionIds.length, 2);
  assert.equal(e.data.totalMarks, 10);

  // Another institution's key sees nothing and cannot reference A's records.
  assert.equal(
    (await api("/exams/ext_FINAL", "GET", undefined, keyB)).status,
    404,
  );
  assert.equal(
    (await api(`/courses/${c1.data.id}`, "GET", undefined, keyB)).status,
    404,
  );
  const crossRef = await api(
    "/exams",
    "POST",
    examBody({ courseId: c1.data.id, questionIds: [], status: "DRAFT" }),
    keyB,
  );
  assert.equal(crossRef.status, 400);
  assert.equal(
    (await api("/exams", "POST", examBody({ courseId: "ext_MATH101" }), keyB))
      .status,
    404,
  );
  assert.equal(
    (await api("/courses", "GET", undefined, keyB)).data.data.length,
    0,
  );
  // Duplicate external IDs conflict.
  const dup = await api("/courses", "POST", {
    title: "Dup",
    code: "DUP",
    externalId: "MATH101",
  });
  assert.equal(dup.status, 409);
});

test("idempotency keys replay POSTs and cursors paginate every row once", async () => {
  const headers = { "Idempotency-Key": "create-history-1" };
  const body = { title: "History", code: "HIS", externalId: "HIS" };
  const first = await api("/courses", "POST", body, keyA, headers);
  const again = await api("/courses", "POST", body, keyA, headers);
  assert.equal(first.status, 201);
  assert.equal(again.status, 201);
  assert.equal(again.headers.get("idempotent-replayed"), "true");
  assert.equal(again.data.id, first.data.id);
  const changed = await api(
    "/courses",
    "POST",
    { ...body, title: "Other" },
    keyA,
    headers,
  );
  assert.equal(changed.status, 409);
  assert.equal(changed.data.error.code, "idempotency_conflict");

  for (const code of ["P1", "P2", "P3"])
    await api("/courses", "POST", { title: code, code });
  const seen = [];
  let cursor = "";
  do {
    const p = await api(`/courses?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
    assert.ok(p.data.data.length <= 2);
    seen.push(...p.data.data.map((c) => c.id));
    cursor = p.data.nextCursor;
  } while (cursor);
  assert.equal(seen.length, new Set(seen).size);
  assert.equal(
    seen.length,
    await db.course.count({ where: { institution: { slug: "klar" } } }),
  );
});

test("launch links are single-use, limited to one exam, and bypass the student login", async () => {
  // returnUrl must be on the institution's allow-list.
  const blocked = await api("/launches", "POST", {
    examId: "ext_FINAL",
    student: { externalId: "S-1", name: "Ada" },
    returnUrl: "https://evil.example/done",
  });
  assert.equal(blocked.status, 400);
  const origins = await request(
    "/developer/origins",
    "PUT",
    { origins: ["https://dashboard.klar.example"] },
    admin,
  );
  assert.deepEqual(origins.data.origins, ["https://dashboard.klar.example"]);
  const l = await launch("ext_FINAL", "S-1", {
    returnUrl: "https://dashboard.klar.example/exams/done",
  });
  assert.match(l.url, /^http:\/\/localhost:5173\/launch\/[a-f0-9]{64}$/);

  const ex = await exchange(l.url);
  assert.equal(ex.status, 200);
  assert.equal(ex.data.exam.title, "Partner final");
  assert.equal(ex.data.returnUrl, "https://dashboard.klar.example/exams/done");
  assert.equal(ex.data.user.email, null);
  assert.equal((await exchange(l.url)).status, 410);
  const session = ex.data.token;

  // The session reaches only this exam's attempt routes.
  for (const [path, method] of [
    ["/exams", "GET"],
    ["/results", "GET"],
    ["/payments", "GET"],
    ["/certificates", "GET"],
    ["/auth/me", "GET"],
    ["/developer/keys", "GET"],
  ])
    assert.ok(
      [401, 403].includes(
        (await request(path, method, undefined, session)).status,
      ),
      `${method} ${path} should be blocked`,
    );
  const otherExam = await api(
    "/exams/ext_OTHER",
    "PUT",
    examBody({ title: "Other" }),
  );
  assert.equal(otherExam.status, 201);
  assert.equal(
    (await request(`/exams/${otherExam.data.id}/start`, "POST", {}, session))
      .status,
    403,
  );

  // Launch-only exams are hidden from and blocked for normal student logins.
  const listed = (await request("/exams", "GET", undefined, nativeStudent))
    .data;
  assert.ok(!listed.some((e) => e.id === ex.data.exam.id));
  assert.equal(
    (
      await request(
        `/exams/${ex.data.exam.id}/start`,
        "POST",
        {},
        nativeStudent,
      )
    ).status,
    403,
  );

  const start = await request(
    `/exams/${ex.data.exam.id}/start`,
    "POST",
    {},
    session,
  );
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const attemptId = start.data.id;
  assert.ok(
    start.data.questions.every((q) =>
      q.options.every((o) => !("correct" in o)),
    ),
  );
  const q = Object.fromEntries(start.data.questions.map((x) => [x.text, x.id]));
  assert.equal(
    (
      await request(
        `/attempts/${attemptId}/answers`,
        "PUT",
        { answers: { [q["Question Q1"]]: ["a"], [q["Question Q2"]]: ["a"] } },
        session,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/attempts/${attemptId}/heartbeat`, "POST", {}, session))
      .status,
    200,
  );
  assert.equal(
    (await request(`/attempts/${attemptId}/submit`, "POST", {}, session))
      .status,
    200,
  );
  const outcome = await request("/launch/result", "GET", undefined, session);
  assert.equal(outcome.data.result.percentage, 50);
  assert.equal(outcome.data.result.passed, true);

  // The partner reads the outcome through the API with its own IDs.
  const results = await api("/results?examId=ext_FINAL&studentId=ext_S-1");
  assert.equal(results.data.data.length, 1);
  const r = results.data.data[0];
  assert.equal(r.studentExternalId, "S-1");
  assert.equal(r.examExternalId, "FINAL");
  assert.equal(r.percentage, 50);
  const attempt = await api(`/attempts/${attemptId}`);
  assert.equal(attempt.data.launchId, l.id);
  assert.ok(!("answers" in attempt.data) && !("snapshot" in attempt.data));
  assert.equal((await api(`/attempts/${attemptId}/integrity`)).status, 200);
  const cert = await api(`/results/${r.id}/certificate`, "POST", {});
  assert.equal(cert.status, 200);
  assert.match(cert.data.verifyUrl, /\/verify\//);
  const pdf = await api(`/certificates/${cert.data.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  // Another institution cannot read it.
  assert.equal(
    (await api(`/results/${r.id}`, "GET", undefined, keyB)).status,
    404,
  );
});

test("launch rules: expiry, attempt limits, deactivation, payment, and resume", async () => {
  const expired = await launch("ext_FINAL", "S-2");
  await db.launchToken.updateMany({
    where: { userId: expired.studentId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await exchange(expired.url)).status, 410);

  // Resuming with a fresh launch returns the same in-progress attempt.
  const s1 = (await exchange((await launch("ext_FINAL", "S-2")).url)).data;
  const a1 = (await request(`/exams/${s1.exam.id}/start`, "POST", {}, s1.token))
    .data;
  const s2 = (await exchange((await launch("ext_FINAL", "S-2")).url)).data;
  assert.equal(s2.activeAttemptId, a1.id);
  const a2 = (await request(`/exams/${s2.exam.id}/start`, "POST", {}, s2.token))
    .data;
  assert.equal(a2.id, a1.id);
  await request(`/attempts/${a1.id}/submit`, "POST", {}, s2.token);
  // maxAttempts is 2: one more launch is allowed, then refused.
  const s3 = (await exchange((await launch("ext_FINAL", "S-2")).url)).data;
  const a3 = (await request(`/exams/${s3.exam.id}/start`, "POST", {}, s3.token))
    .data;
  await request(`/attempts/${a3.id}/submit`, "POST", {}, s3.token);
  const none = await api("/launches", "POST", {
    examId: "ext_FINAL",
    student: { externalId: "S-2", name: "S2" },
  });
  assert.equal(none.status, 409);

  // Deactivation blocks new launches and kills live sessions.
  const live = (await exchange((await launch("ext_FINAL", "S-3")).url)).data;
  const off = await api("/students/ext_S-3/deactivate", "POST", {});
  assert.equal(off.data.active, false);
  assert.equal(
    (await request(`/exams/${live.exam.id}/start`, "POST", {}, live.token))
      .status,
    401,
  );
  const refused = await api("/launches", "POST", {
    examId: "ext_FINAL",
    student: { externalId: "S-3", name: "S3" },
  });
  assert.equal(refused.status, 409);

  // Paid exams launched by a partner do not require a student payment.
  await api(
    "/exams/ext_PAID",
    "PUT",
    examBody({ title: "Paid", price: 500000 }),
  );
  const paid = (await exchange((await launch("ext_PAID", "S-4")).url)).data;
  assert.equal(
    (await request(`/exams/${paid.exam.id}/start`, "POST", {}, paid.token))
      .status,
    200,
  );

  // Unavailable exams cannot be launched.
  await api("/exams/ext_DRAFT", "PUT", examBody({ status: "DRAFT" }));
  const draft = await api("/launches", "POST", {
    examId: "ext_DRAFT",
    student: { externalId: "S-4", name: "S4" },
  });
  assert.equal(draft.status, 409);

  const students = await api("/students?limit=200");
  assert.ok(students.data.data.some((s) => s.externalId === "S-4"));
  assert.ok(
    students.data.data.every((s) => !("email" in s) && !("password" in s)),
  );
});

test("webhooks are signed, retried on failure, and dead after the last retry", async () => {
  const created = await request(
    "/developer/webhooks",
    "POST",
    { url: hookUrl, events: ["*"] },
    admin,
  );
  assert.equal(created.status, 201);
  const secret = created.data.secret;
  assert.match(secret, /^whsec_/);
  assert.ok(
    (await request("/developer/webhooks", "GET", undefined, admin)).data.every(
      (w) => !("secret" in w),
    ),
  );

  received.length = 0;
  const s = (await exchange((await launch("ext_FINAL", "S-10")).url)).data;
  const a = (await request(`/exams/${s.exam.id}/start`, "POST", {}, s.token))
    .data;
  await request(`/attempts/${a.id}/submit`, "POST", {}, s.token);
  await deliverWebhooks();
  const types = received.map((r) => JSON.parse(r.body).type).sort();
  assert.deepEqual(types, [
    "attempt.started",
    "attempt.submitted",
    "result.ready",
  ]);
  for (const r of received) {
    const [t, v1] = r.headers["assessmentdesk-signature"]
      .split(",")
      .map((p) => p.split("=")[1]);
    const expected = createHmac("sha256", secret)
      .update(`${t}.${r.body}`)
      .digest("hex");
    assert.equal(v1, expected);
    assert.equal(JSON.parse(r.body).id, r.headers["assessmentdesk-event-id"]);
  }
  const submitted = JSON.parse(
    received.find((r) => JSON.parse(r.body).type === "attempt.submitted").body,
  );
  assert.equal(submitted.data.studentExternalId, "S-10");
  assert.equal(submitted.data.examExternalId, "FINAL");
  // Delivered events are not sent twice.
  received.length = 0;
  await deliverWebhooks();
  assert.equal(received.length, 0);

  // Failures are retried on the schedule and end as DEAD.
  hookStatus = 500;
  const ping = await request(
    `/developer/webhooks/${created.data.id}/test`,
    "POST",
    {},
    admin,
  );
  assert.equal(ping.status, 202);
  let now = Date.now();
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    await deliverWebhooks(new Date(now));
    now += (RETRY_DELAYS_MS[i] ?? 0) + 1000;
  }
  const dead = await db.webhookDelivery.findFirst({
    where: { eventId: ping.data.eventId },
  });
  assert.equal(dead.status, "DEAD");
  assert.equal(dead.attempts, RETRY_DELAYS_MS.length + 1);
  assert.equal(dead.lastStatus, 500);
  hookStatus = 200;
  const log = await request(
    `/developer/webhooks/${created.data.id}/deliveries`,
    "GET",
    undefined,
    admin,
  );
  assert.ok(log.data.some((d) => d.status === "DEAD"));
  // Other institutions cannot see or touch this endpoint.
  assert.equal(
    (
      await request(
        `/developer/webhooks/${created.data.id}/deliveries`,
        "GET",
        undefined,
        otherAdmin,
      )
    ).status,
    404,
  );
});

test("expired launch attempts emit events and webhook targets are SSRF-checked", async () => {
  const s = (await exchange((await launch("ext_FINAL", "S-11")).url)).data;
  const a = (await request(`/exams/${s.exam.id}/start`, "POST", {}, s.token))
    .data;
  await db.examAttempt.update({
    where: { id: a.id },
    data: { expectedEndAt: new Date(Date.now() - 1000) },
  });
  received.length = 0;
  await expireAttempts();
  await deliverWebhooks();
  const submitted = received
    .map((r) => JSON.parse(r.body))
    .find((e) => e.type === "attempt.submitted" && e.data.attemptId === a.id);
  assert.equal(submitted.data.expired, true);

  process.env.WEBHOOK_ALLOW_PRIVATE = "false";
  try {
    assert.equal(
      checkWebhookUrl("http://example.com/hook"),
      "Webhook URLs must use https.",
    );
    assert.ok(checkWebhookUrl("https://user:pass@example.com/hook"));
    for (const url of [
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://169.254.169.254/latest",
      "https://[::1]/hook",
      "https://localhost/hook",
    ])
      await assert.rejects(assertDeliverable(url), /private|must use/, url);
    const r = await request(
      "/developer/webhooks",
      "POST",
      { url: "http://example.com", events: ["*"] },
      admin,
    );
    assert.equal(r.status, 400);
  } finally {
    process.env.WEBHOOK_ALLOW_PRIVATE = "true";
  }
});

test("the cron sweep endpoint requires the CRON_SECRET bearer token", async () => {
  process.env.CRON_SECRET = "";
  assert.equal((await request("/cron/sweep")).status, 401);
  process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
  assert.equal((await request("/cron/sweep", "GET", undefined, "wrong")).status, 401);
  const ok = await request("/cron/sweep", "GET", undefined, process.env.CRON_SECRET);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
});
