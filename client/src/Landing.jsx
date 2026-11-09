// Public landing page: what AssessmentDesk is, who it is for, how to get
// access, and how platforms integrate with it.
import React, { useState } from "react";
import useHashScroll from "./useHashScroll";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Code2,
  CreditCard,
  FileText,
  GraduationCap,
  KeyRound,
  Layers,
  Library,
  LockKeyhole,
  Menu,
  PenLine,
  Plug,
  ShieldCheck,
  Timer,
  UserCog,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { Logo } from "./App";

const audiences = [
  {
    icon: Building2,
    title: "Institutions",
    text: "Schools, universities, training centres and certification bodies get a private workspace for their courses, staff, students and results.",
  },
  {
    icon: UserCog,
    title: "Examiners",
    text: "Build a reusable question bank, assemble timed exams, review monitoring timelines, and mark essays in a focused grading queue.",
  },
  {
    icon: GraduationCap,
    title: "Students",
    text: "Take exams in a calm, distraction-free room that saves every answer, recovers after a refresh, and shows results when they are released.",
  },
  {
    icon: Plug,
    title: "Platforms and developers",
    text: "Already have a school portal or LMS? Drive AssessmentDesk from your own dashboard with the REST API, launch links and webhooks.",
  },
];

const features = [
  {
    icon: Library,
    title: "Reusable question bank",
    text: "Single and multiple choice, true/false, short answer with accepted variations, and essays. Tag by subject and difficulty, and attach images.",
  },
  {
    icon: Layers,
    title: "Flexible exam builder",
    text: "Choose questions, set duration, pass mark, attempt limit, open and close times, shuffling, fullscreen and camera requirements.",
  },
  {
    icon: Timer,
    title: "Server-enforced timing",
    text: "The deadline lives on the server. Answers save as students work, survive refreshes, and are submitted automatically when time runs out.",
  },
  {
    icon: CheckCircle2,
    title: "Instant automatic grading",
    text: "Objective questions are marked on the server against answers students never see, including exact-set matching for multiple answers.",
  },
  {
    icon: PenLine,
    title: "Manual essay grading",
    text: "Essays go to a grading queue with marks and feedback per answer. Results are recalculated and graded bands applied automatically.",
  },
  {
    icon: Camera,
    title: "Camera and integrity monitoring",
    text: "Optional face-presence checks run in the browser. Tab switches, focus loss, fullscreen exits, paste attempts and disconnections are timelined for review.",
  },
  {
    icon: ClipboardCheck,
    title: "Controlled result release",
    text: "Release results immediately or hold them for review. Configure your own grading bands (A–F or any scheme) and pass thresholds.",
  },
  {
    icon: Award,
    title: "Verifiable certificates",
    text: "Passing students receive PDF certificates with a QR code. Anyone can confirm a certificate is genuine on its public verification page.",
  },
  {
    icon: CreditCard,
    title: "Paid examinations",
    text: "Charge for an exam with Paystack. Access is granted only after the payment is verified with Paystack on the server.",
  },
  {
    icon: BarChart3,
    title: "Dashboards and reports",
    text: "Institution and student dashboards, activity charts and result analytics, plus CSV exports of students, results, payments and monitoring timelines.",
  },
  {
    icon: LockKeyhole,
    title: "Secure by design",
    text: "Every record is scoped to its institution on the server. Four roles, hashed passwords, short-lived tokens and an audit log of key actions.",
  },
  {
    icon: Code2,
    title: "Partner API",
    text: "Scoped API keys, upserts by your own IDs, single-use student launch links, signed webhooks with retries, and idempotent requests.",
  },
];

const steps = [
  {
    title: "Create your workspace",
    text: "Register your institution in under a minute. You become its administrator and choose a short workspace slug, such as greenfield.",
  },
  {
    title: "Add courses and questions",
    text: "Create courses, build your question bank, and invite examiners from Team members. Students join with your workspace slug, or you add them.",
  },
  {
    title: "Publish an exam",
    text: "Pick questions and set the rules: time limit, pass mark, schedule, attempts, price and monitoring. Publish when you are ready.",
  },
  {
    title: "Grade, release, certify",
    text: "Objective answers grade instantly. Mark essays, review integrity timelines, release results, and issue verifiable certificates.",
  },
];

