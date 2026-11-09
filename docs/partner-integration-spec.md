# AssessmentDesk Partner Integration API — Technical Spec

**Status:** Phase 1 implemented (see below) · **Date:** 2026-11-06 · **Owner:** osobasamuel

> **Implementation status (2026-11-08).** Phase 1 is built and tested. That covers API keys with scopes, the `/api/v1` REST API (courses, questions incl. bulk, exams, students, launches, attempts, results, grading, certificates), external IDs, idempotency keys, cursor pagination, single-use launch links in a new tab, launch-only exams, the partner payment bypass, signed webhooks with retries and an SSRF guard, the Developers settings page, and the partner reference [partner-api.md](partner-api.md). Decision Q1 was taken as **Option A** (partner students have no email or password).
>
> **Not done yet:**
> - Phase 1 omissions: force-submit and extend-time endpoints, exam close, and the request log.
> - All of Phase 2: iframe embedding with per-origin `frame-ancestors`, postMessage events, branding, the embed SDK, and an OpenAPI file.
> - All of Phase 3.
> - Webhook secrets are stored in plain text, not encrypted.
> - Background jobs still run inside the API process.

---

## 1. Summary

AssessmentDesk lets institutions create exams, run them with camera monitoring, grade them and issue certificates. Today, everything runs through our own web app.

This spec explains how to let **other platforms** (for example, a school's own dashboard such as Klar Institut's) use AssessmentDesk **through an API**. Their staff would create and control exams from their own dashboard. Their students would take exams without ever signing up on our site.

### Goals

1. A partner's **server** can manage courses, questions, exams, students and results through a documented, versioned REST API.
2. A partner can **launch** a student into an exam from their own dashboard, in a new tab or embedded in their page. The student doesn't need a separate login.
3. A partner's server is **notified** (webhooks) when exams are started, submitted, graded or released.
4. Partner institutions can manage API keys, webhooks and allowed domains themselves.
5. Exam security (timer, answer secrecy, server grading, camera monitoring) is **no weaker** than in our own app.

### Non-goals (for now)

- Letting partners build their **own** exam-taking screen with camera monitoring we can trust (see §16).
- Live video proctoring, recording, or identity verification.
- Migrating partner data into our own app's login system.

### Terms used

| Term | Meaning |
|---|---|
| **Partner** | An outside platform that integrates with us (e.g. Klar Institut). Each partner maps to one `Institution` record. |
| **Partner server** | The partner's backend. It holds the API key and calls our API. |
| **Partner dashboard** | The partner's web UI, used by their staff and students. |
| **API key** | A secret credential the partner server uses to call our API. |
| **External ID** | The partner's own ID for a student, course or exam, stored alongside ours. |
| **Launch** | A one-time link our API creates so a specific student can enter a specific exam without logging in. |
| **Webhook** | An HTTP call **from our server to the partner server** when something happens. |
| **Embedded mode** | Our exam page shown inside the partner's site in an iframe. |

---

## 2. What already exists

Everything here is implemented and tested in the current codebase. Most of it can be **reused** for the partner API.

### 2.1 Platform and workspaces

| Feature | Where | Reusable for partners? |
|---|---|---|
| Separate workspaces per institution (multi-tenant) | `Institution` model; `tenant()` in `server/src/core.js` | ✅ Yes. Each partner gets an Institution. |
| Every database query is filtered by the institution | All `*-routes.js` use `institutionId: tenant(req)` | ✅ Yes. The filtering logic stays the same. |
| Institution status (active / suspended) | `auth()` in `core.js` blocks suspended institutions | ✅ Yes. API keys must follow the same rule. |
| Platform owner controls | `GET /api/platform`, `SUPER_ADMIN` role | ✅ Extend it to show partner usage. |
| Audit log | `AuditLog` model; `audit()` in `core.js` | ⚠️ Needs changing: it currently expects a *user* as the actor. |

### 2.2 Accounts and login

| Feature | Where | Notes |
|---|---|---|
| Email + password login, bcrypt hashing | `auth-routes.js` | Not used by partners. Partner students won't have passwords. |
| 15-minute access token (JWT) + rotating refresh cookie | `session()` in `core.js` | The cookie is `sameSite: strict`, so it **won't work in an iframe**. |
| Four roles: SUPER_ADMIN, INSTITUTION_ADMIN, EXAMINER, STUDENT | `roles()` in `core.js` | ✅ Reuse. Partner students become `STUDENT` users. |
| Email verification, password reset | `auth-routes.js` | Not needed for partner students. |
| Short-lived tokens limited to one purpose (`scope`) | `monitoringToken()` in `proctoring.js` | ✅ **Good pattern to copy** for launch tokens. |

### 2.3 Content and exams

| Feature | Where | Notes |
|---|---|---|
| Courses (create, edit, publish) | `workspace-routes.js` `/courses` | ✅ Logic reusable. |
| Question bank: single / multiple choice, true-false, short answer, essay, image URL | `/questions`, `questionSchema` in `validation.js` | ✅ The Zod schema can be reused as-is. |
| Exam setup: questions, schedule, duration, pass mark, price, attempt limit, shuffling, result release, fullscreen, camera | `saveExam()` in `workspace-routes.js`, `examSchema` | ✅ Reusable, but `saveExam` reads from `req`. It should be refactored into a plain function. |
| Student management, history, CSV export | `/users`, `/users/:id/history` | ✅ Partly reusable. Needs external IDs. |

### 2.4 Exam taking

| Feature | Where | Notes |
|---|---|---|
| Start attempt with frozen question copy, shuffling, attempt limit, schedule checks | `POST /exams/:id/start` in `attempt-routes.js` | ✅ Reuse unchanged. |
| Save answers, recover after refresh, versioned saves | `PUT /attempts/:id/answers` | ✅ Reuse unchanged. |
| Server-enforced deadline + auto-submit every 15 s | `expireAttempts()` in `grading.js`, `setInterval` in `index.js` | ✅ Reuse. Must be moved to a job runner when we run more than one server (§13). |
| Camera face-presence monitoring (runs in browser, nothing uploaded) | `CameraMonitor.jsx`, `useExamMonitoring.js`, `proctoring.js` | ✅ Reuse. Needs iframe permissions (§8). |
| Tab / focus / fullscreen / paste / page-exit / heartbeat signals | `proctoring.js` | ✅ Reuse. |
| Exam screen UI | `client/src/exam.jsx` | ✅ Reuse in "embedded mode" (§8). |

### 2.5 Grading, results, certificates

| Feature | Where | Notes |
|---|---|---|
| Automatic grading of objective questions on the server | `markQuestions()` in `grading.js` | ✅ Reuse. |
| Manual grading queue for essays | `/grading`, `/grading/:id` | ✅ Expose via API. |
| Grading bands, pass/fail, held vs released results | `summarize()`, `/results/:id/release` | ✅ Expose via API. |
| PDF certificates with QR code + public verification | `certificate-routes.js` | ✅ Expose PDF via API. |
| Monitoring timeline per attempt + CSV export | `/monitoring`, `/attempts/:id/integrity` | ✅ Expose via API. |

### 2.6 Payments

