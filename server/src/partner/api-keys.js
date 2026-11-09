import { randomBytes } from "node:crypto";
import { db, hash, fail } from "../core.js";

export const SCOPES = [
  "courses:read",
  "courses:write",
  "questions:read",
  "questions:write",
  "questions:answers",
  "exams:read",
  "exams:write",
  "students:read",
  "students:write",
  "launches:write",
  "attempts:read",
  "results:read",
  "results:write",
  "certificates:read",
];
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// 40 base62 characters ≈ 238 bits. Rejection sampling keeps it unbiased.
function base62(length) {
  let out = "";
  while (out.length < length)
    for (const byte of randomBytes(length * 2))
      if (byte < 248 && out.length < length) out += ALPHABET[byte % 62];
  return out;
}
export function generateApiKey() {
  const key = `sk_live_${base62(40)}`;
  return { key, prefix: key.slice(0, 16), hash: hash(key) };
}

const LAST_USED_RESOLUTION_MS = 60000;
// Authenticates partner servers. Sets req.actor; there is no req.user.
export async function apiKeyAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (!token.startsWith("sk_"))
      fail(401, "Provide an API key as a Bearer token.");
    const key = await db.apiKey.findUnique({
      where: { hash: hash(token) },
      include: { institution: { select: { status: true } } },
    });
    const now = new Date();
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now))
      fail(401, "This API key is invalid or has been revoked.");
    if (key.institution.status !== "ACTIVE")
      fail(403, "This institution is not active.");
    if (
      !key.lastUsedAt ||
      now - key.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    )
      await db.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: now },
      });
    req.actor = {
      type: "API_KEY",
      id: key.id,
      institutionId: key.institutionId,
      scopes: key.scopes,
    };
    next();
  } catch (e) {
    next(e);
  }
}
export const hasScope = (req, scope) => req.actor?.scopes?.includes(scope);
export const requireScope =
  (...scopes) =>
  (req, res, next) => {
    const missing = scopes.filter((s) => !hasScope(req, s));
    if (!missing.length) return next();
    const e = new Error(`This API key needs the ${missing.join(", ")} scope.`);
    e.status = 403;
    e.code = "insufficient_scope";
    next(e);
  };
