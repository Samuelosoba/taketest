# AssessmentDesk

A working multi-tenant examination MVP built from `AssessmentDesk_SaaS_Platform_Documentation.docx`. React/Vite frontend, Express API, Prisma persistence, a PostgreSQL production schema (deployed on Vercel with Neon), and an isolated SQLite profile for local development.

## Run locally

Requires Node.js 22 and npm. From this directory:

```powershell
npm.cmd run setup
npm.cmd run dev
```

Open **http://127.0.0.1:5175**. The API runs at **http://127.0.0.1:4000**. The frontend uses port 5175 because 5173 and 5174 were already occupied on this workstation. Use the exact frontend origin configured in `server/.env`.

`setup` installs dependencies, generates the local Prisma client, initializes the database, creates a random JWT secret, and seeds a demo workspace. Running it again preserves existing records. Stop the API before rerunning setup on Windows, because a running process locks Prisma's native engine DLL. No payment provider is simulated: a paid exam stays locked until a verified Paystack payment exists.

### Demo accounts

All four demo accounts use the password **`Assessment123!`**. The login screen offers buttons that fill these credentials; click **Sign in** to continue.

| Role                      | Email                          |
| ------------------------- | ------------------------------ |
| Institution administrator | `admin@assessmentdesk.demo`    |
| Examiner                  | `examiner@assessmentdesk.demo` |
| Student                   | `student@assessmentdesk.demo`  |
| Platform owner            | `owner@assessmentdesk.demo`    |

Institution slug: **`greenfield`**. The General Science practice exam is free and useful for trying the student workflow. Historical attempts are explicitly seeded demonstration data; dashboards calculate their metrics from persisted records. Browser tests create their own student accounts and archive their test courses.

## Implemented

- Institution and student registration, login/logout, bcrypt password hashing, short-lived JWT access tokens, rotating HTTP-only refresh cookies, email verification endpoints, password recovery and password change.
- Four roles, server-side tenant scoping, active account/institution checks, and platform owner activation/suspension controls.
- Student/staff management, account deactivation, student history, courses, publication states, search, filters, pagination, and CSV exports.
- Reusable question bank: single/multiple-answer MCQ, true/false, normalized short answer, essay, and HTTPS question image URLs.
- Exam configuration: question selection, schedule, duration, pass threshold, price, attempt limit, question/option shuffling, release policy, fullscreen preference, and camera requirement.
- Timed attempts with immutable question snapshots, persisted answers, recovery after refresh, backend validation, server-enforced deadlines, and automatic expiry processing every 15 seconds while the API is running. Overdue attempts are processed again on startup/access.
- Backend objective grading; exact-set matching for multiple answers; subjective grading queue with marks and feedback; configurable grading bands; held/released results.
- Paystack initialization, authenticated verification, raw-body HMAC-SHA512 webhook validation, amount/currency/customer checks, unique references, and idempotent payment fulfillment. Successful payment records are the authoritative access grants.
- PDF certificates with QR verification links and public verification exposing only basic certificate identity.
- Institution/student dashboards, platform metrics, activity charts, result analytics, audit logging, and institution subscription records managed by the owner.
- Responsive desktop/mobile layouts, loading/error/empty states, dialogs, keyboard-accessible controls, and feedback notifications.
- Partner integration: scoped API keys, the `/api/v1` REST API with external IDs, idempotency and pagination, single-use exam launch links for partner students, signed webhooks with retries, and a **Developers** settings page. See [docs/partner-api.md](docs/partner-api.md) and [docs/partner-integration-spec.md](docs/partner-integration-spec.md). Local development may deliver webhooks to `http://127.0.0.1` only when `WEBHOOK_ALLOW_PRIVATE=true` is set on the backend.

## Checks

```powershell
# Backend integration tests and camera-signal unit tests; disposable backend database.
npm.cmd test

# Production client build.
npm.cmd run build

# Browser tests against the running local app; uses installed Google Chrome.
cd client
npx.cmd playwright test
```

The backend suite covers cross-tenant access, role restrictions, payment gating, forged callbacks, exact amount/currency/customer verification, payment idempotency, answer secrecy, saved-answer recovery, backend scoring, repeat submission, expired attempts, attempt limits, manual grading, result release, PDF/public verification, refresh rotation, and institution suspension.