| Feature | Where | Notes |
|---|---|---|
| Paystack checkout, verification, signed webhook check, idempotent fulfilment | `payment-routes.js` | ⚠️ This charges **students**. Partners will usually be billed directly instead (§12). |
| HMAC signature check of incoming webhooks | `webhook()` in `payment-routes.js` | ✅ **Same technique** we'll use to sign our *outgoing* webhooks. |

### 2.7 Quality and infrastructure

| Feature | Where |
|---|---|
| Backend integration tests (tenant isolation, roles, payments, grading, expiry) | `server/test/platform.test.js` |
| Browser tests (Playwright) incl. camera | `client/tests/*.spec.js` |
| Security headers (Helmet), rate limiting, CORS, origin check | `server/src/app.js` |
| Prisma schema for MySQL (prod) + SQLite (local) | `server/prisma/` |

---

## 3. Gap analysis: what blocks partner integration today

| # | Blocker | Exact location | Effect | Fixed in |
|---|---|---|---|---|
| G1 | Only a logged-in **person** can call the API | `auth()` in `core.js:33` | A partner's server can't authenticate on its own. | §6 |
| G2 | `tenant()` needs `req.user` | `core.js:66` | Requests authenticated with an API key have no user, so they fail. | §6 |
| G3 | `audit()` needs a user | `core.js:29` | API actions can't be logged correctly. | §6 |
| G4 | CORS allows **only** `APP_URL` | `app.js:31` | Browser calls from partner domains are blocked. | §11 |
| G5 | Write requests from any other website are rejected with 403 | `app.js:52-58` | Same as G4, for POST/PUT/PATCH/DELETE. | §11 |
| G6 | Helmet's default `frame-ancestors 'self'` / `X-Frame-Options` | `app.js:19` | Our exam page can't be shown inside a partner's site. | §8, §11 |
| G7 | Refresh cookie is `sameSite: strict` | `core.js:83` | Login can't be kept alive inside an iframe. | §8 |
| G8 | `User.email` is unique across the **whole platform** | `schema.prisma` | One student can't belong to two partners, and partners may not give us emails at all. | §5 |
| G9 | No external IDs on User / Course / Exam / Question | `schema.prisma` | We can't match our records to the partner's records. | §5 |
| G10 | Rate limit is 300/min **per IP** | `app.js:39` | All of a partner's traffic comes from one server IP. | §11 |
| G11 | No outgoing webhooks | — | Partners would have to keep polling us. | §9 |
| G12 | Lists are not paginated on the server | `findMany` without `take`/`cursor` | Large partners get huge, slow responses. | §7 |
| G13 | Route logic is mixed into the Express handlers (`saveExam(req)`) | `workspace-routes.js` | Hard to reuse from both the app and the API without duplicating code. | §6 |
| G14 | Payment lock requires a Paystack payment from the student | `attempt-routes.js:58-69` | Paid exams can't be launched for partner students. | §12 |
| G15 | Background jobs run inside the web process with `setInterval` | `index.js:23` | Breaks when we run more than one server. | §13 |
| G16 | Rate-limit counters are kept in memory | `express-rate-limit` default store | Same as G15. | §13 |
| G17 | No API version prefix, no OpenAPI docs | — | Partners have no stable contract to build against. | §7, §10 |

---

## 4. Target architecture

### 4.1 Three integration layers

```
┌───────────────────────── Partner (e.g. Klar Institut) ─────────────────────────┐
│                                                                                 │
│   Partner dashboard (browser)                 Partner server (backend)          │
│   ┌──────────────────────────┐                ┌──────────────────────────────┐  │
│   │ staff: manage exams ─────┼── own API ────▶│ holds API key (sk_live_...)  │  │
│   │ student: "Start exam" ───┼── own API ────▶│                              │  │
│   │   <iframe src=launchUrl> │                └──────┬──────────────▲────────┘  │
│   └───────────┬──────────────┘                       │              │           │
└───────────────┼──────────────────────────────────────┼──────────────┼───────────┘
                │ (C) launch link                      │ (A) REST     │ (B) webhooks
                │     exam UI + camera                 │     /api/v1  │     signed POST
                ▼                                      ▼              │
┌──────────────────────────────── AssessmentDesk ─────────────────────┴───────────┐
│  Exam UI (embedded mode)  ──▶  Existing attempt API  ──▶  grading / results     │
│                                Partner API (/api/v1) ──▶  services (shared)     │
│                                Webhook dispatcher  ◀── domain events            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **(A) REST API:** partner server → us. Used to manage content, students and results.
- **(B) Webhooks:** us → partner server. Used for events.
- **(C) Launch links:** the student's browser goes into **our** exam UI, either in a new tab or an iframe.

### 4.2 End-to-end flow (happy path)

1. A Klar admin opens our developer settings and creates an API key and a webhook URL. They add `https://dashboard.klar-institut.de` as an allowed embed domain.
2. Klar's server calls `POST /api/v1/courses`, `POST /api/v1/questions` and `POST /api/v1/exams` (status `PUBLISHED`). Each request includes Klar's own `externalId`.
3. A student clicks "Start exam" in Klar's dashboard.
4. Klar's server calls `POST /api/v1/launches` with `{ examId, student: { externalId, name, email? }, returnUrl }`.
5. We find or create a `STUDENT` user for that `externalId`, then return `{ url, expiresAt }`. The URL is valid for 5 minutes and can be used once.
6. Klar's dashboard opens `url` in an iframe or a new tab.
7. Our `/launch/:token` page exchanges the token for an **attempt session**, runs the camera check, and starts the attempt using the existing code.
8. The student finishes. The attempt is graded by the existing code.
9. We send `attempt.submitted`, then `result.ready` (or `result.pending_grading`), to Klar's webhook.
10. If the exam is embedded, we also send a `postMessage` to the parent window. In both cases the student is redirected to `returnUrl` (or we show a "You can close this tab" page).
11. Klar's server calls `GET /api/v1/results?examId=...` or uses the data in the webhook.

### 4.3 Code organisation (target)

```
server/src/
  core.js                 ← auth(), tenant(), audit() made actor-aware
  services/               ← NEW: business logic with no Express objects
    courses.js            (createCourse, updateCourse, listCourses)
    questions.js
    exams.js              (saveExam moved here)
    students.js           (upsertExternalStudent)
    attempts.js           (startAttempt, saveAnswers, submit)
    results.js
    events.js             (emit(eventType, payload) → webhook outbox)
  routes/
    app/*.js              ← existing routes, now thin wrappers over services
    v1/*.js               ← NEW: partner API routes, thin wrappers over services
  partner/
    api-keys.js           ← apiKeyAuth middleware, key generation
    launches.js           ← launch token create/exchange
    webhooks.js           ← signing, dispatcher, retries
  jobs/
    worker.js             ← NEW: expiry, disconnect detection, webhook delivery
```

---

## 5. Database changes (Prisma)

All changes are **additive**. Existing data keeps working. Use one new migration: `20261110000000_partner_api`.

### 5.1 New models

