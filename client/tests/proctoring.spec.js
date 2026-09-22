import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtures = new URL("./fixtures/", import.meta.url);
mkdirSync(fixtures, { recursive: true });
const cameraFile = new URL("blank-camera.y4m", fixtures);
writeFileSync(
  cameraFile,
  Buffer.concat([
    Buffer.from("YUV4MPEG2 W320 H240 F10:1 Ip A1:1 C420\nFRAME\n"),
    Buffer.alloc(320 * 240, 16),
    Buffer.alloc((320 * 240) / 2, 128),
  ]),
);

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${fileURLToPath(cameraFile)}`,
    ],
  },
});

async function provision(request) {
  const suffix = Date.now().toString(),
    slug = `camera-${suffix}`,
    password = "Assessment123!";
  const post = async (url, data, token) => {
    const response = await request.post(`/api${url}`, {
      data,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const admin = await post("/auth/register", {
    name: "Monitoring test admin",
    email: `admin-${suffix}@camera.example`,
    password,
    institutionName: "Camera test institution",
    slug,
  });
  const course = await post(
    "/courses",
    { title: "Camera course", code: "CAM", description: "" },
    admin.token,
  );
  const question = await post(
    "/questions",
    {
      text: "Camera test question: what is 2 + 2?",
      type: "SINGLE",
      marks: 5,
      options: [
        { id: "four", text: "4", correct: true },
        { id: "five", text: "5", correct: false },
      ],
    },
    admin.token,
  );
  const exam = await post(
    "/exams",
    {
      title: "Camera monitored exam",
      description: "Camera required.",
      courseId: course.id,
      duration: 30,
      passMark: 50,
      price: 0,
      maxAttempts: 2,
      status: "PUBLISHED",
      cameraRequired: true,
      questionIds: [question.id],
    },
    admin.token,
  );
  const email = `student-${suffix}@camera.example`;
  await post("/auth/register", {
    name: "Camera test student",
    email,
    password,
    slug,
  });
  return { admin, exam, email, password };
}
async function openInstructions(page, fixture) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back,/ }),
  ).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Examinations", exact: true })
    .click();
  await page.getByRole("button", { name: "View exam" }).click();
}
async function captureFakeStreams(page) {
  await page.addInitScript(() => {
    window.testStreams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      window.testStreams.push(stream);
      return stream;
    };
  });
}

test("real local face detector, browser events, recovery, and camera cleanup", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const f = await provision(request);
  await captureFakeStreams(page);
  await openInstructions(page, f);
  const begin = page.getByRole("button", { name: "Begin examination" });
  await expect(begin).toBeDisabled();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("0 faces detected", { exact: true })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(begin).toBeEnabled();
  await begin.click();
  await expect(
    page.getByRole("heading", { name: "Camera test question: what is 2 + 2?" }),
  ).toBeVisible({ timeout: 30000 });
  const attemptId = new URL(page.url()).pathname.split("/").at(-1);
  const events = async () => {
    const r = await request.get(`/api/attempts/${attemptId}/integrity`, {
      headers: { Authorization: `Bearer ${f.admin.token}` },
    });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).violations;
  };
  await expect
    .poll(async () => (await events()).some((e) => e.type === "FACE_ABSENT"), {
      timeout: 15000,
    })
    .toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect
    .poll(async () => (await events()).some((e) => e.type === "WINDOW_BLUR"))
    .toBeTruthy();
  await page.evaluate(() => {
    const stream = document.querySelector("video").srcObject;
    stream.getVideoTracks()[0].stop();
    stream.getVideoTracks()[0].dispatchEvent(new Event("ended"));
  });
  await expect(
    page.getByRole("heading", {
      name: "Restore camera monitoring to continue",
    }),
  ).toBeVisible();
  await expect
    .poll(async () => (await events()).some((e) => e.type === "CAMERA_STOPPED"))
    .toBeTruthy();
  await page.getByRole("button", { name: "Retry camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Camera test question: what is 2 + 2?" }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Camera test question: what is 2 + 2?" }),
  ).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => (await events()).some((e) => e.type === "PAGE_EXIT"))
    .toBeTruthy();
  await page.getByText("4", { exact: true }).click();
  await expect(page.getByText("All answers saved")).toBeVisible();
  await page.getByRole("button", { name: "Review & submit" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Submit examination", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "See the progress behind the numbers." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.testStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBeTruthy();
  await page.getByTitle("Sign out").click();
  await page.getByLabel("Email address").fill(f.admin.user.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Exam monitoring", exact: true })
    .click();
  await page.getByRole("button", { name: "View timeline" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("No face detected for at least 3 seconds", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/monitoring-timeline.png",
    fullPage: true,
  });
});

test("denied camera permission keeps the examination from starting", async ({
  page,
  request,
}) => {
  const f = await provision(request);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await openInstructions(page, f);
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText(/Camera permission was denied/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Begin examination" }),
  ).toBeDisabled();
  const r = await request.get("/api/monitoring", {
    headers: { Authorization: `Bearer ${f.admin.token}` },
  });
  expect(await r.json()).toEqual([]);
});

test("missing face model blocks start and releases the camera", async ({
  page,
  request,
}) => {
  const f = await provision(request);
  await captureFakeStreams(page);
  await page.route("**/proctoring/blaze_face_short_range.tflite", (route) =>
    route.abort(),
  );
  await openInstructions(page, f);
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByRole("button", { name: "Retry camera" })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Begin examination" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        window.testStreams.length > 0 &&
        window.testStreams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
    ),
  ).toBeTruthy();
});
