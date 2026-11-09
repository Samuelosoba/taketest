// Vercel serverless entry: every request is routed here (see vercel.json).
// Background work runs through the /api/cron/sweep endpoint instead of timers.
import { app } from "../src/app.js";
export default app;