```prisma
model ApiKey {
  id            String    @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String                         // "Klar production server"
  prefix        String    @unique              // first 12 chars, e.g. "sk_live_a1b2", shown in UI
  hash          String    @unique              // sha256 of full key; full key never stored
  scopes        Json                           // ["courses:write","exams:write","results:read",...]
  mode          String    @default("LIVE")     // LIVE | TEST
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  revokedAt     DateTime?
  createdById   String?                        // admin who created it
  createdAt     DateTime  @default(now())
  @@index([institutionId])
}

model WebhookEndpoint {
  id            String   @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  url           String   @db.VarChar(2048)     // must be https:// in production
  secret        String                         // used for HMAC signing; shown once
  events        Json                           // ["attempt.submitted","result.ready"] or ["*"]
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  deliveries    WebhookDelivery[]
}

model WebhookDelivery {
  id            String    @id @default(cuid())
  endpointId    String
  endpoint      WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)
  eventId       String                         // same id across retries; partner de-duplicates on it
  eventType     String
  payload       Json
  status        String    @default("PENDING")  // PENDING | SUCCESS | FAILED | DEAD
  attempts      Int       @default(0)
  nextAttemptAt DateTime  @default(now())
  lastStatus    Int?                           // last HTTP status from partner
  lastError     String?   @db.VarChar(500)
  createdAt     DateTime  @default(now())
  @@index([status, nextAttemptAt])
  @@index([endpointId, createdAt])
}

model LaunchToken {
  id            String    @id                  // sha256 of the token in the URL
  institutionId String
  userId        String                         // the student
  examId        String
  returnUrl     String    @default("") @db.VarChar(2048)
  embedded      Boolean   @default(false)
  locale        String    @default("en")
  usedAt        DateTime?                      // single-use
  expiresAt     DateTime                       // createdAt + 5 min
  createdAt     DateTime  @default(now())
  @@index([institutionId, createdAt])
}

model IdempotencyKey {
  key           String                         // value of Idempotency-Key header
  institutionId String
  method        String
  path          String
  requestHash   String                         // sha256 of body; reject same key with different body
  status        Int
  response      Json
  createdAt     DateTime @default(now())       // purge after 24h
  @@id([institutionId, key])
}
```

### 5.2 Changes to existing models

| Model | Change | Why |
|---|---|---|
| `Institution` | `allowedOrigins Json @default("[]")` | Domains allowed to embed our pages or call us from a browser (§11). |
| `Institution` | `integrationMode String @default("NATIVE")` (`NATIVE` \| `PARTNER`) | Partner institutions may hide parts of our UI, e.g. student self-registration. |
| `Institution` | `branding Json @default("{}")` | Logo, primary colour and name for embedded mode (§8.5). |
| `User` | `externalId String?` + `@@unique([institutionId, externalId])` | Matches the partner's student ID. |
| `User` | `email` changes from `@unique` to `@@unique([institutionId, email])`, plus `email` becomes optional for partner students | **Breaking change for login.** See the note below. |
| `Course` | `externalId String?` + `@@unique([institutionId, externalId])` | Matching. |
| `Exam` | `externalId String?` + `@@unique([institutionId, externalId])` | Matching. |
| `Exam` | `accessMode String @default("OPEN")` (`OPEN` \| `LAUNCH_ONLY`) | `LAUNCH_ONLY` exams can only be started via a partner launch. They don't appear in the student exam list. |
| `Question` | `externalId String?` + `@@unique([institutionId, externalId])` | Matching. |
| `ExamAttempt` | `launchId String?` | Links an attempt to the launch that started it, for reporting. |
| `AuditLog` | `apiKeyId String?` | Records which API key performed the action. |
| `Payment` | `source String @default("PAYSTACK")` (`PAYSTACK` \| `PARTNER`) | Partner-granted access (§12). |

**Email uniqueness:** today, login looks a user up by email alone. If emails stop being unique across the platform, login would need either:
- **Option A (recommended):** keep emails globally unique for people who **log in with a password**, and leave `email` empty (`null`) for partner-managed students. They never log in directly. Partner students are identified by `(institutionId, externalId)` only. Because MySQL allows multiple `NULL`s in a unique index, global email uniqueness can stay unchanged.
- **Option B:** add the institution slug to the login form. This is a bigger UX change.

This spec assumes **Option A**. Then the only change to `User` is `email String?` (it becomes optional) plus `externalId`.

### 5.3 Migration tasks

- [ ] Edit `schema.prisma` (MySQL) with the models and fields above.
- [ ] Update the generator in `scripts/setup.mjs` so `schema.local.prisma` picks up the new fields.
- [ ] Write `migrations/20261110000000_partner_api/migration.sql`.
- [ ] Extend `scripts/upgrade-local-proctoring.mjs` (or add `upgrade-local-partner.mjs`) so existing SQLite databases are upgraded additively.
- [ ] Check every place that reads `user.email` and handles `null`: `applyVerifiedPayment`, mail helpers, CSV exports, `publicUser`, the UI.
- [ ] Seed: add a demo `PARTNER` institution with one TEST API key and print the key once.

---

## 6. Workstream A: API key authentication and multi-actor refactor

### 6.1 API key format

- Format: `sk_live_` or `sk_test_` + 40 random base62 characters (≈ 238 bits).
- Store **only** `sha256(key)` in `ApiKey.hash`, plus the first 12 characters as `prefix` for display.
- The full key is shown **once** when created. It can't be recovered afterwards, only rotated.
- `sk_test_` keys may only operate on records with a test flag. Optional in phase 1: they may simply live in a separate "sandbox" institution.

### 6.2 Scopes

| Scope | Allows |
|---|---|
| `courses:read` / `courses:write` | Courses |
| `questions:read` / `questions:write` | Question bank (`read` never returns correct answers unless `questions:answers` is also granted) |
| `questions:answers` | Read accepted answers |
| `exams:read` / `exams:write` | Exams |
| `students:read` / `students:write` | Partner students |
| `launches:write` | Create launch links |
| `attempts:read` | Attempt status and monitoring timeline |
| `results:read` / `results:write` | Results, release, manual grading |
| `certificates:read` | Certificate PDFs |
| `webhooks:write` | Manage webhook endpoints via API |

### 6.3 Request authentication

```
Authorization: Bearer sk_live_9xYk...
```

New middleware `apiKeyAuth` in `server/src/partner/api-keys.js`:

1. Read the bearer token. If it doesn't start with `sk_`, return 401.
2. Look up `ApiKey` by `hash = sha256(token)`, including its institution.
3. Return 401 if not found, revoked, or expired.
4. Return 403 if the institution's `status !== "ACTIVE"`. This is the same rule as `auth()`.
5. Set `req.actor = { type: "API_KEY", id, institutionId, scopes }`.
6. Update `lastUsedAt` at most once a minute. Throttle it so we don't write to the database on every request.

`requireScope(...scopes)` middleware returns 403 with `{ error: { code: "insufficient_scope" } }`.

### 6.4 Making core helpers actor-aware

| Today | Change to |
|---|---|
| `auth()` sets `req.user` | Also sets `req.actor = { type: "USER", id, institutionId, role }` |
| `tenant(req)` reads `req.user.institutionId` | Reads `req.actor.institutionId` |
| `audit(user, action, targetId)` | `audit(actor, action, targetId)`. Writes `userId` or `apiKeyId` depending on actor type. |
| `finishAttempt(id, user, expired)` | Accepts an actor (the system expiry worker becomes `{ type: "SYSTEM" }`). |

