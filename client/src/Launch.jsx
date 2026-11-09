// Partner launch flow: a partner's dashboard opens /launch/<token>. The token
// is exchanged once for a session limited to that exam; the student then runs
// the normal camera check and exam screen, and ends on /launch/done.
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  FileText,
  TrendingUp,
  Play,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { api, get, message, getLaunchSession, setLaunchSession } from "./api";
import { useAuth, Logo } from "./App";
import CameraMonitor from "./CameraMonitor";
import { Loading, ErrorState } from "./ui";

// Guards against exchanging the same single-use token twice (effects can
// run twice in development).
const exchanges = new Map();
const exchangeOnce = (token) => {
  if (!exchanges.has(token))
    exchanges.set(
      token,
      api.post("/launch/exchange", { token }).then((r) => r.data),
    );
  return exchanges.get(token);
};

function Frame({ children }) {
  return (
    <div className="verification-page">
      <Logo />
      <section className="panel verification-card launch-card">
        {children}
      </section>
    </div>
  );
}

export function LaunchEntry() {
  const { token } = useParams(),
    navigate = useNavigate(),
    { login } = useAuth();
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    exchangeOnce(token)
      .then((data) => {
        if (!live) return;
        const session = {
          token: data.token,
          user: data.user,
          exam: data.exam,
          returnUrl: data.returnUrl,
        };
        setLaunchSession(session);
        login({ token: data.token, user: data.user });
        // Replace the URL so the used token is not kept in history.
        navigate("/launch/start", { replace: true });
      })
      .catch((e) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [token]);
  if (!error) return <Loading />;
  return (
    <Frame>
      <h1>This link can't be used.</h1>
      <p>{error}</p>
    </Frame>
  );
}

export function LaunchStart() {
  const session = getLaunchSession(),
    navigate = useNavigate();
  const [cameraReady, setCameraReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!session) return <LaunchMissing />;
  const exam = session.exam;
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post(`/exams/${exam.id}/start`, { cameraReady });
      navigate(`/attempt/${r.data.id}`, { replace: true });
    } catch (e) {
      if (e.response?.status === 410)
        navigate("/launch/done", { replace: true });
      else setError(message(e));
      setBusy(false);
    }
  };
  return (
    <Frame>
      <div className="exam-instructions">
        <span className="eyebrow">{session.user.institution?.name}</span>
        <h2>{exam.title}</h2>
        {exam.description && <p>{exam.description}</p>}
        <div className="instruction-stats">
          <span>
            <Clock /> {exam.duration} minutes
          </span>
          <span>
            <FileText /> {exam.questionCount} questions
          </span>
          <span>
            <TrendingUp /> {exam.passMark}% to pass
          </span>
        </div>
        <ul>
          <li>
            Your timer starts when you begin and keeps running if you close this
            page.
          </li>
          <li>Answers are saved as you go.</li>
          <li>
            When time runs out, your saved answers are submitted automatically.
          </li>
          <li>
            Tab changes, fullscreen exits, and lost connections are recorded for
            review.
          </li>
        </ul>
        {exam.cameraRequired && <CameraMonitor onReady={setCameraReady} />}
        {error && <div className="info-box">{error}</div>}
        <button
          className="btn primary full-width"
          disabled={busy || (exam.cameraRequired && !cameraReady)}
          onClick={start}
        >
          {busy ? (
            "Preparing…"
          ) : (
            <>
              <Play size={17} /> Begin examination
            </>
          )}
        </button>
      </div>
    </Frame>
  );
}

export function LaunchDone() {
  const session = getLaunchSession(),
    { logout } = useAuth();
  const q = useQuery({
    queryKey: ["launch-result"],
    queryFn: () => get("/launch/result"),
    enabled: !!session,
    retry: false,
  });
  if (!session) return <LaunchMissing />;
  const finish = () => {
    setLaunchSession(null);
    logout();
    if (session.returnUrl) window.location.assign(session.returnUrl);
  };
  const r = q.data?.result;
  return (
    <Frame>
      <span className="verified-seal">
        <CheckCircle2 size={44} />
      </span>
      <span className="eyebrow">{session.exam.title}</span>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <h1>
            {q.data.status === "STARTED"
              ? "Exam in progress."
              : "Exam submitted."}
          </h1>
          {r ? (
            <dl>
              <dt>Score</dt>
              <dd>
                {r.percentage}% ({r.obtainedMarks}/{r.totalMarks})
              </dd>
              <dt>Grade</dt>
              <dd>{r.grade}</dd>
              <dt>Outcome</dt>
              <dd>{r.passed ? "Passed" : "Not passed"}</dd>
            </dl>
          ) : (
            <p>
              {q.data.status === "STARTED"
                ? "Return to the exam to continue."
                : "Your answers were received. Your institution will share your result."}
            </p>
          )}
        </>
      )}
      {q.data?.status === "STARTED" ? (
        <Link className="btn primary" to={`/attempt/${q.data.attemptId}`}>
          Continue examination <ArrowRight size={16} />
        </Link>
      ) : session.returnUrl ? (
        <button className="btn primary" onClick={finish}>
          Return to your dashboard <ArrowRight size={16} />
        </button>
      ) : (
        <p>
          <ShieldCheck size={14} /> You can close this tab.
        </p>
      )}
    </Frame>
  );
}

function LaunchMissing() {
  return (
    <Frame>
      <h1>Your exam session has ended.</h1>
      <p>Return to your school's dashboard and start the exam again.</p>
    </Frame>
  );
}
