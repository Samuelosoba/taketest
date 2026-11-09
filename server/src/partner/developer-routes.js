// Institution-admin management of partner credentials (in-app, cookie/JWT auth).
import { Router } from "express";
import { db, roles, tenant, fail, audit } from "../core.js";
import { z, parse } from "../validation.js";
import { SCOPES, generateApiKey } from "./api-keys.js";
import {
  WEBHOOK_EVENTS,
  checkWebhookUrl,
  newWebhookSecret,
  newEventId,
} from "./webhooks.js";

export const developer = Router();
developer.use("/developer", roles("INSTITUTION_ADMIN"));

const keySelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
};
developer.get("/developer/keys", async (req, res) =>
  res.json(
    await db.apiKey.findMany({
      where: { institutionId: tenant(req) },
      select: keySelect,
      orderBy: { createdAt: "desc" },
    }),
  ),
);
developer.post("/developer/keys", async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(1).max(100),
      scopes: z.array(z.enum(SCOPES)).min(1),
      expiresAt: z.string().datetime().nullable().optional(),
    }),
    req.body,
  );
  if (data.expiresAt && new Date(data.expiresAt) <= new Date())
    fail(400, "Expiry must be in the future.");
  const { key, prefix, hash } = generateApiKey();
  const row = await db.apiKey.create({
    data: {
      institutionId: tenant(req),
      name: data.name,
      scopes: [...new Set(data.scopes)],
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      createdById: req.user.id,
      prefix,
      hash,
    },
    select: keySelect,
  });
  await audit(req.user, "API_KEY_CREATED", row.id);
  // The full key is returned exactly once; only its hash is stored.
  res.status(201).json({ ...row, key });
});
developer.post("/developer/keys/:id/revoke", async (req, res) => {
  const row = await db.apiKey.updateMany({
    where: { id: req.params.id, institutionId: tenant(req), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!row.count) fail(404, "Active API key not found.");
  await audit(req.user, "API_KEY_REVOKED", req.params.id);
  res.json({ ok: true });
});

const webhookSelect = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
};
const webhookInput = z.object({
  url: z.string().max(2048),
  events: z.array(z.enum([...WEBHOOK_EVENTS, "*"])).min(1),
  active: z.boolean().default(true),
});
const validUrl = (url) => {
  const problem = checkWebhookUrl(url);
  if (problem) fail(400, problem);
};
developer.get("/developer/webhooks", async (req, res) =>
  res.json(
    await db.webhookEndpoint.findMany({
      where: { institutionId: tenant(req) },
      select: webhookSelect,
      orderBy: { createdAt: "desc" },
    }),
  ),
);
developer.post("/developer/webhooks", async (req, res) => {
  const data = parse(webhookInput, req.body);
  validUrl(data.url);
  const secret = newWebhookSecret();
  const row = await db.webhookEndpoint.create({
    data: { ...data, institutionId: tenant(req), secret },
    select: webhookSelect,
  });
  await audit(req.user, "WEBHOOK_CREATED", row.id);
  res.status(201).json({ ...row, secret });
});
developer.patch("/developer/webhooks/:id", async (req, res) => {
  const data = parse(webhookInput.partial(), req.body);
  if (data.url) validUrl(data.url);
  const row = await db.webhookEndpoint.updateMany({
    where: { id: req.params.id, institutionId: tenant(req) },
    data,
  });
  if (!row.count) fail(404, "Webhook not found.");
  await audit(req.user, "WEBHOOK_UPDATED", req.params.id);
  res.json({ ok: true });
});
developer.delete("/developer/webhooks/:id", async (req, res) => {
  const row = await db.webhookEndpoint.deleteMany({
    where: { id: req.params.id, institutionId: tenant(req) },
  });
  if (!row.count) fail(404, "Webhook not found.");
  await audit(req.user, "WEBHOOK_DELETED", req.params.id);
  res.json({ ok: true });
});
const ownEndpoint = async (req) => {
  const e = await db.webhookEndpoint.findFirst({
    where: { id: req.params.id, institutionId: tenant(req) },
  });
  if (!e) fail(404, "Webhook not found.");
  return e;
};
developer.post("/developer/webhooks/:id/test", async (req, res) => {
  const e = await ownEndpoint(req);
  const eventId = newEventId();
  await db.webhookDelivery.create({
    data: {
      endpointId: e.id,
      eventId,
      eventType: "ping",
      payload: {
        id: eventId,
        type: "ping",
        apiVersion: "v1",
        createdAt: new Date().toISOString(),
        institutionId: e.institutionId,
        data: {},
      },
    },
  });
  res.status(202).json({ eventId });
});
developer.get("/developer/webhooks/:id/deliveries", async (req, res) => {
  const e = await ownEndpoint(req);
  res.json(
    await db.webhookDelivery.findMany({
      where: { endpointId: e.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
});
developer.post("/developer/deliveries/:id/resend", async (req, res) => {
  const row = await db.webhookDelivery.updateMany({
    where: {
      id: req.params.id,
      endpoint: { institutionId: tenant(req) },
      status: { in: ["FAILED", "DEAD", "SUCCESS"] },
    },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
  });
  if (!row.count) fail(404, "Delivery not found.");
  res.json({ ok: true });
});

const origin = z
  .string()
  .trim()
  .transform((value, c) => {
    try {
      const u = new URL(value);
      const local = ["localhost", "127.0.0.1"].includes(u.hostname);
      if (
        (u.protocol === "https:" || (local && u.protocol === "http:")) &&
        u.origin === value.replace(/\/$/, "")
      )
        return u.origin;
    } catch {}
    c.addIssue({
      code: "custom",
      message: `Use an origin such as https://dashboard.example.com (got ${value}).`,
    });
    return z.NEVER;
  });
developer.get("/developer/origins", async (req, res) => {
  const i = await db.institution.findUnique({ where: { id: tenant(req) } });
  res.json({
    origins: Array.isArray(i.allowedOrigins) ? i.allowedOrigins : [],
  });
});
developer.put("/developer/origins", async (req, res) => {
  const { origins } = parse(
    z.object({ origins: z.array(origin).max(20) }),
    req.body,
  );
  await db.institution.update({
    where: { id: tenant(req) },
    data: { allowedOrigins: [...new Set(origins)] },
  });
  await audit(req.user, "ALLOWED_ORIGINS_UPDATED", tenant(req));
  res.json({ origins: [...new Set(origins)] });
});
