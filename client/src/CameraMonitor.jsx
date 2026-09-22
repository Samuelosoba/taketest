import React, { useEffect, useRef, useState } from "react";
import { Camera, ShieldCheck } from "lucide-react";
import { createFaceSignalTracker } from "./proctoring-signals";

export default function CameraMonitor({ autoStart = false, onReady, onEvent }) {
  const video = useRef(null),
    resources = useRef(null),
    generation = useRef(0);
  const callbacks = useRef({ onReady, onEvent });
  callbacks.current = { onReady, onEvent };
  const [state, setState] = useState("idle"),
    [notice, setNotice] = useState(""),
    [faces, setFaces] = useState(null);
  const ready = (value) => callbacks.current.onReady?.(value);
  const emit = (type) => callbacks.current.onEvent?.(type);
  const dispose = () => {
    const r = resources.current;
    resources.current = null;
    if (r) {
      clearInterval(r.timer);
      r.track.onended = null;
      r.track.onmute = null;
      r.track.onunmute = null;
      r.stream.getTracks().forEach((t) => t.stop());
      r.detector.close();
    }
    if (video.current) video.current.srcObject = null;
  };
  const start = async () => {
    const version = ++generation.current;
    dispose();
    ready(false);
    setState("starting");
    setNotice("Preparing your camera and face detection…");
    let stream, detector;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires HTTPS or localhost and a supported browser.",
        );
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
        },
        audio: false,
      });
      if (version !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setNotice("Camera connected. Loading face detection…");
      const { FaceDetector, FilesetResolver } =
        await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/proctoring/wasm");
      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/proctoring/blaze_face_short_range.tflite",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.65,
      });
      if (version !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        detector.close();
        return;
      }
      const element = video.current;
      element.srcObject = stream;
      await element.play();
      if (version !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        detector.close();
        return;
      }
      const track = stream.getVideoTracks()[0];
      const tracker = createFaceSignalTracker();
      let lastTime = -1,
        stalledAt = performance.now(),
        stalled = false;
      const interrupted = () => {
        if (version !== generation.current) return;
        stalled = true;
        ready(false);
        setState("interrupted");
        setNotice("Camera feed interrupted. Restore your camera to continue.");
        emit("CAMERA_STOPPED");
      };
      track.onended = interrupted;
      track.onmute = interrupted;
      track.onunmute = () => {
        stalledAt = performance.now();
      };
      const timer = setInterval(() => {
        if (version !== generation.current || document.hidden) return;
        if (track.readyState !== "live" || track.muted) {
          if (!stalled) interrupted();
          return;
        }
        if (element.readyState < 2 || element.currentTime === lastTime) {
          if (performance.now() - stalledAt > 5000 && !stalled) {
            stalled = true;
            interrupted();
          }
          return;
        }
        lastTime = element.currentTime;
        stalledAt = performance.now();
        stalled = false;
        try {
          const count = detector.detectForVideo(element, performance.now())
            .detections.length;
          setFaces(count);
          setState("active");
          ready(true);
          setNotice(
            count === 1
              ? "One face visible. Monitoring is active."
              : count === 0
                ? "Keep your face visible and check your lighting."
                : "More than one face is visible. Stay alone in the camera frame.",
          );
          const signal = tracker(count, performance.now());
          if (signal) emit(signal);
        } catch {
          clearInterval(timer);
          ready(false);
          setState("error");
          setNotice(
            "Face detection stopped. Restart camera monitoring to continue.",
          );
          emit("DETECTOR_UNAVAILABLE");
        }
      }, 500);
      resources.current = { stream, track, detector, timer };
      setState("active");
      setNotice("Checking your camera feed…");
      emit("CAMERA_STARTED");
      // The first successful frame marks the check ready, not getUserMedia alone.
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
      if (version !== generation.current) return;
      ready(false);
      setState("error");
      setNotice(
        error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser, then retry."
          : error.name === "NotFoundError"
            ? "No camera was found. Connect a camera and retry."
            : error.name === "NotReadableError"
              ? "Your camera is in use or unavailable. Close other camera apps and retry."
              : error.message ||
                "Camera monitoring could not start. Please retry.",
      );
      emit(stream ? "DETECTOR_UNAVAILABLE" : "CAMERA_UNAVAILABLE");
    }
  };
  useEffect(() => {
    if (autoStart) start();
    return () => {
      generation.current++;
      dispose();
      ready(false);
    };
  }, []);
  return (
    <section className="camera-monitor" aria-label="Camera monitoring">
      <div className="camera-heading">
        <Camera size={17} />
        <strong>Camera monitoring</strong>
        <span className={`camera-dot ${state === "active" ? "on" : ""}`} />
      </div>
      <video
        ref={video}
        muted
        playsInline
        autoPlay
        className="camera-preview"
        aria-label="Your camera preview"
      />
      <div className="camera-state" role="status">
        {notice || "Allow your camera to complete the check before starting."}
      </div>
      {state === "active" && (
        <span className="camera-face-count">
          {faces === null
            ? "Checking frame…"
            : `${faces} ${faces === 1 ? "face" : "faces"} detected`}
        </span>
      )}
      {["idle", "error", "interrupted"].includes(state) && (
        <button
          type="button"
          className="btn primary full-width"
          onClick={start}
        >
          {state === "idle" ? "Enable camera" : "Retry camera"}
        </button>
      )}
      <p className="camera-privacy">
        <ShieldCheck size={13} /> Video is processed on this device. No video,
        images, or audio are uploaded. Face-presence and browser events are
        recorded for examiner review.
      </p>
    </section>
  );
}
