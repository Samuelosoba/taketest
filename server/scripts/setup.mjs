import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import "dotenv/config";
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    `DATABASE_URL="file:./dev.db"\nJWT_SECRET="${randomBytes(48).toString("hex")}"\nAPP_URL=http://127.0.0.1:5175\nPORT=4000\n`,
  );
const mysql = process.argv.includes("--mysql");
if (!mysql && !existsSync("prisma/dev.db")) writeFileSync("prisma/dev.db", "");
const schema = readFileSync("prisma/schema.prisma", "utf8");
writeFileSync(
  "prisma/schema.local.prisma",
  schema
    .replace('provider = "mysql"', 'provider = "sqlite"')
    .replace(/ @db\.\w+(\([^)]*\))?/g, ""),
);
const selected = mysql ? "prisma/schema.prisma" : "prisma/schema.local.prisma";
const run = (args) =>
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args, "--schema", selected],
    { stdio: "inherit" },
  );
run(["generate"]);
if (!mysql)
  execFileSync(process.execPath, ["scripts/upgrade-local-proctoring.mjs"], {
    stdio: "inherit",
  });
run(mysql ? ["migrate", "deploy"] : ["db", "push"]);
if (!mysql)
  execFileSync(process.execPath, ["prisma/seed.mjs"], { stdio: "inherit" });
