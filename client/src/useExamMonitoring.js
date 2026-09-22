import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api";
import { signalLabels } from "./proctoring-signals";

export function useExamMonitoring(attempt, submitted, flush) {
  const [warning, setWarning] = useState(""),
    [connected, setConnected] = useState(true);
  const current = useRef({ attempt, submitted, flush });
  current.current = { attempt, submitted, flush };
  const queued = useRef([]),
    sending = useRef(false);
  const drain = useCallback(async () => {
    const { attempt: a, submitted } = current.current;
    if (!a || submitted.current || sending.current) return;
    sending.current = true;
    try {
      while (queued.current.length) {
        await api.post(`/attempts/${a.id}/events`, queued.current[0]);
        queued.current.shift();
      }
    } catch {
      /* Keep bounded events in memory and retry with the heartbeat. */
    } finally {
      sending.current = false;
    }
  }, []);
  const record = useCallback(
    (type) => {
      const { attempt: a, submitted } = current.current;
      if (!a || a.status !== "STARTED" || submitted.current) return;
      if (
        ![
          "CAMERA_STARTED",
          "FACE_RESTORED",
          "TAB_VISIBLE",
          "WINDOW_FOCUS",
        ].includes(type)
      )
        setWarning(
          `${signalLabels[type] || type}. This is recorded for review.`,
        );
      else if (type === "FACE_RESTORED")
        setWarning(
          "Face visibility restored. Earlier events remain recorded for review.",
        );
      if (queued.current.length < 100)
        queued.current.push({ type, eventId: crypto.randomUUID() });
      drain();
    },
    [drain],
  );
  useEffect(() => {
    const a = attempt;
    if (!a || a.status !== "STARTED") return;
    let stopped = false;
    const beacon = (type) => {
      if (current.current.submitted.current || !a.monitoringToken) return;
      const body = JSON.stringify({
        token: a.monitoringToken,
        type,
        eventId: crypto.randomUUID(),
      });
      const blob = new Blob([body], { type: "application/json" });
      const url = `/api/attempts/${a.id}/exit-beacon`;
      if (!navigator.sendBeacon?.(url, blob))
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
    };
    const beat = async () => {
      if (stopped || current.current.submitted.current) return;
      try {
        await api.post(`/attempts/${a.id}/heartbeat`);
        if (!stopped) setConnected(true);
        drain();
      } catch {
        if (!stopped) setConnected(false);
      }
    };
    const visibility = () => {
      if (document.hidden) {
        beacon("TAB_HIDDEN");
        setWarning("Exam tab hidden. This is recorded for review.");
        current.current.flush().catch(() => {});
      } else {
        record("TAB_VISIBLE");
        beat();
      }
    };
    const pagehide = () => beacon("PAGE_EXIT");
    const blur = () => record("WINDOW_BLUR"),
      focus = () => record("WINDOW_FOCUS");
    const fullscreen = () => {
      if (!document.fullscreenElement) record("FULLSCREEN_EXIT");
    };
    const offline = () => setConnected(false);
    const unload = (e) => {
      if (!current.current.submitted.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    beat();
    const timer = setInterval(beat, 15000);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", beat);
    window.addEventListener("offline", offline);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("online", beat);
      window.removeEventListener("offline", offline);
    };
  }, [attempt?.id, record, drain]);
  return { record, warning, connected };
}