### 6.5 Moving logic out of the route handlers into services

Do this **before** writing the v1 routes, so both route sets call the same code.

| Function today | Move to | New signature |
|---|---|---|
| `saveExam(req, id)` | `services/exams.js` | `saveExam(institutionId, input, id?)` |
| course create / update in handlers | `services/courses.js` | `createCourse(institutionId, input)`, `updateCourse(...)` |
| question create / update / delete | `services/questions.js` | same pattern |
| attempt start logic (`/exams/:id/start`) | `services/attempts.js` | `startAttempt({ institutionId, examId, studentId, cameraReady, ip, userAgent, launchId? })` |
| result release, manual grading | `services/results.js` | `releaseResult(institutionId, resultId, actor)`, `gradeSubmission(...)` |

### 6.6 Tasks

- [ ] `partner/api-keys.js`: `generateKey()`, `apiKeyAuth`, `requireScope`.
- [ ] `core.js`: add `req.actor`; update `tenant()` and `audit()`.
- [ ] Refactor `finishAttempt` / `expireAttempts` to accept actors.
- [ ] Create `services/` and move the logic out of the handlers. Existing routes call the services. Existing tests must still pass **unchanged**. That's the proof the refactor is safe.
- [ ] Admin routes to manage keys (used by the developer settings page, §10):
  - `GET /api/developer/keys`
  - `POST /api/developer/keys` → returns full key once
  - `POST /api/developer/keys/:id/revoke`
  - Restricted to `INSTITUTION_ADMIN`. Each action is written to the audit log.

---

## 7. Workstream B: `/api/v1` REST API

### 7.1 Conventions

| Topic | Rule |
|---|---|
| Base URL | `https://api.assessmentdesk.app/api/v1` (or `https://<host>/api/v1`) |
| Auth | `Authorization: Bearer sk_...` only. **No cookies.** |
| Format | JSON, UTF-8. Timestamps in ISO 8601 UTC. Money in integer minor units (kobo / cents) + `currency`. |
| IDs | Every object returns both `id` (ours) and `externalId` (theirs, nullable). Path parameters accept `id` or `ext_<externalId>`, e.g. `GET /exams/ext_MATH101-FINAL`. |
| Pagination | Cursor-based: `?limit=50&cursor=...` → `{ data: [...], nextCursor: "..." \| null }`. Max `limit` is 200. |
| Filtering | Query parameters, e.g. `GET /results?examId=...&released=true&updatedSince=2026-11-01T00:00:00Z` |
| Errors | `{ "error": { "code": "validation_failed", "message": "...", "details": [...] } }` with a correct HTTP status code |
| Idempotency | All `POST` requests accept `Idempotency-Key`. The same key and same body return the stored response for 24 h. The same key with a different body returns 409. |
| Upsert | `PUT /students/ext_123` creates or updates by external ID. This is the easiest way for partners to sync students. |
| Rate limits | Per API key. Responses include `RateLimit-*` headers and return 429 with `Retry-After` (§11). |
| Versioning | Breaking changes → `/api/v2`. Adding fields is **not** breaking, so partners must ignore unknown fields. Deprecations get ≥ 6 months' notice via a `Deprecation` header and an email. |
| Request ID | Every response has `X-Request-Id`. It's logged and shown in the developer settings logs. |

### 7.2 Endpoint catalogue

**Courses**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/courses` | courses:read | paginated |
| POST | `/courses` | courses:write | `{ title, code, description, status, externalId? }` |
| GET | `/courses/{id}` | courses:read | |
| PATCH | `/courses/{id}` | courses:write | |
| PUT | `/courses/ext_{externalId}` | courses:write | upsert |

**Questions**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/questions` | questions:read | `acceptedAnswers` omitted unless `questions:answers` is granted |
| POST | `/questions` | questions:write | Same body as the existing `questionSchema` + `externalId` |
| POST | `/questions/bulk` | questions:write | Up to 500 per call. Returns a result per item. |
| GET / PUT / DELETE | `/questions/{id}` | questions:* | DELETE returns 409 if used in an exam (existing rule) |

**Exams**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/exams` | exams:read | |
| POST | `/exams` | exams:write | Same as `examSchema` + `externalId`, `accessMode` |
| GET | `/exams/{id}` | exams:read | Includes `questionIds`, `totalMarks` |
| PUT | `/exams/{id}` | exams:write | Full replace (reuses `saveExam`) |
| POST | `/exams/{id}/publish` | exams:write | Shortcut |
| POST | `/exams/{id}/close` | exams:write | Sets status to `CLOSED`; stops new attempts |

**Students**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/students` | students:read | |
| PUT | `/students/ext_{externalId}` | students:write | Upsert `{ name, email?, studentNumber? }` |
| GET | `/students/{id}` | students:read | |
| POST | `/students/{id}/deactivate` | students:write | Blocks new launches; running attempts continue |
| GET | `/students/{id}/attempts` | attempts:read | History (reuses `/users/:id/history`) |

**Launches** (§8)

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/launches` | launches:write | Returns `{ id, url, expiresAt }` |

**Attempts and monitoring**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/attempts` | attempts:read | Filters: `examId`, `studentId`, `status`, `updatedSince` |
| GET | `/attempts/{id}` | attempts:read | Status, timing, `launchId`. **No answers** while the attempt is in progress. |
| GET | `/attempts/{id}/integrity` | attempts:read | Monitoring timeline (reuses existing) |
| POST | `/attempts/{id}/force-submit` | results:write | Staff action; new feature, audited |
| POST | `/attempts/{id}/extend` | results:write | Adds minutes (e.g. accessibility accommodations); new feature |

**Results and grading**

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/results` | results:read | Filters: `examId`, `studentId`, `released`, `status`, `updatedSince` |
| GET | `/results/{id}` | results:read | Includes per-question breakdown |
| POST | `/results/{id}/release` | results:write | Reuses existing |
| GET | `/grading` | results:read | Pending manual grading queue |
| POST | `/grading/{resultId}` | results:write | Same body as existing manual grading |

**Certificates**

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/certificates` | certificates:read | `{ resultId }` → issue if passed |
| GET | `/certificates/{id}` | certificates:read | Metadata + `verifyUrl` |
| GET | `/certificates/{id}/pdf` | certificates:read | `application/pdf` |

**Webhooks** (also manageable in the UI)

| Method | Path | Scope |
|---|---|---|
| GET / POST | `/webhooks` | webhooks:write |
| PATCH / DELETE | `/webhooks/{id}` | webhooks:write |
| POST | `/webhooks/{id}/test` | webhooks:write (sends a `ping` event) |

**Utility**

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Returns the institution and scopes of the current key. Partners use it to check their setup. |

### 7.3 Example: create an exam

