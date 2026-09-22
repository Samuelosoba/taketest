import { cp, mkdir, access, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const target = new URL("public/proctoring/", root);
await mkdir(target, { recursive: true });
await cp(
  new URL("node_modules/@mediapipe/tasks-vision/wasm/", root),
  new URL("wasm/", target),
  { recursive: true },
);
const model = new URL("blaze_face_short_range.tflite", target);
try {
  await access(model);
} catch {
  const url =
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok)
    throw new Error(
      `Face model download failed (${r.status}). Retry npm run prepare:proctoring.`,
    );
  await writeFile(model, Buffer.from(await r.arrayBuffer()));
}
const checksum = createHash("sha256")
  .update(await readFile(model))
  .digest("hex");
if (
  checksum !==
  "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
)
  throw new Error(
    "Face model checksum mismatch. Replace the model with the pinned official asset.",
  );
console.log("Local camera detection assets ready:", fileURLToPath(target));
