import { spawn } from "node:child_process";
const children = ["server", "client"].map((folder) =>
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["--prefix", folder, "run", "dev"],
    { stdio: "inherit", shell: process.platform === "win32" },
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((child) => child.kill());
    process.exit();
  });
