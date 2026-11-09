import { db } from "../core.js";

const HOUR_MS = 3600000;
let lastPurge = 0;
// Removes expired idempotency records, used/expired launch tokens, and old
// successful deliveries. Runs at most once an hour from the sweep loop.
export async function purgePartnerRecords(now = new Date()) {
  if (now.getTime() - lastPurge < HOUR_MS) return;
  lastPurge = now.getTime();
  const ago = (ms) => new Date(now.getTime() - ms);
  await db.idempotencyKey.deleteMany({
    where: { createdAt: { lt: ago(24 * HOUR_MS) } },
  });
  await db.launchToken.deleteMany({
    where: { expiresAt: { lt: ago(24 * HOUR_MS) } },
  });
  await db.webhookDelivery.deleteMany({
    where: { status: "SUCCESS", createdAt: { lt: ago(30 * 24 * HOUR_MS) } },
  });
}
