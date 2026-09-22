// Require a sustained observation, not a single uncertain frame. Repeated warnings
// are emitted at most once every 30 seconds while a condition continues.
export function createFaceSignalTracker({
  holdMs = 3000,
  repeatMs = 30000,
  maxSampleGapMs = 2000,
} = {}) {
  let condition = null,
    since = 0,
    lastEmitted = -Infinity,
    flagged = false;
  let previousSample = null;
  return (count, now) => {
    if (previousSample !== null && now - previousSample > maxSampleGapMs)
      condition = null;
    previousSample = now;
    const next =
      count === 0
        ? "FACE_ABSENT"
        : count > 1
          ? "MULTIPLE_FACES"
          : "FACE_RESTORED";
    if (next !== condition) {
      condition = next;
      since = now;
      lastEmitted = -Infinity;
    }
    if (now - since < holdMs) return null;
    if (next === "FACE_RESTORED") {
      if (!flagged) return null;
      flagged = false;
      lastEmitted = now;
      return next;
    }
    if (now - lastEmitted < repeatMs) return null;
    flagged = true;
    lastEmitted = now;
    return next;
  };
}
export const signalLabels = {
  TAB_HIDDEN: "Exam tab hidden",
  TAB_VISIBLE: "Exam tab visible again",
  WINDOW_BLUR: "Exam window lost focus",
  WINDOW_FOCUS: "Exam window regained focus",
  PAGE_EXIT: "Page left, refreshed, or closed",
  FULLSCREEN_EXIT: "Exited fullscreen",
  PASTE_ATTEMPT: "Paste attempt",
  CAMERA_STARTED: "Camera monitoring started",
  CAMERA_STOPPED: "Camera feed interrupted",
  CAMERA_UNAVAILABLE: "Camera access unavailable",
  DETECTOR_UNAVAILABLE: "Face detector unavailable",
  FACE_ABSENT: "No face detected for at least 3 seconds",
  MULTIPLE_FACES: "Multiple faces detected for at least 3 seconds",
  FACE_RESTORED: "Single face detected again",
  CONNECTION_LOST: "No heartbeat for over 60 seconds",
  CONNECTION_RESTORED: "Connection restored",
};
