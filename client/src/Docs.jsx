// Public developer documentation for the AssessmentDesk Partner API (v1).
import React, { useState } from "react";
import useHashScroll from "./useHashScroll";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Menu, X } from "lucide-react";
import { Logo } from "./App";

const API = "https://assessmentdesk-api.vercel.app/api/v1";
const WEB = "https://assessmentdesk-web.vercel.app";

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="doc-code">
      <div className="doc-code-bar">
        <span>{label}</span>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
          aria-label="Copy code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}
function Tabs({ samples }) {
  const [active, setActive] = useState(0);
  return (
    <div className="doc-tabs">
      <div role="tablist">
        {samples.map(([name], i) => (
          <button
            key={name}
            role="tab"
            aria-selected={i === active}
            className={i === active ? "on" : ""}
            onClick={() => setActive(i)}
          >
            {name}
          </button>
        ))}
      </div>
      <CodeBlock code={samples[active][1]} label={samples[active][0]} />
    </div>
  );
}
function Table({ head, rows }) {
  return (
    <div className="doc-table">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const C = ({ children }) => <code className="doc-inline">{children}</code>;
function Endpoint({ method, path, scope, children }) {
  return (
    <div className="doc-endpoint">
      <div>
        <span className={`doc-method ${method.toLowerCase()}`}>{method}</span>
        <code>{path}</code>
        {scope && <span className="doc-scope">{scope}</span>}
      </div>
      {children && <p>{children}</p>}
    </div>
  );
}
function Section({ id, title, children }) {
  return (
    <section id={id} className="doc-section">
      <h2>
        <a href={`#${id}`}>{title}</a>
      </h2>
      {children}
    </section>
  );
}

const toc = [
  ["overview", "Overview"],
  ["features", "Key features"],
  ["how", "How an integration works"],
  ["quickstart", "Quick start"],
  ["auth", "Authentication and scopes"],
  ["conventions", "Conventions"],
  ["errors", "Errors and rate limits"],
  ["courses", "Courses"],
  ["questions", "Questions"],
  ["exams", "Exams"],
  ["students", "Students"],
  ["launches", "Launch links"],
  ["attempts", "Attempts and monitoring"],
  ["results", "Results and grading"],
  ["certificates", "Certificates"],
  ["webhooks", "Webhooks"],
  ["verify", "Verifying webhook signatures"],
  ["security", "Security checklist"],
  ["troubleshooting", "Troubleshooting"],
  ["limits", "Current limitations"],
];

export default function Docs() {
  const [menu, setMenu] = useState(false);
  useHashScroll();
  return (
    <div className="docs">
      <header className="docs-top">
        <Link to="/welcome" aria-label="AssessmentDesk home">
          <Logo />
        </Link>
        <span className="docs-badge">API v1</span>
        <div className="docs-top-links">
          <Link to="/welcome">
            <ArrowLeft size={15} /> Home
          </Link>
          <Link className="btn primary" to="/register">
            Get an API key
          </Link>
        </div>
        <button
          className="icon-btn docs-menu"
          aria-label={menu ? "Close contents" : "Open contents"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <div className="docs-body">
        <aside className={`docs-nav ${menu ? "open" : ""}`}>
          <strong>Contents</strong>
          <nav aria-label="Documentation">
            {toc.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="docs-main">
          <div className="docs-intro">
            <span className="eyebrow">DEVELOPER DOCUMENTATION</span>
            <h1>AssessmentDesk Partner API</h1>
            <p>
              Build exams, enrol students and collect results from your own
              platform. AssessmentDesk runs the secure exam room, timing,
              monitoring, grading and certificates. Your platform stays in
              charge of users and the experience around them.
            </p>
            <div className="docs-facts">
              <div>
                <span>Base URL</span>
                <code>{API}</code>
              </div>
              <div>
                <span>Format</span>
                <code>JSON over HTTPS</code>
              </div>
              <div>
                <span>Auth</span>
                <code>Bearer API key</code>
              </div>
            </div>
          </div>

          <Section id="overview" title="Overview">
            <p>
              The Partner API is a <strong>server-to-server</strong> REST API.
              Your backend authenticates with an API key that belongs to one
              institution workspace, and every call only sees that institution's
              data.
            </p>
            <p>There are three integration layers:</p>
            <ol>
              <li>
                <strong>REST API</strong> (your server → AssessmentDesk). Manage
                courses, questions, exams and students, and read attempts,
                results and certificates.
              </li>
              <li>
                <strong>Launch links</strong> (student browser →
                AssessmentDesk). Each link is single-use and sends one student
                into one exam without a separate login.
              </li>
              <li>
                <strong>Webhooks</strong> (AssessmentDesk → your server). Signed
                notifications when attempts start and finish and when results
                are ready.
              </li>
            </ol>
          </Section>

          <Section id="features" title="Key features of the service">
            <Table
              head={["Feature", "What you get"]}
              rows={[
                [
                  "Question bank",
                  "Single choice, multiple choice (exact-set grading), true/false, short answer with accepted variations, and essays with manual marking. Subjects, difficulty, marks and image URLs.",
                ],
                [
                  "Exam engine",
                  "Question selection, duration, pass mark, attempt limits, open/close windows, question and option shuffling, fullscreen request, camera requirement, price, and result release policy.",
                ],
                [
                  "Server-side timing",
                  "Deadlines are enforced by the server. Answers save continuously and recover after refresh. Expired attempts are submitted automatically.",
                ],
                [
                  "Grading",
                  "Objective answers are graded on the server instantly. Essays go to a grading queue. Institution grading bands and pass thresholds are applied.",
                ],
                [
                  "Integrity monitoring",
                  "Optional in-browser face-presence detection (no video uploaded), plus tab, focus, fullscreen, paste, page-exit and connection signals in a reviewable timeline.",
                ],
                [
                  "Results and certificates",
                  "Held or released results, per-question breakdowns, and PDF certificates with public QR verification.",
                ],
                [
                  "Your identifiers",
                  "Every resource accepts your own externalId. Use ext_<id> anywhere an ID is expected, and upsert with PUT.",
                ],
                [
                  "Reliable writes",
                  "Idempotency keys on POST, cursor pagination, consistent error codes and request IDs.",
                ],
                [
                  "Launch links",
                  "Single-use, 5-minute links that create or update the student and open the exam, with an optional return URL to your site.",
                ],
                [
                  "Webhooks",
                  "HMAC-SHA256 signed events, automatic retries for about 21 hours, delivery logs and manual resend.",
                ],
                [
                  "Isolation and audit",
                  "Each key is limited to one institution and its scopes. Actions are written to the institution's audit log with the API key that made them.",
                ],
              ]}
            />
          </Section>

          <Section id="how" title="How an integration works">
            <ol className="doc-flow">
              <li>
                <strong>Set up once.</strong> An institution administrator
                creates an API key, a webhook endpoint and allowed origins on
                the <em>Developers</em> page.
              </li>
              <li>
                <strong>Sync content.</strong> Your server upserts courses,
                questions and exams with your own IDs, for example{" "}
                <C>PUT /exams/ext_MATH101-FINAL</C>.
              </li>
              <li>
                <strong>Student clicks Start in your portal.</strong> Your
                server calls <C>POST /launches</C> and receives a one-time{" "}
                <C>url</C>.
              </li>
              <li>
                <strong>Open the link</strong> in a new tab. The student does
                the camera check (if required) and takes the exam on
                AssessmentDesk.
              </li>
              <li>
                <strong>Get the outcome.</strong> You receive{" "}
                <C>attempt.submitted</C> and <C>result.ready</C> webhooks, and
                can read <C>GET /results</C> at any time. The student can return
                to your <C>returnUrl</C>.
              </li>
            </ol>
          </Section>

          <Section id="quickstart" title="Quick start">
            <ol>
              <li>
                <Link to="/register">Register an institution</Link> and sign in
                as its administrator.
              </li>
              <li>
                Open <strong>Developers → New key</strong>, choose scopes, and
                store the key (<C>sk_live_…</C>) in your server's secrets. It is
                shown only once.
              </li>
              <li>
                Optionally add a webhook URL and your dashboard's origin under{" "}
                <strong>Allowed origins</strong>.
              </li>
              <li>Check the key:</li>
            </ol>
            <CodeBlock
              label="Shell"
              code={`curl ${API}/me \\
  -H "Authorization: Bearer $ASSESSMENTDESK_KEY"`}
            />
            <CodeBlock
              label="Response · 200"
              code={`{
  "institution": { "id": "cm3…", "name": "Klar Institut", "slug": "klar" },
  "apiKeyId": "cm3…",
  "scopes": ["courses:read", "courses:write", "exams:write", "launches:write", "results:read"]
}`}
            />
            <p>
              Create a course, a question and an exam, then launch a student:
            </p>
            <Tabs
              samples={[
                [
                  "Shell",
                  `KEY="Authorization: Bearer $ASSESSMENTDESK_KEY"
JSON="Content-Type: application/json"

curl -X PUT ${API}/courses/ext_MATH101 -H "$KEY" -H "$JSON" \\
  -d '{"title":"Mathematics 101","code":"MATH101"}'

curl -X PUT ${API}/questions/ext_Q1 -H "$KEY" -H "$JSON" \\
  -d '{"text":"2 + 2 = ?","type":"SINGLE","marks":1,
       "options":[{"id":"a","text":"4","correct":true},
                  {"id":"b","text":"5","correct":false}]}'

curl -X PUT ${API}/exams/ext_MATH101-FINAL -H "$KEY" -H "$JSON" \\
  -d '{"title":"Final exam","courseId":"ext_MATH101","questionIds":["ext_Q1"],
       "duration":60,"passMark":50,"price":0,"maxAttempts":1,
       "status":"PUBLISHED","cameraRequired":true}'

curl -X POST ${API}/launches -H "$KEY" -H "$JSON" \\
  -d '{"examId":"ext_MATH101-FINAL",
       "student":{"externalId":"S-20931","name":"Ada Obi"},
       "returnUrl":"https://portal.example.com/exams/done"}'`,
                ],
                [
                  "Node.js",
                  `const API = "${API}";
const headers = {
  Authorization: \`Bearer \${process.env.ASSESSMENTDESK_KEY}\`,
  "Content-Type": "application/json",
};
async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(\`\${data.error.code}: \${data.error.message}\`);
  return data;
}

await call("PUT", "/courses/ext_MATH101", { title: "Mathematics 101", code: "MATH101" });
await call("PUT", "/exams/ext_MATH101-FINAL", {
  title: "Final exam", courseId: "ext_MATH101", questionIds: ["ext_Q1"],
  duration: 60, passMark: 50, price: 0, maxAttempts: 1, status: "PUBLISHED",
});

// When the student clicks "Start" in your portal:
const launch = await call("POST", "/launches", {
  examId: "ext_MATH101-FINAL",
  student: { externalId: user.id, name: user.fullName },
  returnUrl: "https://portal.example.com/exams/done",
});
res.redirect(launch.url); // or window.open(launch.url) from your frontend`,
                ],
                [
                  "Python",
                  `import os, requests

API = "${API}"
session = requests.Session()
session.headers.update({"Authorization": f"Bearer {os.environ['ASSESSMENTDESK_KEY']}"})

def call(method, path, body=None):
    r = session.request(method, API + path, json=body, timeout=15)
    data = r.json()
    if not r.ok:
        raise RuntimeError(f"{data['error']['code']}: {data['error']['message']}")
    return data

call("PUT", "/courses/ext_MATH101", {"title": "Mathematics 101", "code": "MATH101"})
launch = call("POST", "/launches", {
    "examId": "ext_MATH101-FINAL",
    "student": {"externalId": "S-20931", "name": "Ada Obi"},
})
print(launch["url"])`,
                ],
                [
                  "PHP",
                  `<?php
function assessmentdesk($method, $path, $body = null) {
    $ch = curl_init("${API}" . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer " . getenv("ASSESSMENTDESK_KEY"),
            "Content-Type: application/json",
        ],
        CURLOPT_POSTFIELDS => $body ? json_encode($body) : null,
    ]);
    $data = json_decode(curl_exec($ch), true);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($status >= 400) throw new Exception($data["error"]["message"]);
    return $data;
}

$launch = assessmentdesk("POST", "/launches", [
    "examId" => "ext_MATH101-FINAL",
    "student" => ["externalId" => "S-20931", "name" => "Ada Obi"],
]);
header("Location: " . $launch["url"]);`,
                ],
              ]}
            />
          </Section>

          <Section id="auth" title="Authentication and scopes">
            <p>
              Send the key in the <C>Authorization</C> header on every request:{" "}
              <C>Authorization: Bearer sk_live_…</C>. Keys are created and
              revoked by institution administrators on the{" "}
              <strong>Developers</strong> page. Only a hash is stored, so a lost
              key cannot be recovered. Create a new one and revoke the old one.
            </p>
            <p>
              <strong>Never</strong> use a key in browser or mobile code. Call
              the API from your server only.
            </p>
            <Table
              head={["Scope", "Allows"]}
              rows={[
                [<C>courses:read</C>, "List and read courses"],
                [<C>courses:write</C>, "Create, update and upsert courses"],
                [
                  <C>questions:read</C>,
                  "List and read questions (correct answers hidden)",
                ],
                [
                  <C>questions:write</C>,
                  "Create, update, bulk-upsert and delete questions",
                ],
                [
                  <C>questions:answers</C>,
                  "Include correct options and accepted answers when reading questions",
                ],
                [<C>exams:read</C>, "List and read exams"],
                [<C>exams:write</C>, "Create, replace and upsert exams"],
                [<C>students:read</C>, "List and read students"],
                [
                  <C>students:write</C>,
                  "Upsert, deactivate and reactivate students",
                ],
                [<C>launches:write</C>, "Create launch links"],
                [<C>attempts:read</C>, "Read attempts and integrity timelines"],
                [<C>results:read</C>, "Read results and the grading queue"],
                [
                  <C>results:write</C>,
                  "Release results and submit essay marks",
                ],
                [<C>certificates:read</C>, "Issue and download certificates"],
              ]}
            />
            <p>
              A request without the required scope fails with{" "}
              <C>403 insufficient_scope</C>. Give each key only the scopes it
              needs.
            </p>
          </Section>

          <Section id="conventions" title="Conventions">
            <h3>Your IDs (externalId)</h3>
            <p>
              Every object has our <C>id</C> and your <C>externalId</C>.
              Anywhere an ID is accepted (paths, <C>courseId</C>,{" "}
              <C>questionIds</C>, <C>examId</C>, filters), you can pass{" "}
              <C>ext_&lt;yourId&gt;</C> instead. External IDs are unique per
              resource type within your institution, up to 190 characters.
            </p>
            <h3>Upserts</h3>
            <p>
              <C>PUT /courses|questions|exams/ext_&lt;yourId&gt;</C> creates the
              record (<C>201</C>) or replaces it (<C>200</C>). Use this to sync
              from your system without tracking our IDs. A <C>PUT</C> on one of
              our IDs that does not exist returns <C>404</C>.
            </p>
            <h3>Pagination</h3>
            <p>
              Lists return newest first. Pass <C>?limit=</C> (1–200, default 50)
              and the <C>cursor</C> from the previous page:
            </p>
            <CodeBlock
              label="Response shape"
              code={`{ "data": [ … ], "nextCursor": "cm3…" }   // null on the last page

GET /courses?limit=100&cursor=cm3…`}
            />
            <h3>Idempotency</h3>
            <p>
              Add <C>Idempotency-Key: &lt;unique string&gt;</C> to any{" "}
              <C>POST</C>. If you retry with the same key and the same body
              within 24 hours, you receive the original response with{" "}
              <C>Idempotent-Replayed: true</C> and nothing is created twice.
              Reusing a key with a different body returns{" "}
              <C>409 idempotency_conflict</C>.
            </p>
            <h3>Data formats</h3>
            <ul>
              <li>Timestamps are ISO 8601 in UTC.</li>
              <li>
                Money is an integer in minor units (kobo), for example{" "}
                <C>250000</C> = ₦2,500.00.
              </li>
              <li>
                New fields may be added to responses at any time. Ignore fields
                you don't recognise. Breaking changes will only ship under a new
                version (<C>/api/v2</C>).
              </li>
            </ul>
          </Section>

          <Section id="errors" title="Errors and rate limits">
            <CodeBlock
              label="Error body"
              code={`{
  "error": {
    "code": "validation_failed",
    "message": "The request body is invalid.",
    "details": [{ "path": "duration", "message": "Too small: expected number to be >=1" }],
    "requestId": "6548fd1a-0931-4552-b443-0744ea33ca2c"
  }
}`}
            />
            <Table
              head={["HTTP", "code", "Meaning"]}
              rows={[
                [
                  "400",
                  <C>bad_request</C>,
                  "Invalid input that isn't a schema error, e.g. a returnUrl outside your allowed origins",
                ],
                [
                  "400",
                  <C>validation_failed</C>,
                  "Body failed validation; see details",
                ],
                ["400", <C>invalid_json</C>, "Body is not valid JSON"],
                [
                  "401",
                  <C>unauthorized</C>,
                  "Missing, invalid, expired or revoked key",
                ],
                ["403", <C>forbidden</C>, "Institution suspended"],
                [
                  "403",
                  <C>insufficient_scope</C>,
                  "Key lacks a required scope",
                ],
                [
                  "404",
                  <C>not_found</C>,
                  "No such resource in your institution",
                ],
                [
                  "409",
                  <C>conflict</C>,
                  "Duplicate externalId/code, exam not available, attempts used up, question in use",
                ],
                [
                  "409",
                  <C>idempotency_conflict</C>,
                  "Idempotency-Key reused with a different body",
                ],
                [
                  "429",
                  <C>rate_limited</C>,
                  "Too many requests. Wait for Retry-After.",
                ],
                [
                  "500",
                  <C>server_error</C>,
                  "Unexpected error. Retry with backoff and share the requestId.",
                ],
              ]}
            />
            <p>
              Each key may make <strong>600 requests per minute</strong> by
              default. Responses include <C>RateLimit</C> and{" "}
              <C>RateLimit-Policy</C> headers. Every response carries an{" "}
              <C>X-Request-Id</C>. Include it when you contact support.
            </p>
          </Section>

          <Section id="courses" title="Courses">
            <Endpoint method="GET" path="/courses" scope="courses:read">
              Paginated list.
            </Endpoint>
            <Endpoint method="POST" path="/courses" scope="courses:write" />
            <Endpoint method="GET" path="/courses/{id}" scope="courses:read" />
            <Endpoint method="PATCH" path="/courses/{id}" scope="courses:write">
              Partial update.
            </Endpoint>
            <Endpoint
              method="PUT"
              path="/courses/ext_{externalId}"
              scope="courses:write"
            >
              Create or replace.
            </Endpoint>
            <Table
              head={["Field", "Type", "Notes"]}
              rows={[
                [<C>title</C>, "string", "Required, 1–190 characters"],
                [
                  <C>code</C>,
                  "string",
                  "Required, unique within your institution",
                ],
                [
                  <C>description</C>,
                  "string",
                  "Optional, up to 4,000 characters",
                ],
                [
                  <C>status</C>,
                  "enum",
                  <>
                    <C>PUBLISHED</C> (default), <C>DRAFT</C> or <C>ARCHIVED</C>.
                    Exams in unpublished courses can't be launched.
                  </>,
                ],
                [
                  <C>externalId</C>,
                  "string",
                  "Optional on POST; taken from the path on PUT",
                ],
              ]}
            />
            <CodeBlock
              label="Course object"
              code={`{
  "id": "cm3k2…",
  "externalId": "MATH101",
  "title": "Mathematics 101",
  "code": "MATH101",
  "description": "",
  "status": "PUBLISHED",
  "createdAt": "2026-11-09T10:00:00.000Z"
}`}
            />
          </Section>

          <Section id="questions" title="Questions">
            <Endpoint method="GET" path="/questions" scope="questions:read" />
            <Endpoint method="POST" path="/questions" scope="questions:write" />
            <Endpoint
              method="POST"
              path="/questions/bulk"
              scope="questions:write"
            >
              Upsert up to 500 questions by externalId in one call. Returns a
              result for each item, so one invalid question doesn't fail the
              rest.
            </Endpoint>
            <Endpoint
              method="GET"
              path="/questions/{id}"
              scope="questions:read"
            />
            <Endpoint
              method="PUT"
              path="/questions/{id}"
              scope="questions:write"
            >
              Replace, or create when the ID is ext_….
            </Endpoint>
            <Endpoint
              method="DELETE"
              path="/questions/{id}"
              scope="questions:write"
            >
              Returns 204. Fails with 409 if the question is used by an exam.
            </Endpoint>
            <Table
              head={["type", "Answer definition", "Grading"]}
              rows={[
                [
                  <C>SINGLE</C>,
                  "2–10 options, exactly one correct",
                  "Automatic",
                ],
                [
                  <C>MULTIPLE</C>,
                  "2–10 options, one or more correct",
                  "Automatic; the selected set must match exactly",
                ],
                [
                  <C>TRUE_FALSE</C>,
                  "Two options, exactly one correct",
                  "Automatic",
                ],
                [
                  <C>SHORT</C>,
                  <>
                    Accepted answers in <C>acceptedAnswers</C> (up to 30)
                  </>,
                  "Automatic; ignores case and extra spaces",
                ],
                [<C>ESSAY</C>, "None", "Manual, in the grading queue"],
              ]}
            />
            <CodeBlock
              label="POST /questions/bulk"
              code={`{
  "questions": [
    {
      "externalId": "Q-ALG-1",
      "text": "Select all prime numbers",
      "type": "MULTIPLE",
      "marks": 2,
      "difficulty": "MEDIUM",
      "subject": "Number theory",
      "options": [
        { "id": "a", "text": "2", "correct": true },
        { "id": "b", "text": "4", "correct": false },
        { "id": "c", "text": "7", "correct": true }
      ]
    },
    {
      "externalId": "Q-ALG-2",
      "text": "What is the capital of Nigeria?",
      "type": "SHORT",
      "marks": 1,
      "acceptedAnswers": ["Abuja"]
    }
  ]
}

// 200 → { "results": [ { "index": 0, "ok": true, "id": "cm…", "externalId": "Q-ALG-1", "created": true },
//                       { "index": 1, "ok": true, … } ] }`}
            />
            <p>
              Other fields: <C>marks</C> (1–100), <C>difficulty</C> (<C>EASY</C>{" "}
              | <C>MEDIUM</C> | <C>HARD</C>), <C>subject</C>, and{" "}
              <C>imageUrl</C> (https only). Option <C>correct</C> flags and{" "}
              <C>acceptedAnswers</C> are returned only to keys with{" "}
              <C>questions:answers</C>, and are never sent to students.
            </p>
          </Section>

          <Section id="exams" title="Exams">
            <Endpoint method="GET" path="/exams" scope="exams:read" />
            <Endpoint method="POST" path="/exams" scope="exams:write" />
            <Endpoint method="GET" path="/exams/{id}" scope="exams:read" />
            <Endpoint method="PUT" path="/exams/{id}" scope="exams:write">
              Full replace, including the question list. Creates when the ID is
              ext_….
            </Endpoint>
            <Table
              head={["Field", "Type", "Notes"]}
              rows={[
                [<C>title</C>, "string", "Required"],
                [
                  <C>courseId</C>,
                  "id | ext_id",
                  "Required; must be a course in your institution",
                ],
                [
                  <C>questionIds</C>,
                  "array",
                  "IDs or ext_ IDs, up to 190. A published exam needs at least one.",
                ],
                [<C>duration</C>, "integer", "Minutes, 1–600"],
                [<C>passMark</C>, "integer", "Percentage, 0–100"],
                [
                  <C>price</C>,
                  "integer",
                  "Minor units (kobo). Students launched through the API never pay AssessmentDesk.",
                ],
                [<C>maxAttempts</C>, "integer", "1–20"],
                [
                  <C>status</C>,
                  "enum",
                  <>
                    <C>DRAFT</C>, <C>PUBLISHED</C>, <C>ARCHIVED</C>
                  </>,
                ],
                [
                  <C>accessMode</C>,
                  "enum",
                  <>
                    <C>LAUNCH_ONLY</C> (API default): only startable via launch
                    links and hidden from AssessmentDesk's own student list.{" "}
                    <C>OPEN</C>: also offered to students who sign in to
                    AssessmentDesk directly.
                  </>,
                ],
                [
                  <C>startsAt</C> + <C>endsAt</C>,
                  "datetime | null",
                  "Optional availability window. Attempts never run past endsAt.",
                ],
                [<C>shuffleQuestions</C>, "boolean", "Default true"],
                [<C>shuffleOptions</C>, "boolean", "Default true"],
                [
                  <C>releaseResults</C>,
                  "boolean",
                  "Release automatically when fully graded (default true). If false, results are held until released.",
                ],
                [
                  <C>fullscreen</C>,
                  "boolean",
                  "Ask students to stay in fullscreen; exits are recorded",
                ],
                [
                  <C>cameraRequired</C>,
                  "boolean",
                  "Require the camera and face-presence check",
                ],
              ]}
            />
            <CodeBlock
              label="Exam object"
              code={`{
  "id": "cm3m…",
  "externalId": "MATH101-FINAL",
  "courseId": "cm3k2…",
  "courseExternalId": "MATH101",
  "title": "Final exam",
  "status": "PUBLISHED",
  "accessMode": "LAUNCH_ONLY",
  "duration": 60, "passMark": 50, "price": 0, "currency": "NGN", "maxAttempts": 1,
  "startsAt": null, "endsAt": null,
  "shuffleQuestions": true, "shuffleOptions": true, "releaseResults": true,
  "fullscreen": false, "cameraRequired": true,
  "questionIds": ["cm3q…"], "totalMarks": 1,
  "createdAt": "2026-11-09T10:05:00.000Z"
}`}
            />
            <p>
              Exams take a snapshot of their questions when an attempt starts.
              Editing an exam never changes attempts already in progress.
            </p>
          </Section>

          <Section id="students" title="Students">
            <Endpoint method="GET" path="/students" scope="students:read" />
            <Endpoint
              method="GET"
              path="/students/{id}"
              scope="students:read"
            />
            <Endpoint
              method="PUT"
              path="/students/ext_{externalId}"
              scope="students:write"
            >
              Create or update. Body: name, plus an optional studentNumber.
            </Endpoint>
            <Endpoint
              method="POST"
              path="/students/{id}/deactivate"
              scope="students:write"
            >
              Blocks new launches and ends live exam sessions immediately.
            </Endpoint>
            <Endpoint
              method="POST"
              path="/students/{id}/reactivate"
              scope="students:write"
            />
            <p>
              Students you create are matched by your <C>externalId</C>. They
              have no email or password and can only enter exams through your
              launch links. You don't need to create them in advance, because{" "}
              <C>POST /launches</C> creates or updates them automatically.
            </p>
          </Section>

          <Section id="launches" title="Launch links">
            <Endpoint method="POST" path="/launches" scope="launches:write">
              Creates a single-use link for one student and one exam.
            </Endpoint>
            <CodeBlock
              label="Request"
              code={`{
  "examId": "ext_MATH101-FINAL",
  "student": { "externalId": "S-20931", "name": "Ada Obi", "studentNumber": "2026/0931" },
  "returnUrl": "https://portal.example.com/exams/done"
}`}
            />
            <CodeBlock
              label="Response · 201"
              code={`{
  "id": "5f0c…",
  "url": "${WEB}/launch/9c41…",
  "expiresAt": "2026-11-09T10:15:00.000Z",
  "studentId": "cm3s…",
  "examId": "cm3m…"
}`}
            />
            <h3>Rules</h3>
            <ul>
              <li>
                The link works <strong>once</strong> and expires after{" "}
                <strong>5 minutes</strong>. Create it when the student clicks
                Start. Never store it or send it by email.
              </li>
              <li>
                Open it in a <strong>new tab</strong> (<C>window.open(url)</C>{" "}
                or a redirect). Embedding inside an iframe is not supported yet.
              </li>
              <li>
                The student gets a session limited to that exam. It cannot reach
                any other part of AssessmentDesk.
              </li>
              <li>
                If the student already has an attempt in progress, a new launch
                <strong> resumes</strong> it with saved answers. Use this when a
                student closed the tab or lost their connection.
              </li>
              <li>
                <C>returnUrl</C> must begin with one of your institution's{" "}
                <strong>Allowed origins</strong> (https, or http on localhost
                for development). The student sees their result (if released)
                and a "Return to your dashboard" button.
              </li>
              <li>
                Paid exams don't ask launched students to pay. You bill your own
                students.
              </li>
            </ul>
            <h3>When a launch is refused (409)</h3>
            <ul>
              <li>
                The exam or its course is not published, or the exam has no
                questions.
              </li>
              <li>The exam is outside its startsAt/endsAt window.</li>
              <li>The student has used all of maxAttempts.</li>
              <li>The student was deactivated.</li>
            </ul>
          </Section>

          <Section id="attempts" title="Attempts and monitoring">
            <Endpoint method="GET" path="/attempts" scope="attempts:read">
              Filters: examId, studentId (both accept ext_ IDs) and status.
            </Endpoint>
            <Endpoint method="GET" path="/attempts/{id}" scope="attempts:read">
              Status and timing. Never includes answers.
            </Endpoint>
            <Endpoint
              method="GET"
              path="/attempts/{id}/integrity"
              scope="attempts:read"
            >
              Chronological monitoring events.
            </Endpoint>
            <Table
              head={["Attempt status", "Meaning"]}
              rows={[
                [<C>STARTED</C>, "In progress"],
                [<C>GRADED</C>, "Submitted and fully graded"],
                [<C>GRADING</C>, "Submitted, waiting for essay marking"],
                [
                  <C>EXPIRED</C>,
                  "Time ran out; saved answers were submitted and graded",
                ],
              ]}
            />
            <Table
              head={["Integrity event", "Recorded when"]}
              rows={[
                [<C>CAMERA_STARTED</C>, "Camera monitoring began"],
                [
                  <>
                    <C>FACE_ABSENT</C> / <C>MULTIPLE_FACES</C>
                  </>,
                  "No face, or more than one face, for at least 3 seconds",
                ],
                [<C>FACE_RESTORED</C>, "A single face was detected again"],
                [
                  <>
                    <C>CAMERA_STOPPED</C> / <C>CAMERA_UNAVAILABLE</C> /{" "}
                    <C>DETECTOR_UNAVAILABLE</C>
                  </>,
                  "The camera or detector stopped working",
                ],
                [
                  <>
                    <C>TAB_HIDDEN</C> / <C>TAB_VISIBLE</C>
                  </>,
                  "The exam tab was hidden or shown",
                ],
                [
                  <>
                    <C>WINDOW_BLUR</C> / <C>WINDOW_FOCUS</C>
                  </>,
                  "The window lost or regained focus",
                ],
                [<C>FULLSCREEN_EXIT</C>, "The student left fullscreen"],
                [<C>PASTE_ATTEMPT</C>, "A paste was attempted"],
                [<C>PAGE_EXIT</C>, "The page was left, refreshed or closed"],
                [
                  <>
                    <C>CONNECTION_LOST</C> / <C>CONNECTION_RESTORED</C>
                  </>,
                  "No heartbeat for over 60 seconds, then reconnection",
                ],
              ]}
            />
            <p>
              These are signals for human review, not proof of misconduct.
              Network problems, accessibility tools and shared devices can
              produce them. AssessmentDesk never applies automatic penalties.
            </p>
          </Section>

          <Section id="results" title="Results and grading">
            <Endpoint method="GET" path="/results" scope="results:read">
              Filters: examId, studentId, released (true/false) and status
              (GRADED or UNDER_REVIEW).
            </Endpoint>
            <Endpoint method="GET" path="/results/{id}" scope="results:read">
              Includes the per-question breakdown.
            </Endpoint>
            <Endpoint
              method="POST"
              path="/results/{id}/release"
              scope="results:write"
            >
              Release a held result.
            </Endpoint>
            <Endpoint method="GET" path="/grading" scope="results:read">
              Results waiting for essay marks.
            </Endpoint>
            <Endpoint
              method="POST"
              path="/results/{id}/grade"
              scope="results:write"
            >
              Submit essay marks.
            </Endpoint>
            <CodeBlock
              label="Result object"
              code={`{
  "id": "cm3r…",
  "attemptId": "cm3a…",
  "examId": "cm3m…", "examExternalId": "MATH101-FINAL",
  "studentId": "cm3s…", "studentExternalId": "S-20931",
  "status": "GRADED",            // or UNDER_REVIEW while essays are unmarked
  "totalMarks": 20, "obtainedMarks": 16, "percentage": 80,
  "grade": "A", "passed": true, "released": true,
  "certificateId": null,
  "createdAt": "2026-11-09T11:02:00.000Z",
  "breakdown": [ { "questionId": "cm3q…", "marks": 5, "awarded": 5, "correct": true, "comment": "" } ]
}`}
            />
            <CodeBlock
              label="POST /results/{id}/grade"
              code={`{
  "grades": [
    { "questionId": "cm3q-essay…", "awarded": 7, "comment": "Clear argument, missing one example." }
  ]
}`}
            />
            <p>
              Marks must be between 0 and the essay's maximum. When every essay
              is marked, the result becomes <C>GRADED</C>, the institution's
              grading bands are applied, and <C>result.graded</C> is sent.
            </p>
          </Section>

          <Section id="certificates" title="Certificates">
            <Endpoint
              method="POST"
              path="/results/{id}/certificate"
              scope="certificates:read"
            >
              Issues the certificate for a released, passing result (or returns
              the existing one).
            </Endpoint>
            <Endpoint
              method="GET"
              path="/certificates/{id}/pdf"
              scope="certificates:read"
            >
              Downloads the PDF.
            </Endpoint>
            <CodeBlock
              label="Response"
              code={`{
  "id": "cm3c…",
  "resultId": "cm3r…",
  "code": "a81f…",
  "createdAt": "2026-11-09T11:05:00.000Z",
  "verifyUrl": "${WEB}/verify/a81f…"
}`}
            />
            <p>
              Anyone with the <C>verifyUrl</C> or the QR code on the PDF can
              confirm the certificate. The page shows only the student's name,
              the exam, the institution and the issue date.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              Add endpoints under <strong>Developers → New webhook</strong>. The
              URL must use https and must not point to a private network. Copy
              the signing secret (<C>whsec_…</C>) when it is shown.
            </p>
            <Table
              head={["Event", "Sent when"]}
              rows={[
                [<C>attempt.started</C>, "A student starts an attempt"],
                [
                  <C>attempt.submitted</C>,
                  <>
                    The student submits, or time runs out (
                    <C>data.expired: true</C>)
                  </>,
                ],
                [
                  <C>result.ready</C>,
                  <>
                    Fully graded automatically. Check <C>data.released</C>.
                  </>,
                ],
                [
                  <C>result.pending_grading</C>,
                  "Essays are waiting for an examiner",
                ],
                [<C>result.graded</C>, "An examiner finished marking"],
                [<C>result.released</C>, "A held result was released"],
                [
                  <C>certificate.issued</C>,
                  <>
                    A certificate was created (<C>data.verifyUrl</C>)
                  </>,
                ],
                [<C>ping</C>, "You pressed Send test event"],
              ]}
            />
            <CodeBlock
              label="Example delivery"
              code={`POST /your/webhook HTTP/1.1
Content-Type: application/json
AssessmentDesk-Event-Id: evt_9c1f…
AssessmentDesk-Event-Type: result.ready
AssessmentDesk-Signature: t=1762686164,v1=5d2c…

{
  "id": "evt_9c1f…",
  "type": "result.ready",
  "apiVersion": "v1",
  "createdAt": "2026-11-09T11:02:44.000Z",
  "institutionId": "cm3…",
  "data": {
    "resultId": "cm3r…", "attemptId": "cm3a…",
    "examId": "cm3m…", "examExternalId": "MATH101-FINAL",
    "studentId": "cm3s…", "studentExternalId": "S-20931",
    "launchId": "5f0c…", "attemptStatus": "GRADED",
    "status": "GRADED", "totalMarks": 20, "obtainedMarks": 16,
    "percentage": 80, "grade": "A", "passed": true, "released": true,
    "startedAt": "…", "expectedEndAt": "…", "submittedAt": "…"
  }
}`}
            />
            <h3>Delivery and retries</h3>
            <ul>
              <li>
                Respond with any 2xx within 10 seconds. Do slow work after
                responding.
              </li>
              <li>
                Failed deliveries are retried after 1 minute, 5 minutes, 30
                minutes, 2 hours, 6 hours and 12 hours, then marked dead. You
                can resend any delivery from the Developers page.
              </li>
              <li>
                Events can arrive late, more than once or out of order.
                De-duplicate on <C>id</C> and, if in doubt, re-read the current
                state from <C>GET /results</C>.
              </li>
              <li>Redirects are not followed.</li>
            </ul>
          </Section>

          <Section id="verify" title="Verifying webhook signatures">
            <p>
              The signature is <C>HMAC-SHA256(secret, t + "." + rawBody)</C> in
              hex. Use the <strong>raw</strong> request body, not re-encoded
              JSON. Compare in constant time, and reject timestamps older than 5
              minutes to block replays.
            </p>
            <Tabs
              samples={[
                [
                  "Node.js (Express)",
                  `import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
app.post("/webhooks/assessmentdesk", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("AssessmentDesk-Signature") || "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  const expected = createHmac("sha256", process.env.ASSESSMENTDESK_WEBHOOK_SECRET)
    .update(\`\${parts.t}.\${req.body}\`)
    .digest();
  const given = Buffer.from(parts.v1 || "", "hex");
  if (!fresh || given.length !== expected.length || !timingSafeEqual(given, expected))
    return res.sendStatus(400);

  const event = JSON.parse(req.body);
  // TODO: skip if event.id was already processed, then handle event.type
  res.sendStatus(200);
});`,
                ],
                [
                  "Python (Flask)",
                  `import hmac, hashlib, os, time, json
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["ASSESSMENTDESK_WEBHOOK_SECRET"].encode()

@app.post("/webhooks/assessmentdesk")
def webhook():
    raw = request.get_data()
    parts = dict(p.split("=", 1) for p in request.headers.get("AssessmentDesk-Signature", "").split(","))
    if abs(time.time() - int(parts.get("t", 0))) > 300:
        abort(400)
    expected = hmac.new(SECRET, f"{parts['t']}.".encode() + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")):
        abort(400)
    event = json.loads(raw)
    # skip duplicates by event["id"], then handle event["type"]
    return "", 200`,
                ],
                [
                  "PHP",
                  `<?php
$raw = file_get_contents("php://input");
$header = $_SERVER["HTTP_ASSESSMENTDESK_SIGNATURE"] ?? "";
parse_str(str_replace(",", "&", $header), $parts);
$secret = getenv("ASSESSMENTDESK_WEBHOOK_SECRET");

$expected = hash_hmac("sha256", $parts["t"] . "." . $raw, $secret);
if (abs(time() - (int)$parts["t"]) > 300 || !hash_equals($expected, $parts["v1"] ?? "")) {
    http_response_code(400);
    exit;
}
$event = json_decode($raw, true);
// skip duplicates by $event["id"], then handle $event["type"]
http_response_code(200);`,
                ],
              ]}
            />
          </Section>

          <Section id="security" title="Security checklist">
            <ul className="doc-checklist">
              <li>
                Keep API keys and webhook secrets in server-side secret storage,
                never in client code or Git.
              </li>
              <li>
                Use one key per environment or service, with only the scopes it
                needs.
              </li>
              <li>
                Revoke keys immediately if they leak; requests using them fail
                at once.
              </li>
              <li>
                Verify every webhook signature and timestamp, and de-duplicate
                events.
              </li>
              <li>
                Create launch links only for the signed-in student, at the
                moment they click Start.
              </li>
              <li>
                Keep your Allowed origins list to the dashboards you control.
              </li>
              <li>
                Treat integrity events as signals for human review, not
                automatic penalties.
              </li>
            </ul>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <Table
              head={["Symptom", "Likely cause"]}
              rows={[
                [
                  <>
                    401 <C>unauthorized</C>
                  </>,
                  "The key is missing the Bearer prefix, was revoked, or belongs to another environment.",
                ],
                [
                  <>
                    403 <C>insufficient_scope</C>
                  </>,
                  "Create a key with the scope named in the message.",
                ],
                [
                  <>
                    404 on an <C>ext_</C> ID
                  </>,
                  "That externalId doesn't exist for this resource type in your institution. Create it with PUT first.",
                ],
                [
                  <>409 when launching</>,
                  "The exam isn't published or open, or the student has used all attempts or was deactivated.",
                ],
                [
                  <>400 "Add … to your allowed origins"</>,
                  "Add your dashboard's origin under Developers → Allowed origins.",
                ],
                [
                  'Student sees "This link can\'t be used"',
                  "The link was opened twice or after 5 minutes. Create a new launch.",
                ],
                [
                  "Camera check fails",
                  "The student's browser needs camera permission and https. Ask them to allow the camera, or try another browser.",
                ],
                [
                  "No webhooks arriving",
                  "Check the delivery log on the Developers page for status codes and errors, and confirm the URL is public https.",
                ],
              ]}
            />
          </Section>

          <Section id="limits" title="Current limitations">
            <ul>
              <li>
                Launch links open in a new tab. Embedding in an iframe is
                planned.
              </li>
              <li>
                Prices are in NGN through Paystack. Launched students bypass
                payment, so you bill them yourself.
              </li>
              <li>
                Background work (auto-submitting expired attempts and delivering
                webhooks) runs on a schedule. Deliveries can lag behind the
                event.
              </li>
              <li>
                There is no sandbox mode yet. Use a separate test institution
                and key.
              </li>
              <li>
                Face detection checks presence only. It does not identify people
                or prove misconduct.
              </li>
            </ul>
            <p className="doc-foot">
              Questions or a feature request? Ask your AssessmentDesk contact,
              and include the <C>X-Request-Id</C> from any failing call.
            </p>
          </Section>
        </main>
      </div>
    </div>
  );
}
