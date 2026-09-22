import { app } from "./app.js";
import { db } from "./core.js";
import { expireAttempts } from "./grading.js";
import { detectDisconnectedAttempts } from "./proctoring.js";
const server = app.listen(process.env.PORT || 4000, "127.0.0.1", () =>
  console.log(
    `AssessmentDesk API: http://localhost:${process.env.PORT || 4000}`,
  ),
);
let running = false;
const sweep = async () => {
  if (running) return;
  running = true;
  try {
    await expireAttempts();
    await detectDisconnectedAttempts();
  } catch (e) {
    console.error("Expiry worker:", e.message);
  } finally {
    running = false;
  }
};
const timer = setInterval(sweep, 15000);
sweep();
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    clearInterval(timer);
    server.close(async () => {
      await db.$disconnect();
      process.exit();
    });
  });
