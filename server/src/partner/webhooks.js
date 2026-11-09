import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { db } from "../core.js";

export const WEBHOOK_EVENTS = [
  "attempt.started",
  "attempt.submitted",
  "result.ready",
  "result.pending_grading",
  "result.graded",
  "result.released",
  "certificate.issued",
  "ping",
];
// Delay before retry N (after the Nth failure). The last failure marks DEAD.
export const RETRY_DELAYS_MS = [60, 300, 1800, 7200, 21600, 43200].map(
  (s) => s * 1000,
);
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const LEASE_MS = 2 * 60000;
const TIMEOUT_MS = 10000;

export const newWebhookSecret = () =>
  `whsec_${randomBytes(32).toString("hex")}`;
export const newEventId = () => `evt_${randomBytes(12).toString("hex")}`;

export function sign(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

// Local development and tests deliver to 127.0.0.1; production must not.
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "true";
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
])
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
])
  blocked.addSubnet(net, prefix, "ipv6");
const isBlocked = (address) => {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
};

export function checkWebhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid URL.";
  }
  if (url.username || url.password)
    return "Webhook URLs cannot contain credentials.";
  if (
    url.protocol !== "https:" &&
    !(allowPrivate() && url.protocol === "http:")
  )
    return "Webhook URLs must use https.";
  return null;
}

// Resolves the host and rejects private, loopback, and link-local targets.
export async function assertDeliverable(value) {
  const problem = checkWebhookUrl(value);
  if (problem) throw new Error(problem);
  if (allowPrivate()) return;
  const { hostname } = new URL(value);
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => isBlocked(a.address)))
    throw new Error("Webhook host resolves to a private network address.");
}

// Queues an event for every active endpoint subscribed to it. Pass the
// transaction client so the event commits together with the change.
export async function emit(client, institutionId, type, data) {
  const endpoints = await client.webhookEndpoint.findMany({
    where: { institutionId, active: true },
    select: { id: true, events: true },
  });
  const targets = endpoints.filter(
    (e) => e.events.includes("*") || e.events.includes(type),
  );
  if (!targets.length) return;
  const eventId = newEventId();
  const payload = {
    id: eventId,
    type,
    apiVersion: "v1",
    createdAt: new Date().toISOString(),
    institutionId,
    data,
  };
  await client.webhookDelivery.createMany({
    data: targets.map((e) => ({
      endpointId: e.id,
      eventId,
      eventType: type,
      payload,
    })),
  });
}

async function send(delivery, now) {
  const body = JSON.stringify(delivery.payload);
  try {
    await assertDeliverable(delivery.endpoint.url);
    const response = await fetch(delivery.endpoint.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AssessmentDesk-Webhooks/1",
        "AssessmentDesk-Event-Id": delivery.eventId,
        "AssessmentDesk-Event-Type": delivery.eventType,
        "AssessmentDesk-Signature": sign(
          delivery.endpoint.secret,
          body,
          Math.floor(now.getTime() / 1000),
        ),
      },
      body,
    });
    await response.body?.cancel().catch(() => {});
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (e) {
    return { ok: false, status: null, error: String(e.message).slice(0, 500) };
  }
}

// Delivers due webhooks. Each row is leased first so overlapping workers do
// not send the same delivery twice.
export async function deliverWebhooks(now = new Date()) {
  const due = await db.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
    },
    include: { endpoint: true },
    orderBy: { nextAttemptAt: "asc" },
    take: 50,
  });
  // Sent in parallel so one slow endpoint cannot stall the sweep loop.
  await Promise.all(due.map((d) => deliverOne(d, now)));
}
async function deliverOne(d, now) {
  {
    const leased = await db.webhookDelivery.updateMany({
      where: {
        id: d.id,
        attempts: d.attempts,
        status: d.status,
        nextAttemptAt: d.nextAttemptAt,
      },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (!leased.count) return;
    if (!d.endpoint.active) {
      await db.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "DEAD", lastError: "Endpoint disabled." },
      });
      return;
    }
    const outcome = await send(d, now);
    const attempts = d.attempts + 1;
    await db.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts,
        lastStatus: outcome.status,
        lastError: outcome.error,
        status: outcome.ok
          ? "SUCCESS"
          : attempts >= MAX_ATTEMPTS
            ? "DEAD"
            : "FAILED",
        nextAttemptAt: outcome.ok
          ? now
          : new Date(
              now.getTime() +
                RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1],
            ),
      },
    });
  }
}

// Public payload shapes shared by webhooks and the v1 API.
export const attemptEvent = (a) => ({
  attemptId: a.id,
  examId: a.examId,
  examExternalId: a.exam?.externalId ?? null,
  studentId: a.studentId,
  studentExternalId: a.student?.externalId ?? null,
  launchId: a.launchId ?? null,
  status: a.status,
  startedAt: a.startedAt,
  expectedEndAt: a.expectedEndAt,
  submittedAt: a.submittedAt ?? null,
});
export const resultEvent = (r, a) => ({
  resultId: r.id,
  ...attemptEvent(a),
  attemptStatus: a.status,
  status: r.status,
  totalMarks: r.totalMarks,
  obtainedMarks: r.obtainedMarks,
  percentage: r.percentage,
  grade: r.grade,
  passed: r.passed,
  released: r.released,
});
