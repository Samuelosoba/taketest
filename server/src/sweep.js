// Background work: auto-submit expired attempts, flag silent disconnections,
// deliver webhooks, and purge old partner records. A long-running server calls
// it every 15 seconds (index.js); serverless hosts call /api/cron/sweep.
import { timingSafeEqual } from "node:crypto";
import { expireAttempts } from "./grading.js";
import { detectDisconnectedAttempts } from "./proctoring.js";
import { deliverWebhooks } from "./partner/webhooks.js";
import { purgePartnerRecords } from "./partner/maintenance.js";

let running = false;
export async function runSweep() {
  if (running) return false;
  running = true;
  try {
    await expireAttempts();
    await detectDisconnectedAttempts();
    await deliverWebhooks();
    await purgePartnerRecords();
    return true;
  } finally {
    running = false;
  }
}

// GET /api/cron/sweep with "Authorization: Bearer <CRON_SECRET>". Vercel Cron
// sends this header automatically when CRON_SECRET is set on the project.
export async function cronSweep(req, res) {
  const secret = process.env.CRON_SECRET || "";
  const given = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    secret.length < 16 ||
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  )
    return res.status(401).json({ message: "Unauthorized." });
  const started = Date.now();
  const ran = await runSweep();
  res.json({ ok: true, ran, ms: Date.now() - started });
}
