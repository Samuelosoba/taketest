import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import "dotenv/config";
import { writeLocalSchema } from "./local-schema.mjs";
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    `DATABASE_URL="file:./dev.db"\nJWT_SECRET="${randomBytes(48).toString("hex")}"\nAPP_URL=http://127.0.0.1:5175\nPORT=4000\n`,
  );
// --production applies migrations to the Postgres database in DATABASE_URL.
const production = process.argv.includes("--production");
if (!production && !existsSync("prisma/dev.db")) writeFileSync("prisma/dev.db", "");
writeLocalSchema();
const selected = production ? "prisma/schema.prisma" : "prisma/schema.local.prisma";
const run = (args) =>
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args, "--schema", selected],
    { stdio: "inherit" },
  );
run(["generate"]);
if (!production)
  for (const upgrade of [
    "scripts/upgrade-local-proctoring.mjs",
    "scripts/upgrade-local-partner.mjs",
  ])
    execFileSync(process.execPath, [upgrade], { stdio: "inherit" });
run(production ? ["migrate", "deploy"] : ["db", "push"]);
if (!production)
  execFileSync(process.execPath, ["prisma/seed.mjs"], { stdio: "inherit" });
