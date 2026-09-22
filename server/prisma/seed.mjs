import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const db = new PrismaClient();
const settings = {
  gradingBands: [
    { min: 70, grade: "A" },
    { min: 60, grade: "B" },
    { min: 50, grade: "C" },
    { min: 40, grade: "D" },
    { min: 0, grade: "F" },
  ],
};
try {
  if (await db.institution.findUnique({ where: { slug: "greenfield" } })) {
    console.log("Demo workspace already exists; seed skipped.");
    process.exitCode = 0;
  } else {
    const password = await bcrypt.hash("Assessment123!", 12);
    const institution = await db.institution.create({
      data: {
        name: "Greenfield Academy",
        slug: "greenfield",
        email: "hello@greenfield.example",
        description: "A place to learn, grow, and achieve.",
        settings,
        subscriptions: {
          create: {
            plan: "GROWTH",
            status: "TRIAL",
            endsAt: new Date(Date.now() + 30 * 86400000),
          },
        },
      },
    });
    for (const [name, email, role] of [
      ["Alex Morgan", "admin@assessmentdesk.demo", "INSTITUTION_ADMIN"],
      ["Sarah Williams", "examiner@assessmentdesk.demo", "EXAMINER"],
      ["Daniel Okafor", "student@assessmentdesk.demo", "STUDENT"],
    ])
      await db.user.create({
        data: {
          name,
          email,
          role,
          password,
          emailVerified: true,
          institutionId: institution.id,
        },
      });
    await db.user.create({
      data: {
        name: "Platform Admin",
        email: "owner@assessmentdesk.demo",
        role: "SUPER_ADMIN",
        password,
        emailVerified: true,
      },
    });
    const students = [];
    for (const [i, name] of [
      "Amara Johnson",
      "James Wilson",
      "Olivia Chen",
      "Noah Adeyemi",
      "Emma Thompson",
      "Liam Patel",
      "Sofia Martins",
      "Ethan Davis",
      "Isabella Okoye",
      "Mason Brown",
      "Chloe Taylor",
      "Lucas Adebayo",
    ].entries())
      students.push(
        await db.user.create({
          data: {
            name,
            email: `student${i + 1}@greenfield.example`,
            role: "STUDENT",
            password,
            institutionId: institution.id,
            studentNumber: `GF-${String(i + 1).padStart(4, "0")}`,
            emailVerified: true,
          },
        }),
      );
    const courses = [];
    for (const [title, code, description] of [
      [
        "Mathematics",
        "MTH 101",
        "Build confidence in numbers, algebra, and logical thinking.",
      ],
      [
        "Computer Science",
        "CSC 201",
        "Explore computational thinking and the foundations of technology.",
      ],
      [
        "English Language",
        "ENG 101",
        "Develop clear communication and critical reading skills.",
      ],
      [
        "General Science",
        "SCI 102",
        "Discover the principles that shape our natural world.",
      ],
    ])
      courses.push(
        await db.course.create({
          data: { institutionId: institution.id, title, code, description },
        }),
      );
    const qs = [];
    for (const [text, options, index, subject] of [
      [
        "What is the value of 12 × 8?",
        ["86", "96", "108", "112"],
        1,
        "Mathematics",
      ],
      ["Solve for x: 3x + 7 = 22.", ["3", "5", "7", "9"], 1, "Mathematics"],
      [
        "What is the square root of 144?",
        ["10", "11", "12", "14"],
        2,
        "Mathematics",
      ],
      [
        "Which data structure follows First In, First Out?",
        ["Stack", "Queue", "Tree", "Graph"],
        1,
        "Computer Science",
      ],
      [
        "Which protocol secures web traffic?",
        ["HTTP", "FTP", "HTTPS", "SMTP"],
        2,
        "Computer Science",
      ],
      [
        "What does CPU stand for?",
        [
          "Central Processing Unit",
          "Computer Personal Utility",
          "Central Program User",
          "Control Processing Update",
        ],
        0,
        "Computer Science",
      ],
      [
        "Which word is a synonym of “resilient”?",
        ["Fragile", "Adaptable", "Indifferent", "Rigid"],
        1,
        "English Language",
      ],
      [
        "What is the chemical symbol for water?",
        ["CO2", "H2O", "O2", "NaCl"],
        1,
        "General Science",
      ],
    ])
      qs.push(
        await db.question.create({
          data: {
            institutionId: institution.id,
            text,
            type: "SINGLE",
            marks: 5,
            subject,
            options: options.map((text, i) => ({
              id: `o${i + 1}`,
              text,
              correct: i === index,
            })),
            acceptedAnswers: [],
          },
        }),
      );
    const essay = await db.question.create({
      data: {
        institutionId: institution.id,
        text: "Explain how technology can improve access to education. Use one concrete example.",
        type: "ESSAY",
        marks: 10,
        subject: "English Language",
        options: [],
        acceptedAnswers: [],
      },
    });
    const exams = [];
    for (const [i, title] of [
      "Mathematics · Midterm Assessment",
      "Introduction to Computer Science",
      "English Language Proficiency",
      "General Science · Practice Test",
    ].entries()) {
      const questionList =
        i === 0
          ? qs.slice(0, 3)
          : i === 1
            ? qs.slice(3, 6)
            : i === 2
              ? [qs[6], essay]
              : [qs[7]];
      exams.push(
        await db.exam.create({
          data: {
            institutionId: institution.id,
            courseId: courses[i].id,
            title,
            description:
              i === 3
                ? "A free practice assessment. Get familiar with the exam experience."
                : "Put your knowledge into practice. Read each question carefully and submit before the timer ends.",
            duration: [45, 60, 40, 15][i],
            price: i === 1 ? 250000 : 0,
            passMark: 50,
            maxAttempts: 3,
            status: i === 2 ? "DRAFT" : "PUBLISHED",
            questions: {
              create: questionList.map((q) => ({ questionId: q.id })),
            },
          },
        }),
      );
    }
    for (let i = 0; i < 24; i++) {
      const student = students[i % students.length],
        exam = exams[i % 2],
        questions = i % 2 ? qs.slice(3, 6) : qs.slice(0, 3),
        date = new Date(Date.now() - ((i % 7) * 86400000 + 3600000));
      const percentage = [100, 67, 33, 100, 67, 100][i % 6];
      const attempt = await db.examAttempt.create({
        data: {
          institutionId: institution.id,
          examId: exam.id,
          studentId: student.id,
          number: Math.floor(i / 12) + 1,
          status: "GRADED",
          startedAt: date,
          expectedEndAt: new Date(date.getTime() + exam.duration * 60000),
          submittedAt: new Date(date.getTime() + 1200000),
          snapshot: {
            title: exam.title,
            questions,
            passMark: 50,
            gradingBands: settings.gradingBands,
          },
          answers: {},
          ip: "127.0.0.1",
          userAgent: "Demo seed",
        },
      });
      await db.result.create({
        data: {
          institutionId: institution.id,
          attemptId: attempt.id,
          totalMarks: 15,
          obtainedMarks: percentage === 100 ? 15 : percentage === 67 ? 10 : 5,
          percentage,
          grade: percentage >= 70 ? "A" : percentage >= 60 ? "B" : "F",
          passed: percentage >= 50,
          status: "GRADED",
          breakdown: [],
          released: true,
          createdAt: date,
        },
      });
    }
    await db.auditLog.create({
      data: {
        institutionId: institution.id,
        action: "WORKSPACE_CREATED",
        targetId: institution.id,
      },
    });
    console.log(
      "Demo ready. Login: admin@assessmentdesk.demo / Assessment123!",
    );
  }
} finally {
  await db.$disconnect();
}
