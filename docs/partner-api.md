# AssessmentDesk Partner API (v1)

Use this API to manage exams from your own platform and send your students into them without a separate AssessmentDesk login.

- **Base URL:** `https://<assessmentdesk-host>/api/v1`
- **Format:** JSON. Timestamps are ISO 8601 UTC. Money is in minor units (kobo).
- **Server-to-server only.** Never put an API key in browser code.

## Quick start

1. In AssessmentDesk, sign in as an institution administrator and open **Developers**.
2. Create an **API key** and store it in your server's secrets.
3. Add your dashboard's origin (e.g. `https://dashboard.example.com`) under **Allowed origins** if you want students sent back after the exam.
4. Add a **webhook** URL to receive results. Store the signing secret.
5. Create content, then create a launch link each time a student clicks "Start":

```bash
curl -X PUT https://HOST/api/v1/courses/ext_MATH101 \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Mathematics 101","code":"MATH101"}'

curl -X PUT https://HOST/api/v1/questions/ext_Q1 \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"text":"2 + 2 = ?","type":"SINGLE","marks":1,
       "options":[{"id":"a","text":"4","correct":true},{"id":"b","text":"5","correct":false}]}'

curl -X PUT https://HOST/api/v1/exams/ext_MATH101-FINAL \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Final","courseId":"ext_MATH101","questionIds":["ext_Q1"],
       "duration":60,"passMark":50,"price":0,"maxAttempts":1,"status":"PUBLISHED",
       "cameraRequired":true}'

curl -X POST https://HOST/api/v1/launches \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"examId":"ext_MATH101-FINAL",
       "student":{"externalId":"S-20931","name":"Ada Obi"},
       "returnUrl":"https://dashboard.example.com/exams/done"}'
# → { "id": "...", "url": "https://HOST/launch/…", "expiresAt": "...", "studentId": "...", "examId": "..." }
```

Open the returned `url` for the student in a new tab. It works **once** and expires after **5 minutes**, so create it when the student clicks Start. Never store or email it.

## Authentication and scopes

Send `Authorization: Bearer sk_live_…`. Keys are scoped:

| Scope | Allows |
|---|---|
| `courses:read` / `courses:write` | Courses |
| `questions:read` / `questions:write` | Questions. Correct answers are hidden unless the key also has `questions:answers`. |
| `questions:answers` | See correct options and accepted answers |
| `exams:read` / `exams:write` | Exams |
| `students:read` / `students:write` | Students |
| `launches:write` | Create launch links |
| `attempts:read` | Attempts and monitoring timelines |
| `results:read` / `results:write` | Results, release, manual grading |
| `certificates:read` | Issue and download certificates |

## Conventions

- **Your IDs.** Every object has our `id` and your `externalId`. Anywhere a path or body takes an ID, you can pass `ext_<yourId>` instead.
- **Upsert.** `PUT /{courses|questions|exams}/ext_<yourId>` creates the record (201) or replaces it (200). `PUT /students/ext_<yourId>` does the same for students.
- **Lists** take `?limit=` (max 200, default 50) and `?cursor=`, and return `{ "data": [...], "nextCursor": "..." | null }`.
- **Retries.** Send `Idempotency-Key: <unique string>` on POST requests. Repeating the same key and body within 24 hours returns the original response with `Idempotent-Replayed: true`. Reusing a key with a different body returns `409 idempotency_conflict`.
- **Errors** look like `{ "error": { "code": "validation_failed", "message": "...", "details": [...], "requestId": "..." } }`. Codes: `bad_request`, `validation_failed`, `unauthorized`, `forbidden`, `insufficient_scope`, `not_found`, `conflict`, `idempotency_conflict`, `gone`, `rate_limited`.
- **Rate limit:** 600 requests per minute per key by default (`RateLimit-*` headers, `429` with `Retry-After`).
- Every response has an `X-Request-Id`. Include it when you contact support.
- New fields may be added to responses at any time. Ignore fields you don't know.