```http
POST /api/v1/exams
Authorization: Bearer sk_live_...
Idempotency-Key: 6c0e6c1b-...
Content-Type: application/json

{
  "externalId": "MATH101-FINAL-2026",
  "courseId": "ext_MATH101",
  "title": "Mathematics 101 — Final",
  "description": "",
  "duration": 60,
  "passMark": 50,
  "maxAttempts": 1,
  "status": "PUBLISHED",
  "accessMode": "LAUNCH_ONLY",
  "cameraRequired": true,
  "fullscreen": true,
  "shuffleQuestions": true,
  "shuffleOptions": true,
  "releaseResults": false,
  "startsAt": "2026-12-01T08:00:00Z",
  "endsAt": "2026-12-01T18:00:00Z",
  "questionIds": ["ext_Q-001", "ext_Q-002"]
}
```

### 7.4 Tasks

- [ ] `routes/v1/index.js`: mount under `/api/v1` with `apiKeyAuth`, per-key rate limit, request ID, and error formatter.
- [ ] Shared helpers: `paginate(model, where, { limit, cursor })`, `resolveId(model, institutionId, idOrExt)`.
- [ ] Idempotency middleware using the `IdempotencyKey` table, plus a daily purge job.
- [ ] One route file per resource (courses, questions, exams, students, launches, attempts, results, certificates, webhooks). Each is a thin wrapper over a service.
- [ ] Output "serializers" per resource, so internal fields are never leaked (e.g. `acceptedAnswers`, `password`, `snapshot`).
- [ ] New features: `force-submit`, `extend`, exam `close`, question `bulk`.
- [ ] Write the OpenAPI 3.1 spec (`docs/openapi.yaml`). Ideally generate it from the Zod schemas with `zod-to-openapi` so it stays in sync.

---

## 8. Workstream C: exam launch links and embedded mode

### 8.1 Why launches instead of a partner-built exam screen

The timer, answer secrecy, question snapshot and camera monitoring are all enforced by **our** server and **our** frontend code. If partners built their own exam screen, we couldn't trust the camera and tab signals. Launch links keep the security model intact.

### 8.2 Creating a launch (partner server → us)

```http
POST /api/v1/launches
Authorization: Bearer sk_live_...

{
  "examId": "ext_MATH101-FINAL-2026",
  "student": { "externalId": "S-20931", "name": "Ada Obi", "email": "ada@example.com" },
  "returnUrl": "https://dashboard.klar-institut.de/exams/done",
  "embedded": true,
  "locale": "en"
}
```

Server steps:

1. Resolve the exam within the institution. It must be `PUBLISHED` and inside its schedule. Otherwise return 409 `exam_not_available`.
2. Upsert the student with `(institutionId, externalId)`. Update their name if it changed. Return 409 if they've been deactivated.
3. Check attempts left (`maxAttempts`), **before** creating the link, so the partner gets a clear error.
4. Validate `returnUrl`: it must be `https` and its origin must be in `Institution.allowedOrigins`. This prevents open redirects.
5. Create `LaunchToken` with a random 32-byte token. Store only `sha256(token)`. `expiresAt` = now + 5 min.
6. Respond `{ id, url: "https://<our-host>/launch/<token>", expiresAt }`.

The partner must create a fresh launch **each time** the student clicks "Start". Launch URLs must never be stored or emailed.

### 8.3 Using a launch (student browser → us)

1. The browser opens `/launch/<token>`. This is a new React route (`client/src/Launch.jsx`) **outside** the normal login layout.
2. The page calls `POST /api/launch/exchange { token }`. This is a public endpoint, rate-limited per IP.
3. The server checks the token: it must exist, not be used, not be expired, and the institution must be active. In one transaction it marks the token as used and issues an **attempt session token**:
   - JWT with `{ sub: userId, institutionId, examId, launchId, scope: "launch" }`.
   - Expiry = exam duration + 30 min grace, capped at the exam's `endsAt` + grace.
   - It is returned in the JSON response, **not as a cookie**, and kept in memory (not localStorage).
