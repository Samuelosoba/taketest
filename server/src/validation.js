import { z } from "zod";
export const parse = (schema, data) => schema.parse(data);
const text = z.string().trim().min(1).max(190);
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const registerSchema = loginSchema.extend({
  name: text,
  password: z.string().min(10).max(128),
  institutionName: text.optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
});
export const courseSchema = z.object({
  title: text,
  code: text,
  description: z.string().max(4000).default(""),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
});
export const examSchema = z
  .object({
    title: text,
    description: z.string().max(5000).default(""),
    courseId: text,
    duration: z.number().int().min(1).max(600),
    passMark: z.number().int().min(0).max(100),
    price: z.number().int().min(0).max(100000000),
    maxAttempts: z.number().int().min(1).max(20),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    shuffleQuestions: z.boolean().default(true),
    shuffleOptions: z.boolean().default(true),
    releaseResults: z.boolean().default(true),
    fullscreen: z.boolean().default(false),
    cameraRequired: z.boolean().default(false),
    questionIds: z.array(text).max(190).default([]),
  })
  .superRefine((v, c) => {
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt))
      c.addIssue({
        code: "custom",
        message: "End time must follow start time.",
      });
  });
export const questionSchema = z
  .object({
    text: z.string().trim().min(3).max(10000),
    type: z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE", "SHORT", "ESSAY"]),
    marks: z.number().int().min(1).max(100),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    subject: z.string().max(190).default(""),
    imageUrl: z
      .union([z.literal(""), z.string().url().startsWith("https://")])
      .default(""),
    options: z
      .array(
        z.object({
          id: text,
          text: z.string().min(1).max(2000),
          correct: z.boolean(),
        }),
      )
      .max(10)
      .default([]),
    acceptedAnswers: z.array(z.string().min(1).max(500)).max(30).default([]),
  })
  .superRefine((v, c) => {
    if (["SINGLE", "MULTIPLE", "TRUE_FALSE"].includes(v.type)) {
      const count = v.options.filter((o) => o.correct).length;
      if (
        v.options.length < 2 ||
        count < 1 ||
        (v.type !== "MULTIPLE" && count !== 1) ||
        new Set(v.options.map((o) => o.id)).size !== v.options.length
      )
        c.addIssue({
          code: "custom",
          message:
            "Provide distinct options and valid correct answer selections.",
        });
    }
    if (v.type === "SHORT" && !v.acceptedAnswers.length)
      c.addIssue({
        code: "custom",
        message: "Provide at least one accepted answer.",
      });
  });
export const userSchema = z.object({
  name: text,
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128).optional(),
  role: z.enum(["STUDENT", "EXAMINER", "INSTITUTION_ADMIN"]),
  active: z.boolean().default(true),
  studentNumber: z.string().max(100).nullable().optional(),
});
export { z };
