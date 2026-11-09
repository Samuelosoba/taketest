import { app } from "./app.js";
import { db } from "./core.js";
import { runSweep } from "./sweep.js";
const server = app.listen(process.env.PORT || 4000, "127.0.0.1", () =>
  console.log(
    `AssessmentDesk API: http://localhost:${process.env.PORT || 4000}`,
  ),
);
const sweep = () =>
  runSweep().catch((e) => console.error("Expiry worker:", e.message));
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