4. Change `auth()` so a `scope: "launch"` token is accepted **only** on:
   - `POST /exams/:examId/start` (the same `examId` as in the token)
   - `GET/PUT /attempts/:id`, `/attempts/:id/answers`, `/submit`, `/events`, `/heartbeat` (only attempts belonging to that student and exam)
   - `GET /results` (only that attempt's result, and only if released)

   Every other route returns 403. Today `auth()` rejects any token with a `scope`, so this is a targeted exception.
5. The page then renders the **existing** camera check and exam screen (`exam.jsx`), with the attempt session token as the bearer token.
6. If the token is used again or has expired, show the message "This exam link has expired. Return to your school's dashboard and click Start again."

**Refreshing the page mid-exam:** the attempt session token is lost on refresh because it's kept in memory. The student goes back to the partner dashboard and clicks Start again. That gives a new launch → `startAttempt` returns the **existing** active attempt (current behaviour) → saved answers are recovered. Optional improvement: keep the attempt session in `sessionStorage`. That's safe enough because it's limited to one exam and expires.

### 8.4 Embedded mode (iframe)

**What the partner adds to their page:**

```html
<iframe
  src="https://<our-host>/launch/<token>"
  allow="camera; fullscreen"
  allowfullscreen
  style="width:100%;height:100vh;border:0">
</iframe>
```

**What we change:**

| Change | How |
|---|---|
| Allow our pages to be framed by approved partners | `frame-ancestors` is set **per request**. For `/launch/*` and the exam routes, read the institution from the launch token and set `Content-Security-Policy: frame-ancestors 'self' <allowedOrigins>`. All other pages keep `frame-ancestors 'self'`. Remove `X-Frame-Options` on those routes (CSP takes precedence). |
| Camera permission inside the iframe | Send `Permissions-Policy: camera=(self), fullscreen=(self)` on our side. The partner's `allow="camera; fullscreen"` passes the permission down to the iframe. |
| No cookies | Already handled: the attempt session token isn't a cookie. |
| Hide our app chrome | `embedded=true` → `Launch.jsx` renders the exam with no sidebar, header or logout. |
| Tell the parent page what happened | `window.parent.postMessage({ source: "assessmentdesk", type, attemptId }, partnerOrigin)` for `ready`, `started`, `submitted`, `expired`, `error`, `camera_blocked`. **Always send to the exact partner origin, never `*`.** |
| Fullscreen | Fullscreen inside an iframe works only with `allowfullscreen`. If it's denied, record `FULLSCREEN_EXIT` as today and tell the parent page via postMessage. |
| Fallback | If the camera can't start in the iframe (e.g. Safari), show a button: "Open exam in a new tab". It creates a new launch through a parent-page message, or reuses the session via `window.open` to `/launch/continue`. |

### 8.5 Branding

- `Institution.branding = { logoUrl, primaryColor, displayName }`.
- In embedded / launch mode, the exam header uses the partner's logo and colour. A small "Powered by AssessmentDesk" note can be kept or removed depending on the plan.

### 8.6 Returning the student

- **New tab:** after submit, show the result (if released) or a "Submitted" page, then a button back to `returnUrl?attemptId=...&status=submitted`.
- **Embedded:** send `postMessage` `submitted`. The partner decides what to show. Also show our "Submitted" page in case the partner ignores the message.

### 8.7 Tasks

- [ ] `LaunchToken` model + `partner/launches.js` (create, exchange).
- [ ] `POST /api/v1/launches` and `POST /api/launch/exchange` (public, rate-limited).
- [ ] Extend `auth()` with the `scope: "launch"` limited-access rules + tests for every route that must be blocked.
- [ ] `Exam.accessMode = LAUNCH_ONLY` check in `startAttempt` (only launch tokens may start such exams) and hide these exams from the normal `/exams` list.
- [ ] Per-request CSP `frame-ancestors` + `Permissions-Policy` middleware.
- [ ] Client: `Launch.jsx` route, embedded layout, `postMessage` bridge, branding, new-tab fallback.
- [ ] Changes to `api.js`: allow an in-memory bearer token without the refresh-cookie flow.
- [ ] Playwright test: a test "partner page" on a different origin (e.g. `127.0.0.1:5199`) that embeds the launch in an iframe. Cover camera fixture, submit, postMessage, and an expired/reused link.

---

## 9. Workstream D: outgoing webhooks

### 9.1 Events

| Event | When | Payload (`data`) |
|---|---|---|
| `attempt.started` | Attempt created | attempt summary (id, examId, studentId, externalIds, startedAt, expectedEndAt) |
| `attempt.submitted` | Student submits **or** the timer expires | + `submittedAt`, `expired: bool` |
| `attempt.integrity_flagged` | First `FACE_ABSENT`, `MULTIPLE_FACES`, `CONNECTION_LOST`, or `TAB_HIDDEN` > N times. **Debounced: at most 1 per attempt per 5 min.** | attempt id, signal type, count |
| `result.ready` | Objective-only exam graded **and** released | result summary (score, percentage, grade, passed) |
| `result.pending_grading` | Exam has essays waiting for manual grading | result id, attempt id |
| `result.graded` | Manual grading completed | result summary |
| `result.released` | Held result released | result summary |
| `certificate.issued` | Certificate generated | certificate id, code, verifyUrl |
| `exam.updated` | Exam changed (status, schedule) | exam summary |
| `ping` | `POST /webhooks/{id}/test` | `{}` |

### 9.2 Payload envelope

```json
{
  "id": "evt_01JC...",
  "type": "result.ready",
  "createdAt": "2026-12-01T09:12:44Z",
  "institutionId": "clx...",
  "apiVersion": "v1",
  "data": { "...": "..." }
}
```

### 9.3 Signing (the same idea as the Paystack check we already have)

Headers sent with every delivery:

```
AssessmentDesk-Signature: t=1733044364,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>
AssessmentDesk-Event-Id: evt_01JC...
Content-Type: application/json
```

The partner should:
1. Recompute the HMAC and compare in constant time.
2. Reject if `t` is older than 5 minutes (replay protection).
3. De-duplicate on `Event-Id`.

### 9.4 Delivery rules

- **Outbox pattern:** when a domain event happens, write `WebhookDelivery` rows **in the same database transaction** as the change (e.g. inside `finishAttempt`). That way, events are never lost when the server crashes.
- A worker (§13) picks up rows `WHERE status IN (PENDING, FAILED) AND nextAttemptAt <= now`.
- It sends a POST with a 10 s timeout. A 2xx response counts as success. Anything else counts as failure.
- Retry schedule: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h (7 tries in total). After that the row is marked `DEAD`. The endpoint is auto-disabled after 3 consecutive days of failures, and the institution admin is emailed.
- Order is **not guaranteed**. Partners must use `createdAt` / state, not arrival order.
- **SSRF protection:** endpoint URLs must use https. Reject private/loopback IP ranges **after DNS lookup**, and don't follow redirects.

### 9.5 Tasks

- [ ] `services/events.js`: `emit(tx, institutionId, type, data)` → writes deliveries for the matching endpoints.
- [ ] Call `emit` from `startAttempt`, `finishAttempt`, grading, release, certificate and `recordEvent` (integrity, debounced).
- [ ] `partner/webhooks.js`: signer, sender with SSRF guard, retry scheduler.
- [ ] Worker job (§13).
- [ ] Admin endpoints and UI: list endpoints, delivery log with payload and response, "Resend" button.
- [ ] Docs: verification code samples in Node, PHP, Python.

---

## 10. Workstream E: developer settings page, docs and SDK

### 10.1 Developer settings page (in our app, for `INSTITUTION_ADMIN`)

New page **Settings → Developers** with tabs:

| Tab | Contents |
|---|---|
| API keys | List (name, prefix, scopes, created, last used, status). Create (pick scopes, optional expiry; the full key is shown once with a copy button). Revoke. |
| Webhooks | Endpoints (URL, events, active). Create (the secret is shown once). Test-send. Delivery log with status, response code, payload, and a resend button. |
| Allowed domains | List of origins allowed to embed our pages and receive `returnUrl` redirects. Validated as `https://host[:port]`. |
| Branding | Logo URL, primary colour, display name, preview. |
| Request log | Last 1,000 API requests: time, method, path, status, request ID, key prefix. Needs a new `ApiRequestLog` table (or log storage) with 14-day retention. |
| Usage | Launches and attempts per month (feeds billing, §12). |

### 10.2 Public documentation

- Getting started (5 steps: create key → create course → create exam → create launch → handle webhook).
- Authentication, errors, pagination, idempotency, versioning.
- Endpoint reference generated from `openapi.yaml` (Redoc or Scalar, served at `/docs/api`).
- Embedding guide (iframe attributes, postMessage events, Safari fallback).
- Webhook guide with signature verification samples.
- Changelog.

### 10.3 SDKs (optional, phase 2)

- `@assessmentdesk/node`: a typed client (generated from OpenAPI) + `verifyWebhook()` helper.
- `@assessmentdesk/embed` (a browser script, ~3 KB): `AssessmentDesk.mount(el, { launchUrl, onSubmitted, onError })`. It builds the iframe with the correct `allow` attributes and wraps postMessage.
- PHP package later. Many school systems are PHP-based (Moodle, custom LMSs).

### 10.4 Tasks

- [ ] Developer settings page (React, in `pages.jsx` or a new `Developers.jsx`).
- [ ] Admin API endpoints for keys, webhooks, domains, branding, logs.
- [ ] `ApiRequestLog` writes (async, sampled if needed) + retention purge.
- [ ] Docs site + OpenAPI.
- [ ] Embed script.

---

## 11. Workstream F: security headers, CORS, rate limits

| Item | Current | Target |
|---|---|---|
| CORS for `/api/v1/*` | Only `APP_URL` | **No browser CORS at all.** The API is server-to-server only. A secret key must never be in a browser. |
| CORS for `/api/launch/exchange` + launch-scoped exam routes | Only `APP_URL` | Same origin. These are called from **our** page inside the iframe, so the request origin is our own host. No change needed. |
| Origin check middleware (`app.js:52`) | Rejects other origins | Skip it for `/api/v1/*` requests authenticated with an API key, because no browser is involved. Keep it for everything else. |
| `frame-ancestors` | `'self'` (Helmet default) | Per request, per institution, for launch / exam routes only (§8.4) |
| `Permissions-Policy` | not set | `camera=(self), fullscreen=(self)` on exam routes |
| `connect-src` in CSP | `'self'` | unchanged |
| Rate limit | 300/min per IP (memory) | `/api/v1`: **per API key**, e.g. 600/min burst, 20k/hour, configurable per institution. Launch exchange: 30/min per IP. Shared Redis store (§13). |
| Key leakage | n/a | Enable GitHub secret scanning for the `sk_live_` prefix. Automatically revoke keys reported as leaked. |
| Audit | user actions only | All write actions through the API are recorded with `apiKeyId`. |
| Request body size | 1 MB | Keep it. Bulk question endpoint is limited to 500 items / 1 MB. |

### Tasks

- [ ] Split CORS / origin-check / Helmet configuration per route group in `app.js`.
- [ ] Dynamic CSP middleware for launch routes.
- [ ] Per-key rate limiter (`express-rate-limit` with `keyGenerator: req => req.actor.id` and a Redis store).

---

## 12. Workstream G: billing and the payment lock

Today, a paid exam (`price > 0`) can't be started unless the **student** has a successful Paystack `Payment`. For partners this usually doesn't fit, because the school collects fees itself.

### Proposed model

| Scenario | Behaviour |
|---|---|
| Exam started via **launch** | The partner has vouched for the student. Skip the student payment check, **or** auto-create a `Payment { source: "PARTNER", status: "SUCCESS", amount: 0 }` as the access record, so existing reports keep working. |
| Partner wants **us** to charge the student | Keep the Paystack flow. The launch page shows "Payment required" first. Advanced option for later. |
| How **we** charge the partner | Usage-based: per started attempt (or per launch), billed monthly, **or** a plan with an included quota. Counted from `ExamAttempt` rows where `launchId` is not null. |

### Tasks

- [ ] `startAttempt`: if `launchId` is present → skip the student payment lock (or write a `PARTNER` payment record).
- [ ] Usage counter query + monthly usage view (owner dashboard + partner Usage tab).
- [ ] Decide on pricing (open question, §19).
- [ ] Phase 3: automated invoicing (Paystack subscriptions for NGN partners, Stripe for EUR/USD partners).

---

## 13. Workstream H: scaling and infrastructure

| Item | Today | Needed for partners |
|---|---|---|
| Background jobs | `setInterval` in `index.js` (every web process runs it) | Separate **worker** process (`node src/jobs/worker.js`). Use a database lock (`SELECT ... FOR UPDATE SKIP LOCKED`) or a queue (BullMQ + Redis) so several workers don't process the same row. |
| Jobs | expiry, disconnect detection | + webhook delivery, idempotency key purge, request log purge, launch token purge |
| Rate-limit storage | In memory | Redis (`rate-limit-redis`) |
| Web servers | One | 2+ behind a load balancer. The app is already mostly stateless (JWT), so this is straightforward. |
| Database | MySQL schema not yet run in production | Managed MySQL 8, daily backups + tested restore, read replica later for reports |
| Lists | Loaded in full then paginated in the browser | Server-side cursor pagination (v1 has this from day one) |
| Observability | morgan logs | Structured JSON logs with request ID; error tracking (e.g. Sentry); metrics: requests/sec per key, webhook backlog, failed deliveries, active attempts |
| Load test | none | Simulate e.g. 2,000 concurrent attempts: answer saves every 10 s, heartbeats every 15 s, burst of submits at deadline |
| Status page | none | Public status page; partners need it |

### Tasks

- [ ] `jobs/worker.js` + move `sweep` out of `index.js`.
- [ ] Locking for the expiry job and the webhook job.
- [ ] Redis (rate limits, optionally the queue).
- [ ] Structured logging + request ID middleware.
- [ ] Load test script (k6 or Artillery).

---

## 14. Workstream I: LTI 1.3 (phase 3)

**LTI 1.3 / LTI Advantage** is the standard used by Moodle, Canvas, Blackboard, D2L and Brightspace to plug in external tools. If a school uses one of these, they can add AssessmentDesk **without any custom code** on their side.

| LTI piece | Maps to |
|---|---|
| Tool registration (Dynamic Registration) | Creates/links an `Institution` + stores the LMS platform's keys |
| OIDC login + `LtiResourceLinkRequest` launch | Same as our launch: find or create the student (`sub` → `externalId`), open the exam |
| Deep Linking | Teacher picks which of our exams to add to their course |
| Assignment & Grade Services (AGS) | We send the score back into the LMS gradebook (uses the same events as `result.ready` / `result.released`) |
| Names & Role Provisioning (NRPS) | Optional roster sync |

Library: `ltijs` (Node) or our own implementation using `jose` for JWT/JWKS.

### Tasks (high level)

- [ ] `LtiPlatform` model (issuer, clientId, deploymentId, JWKS URL, institutionId).
- [ ] OIDC login + launch endpoints, JWKS endpoint for our keys.
- [ ] Deep linking UI.
- [ ] AGS score sending, triggered from the webhook/event outbox.
- [ ] Certification testing with the 1EdTech reference implementation, Moodle and Canvas.

---

## 15. Compliance and data protection

| Topic | What to do |
|---|---|
| Roles | We are the **data processor**. The partner school is the **controller** of student data. |
| Contracts | Data Processing Agreement (DPA) template; list of subprocessors (hosting, email, Paystack, Sentry). |
| Laws | **NDPA 2023 (Nigeria)** for us; **GDPR** if the partner is in the EU (e.g. Germany). Check whether EU data must be stored in the EU. If so, we may need an EU deployment. |
| Data minimisation | Partner students only need `externalId` + `name`. Email is optional. |
| Camera | Already favourable: detection runs in the browser and no video or images are stored. The camera notice must name the partner institution as the controller. |
| Retention | Configurable per institution: e.g. delete attempts / monitoring events after N months. Add `DELETE /api/v1/students/{id}` (erasure) that anonymises the user but keeps aggregate statistics. |
| Data export | `GET /api/v1/students/{id}/export` (data portability). |
| Children | If partners are secondary schools, parental consent rules may apply. The partner is responsible, but this should be stated in the terms. |
| Security | Keys stored hashed, TLS everywhere, audit log, access reviews. Pen-test before the first paying partner. |

---

## 16. Limitations and risks

| # | Limitation | Impact | Mitigation |
|---|---|---|---|
| L1 | **Camera in iframes on Safari / iOS** is unreliable | Some students can't pass the camera check when embedded | "Open in new tab" fallback (§8.4); document supported browsers |
| L2 | Partner forgets `allow="camera; fullscreen"` | Camera is blocked | Embed SDK sets it automatically; we detect it and post `camera_blocked` to the parent page |
| L3 | **Third-party cookies are blocked** by browsers | Cookie login can't work in iframes | Already designed around: token-based launch sessions |
| L4 | **We trust the partner's statement about who the student is** | A compromised partner, or one with weak login, can launch anyone | Contract terms; audit log of launches; partner keys limited by scope |
| L5 | Partner-built exam screens can't be trusted for monitoring | Monitoring only means something with our UI | Non-goal; document clearly. Grading, time limits and answer secrecy stay enforced on the server regardless. |
| L6 | Browser monitoring signals can be faked by a modified browser | Already true today | Keep the existing "signals, not verdicts" policy |
| L7 | Webhook order isn't guaranteed; delivery can be late | Partner shows stale state | `updatedSince` polling as a backup; document it |
| L8 | Once published, the API contract is hard to change | Slower future changes | Versioning policy (§7.1); think carefully about v1 fields |
| L9 | Paystack mostly covers African currencies | EU partners can't pay through it | Stripe / bank invoices for non-NGN partners |
| L10 | EU data residency | May need a second deployment | Decide before signing EU partners |
| L11 | Current single-process design | Outages under load during exam peaks | §13 must be done before the first large partner |
| L12 | Support and operations load | Partners expect uptime, docs, quick answers | Status page, docs, test environment, defined SLA |
| L13 | MySQL / Paystack / SMTP not yet tested end-to-end in production (per README) | Unknown production issues | Do the README's launch checklist first |

---

## 17. Phased delivery plan

Estimates assume one full-stack developer. "d" = working days.

### Phase 0: Preparation (≈ 4 d)

- [ ] Finish the README launch items: real MySQL, HTTPS deployment, SMTP. (2 d)
- [ ] Move business logic into `services/` (§6.5). Existing tests still pass. (2 d)

### Phase 1: Core partner API, new-tab launches (≈ 15 d)

- [ ] Prisma migration (§5). (1.5 d)
- [ ] Actor refactor: `req.actor`, `tenant()`, `audit()`, `finishAttempt`. (1 d)
- [ ] API keys: generation, `apiKeyAuth`, scopes, admin endpoints. (1.5 d)
- [ ] v1 conventions: errors, pagination, ID resolver, idempotency, request ID. (2 d)
- [ ] v1 routes: courses, questions (+bulk), exams, students, attempts, results, grading, certificates, `/me`. (3.5 d)
- [ ] Launches: create, exchange, `scope: "launch"` limited auth, `LAUNCH_ONLY` exams, payment-lock bypass, `Launch.jsx` (new-tab mode). (2.5 d)
- [ ] Webhooks: outbox, signer, worker with retries, SSRF guard. (2 d)
- [ ] Minimal developer settings page: keys + webhooks + allowed domains. (1 d)
- [ ] **Exit criteria:** a sample "partner" Node script can create an exam, launch a student, receive `result.ready`, and fetch the certificate PDF, all automated in CI.

### Phase 2: Embedding and developer experience (≈ 10 d)

- [ ] Per-institution `frame-ancestors`, `Permissions-Policy`. (1 d)
- [ ] Embedded layout, branding, postMessage bridge, Safari fallback. (2.5 d)
- [ ] Embed SDK script. (1 d)
- [ ] OpenAPI spec + docs site + guides + code samples. (2.5 d)
- [ ] Developer settings page: request logs, delivery log + resend, usage. (1.5 d)
- [ ] New features: force-submit, extend time, close exam. (1 d)
- [ ] Per-key rate limit with Redis. (0.5 d)

### Phase 3: Scale, billing, LTI (≈ 15–20 d)

- [ ] Separate worker process + locking; Redis; structured logs; error tracking. (3 d)
- [ ] Load test + fixes. (3 d)
- [ ] Usage-based billing + invoices (Paystack / Stripe). (4 d)
- [ ] LTI 1.3 launch + deep linking + grade sending. (6–8 d)
- [ ] Data retention, erasure, export endpoints; DPA. (2 d)

---

## 18. Testing strategy and acceptance criteria

### 18.1 Automated tests to add (`server/test/partner.test.js`)

**API keys**
- [ ] Missing / invalid / revoked / expired key → 401.
- [ ] Key from institution A can never read or change institution B's data (repeat for **every** v1 resource).
- [ ] Missing scope → 403 `insufficient_scope`.
- [ ] Suspended institution → 403.
- [ ] `questions:read` without `questions:answers` never returns `acceptedAnswers`.

**Idempotency and pagination**
- [ ] Same `Idempotency-Key` + same body → same response, no duplicate record.
- [ ] Same key + different body → 409.
- [ ] Cursor pagination returns every row exactly once.

**Launches**
- [ ] Launch token works once, expires after 5 min, can't be reused.
- [ ] Launch session token is rejected on non-exam routes (`/users`, `/exams` list, `/payments`, other exam IDs, other students' attempts).
- [ ] `returnUrl` outside `allowedOrigins` → 400.
- [ ] `LAUNCH_ONLY` exam can't be started with a normal student login.
- [ ] Paid exam started via launch doesn't need a Paystack payment.
- [ ] Restarting with a new launch resumes the same active attempt with saved answers.

**Webhooks**
- [ ] Event written in the same transaction as the attempt submission (crash simulation).
- [ ] Signature verifies with the documented algorithm; old timestamp rejected by the sample verifier.
- [ ] Retries follow the schedule; `DEAD` after the last try.
- [ ] SSRF: `http://127.0.0.1`, `http://169.254.169.254`, and private IP ranges reached via DNS are all rejected.

**Regression**
- [ ] All existing tests in `platform.test.js` and the Playwright suites pass unchanged.

### 18.2 Browser tests (`client/tests/partner-embed.spec.js`)

- [ ] Test partner page on a second origin embeds a launch in an iframe with `allow="camera; fullscreen"`. Camera check passes (fake video fixture), exam submitted, parent page receives `submitted` postMessage.
- [ ] Iframe without the `allow` attribute → `camera_blocked` message + fallback button shown.
- [ ] Embedding from an origin not in `allowedOrigins` is blocked by CSP.
- [ ] Expired / reused launch link shows the friendly error page.

### 18.3 Acceptance criteria (definition of done for Phase 1)

1. A partner can complete the full flow (create → launch → submit → webhook → result → certificate) using **only** the API and documentation, without our help.
2. No v1 endpoint returns data from another institution (proven by tests).
3. No secret (API key, webhook secret, launch token) is stored unhashed, except webhook secrets, which must be readable to sign deliveries. Encrypt those at rest with an app-level key.
4. Existing app behaviour and tests are unchanged.

---

## 19. Open questions / decisions needed

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | How do we identify partner students vs. our own students? | A: no email/password for partner students. B: email unique per institution + institution field on the login form. | **A** (§5.2) |
| Q2 | How do we charge partners? | Per attempt / per launch / monthly plan with quota | Monthly plan with included attempts + per-attempt overage |
| Q3 | Should partners be able to sell exams to their students through our Paystack? | Yes / No | Not in phase 1 |
| Q4 | Do we need an EU data location for German/EU partners? | Yes / No | Ask the first EU partner before signing; affects hosting choice |
| Q5 | Should "Powered by AssessmentDesk" be removable? | Per plan | Removable on higher plans |
| Q6 | Sandbox: separate `sk_test_` mode, or a separate sandbox institution? | Mode flag / separate institution | Separate sandbox institution in phase 1 (simpler); test mode later |
| Q7 | Do partners need to receive question answers via the API (e.g. to show students a review)? | Yes via `questions:answers` scope / only via result breakdown | Scope exists but is off by default |
| Q8 | LTI before or after the custom API? | — | After. The custom API gives more control and LTI reuses the same pieces. |
| Q9 | Who is the first pilot partner, and which LMS / stack do they use? | — | Needed to prioritise Phase 2 vs LTI |
