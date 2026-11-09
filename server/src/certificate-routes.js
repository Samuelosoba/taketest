import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { db, tenant, fail, random, audit } from "./core.js";
import { emit } from "./partner/webhooks.js";
export const certificates = Router();
certificates.post("/certificates/:resultId", async (req, res) => {
  const r = await db.result.findFirst({
    where: {
      id: req.params.resultId,
      institutionId: tenant(req),
      passed: true,
      released: true,
      status: "GRADED",
      ...(req.user.role === "STUDENT"
        ? { attempt: { studentId: req.user.id } }
        : {}),
    },
  });
  if (!r) fail(404, "A released passing result is required.");
  res.json(await issueCertificate(r, req.actor));
});
export async function issueCertificate(result, actor) {
  const existing = await db.certificate.findUnique({
    where: { resultId: result.id },
  });
  if (existing) return existing;
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.certificate.create({
        data: { resultId: result.id, code: random().slice(0, 24) },
      });
      await audit(actor, "CERTIFICATE_ISSUED", c.id, tx);
      await emit(tx, result.institutionId, "certificate.issued", {
        certificateId: c.id,
        resultId: result.id,
        attemptId: result.attemptId,
        code: c.code,
        verifyUrl: `${process.env.APP_URL}/verify/${c.code}`,
      });
      return c;
    });
  } catch (e) {
    // Two concurrent requests: the other one created it.
    if (e.code !== "P2002") throw e;
    return db.certificate.findUnique({ where: { resultId: result.id } });
  }
}
certificates.get("/certificates", async (req, res) =>
  res.json(
    await db.certificate.findMany({
      where: {
        result: {
          institutionId: tenant(req),
          released: true,
          ...(req.user.role === "STUDENT"
            ? { attempt: { studentId: req.user.id } }
            : {}),
        },
      },
      include: {
        result: {
          include: {
            attempt: {
              include: {
                student: { select: { name: true } },
                exam: { select: { title: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ),
);
certificates.get("/certificates/:id/pdf", async (req, res) => {
  const c = await db.certificate.findFirst({
    where: {
      id: req.params.id,
      result: {
        institutionId: tenant(req),
        released: true,
        ...(req.user.role === "STUDENT"
          ? { attempt: { studentId: req.user.id } }
          : {}),
      },
    },
    include: certificatePdfInclude,
  });
  if (!c) fail(404, "Certificate not found.");
  await sendCertificatePdf(res, c);
});
export const certificatePdfInclude = {
  result: {
    include: {
      attempt: {
        include: { student: true, exam: { include: { institution: true } } },
      },
    },
  },
};
// Streams a certificate (loaded with certificatePdfInclude) as a PDF.
export async function sendCertificatePdf(res, c) {
  const a = c.result.attempt;
  const qr = await QRCode.toBuffer(`${process.env.APP_URL}/verify/${c.code}`);
  const pdf = new PDFDocument({ size: "A4", layout: "landscape", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="AssessmentDesk-${c.code}.pdf"`,
  );
  pdf.pipe(res);
  pdf.rect(25, 25, 792, 545).lineWidth(2).stroke("#17664f");
  pdf
    .fillColor("#17664f")
    .fontSize(18)
    .text(a.exam.institution.name, 50, 75, { align: "center" });
  pdf
    .fontSize(34)
    .text("Certificate of Achievement", 50, 135, { align: "center" });
  pdf
    .fillColor("#666666")
    .fontSize(14)
    .text("This is to certify that", 50, 205, { align: "center" });
  pdf
    .fillColor("#142e27")
    .fontSize(30)
    .text(a.student.name, 50, 240, { align: "center" });
  pdf.fontSize(15).text(`has successfully completed ${a.exam.title}`, 50, 300, {
    align: "center",
  });
  pdf.text(
    `Score: ${c.result.percentage}%  |  Grade: ${c.result.grade}`,
    50,
    337,
    { align: "center" },
  );
  pdf
    .fontSize(10)
    .text(
      `Issued ${c.createdAt.toLocaleDateString("en-GB")}  •  ${c.code}`,
      65,
      478,
    );
  pdf.image(qr, 685, 425, { width: 80 });
  pdf.end();
}
export async function verifyCertificate(req, res) {
  const c = await db.certificate.findUnique({
    where: { code: req.params.code },
    include: {
      result: {
        include: {
          attempt: {
            include: {
              student: { select: { name: true } },
              exam: {
                select: {
                  title: true,
                  institution: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!c || !c.result.released || !c.result.passed)
    fail(404, "Certificate not found.");
  res.json({
    code: c.code,
    issuedAt: c.createdAt,
    student: c.result.attempt.student.name,
    exam: c.result.attempt.exam.title,
    institution: c.result.attempt.exam.institution.name,
  });
}
