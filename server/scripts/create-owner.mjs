import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { z } from "zod";
const data = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(190),
    password: z.string().min(12).max(128),
  })
  .parse({
    email: process.env.OWNER_EMAIL,
    name: process.env.OWNER_NAME || "Platform Owner",
    password: process.env.OWNER_PASSWORD,
  });
const db = new PrismaClient();
try {
  if (await db.user.findUnique({ where: { email: data.email.toLowerCase() } }))
    throw new Error(
      "An account with this email already exists; no account was modified.",
    );
  await db.user.create({
    data: {
      email: data.email.toLowerCase(),
      name: data.name,
      password: await bcrypt.hash(data.password, 12),
      role: "SUPER_ADMIN",
      emailVerified: true,
    },
  });
  console.log(
    "Platform owner created. Sign in using the supplied credentials.",
  );
} finally {
  await db.$disconnect();
}
