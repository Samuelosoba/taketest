import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, fail, tenant, roles, random, audit } from "./core.js";
import { z, parse } from "./validation.js";
export const payments = Router();
async function paystack(path, body) {
  if (!process.env.PAYSTACK_SECRET_KEY)
    fail(503, "Payments are not configured yet. Contact your institution.");
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.status)
    fail(502, "Payment provider is unavailable. Please try again.");
  return result.data;
}
export async function applyVerifiedPayment(data) {
  const p = await db.payment.findUnique({
    where: { reference: data.reference },
  });
  if (!p) fail(404, "Payment reference not found.");
  if (
    data.status !== "success" ||
    data.amount !== p.amount ||
    data.currency !== p.currency
  )
    fail(
      400,
      "Payment verification did not match the expected amount, currency, and status.",
    );
  const u = await db.user.findUnique({ where: { id: p.studentId } });
  if (data.customer?.email?.toLowerCase() !== u.email.toLowerCase())
    fail(400, "Payment customer does not match.");
  return db.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: p.id, status: { not: "SUCCESS" } },
      data: { status: "SUCCESS", paidAt: new Date() },
    });
    if (updated.count)
      await tx.auditLog.create({
        data: {
          institutionId: p.institutionId,
          userId: p.studentId,
          action: "PAYMENT_VERIFIED",
          targetId: p.id,
        },
      });
    return tx.payment.findUnique({ where: { id: p.id } });
  });
}
export async function webhook(req, res) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) fail(503, "Payments are not configured.");
  const provided = req.headers["x-paystack-signature"];
  const expected = createHmac("sha512", key).update(req.body).digest("hex");
  if (
    typeof provided !== "string" ||
    !/^[a-f0-9]{128}$/i.test(provided) ||
    !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
  )
    fail(401, "Invalid webhook signature.");
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    fail(400, "Invalid payload.");
  }
  if (event.event === "charge.success")
    await applyVerifiedPayment(
      await paystack(
        `/transaction/verify/${encodeURIComponent(event.data.reference)}`,
      ),
    );
  res.json({ received: true });
}
payments.get(
  "/payments",
  roles("STUDENT", "INSTITUTION_ADMIN"),
  async (req, res) =>
    res.json(
      await db.payment.findMany({
        where: {
          institutionId: tenant(req),
          ...(req.user.role === "STUDENT" ? { studentId: req.user.id } : {}),
        },
        include: {
          student: { select: { name: true, email: true } },
          exam: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
);
payments.post("/payments/initialize", roles("STUDENT"), async (req, res) => {
  const { examId } = parse(z.object({ examId: z.string() }), req.body);
  const e = await db.exam.findFirst({
    where: {
      id: examId,
      institutionId: tenant(req),
      status: "PUBLISHED",
      course: { status: "PUBLISHED" },
    },
  });
  if (!e || e.price <= 0) fail(400, "Paid exam not found.");
  if (e.endsAt && e.endsAt <= new Date())
    fail(403, "This examination has closed.");
  const usedAttempts = await db.examAttempt.count({
    where: { studentId: req.user.id, examId },
  });
  if (usedAttempts >= e.maxAttempts)
    fail(403, "You have used all available attempts.");
  if (!process.env.PAYSTACK_SECRET_KEY)
    fail(503, "Payments are not configured yet. Contact your institution.");
  if (
    await db.payment.findFirst({
      where: { studentId: req.user.id, examId, status: "SUCCESS" },
    })
  )
    fail(409, "You already have access to this exam.");
  const reference = `ad_${random()}`;
  await db.payment.create({
    data: {
      reference,
      institutionId: tenant(req),
      studentId: req.user.id,
      examId,
      amount: e.price,
      currency: e.currency,
    },
  });
  const transaction = await paystack("/transaction/initialize", {
    email: req.user.email,
    amount: e.price,
    currency: e.currency,
    reference,
    callback_url: `${process.env.APP_URL}/payments?reference=${reference}`,
  });
  await audit(req.user, "PAYMENT_INITIALIZED", reference);
  res.json({ reference, url: transaction.authorization_url });
});
payments.post("/payments/verify", roles("STUDENT"), async (req, res) => {
  const { reference } = parse(
    z.object({ reference: z.string().max(100) }),
    req.body,
  );
  if (
    !(await db.payment.findFirst({
      where: { reference, studentId: req.user.id, institutionId: tenant(req) },
    }))
  )
    fail(404, "Payment not found.");
  res.json(
    await applyVerifiedPayment(
      await paystack(`/transaction/verify/${encodeURIComponent(reference)}`),
    ),
  );
});