## Endpoints

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/me` | any | Your institution and the key's scopes |
| GET | `/courses` | courses:read | |
| POST | `/courses` | courses:write | `{ title, code, description?, status?, externalId? }` |
| GET / PATCH | `/courses/{id}` | courses:* | PATCH is a partial update |
| PUT | `/courses/{id}` | courses:write | Create or replace (`ext_` IDs) |
| GET | `/questions` | questions:read | |
| POST | `/questions` | questions:write | Types: `SINGLE`, `MULTIPLE`, `TRUE_FALSE`, `SHORT` (needs `acceptedAnswers`), `ESSAY` |
| POST | `/questions/bulk` | questions:write | `{ questions: [...] }`, up to 500. Upserts by `externalId`; returns a result per item. |
| GET / PUT / DELETE | `/questions/{id}` | questions:* | DELETE fails with 409 if the question is used in an exam |
| GET / POST | `/exams` | exams:* | |
| GET / PUT | `/exams/{id}` | exams:* | PUT replaces the exam, including its question list |
| GET | `/students` | students:read | |
| GET | `/students/{id}` | students:read | |
| PUT | `/students/ext_{id}` | students:write | `{ name, studentNumber? }` |
| POST | `/students/{id}/deactivate` · `/reactivate` | students:write | Deactivation blocks new launches and ends live exam sessions |
| POST | `/launches` | launches:write | See above. Creates the student if needed. |
| GET | `/attempts` | attempts:read | Filters: `examId`, `studentId`, `status` |
| GET | `/attempts/{id}` | attempts:read | Never includes answers |
| GET | `/attempts/{id}/integrity` | attempts:read | Camera, tab and connection events |
| GET | `/results` | results:read | Filters: `examId`, `studentId`, `released=true\|false`, `status=GRADED\|UNDER_REVIEW` |
| GET | `/results/{id}` | results:read | Includes per-question `breakdown` |
| POST | `/results/{id}/release` | results:write | Release a held result |
| GET | `/grading` | results:read | Results waiting for essay marking |
| POST | `/results/{id}/grade` | results:write | `{ grades: [{ questionId, awarded, comment? }] }` |
| POST | `/results/{id}/certificate` | certificates:read | Issues (or returns) the certificate for a released passing result |
| GET | `/certificates/{id}/pdf` | certificates:read | PDF download |

### Exam fields

`title`, `description`, `courseId`, `questionIds`, `duration` (minutes), `passMark` (%), `price` (kobo), `maxAttempts`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `startsAt`, `endsAt`, `shuffleQuestions`, `shuffleOptions`, `releaseResults`, `fullscreen`, `cameraRequired`, and `accessMode`.

`accessMode` defaults to `LAUNCH_ONLY` for exams created through the API. These exams can only be started through a launch link and are hidden from AssessmentDesk's own student list. Set `OPEN` to also offer the exam to students who sign in to AssessmentDesk directly.

Students started through a launch never pay through AssessmentDesk. You handle billing for your students.

### Launches

- A launch fails with `409` if the exam isn't published, is outside its schedule, has no questions, or the student has used all attempts.
- If the student already has an exam in progress, a new launch resumes it with saved answers. Use this if the student closed the tab.
- `returnUrl` must start with one of your **Allowed origins**. When the student finishes, they see their result (if released) and a **Return to your dashboard** button.
- Students created through launches have no email address or password. They can only take exams through your launches.

## Webhooks

We `POST` JSON to your URL:

```json
{
  "id": "evt_9c1f…",
  "type": "result.ready",
  "apiVersion": "v1",
  "createdAt": "2026-12-01T09:12:44.000Z",
  "institutionId": "…",
  "data": { "resultId": "…", "attemptId": "…", "examExternalId": "MATH101-FINAL",
            "studentExternalId": "S-20931", "percentage": 80, "grade": "A",
            "passed": true, "released": true, "...": "..." }
}
```

| Event | When |
|---|---|
| `attempt.started` | A student starts an attempt |
| `attempt.submitted` | Submitted by the student, or automatically when time runs out (`data.expired: true`) |
| `result.ready` | Fully graded automatically. Check `data.released`. |
| `result.pending_grading` | Contains essays waiting for an examiner |
| `result.graded` | An examiner finished marking |
| `result.released` | A held result was released |
| `certificate.issued` | A certificate was created (`data.verifyUrl`) |
| `ping` | Test event from the Developers page |

**Verify every request.** The `AssessmentDesk-Signature` header looks like `t=<unix seconds>,v1=<hex>`. Compute `HMAC-SHA256(secret, t + "." + rawBody)` and compare in constant time. Reject requests where `t` is more than 5 minutes old.

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 || "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

**Delivery:**
- Respond with any `2xx` within 10 seconds.
- Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours and 12 hours. After that the delivery is marked dead. You can resend it from the Developers page.
- Events can arrive late, more than once, or out of order. De-duplicate on `id` (also sent as `AssessmentDesk-Event-Id`). If in doubt, re-read the current state with `GET /results`.