The browser suite covers question and exam authoring, all administrator screens, course creation/editing, account access, session persistence, student registration, exam recovery/submission, results and certificate download, role-specific navigation, and a 390px mobile viewport. Camera tests use a generated blank video fixture, never your physical webcam, and cover the real local face detector, permission denial, a missing model, camera interruption/recovery, page-exit delivery, and camera cleanup after submission. Browser tests add clearly named test records to the local demo database; camera tests create separate test institutions. Run them only against a development instance.

## Camera and exam monitoring

1. Open **Examinations → Manage → Exam details** and enable **Require camera and face-presence monitoring**. Select questions and save. New exams created in the UI default to camera monitoring; existing exams retain their previous policy until edited. In-progress attempts keep the policy captured when they started.
2. Students see a camera/privacy notice and must enable their camera and load face detection before starting. The camera preview stays visible during the attempt. If the camera or detector becomes unavailable, the answer interface is blocked until monitoring recovers; the authoritative timer continues.
3. Admins and examiners open **Exam monitoring → View timeline** to review events, including active attempts and objective-only exams. Timelines can be exported as CSV.

**Recorded signals:** no face or multiple faces continuously detected for at least 3 seconds; camera unavailable/stopped; detector failure; tab hidden/visible; window focus loss/return; fullscreen exit; attempted paste; and page exit. Repeated camera warnings have a 30-second client cooldown; the server debounces identical browser signals for 10 seconds and caps them at 1,000 per attempt.

**Tab/window closure:** `pagehide` sends a best-effort authenticated beacon with an attempt-scoped, exit-only token. A page-exit event means navigation, refresh, or closure—not definitively a closed tab. The browser also sends a heartbeat every 15 seconds. The server records a connection gap after more than 60 seconds without a heartbeat, checked every 15 seconds, and records reconnection. Crashes, lost internet, OS sleep, and browser timer throttling can produce the same signal. Closing a tab does not stop the exam timer; saved answers remain recoverable until expiry. The app requests the browser's native leave-page warning, which browsers may suppress. It cannot prevent a user from closing a window.

**Privacy and limitations:** MediaPipe checks face presence/count locally using pinned, self-hosted model/WASM assets. No video, images, or audio are uploaded or stored; only event types, server timestamps, and last-seen metadata are persisted. This does not identify people, detect gaze/intent, verify a live person, or prove cheating. Browser-reported signals and the camera-ready check can be spoofed by a modified client. No automatic cheating verdicts, grade penalties, or disqualifications are applied. Examiners must review signals in context, including device/accessibility/network issues. Actual detection accuracy across devices and lighting has not been benchmarked.

Camera access requires a supported browser and HTTPS, or localhost/127.0.0.1 for development. Running `npm run dev` or `npm run build` copies the pinned MediaPipe WASM files into `client/public/proctoring/wasm`; the checked-in model is SHA-256 verified. All assets are served from the app's own origin, including the production build. If assets are missing, run `npm.cmd run prepare:proctoring` in `client`. The production CSP allows same-origin scripts and WebAssembly compilation.

For an existing local database, stop the backend and run `npm.cmd run db:setup` in `server`. The additive SQLite upgrade preserves existing records. Restart the backend afterward.

Browser behavior follows the [MDN beacon guidance](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) and [page visibility guidance](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). Local detection uses [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md).

## Deployment (Vercel + Neon Postgres)

Production runs as two Vercel projects and a Neon Postgres database:

| Part | Vercel project | Root directory | URL |
| --- | --- | --- | --- |
| Frontend (React/Vite) | `assessmentdesk-web` | `client/` | https://assessmentdesk-web.vercel.app |
| Backend (Express, serverless) | `assessmentdesk-api` | `server/` | https://assessmentdesk-api.vercel.app |

- `client/vercel.json` forwards `/api/*` to the backend. To the browser everything is one site, so the same-site refresh cookie, CORS and the origin check need no changes. Other paths fall back to `index.html` for client-side routing.
- `server/vercel.json` routes every request to `server/api/index.js`, which exports the Express app. The build runs `npm run vercel-build`, which generates the Prisma client and applies `prisma migrate deploy` to Neon.
- Local development and tests still use SQLite. `scripts/local-schema.mjs` derives `schema.local.prisma` from the Postgres schema.

