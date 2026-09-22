import jwt from "jsonwebtoken";
import { db, secret, fail } from "./core.js";
import { z, parse } from "./validation.js";

export const HEARTBEAT_GRACE_MS = 60000;
export const eventSchema = z.object({
  type: z.enum([
    "TAB_HIDDEN",
    "TAB_VISIBLE",
    "WINDOW_BLUR",
    "WINDOW_FOCUS",
    "PAGE_EXIT",
    "FULLSCREEN_EXIT",
    "PASTE_ATTEMPT",
    "CAMERA_STARTED",
    "CAMERA_STOPPED",
    "CAMERA_UNAVAILABLE",
    "DETECTOR_UNAVAILABLE",
    "FACE_ABSENT",
    "MULTIPLE_FACES",
    "FACE_RESTORED",
  ]),
  eventId: z.string().uuid().optional(),
});
export function monitoringToken(attempt) {
  return jwt.sign(
    {
      sub: attempt.studentId,
      attemptId: attempt.id,
      institutionId: attempt.institutionId,
      scope: "attempt-exit",
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: Math.max(
        1,
        Math.ceil((attempt.expectedEndAt.getTime() - Date.now()) / 1000) + 60,
      ),
    },
  );
}
export async function recordEvent(attemptId, user, data) {
  return db.$transaction(async (tx) => {
    const attempt = await tx.examAttempt.findFirst({
      where: {
        id: attemptId,
        studentId: user.id,
        institutionId: user.institutionId,
        status: "STARTED",
        expectedEndAt: { gt: new Date() },
      },
    });
    if (!attempt) fail(404, "Active attempt not found.");
    if (
      data.eventId &&
      (await tx.examViolation.findUnique({
        where: { clientEventId: data.eventId },
      }))
    )
      return;
    // Repeated detections are review signals, not a per-frame event stream.
    if (
      await tx.examViolation.findFirst({
        where: {
          attemptId,
          type: data.type,
          createdAt: { gt: new Date(Date.now() - 10000) },
        },
      })
    )
      return;
    if ((await tx.examViolation.count({ where: { attemptId } })) >= 1000)
      return;
    await tx.examViolation.create({
      data: { attemptId, type: data.type, clientEventId: data.eventId },
    });
  });
}
export async function receiveExitBeacon(req, res) {
  const data = parse(
    z.object({
      token: z.string().max(2048),
      type: z.enum(["PAGE_EXIT", "TAB_HIDDEN"]),
      eventId: z.string().uuid(),
    }),
    req.body,
  );
  let claims;
  try {
    claims = jwt.verify(data.token, secret, { algorithms: ["HS256"] });
  } catch {
    fail(401, "Invalid monitoring token.");
  }
  if (claims.scope !== "attempt-exit" || claims.attemptId !== req.params.id)
    fail(403, "Invalid monitoring scope.");
  const user = await db.user.findFirst({
    where: {
      id: claims.sub,
      institutionId: claims.institutionId,
      role: "STUDENT",
      active: true,
      institution: { status: "ACTIVE" },
    },
  });
  if (!user) fail(403, "Account is not active.");
  await recordEvent(req.params.id, user, data);
  res.sendStatus(204);
}
export async function heartbeat(id, user, now = new Date()) {
  return db.$transaction(async (tx) => {
    const a = await tx.examAttempt.findFirst({
      where: {
        id,
        studentId: user.id,
        institutionId: user.institutionId,
        status: "STARTED",
        expectedEndAt: { gt: now },
      },
    });
    if (!a) fail(404, "Active attempt not found.");
    // Compare-and-set prevents duplicate restoration events from overlapping requests.
    const updated = await tx.examAttempt.updateMany({
      where: {
        id,
        status: "STARTED",
        lastSeenAt: a.lastSeenAt,
        disconnectedAt: a.disconnectedAt,
      },
      data: { lastSeenAt: now, disconnectedAt: null },
    });
    if (updated.count) {
      const missed =
        a.lastSeenAt &&
        now.getTime() - a.lastSeenAt.getTime() > HEARTBEAT_GRACE_MS;
      if (missed && !a.disconnectedAt)
        await tx.examViolation.create({
          data: { attemptId: id, type: "CONNECTION_LOST" },
        });
      if (missed || a.disconnectedAt)
        await tx.examViolation.create({
          data: { attemptId: id, type: "CONNECTION_RESTORED" },
        });
    }
    return { serverTime: now };
  });
}
export async function detectDisconnectedAttempts(now = new Date()) {
  const cutoff = new Date(now.getTime() - HEARTBEAT_GRACE_MS);
  const attempts = await db.examAttempt.findMany({
    where: {
      status: "STARTED",
      lastSeenAt: { lt: cutoff },
      disconnectedAt: null,
      expectedEndAt: { gt: now },
    },
    select: { id: true },
    take: 200,
  });
  for (const a of attempts)
    await db.$transaction(async (tx) => {
      const changed = await tx.examAttempt.updateMany({
        where: {
          id: a.id,
          status: "STARTED",
          lastSeenAt: { lt: cutoff },
          disconnectedAt: null,
        },
        data: { disconnectedAt: now },
      });
      if (changed.count)
        await tx.examViolation.create({
          data: { attemptId: a.id, type: "CONNECTION_LOST" },
        });
    });
}