const roles = [
  [
    "Institution administrator",
    "Registers the institution",
    "Everything in the workspace: staff, students, courses, exams, results, payments, settings and the developer API.",
  ],
  [
    "Examiner",
    "Added by an administrator under Team members",
    "Question bank, courses, exams, manual grading, results and exam monitoring.",
  ],
  [
    "Student",
    "Registers with the institution's workspace slug, or is added by an administrator",
    "Takes published exams, pays for paid exams, sees released results and downloads certificates.",
  ],
  [
    "Partner student",
    "Created automatically by a partner platform through the API",
    "Enters one exam at a time through a secure launch link from the partner's dashboard. No password needed.",
  ],
];

const faqs = [
  [
    "Who is AssessmentDesk for?",
    "Any organisation that runs tests: schools and universities, training academies, professional certification bodies, recruitment teams and online course creators. Each organisation works in its own private workspace.",
  ],
  [
    "How do students get into the platform?",
    "Students open the Register page, choose Student, and enter your workspace slug. Administrators can also create student accounts. If you use the API, your platform creates students automatically and sends them straight into an exam.",
  ],
  [
    "Does the camera record my students?",
    "No. Face detection runs entirely in the student's browser. No video, images or audio are uploaded or stored; only event types and times (for example, no face detected for 3 seconds) are saved for examiners to review. The system never makes automatic cheating decisions.",
  ],
  [
    "What happens if a student's internet drops or the tab closes?",
    "Answers are saved as the student works. They can reopen the exam and continue where they stopped while time remains. The timer keeps running on the server, and the saved answers are submitted automatically at the deadline.",
  ],
  [
    "Can we charge for exams?",
    "Yes. Set a price on an exam and students pay through Paystack before starting. Access is granted only after the server confirms the payment with Paystack.",
  ],
  [
    "Can I use it from my own school portal?",
    "Yes. Create an API key under Developers, manage courses and exams with the REST API, and create a launch link whenever a student clicks Start in your portal. Webhooks tell your server when attempts finish and results are ready.",
  ],
];

function Code() {
  return (
    <pre className="lp-code" aria-label="Example API request">
      <code>
        <span className="c">
          # Send a student from your portal into an exam
        </span>
        {"\n"}curl -X POST https://assessmentdesk-api.vercel.app/api/v1/launches
        \{"\n"}
        {"  "}-H <span className="s">"Authorization: Bearer sk_live_…"</span> \
        {"\n"}
        {"  "}-H <span className="s">"Content-Type: application/json"</span> \
        {"\n"}
        {"  "}-d <span className="s">'{"{"}"examId":"ext_MATH101-FINAL",</span>
        {"\n"}
        {"       "}
        <span className="s">
          "student":{"{"}"externalId":"S-20931","name":"Ada Obi"{"}}"}'
        </span>
        {"\n\n"}
        <span className="c">
          # → {"{"} "url": "https://assessmentdesk-web.vercel.app/launch/…",
        </span>
        {"\n"}
        <span className="c"># "expiresAt": "…" {"}"}</span>
      </code>
    </pre>
  );
}