**Backend environment variables:**
- `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations). The Neon integration adds both.
- `JWT_SECRET`
- `APP_URL`: the frontend URL. It is used for CORS, the origin check, launch links and certificate links.
- `CRON_SECRET`
- Optional: `PAYSTACK_SECRET_KEY`, the SMTP variables, `MAIL_FROM`, `API_RATE_LIMIT_PER_MINUTE`.

**Background work.** Serverless functions can't run the 15-second timer, so this work runs through `GET /api/cron/sweep` with `Authorization: Bearer <CRON_SECRET>`:
- auto-submitting expired attempts
- flagging silent disconnections
- delivering webhooks

Vercel Cron calls it once a day, which is the Hobby plan's limit. For exams, call it every minute from an external scheduler (for example cron-job.org) with that header, or upgrade to Vercel Pro and change the schedule in `server/vercel.json`. Deadlines are always enforced when a student returns, but auto-submission and webhooks wait for the next sweep.

**Deploy updates** from each folder with `npx vercel@latest deploy --prod`, or connect the GitHub repo with root directories `server` and `client`.

**Create the platform owner** for an empty production database:
1. Run `npx vercel@latest env pull .env.production.local` in `server/`.
2. Run `owner:create` with that file's `DATABASE_URL` and `OWNER_*` variables, after `npx prisma generate --schema prisma/schema.prisma`.
3. Run `npm run db:setup` afterwards to restore the local SQLite client.
4. Delete the pulled env file.

Never seed the demo accounts into production.

## Paystack and email configuration

Set `PAYSTACK_SECRET_KEY` on the backend. Configure your Paystack webhook URL to `https://YOUR_DOMAIN/api/payments/webhook`. Checkout returns to `/payments`, where the student can ask the backend to verify the reference. The redirect itself never grants access. Webhooks independently verify the transaction with Paystack before granting access. Amounts are stored as integer minor units (kobo) in NGN.

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` for registration verification and password recovery emails. Missing mail configuration is reported; no reset tokens are exposed through API responses. Verification links expire after 24 hours and reset links after one hour. Account verification is recorded but not currently required for exam access.

The implementation follows [Paystack webhook signature guidance](https://paystack.com/docs/payments/webhooks/) and [transaction verification guidance](https://paystack.com/docs/payments/verify-payments/). Database provider configuration follows the [Prisma 6 schema reference](https://www.prisma.io/docs/orm/v6/reference/prisma-schema-reference).

## Remaining launch work and scope

This is a locally verified MVP, not a claim of production readiness or a completed implementation of every future item in the document.

- Run end-to-end checks against the production Neon database, Paystack test/live accounts, SMTP service, and HTTPS deployment. No real payment was charged or live email sent during development.
- Subscription plans are owner-managed records. Automated SaaS subscription checkout, renewal, plan quotas, and billing enforcement are not connected.
- Question images use HTTPS URLs. Cloudinary uploads, institution/profile image uploads, and custom certificate templates are not implemented.
- The header provides guidance to results/payments; a persistent in-app notification inbox and automatic payment/result notification emails remain to be added.
- CSV reports are available; bulk CSV/Excel enrollment and Excel/PDF analytical reports remain outside this MVP. Certificate PDFs are implemented.
- Camera face-presence monitoring and browser/connection event review are implemented. Automatic sanctions, remote live video proctoring, video recording, identity verification, AI question generation, offline sync, and the document's other future enhancements remain deferred.
- Before a public launch, configure reverse-proxy trust for your topology, monitoring, backups/restore tests, mail delivery, retention policies, rate-limit storage for multiple API instances, and load testing with realistic concurrent exams. Current lists load workspace records before client-side pagination; large tenants will need server pagination.

## Layout

```text
client/src/             React application, dashboard, forms, exam screen
client/tests/           Playwright browser workflows
server/src/core.js     Database, authentication, sessions, mail helpers
server/src/*-routes.js Validated role/tenant scoped API areas
server/src/grading.js  Authoritative grading and expiry processing
server/prisma/         Postgres schema/migration, local schema, seed
server/test/           API/security integration checks
scripts/dev.mjs        Starts the frontend and backend together
```