export default function Landing() {
  const [menu, setMenu] = useState(false);
  useHashScroll();
  const nav = [
    ["#about", "About"],
    ["#features", "Features"],
    ["#how", "How it works"],
    ["#access", "Access"],
    ["#developers", "Developers"],
    ["#faq", "FAQ"],
  ];
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/welcome" aria-label="AssessmentDesk home">
          <Logo />
        </Link>
        <nav className={menu ? "open" : ""} aria-label="Main">
          {nav.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
          <Link to="/docs" onClick={() => setMenu(false)}>
            API docs
          </Link>
          <Link className="btn lp-nav-signin" to="/login">
            Sign in
          </Link>
        </nav>
        <Link className="btn primary lp-nav-cta" to="/register">
          Get started <ArrowRight size={16} />
        </Link>
        <button
          className="icon-btn lp-menu"
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="pill">ONLINE EXAMINATION PLATFORM</span>
          <h1>
            Run fair, secure exams <em>from question to certificate.</em>
          </h1>
          <p>
            AssessmentDesk gives schools, training providers and certification
            bodies one workspace to build question banks, schedule timed exams,
            monitor integrity, grade automatically, and issue verifiable
            certificates. You can also plug it into your own platform through
            the API.
          </p>
          <div className="lp-actions">
            <Link to="/register" className="btn primary">
              Create your free workspace <ArrowRight size={18} />
            </Link>
            <Link to="/docs" className="btn">
              <Code2 size={17} /> Read the API docs
            </Link>
          </div>
          <ul className="lp-checks">
            <li>
              <Check /> No installation, works in the browser
            </li>
            <li>
              <Check /> Automatic grading
            </li>
            <li>
              <Check /> Privacy-first camera checks
            </li>
          </ul>
        </div>
        <div className="lp-hero-card" aria-hidden="true">
          <div className="lp-mock-top">
            <span className="lp-dot" />
            <strong>Mathematics 101 · Final</strong>
            <span className="lp-timer">
              <Clock size={13} /> 42:18
            </span>
          </div>
          <p className="lp-mock-q">Question 4 of 20</p>
          <h3>Which value of x satisfies 2x + 6 = 14?</h3>
          {["x = 3", "x = 4", "x = 5", "x = 10"].map((o, i) => (
            <div key={o} className={`lp-mock-option ${i === 1 ? "on" : ""}`}>
              <span>{"ABCD"[i]}</span> {o}
            </div>
          ))}
          <div className="lp-mock-foot">
            <span>
              <CheckCircle2 size={14} /> Saved
            </span>
            <span>
              <Camera size={14} /> Camera active
            </span>
          </div>
        </div>
      </section>

      <section className="lp-strip" aria-label="Highlights">
        <div>
          <strong>5</strong>
          <span>question types</span>
        </div>
        <div>
          <strong>4</strong>
          <span>roles with separate permissions</span>
        </div>
        <div>
          <strong>16</strong>
          <span>integrity signals recorded</span>
        </div>
        <div>
          <strong>0</strong>
          <span>video frames uploaded</span>
        </div>
      </section>

      <section id="about" className="lp-section">
        <div className="lp-head">
          <span className="eyebrow">WHAT IS ASSESSMENTDESK?</span>
          <h2>One workspace for your whole assessment process.</h2>
          <p>
            AssessmentDesk replaces spreadsheets, paper scripts and disconnected
            quiz tools. You write questions once and reuse them. Students take
            exams in a secure online room. Grading, results, payments and
            certificates all happen in the same place, with each institution's
            data kept separate.
          </p>
        </div>
        <div className="lp-grid four">
          {audiences.map(({ icon: Icon, title, text }) => (
            <article key={title} className="lp-card">
              <span className="lp-icon">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="lp-section tinted">
        <div className="lp-head">
          <span className="eyebrow">KEY FEATURES</span>
          <h2>Everything you need to assess with confidence.</h2>
          <p>
            Every important rule is enforced on the server: deadlines, grading,
            attempt limits, payment checks and data isolation.
          </p>
        </div>
        <div className="lp-grid three">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="lp-feature">
              <Icon size={20} />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="lp-section">
        <div className="lp-head">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>From sign-up to certificates in four steps.</h2>
        </div>
        <ol className="lp-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="lp-step-no">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="lp-student">
          <h3>
            <BookOpen size={18} /> What students experience
          </h3>
          <ul>
            <li>
              <Check /> A clear preparation screen showing the duration,
              question count and pass mark before the timer starts.
            </li>
            <li>
              <Check /> A camera check first, if the exam requires it, with a
              plain-language privacy notice.
            </li>
            <li>
              <Check /> One question at a time, question flags, a visible save
              indicator and a countdown synced to the server clock.
            </li>
            <li>
              <Check /> Results, grades and downloadable certificates as soon as
              the institution releases them.
            </li>
          </ul>
        </div>
      </section>

      <section id="access" className="lp-section tinted">
        <div className="lp-head">
          <span className="eyebrow">HOW TO ACCESS THE APP</span>
          <h2>Getting in, by role.</h2>
          <p>
            AssessmentDesk runs in any modern browser on desktop, tablet or
            phone. There is nothing to install. Camera monitoring needs a webcam
            and a secure (https) connection.
          </p>
        </div>
        <div className="lp-access">
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>How they get an account</th>
                  <th>What they can do</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(([role, how, what]) => (
                  <tr key={role}>
                    <th scope="row">{role}</th>
                    <td>{how}</td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lp-access-steps">
            <h3>Start in two minutes</h3>
            <ol>
              <li>
                Open <Link to="/register">Register</Link> and choose{" "}
                <strong>Institution</strong>.
              </li>
              <li>Enter your name, institution name and a workspace slug.</li>
              <li>Use your email and a password of at least 10 characters.</li>
              <li>
                Share your workspace slug with students so they can register.
              </li>
            </ol>
            <Link to="/register" className="btn primary full-width">
              Create a workspace <ArrowRight size={16} />
            </Link>
            <p>
              Already registered? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-split">
          <div>
            <span className="eyebrow">INTEGRITY AND PRIVACY</span>
            <h2>Signals for examiners, not verdicts.</h2>
            <p>
              When an exam requires the camera, AssessmentDesk checks in the
              student's browser that exactly one face is present. Examiners see
              a timeline of events and decide what they mean.
            </p>
            <ul className="lp-list">
              <li>
                <ShieldCheck /> Records: no face or multiple faces for 3+
                seconds, camera interruptions, tab switches, focus loss,
                fullscreen exits, paste attempts, page exits and lost
                connections.
              </li>
              <li>
                <LockKeyhole /> Never uploads or stores video, images or audio.
              </li>
              <li>
                <Users /> Never applies automatic penalties. People review the
                events with context such as accessibility needs or unreliable
                connections.
              </li>
            </ul>
          </div>
          <div className="lp-timeline" aria-hidden="true">
            <h4>Integrity timeline · Ada Obi</h4>
            {[
              ["09:00:04", "Camera monitoring started"],
              ["09:12:31", "Exam tab hidden"],
              ["09:12:40", "Exam tab visible again"],
              ["09:27:02", "No face detected for at least 3 seconds"],
              ["09:27:09", "Single face detected again"],
              ["09:41:15", "Exam window lost focus"],
            ].map(([t, e]) => (
              <div key={t}>
                <time>{t}</time>
                <span>{e}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="developers" className="lp-section dark">
        <div className="lp-split">
          <div>
            <span className="eyebrow">FOR DEVELOPERS AND PLATFORMS</span>
            <h2>Use AssessmentDesk from your own dashboard.</h2>
            <p>
              Keep your users in your portal, LMS or school management system.
              AssessmentDesk handles the exam room, timing, monitoring and
              grading, and your platform stays in control.
            </p>
            <ul className="lp-list">
              <li>
                <KeyRound /> Scoped API keys, managed under{" "}
                <strong>Developers</strong> in your workspace.
              </li>
              <li>
                <FileText /> REST endpoints for courses, questions, exams,
                students, attempts, results and certificates, using your own
                IDs.
              </li>
              <li>
                <ArrowUpRight /> Single-use launch links that send a student
                straight into an exam, no separate login needed.
              </li>
              <li>
                <Webhook /> Signed webhooks when attempts start and finish and
                when results are graded or released.
              </li>
            </ul>
            <Link to="/docs" className="btn primary">
              Explore the documentation <ArrowRight size={16} />
            </Link>
          </div>
          <Code />
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-head">
          <span className="eyebrow">FREQUENTLY ASKED QUESTIONS</span>
          <h2>Good questions, clear answers.</h2>
        </div>
        <div className="lp-faq">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <h2>Ready to run your next exam?</h2>
        <p>Create a workspace now and publish your first exam today.</p>
        <div className="lp-actions">
          <Link to="/register" className="btn primary">
            Get started free <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="btn">
            Sign in
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <Logo />
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#access">Access</a>
          <Link to="/docs">API documentation</Link>
          <Link to="/register">Register</Link>
          <Link to="/login">Sign in</Link>
        </nav>
        <small>© {new Date().getFullYear()} AssessmentDesk</small>
      </footer>
    </div>
  );
}
