import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  Library,
  Wallet,
  ChartNoAxesCombined,
  Award,
  Settings,
  LogOut,
  ChevronDown,
  ArrowUpRight,
  Bell,
  Search,
  Menu,
  X,
  GraduationCap,
  ShieldCheck,
  ClipboardCheck,
  Building2,
  ArrowRight,
  Check,
  Mail,
  LockKeyhole,
} from "lucide-react";
import { api, setToken, message } from "./api";
import { Loading, useToast, Field, Submit } from "./ui";
import {
  Dashboard,
  Exams,
  Questions,
  People,
  Courses,
  Results,
  Payments,
  Grading,
  Certificates,
  SettingsPage,
  AccountPage,
  Platform,
  Reports,
} from "./pages";
import { ExamRoom, CertificateVerification } from "./exam";
import Monitoring from "./Monitoring";
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function Logo({ light = false }) {
  return (
    <div className={`logo ${light ? "light" : ""}`}>
      <span className="logo-mark">
        <GraduationCap size={24} />
      </span>
      <span>
        Assessment<span className="logo-weight">Desk</span>
        <small>THE ASSESSMENT WORKSPACE</small>
      </span>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false);
  const cache = useQueryClient();
  useEffect(() => {
    let live = true;
    api
      .post("/auth/refresh")
      .then((r) => {
        if (live) {
          setToken(r.data.token);
          setUser(r.data.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    const expired = () => {
      setUser(null);
      cache.clear();
    };
    window.addEventListener("session-expired", expired);
    return () => {
      live = false;
      window.removeEventListener("session-expired", expired);
    };
  }, [cache]);
  const login = (data) => {
    cache.clear();
    setToken(data.token);
    setUser(data.user);
  };
  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setToken("");
    setUser(null);
    cache.clear();
  };
  if (!ready) return <Loading />;
  return (
    <AuthContext.Provider value={{ user, login, logout, setUser }}>
      <Routes>
        <Route path="/verify/:code" element={<CertificateVerification />} />
        <Route path="/welcome" element={<Landing />} />
        <Route
          path="/login"
          element={user ? <Navigate to="/" /> : <AuthPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" /> : <AuthPage mode="register" />}
        />
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset" />} />
        <Route path="/verify-email" element={<AuthPage mode="verify" />} />
        <Route
          path="/attempt/:id"
          element={
            user?.role === "STUDENT" ? <ExamRoom /> : <Navigate to="/login" />
          }
        />
        <Route
          path="/*"
          element={user ? <Shell /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </AuthContext.Provider>
  );
}
function Landing() {
  return (
    <div className="landing">
      <header>
        <Logo />
        <Link className="btn" to="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="landing-content">
        <span className="pill">BUILT FOR BETTER LEARNING</span>
        <h1>
          Great assessments.
          <br />
          <em>Greater possibilities.</em>
        </h1>
        <p>
          Your institution’s entire assessment journey, in one thoughtful
          workspace. Create exams, reach your students, and turn results into
          progress.
        </p>
        <Link to="/register" className="btn primary">
          Create your workspace <ArrowRight size={18} />
        </Link>
        <div className="landing-features">
          <span>
            <Check /> Secure workspaces
          </span>
          <span>
            <Check /> Automatic grading
          </span>
          <span>
            <Check /> Paid examinations
          </span>
        </div>
      </div>
      <div className="landing-preview">
        <div className="preview-icon">
          <GraduationCap size={68} />
        </div>
        <h2>
          Less administration.
          <br />
          More achievement.
        </h2>
        <p>Built for institutions. Designed for people.</p>
      </div>
    </div>
  );
}
function AuthPage({ mode = "login" }) {
  const { login } = useAuth(),
    toast = useToast(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(""),
    [registration, setRegistration] = useState("institution");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      if (mode === "login") {
        login((await api.post("/auth/login", { email, password })).data);
        navigate("/");
      } else if (mode === "register") {
        const r = await api.post("/auth/register", {
          ...f,
          ...(registration === "student" ? { institutionName: undefined } : {}),
        });
        login(r.data);
        if (!r.data.emailSent)
          toast(
            "Workspace created. Email verification requires mail configuration.",
          );
        navigate("/");
      } else if (mode === "forgot") {
        const r = await api.post("/auth/forgot-password", f);
        setDone(r.data.message);
      } else if (mode === "reset") {
        await api.post("/auth/reset-password", {
          password: f.password,
          token: new URLSearchParams(location.search).get("token"),
        });
        setDone("Password updated. You can now sign in.");
      } else {
        await api.post("/auth/verify-email", {
          token: new URLSearchParams(location.search).get("token"),
        });
        setDone("Your email is verified.");
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const titles = {
    login: "Welcome back.",
    register: "Your next chapter starts here.",
    forgot: "Forgot your password?",
    reset: "Set a new password",
    verify: "Verify your email",
  };
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link to="/welcome">
          <Logo light />
        </Link>
        <div>
          <span className="pill">MAKE KNOWLEDGE COUNT</span>
          <h1>
            A better way
            <br />
            to assess.
            <br />
            <em>
              A clearer path
              <br />
              to progress.
            </em>
          </h1>
          <p>
            Everything your institution needs to create, deliver, and manage
            meaningful assessments.
          </p>
          <div className="story-line" />
          <div className="story-benefits">
            <span>
              <ShieldCheck /> Secure by design
            </span>
            <span>
              <ChartNoAxesCombined /> Insights that matter
            </span>
            <span>
              <GraduationCap /> Built for every learner
            </span>
          </div>
        </div>
        <small>© {new Date().getFullYear()} AssessmentDesk</small>
      </aside>
      <main className="auth-form-area">
        <Link to="/welcome" className="auth-mobile-logo">
          <Logo />
        </Link>
        <div className="auth-form">
          <span className="eyebrow">YOUR ASSESSMENT WORKSPACE</span>
          <h1>{titles[mode]}</h1>
          <p>
            {mode === "login"
              ? "Sign in to pick up where you left off."
              : mode === "register"
                ? "Bring your courses, people, and assessments together."
                : "Let’s get your account ready."}
          </p>
          {done ? (
            <div className="success-message">
              <Check />
              {done}
              <Link to="/login">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode === "register" && (
                <>
                  <div className="segmented">
                    <button
                      type="button"
                      className={
                        registration === "institution" ? "selected" : ""
                      }
                      onClick={() => setRegistration("institution")}
                    >
                      Institution
                    </button>
                    <button
                      type="button"
                      className={registration === "student" ? "selected" : ""}
                      onClick={() => setRegistration("student")}
                    >
                      Student
                    </button>
                  </div>
                  <Field label="Your full name">
                    <input name="name" required autoComplete="name" />
                  </Field>
                  {registration === "institution" && (
                    <Field label="Institution name">
                      <input name="institutionName" required />
                    </Field>
                  )}
                  <Field
                    label={
                      registration === "institution"
                        ? "Workspace slug"
                        : "Institution workspace slug"
                    }
                    hint="Lowercase letters, numbers, and hyphens. At least 3 characters."
                  >
                    <input
                      name="slug"
                      pattern="[a-z0-9-]{3,60}"
                      required
                      placeholder="greenfield"
                    />
                  </Field>
                </>
              )}
              {["login", "register", "forgot"].includes(mode) && (
                <Field label="Email address">
                  <div className="input-icon">
                    <Mail size={17} />
                    <input
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@institution.com"
                      autoComplete="email"
                    />
                  </div>
                </Field>
              )}
              {["login", "register", "reset"].includes(mode) && (
                <Field label="Password">
                  <div className="input-icon">
                    <LockKeyhole size={17} />
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={mode === "login" ? 1 : 10}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "login"
                          ? "Enter your password"
                          : "At least 10 characters"
                      }
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                  </div>
                </Field>
              )}
              {mode === "login" && (
                <div className="auth-options">
                  <span>Good to have you here.</span>
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <Submit pending={busy}>
                {mode === "login" ? (
                  <>
                    Sign in <ArrowRight size={18} />
                  </>
                ) : mode === "register" ? (
                  "Create account"
                ) : mode === "verify" ? (
                  "Verify email"
                ) : (
                  "Continue"
                )}
              </Submit>
            </form>
          )}
          {mode === "login" && (
            <>
              <p className="auth-switch">
                New to AssessmentDesk?{" "}
                <Link to="/register">Create a workspace</Link>
              </p>
              <div className="demo-box">
                <span>EXPLORE THE DEMO</span>
                <p>Choose a role to fill in the demo credentials.</p>
                <div>
                  {[
                    ["Admin", "admin"],
                    ["Examiner", "examiner"],
                    ["Student", "student"],
                    ["Owner", "owner"],
                  ].map(([name, id]) => (
                    <button
                      key={id}
                      onClick={() => {
                        setEmail(`${id}@assessmentdesk.demo`);
                        setPassword("Assessment123!");
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {mode === "register" && (
            <p className="auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          )}
          <div className="auth-footer">
            <ShieldCheck size={14} /> Your institution. Your data. Securely
            connected.
          </div>
        </div>
      </main>
    </div>
  );
}
const navItems = [
  {
    label: "Exam monitoring",
    path: "/monitoring",
    icon: ShieldCheck,
    roles: ["INSTITUTION_ADMIN", "EXAMINER"],
  },
  {
    label: "Overview",
    path: "/",
    icon: LayoutDashboard,
    roles: ["INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
  {
    label: "Examinations",
    path: "/exams",
    icon: FileText,
    roles: ["INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
  {
    label: "Question bank",
    path: "/questions",
    icon: Library,
    roles: ["INSTITUTION_ADMIN", "EXAMINER"],
  },
  {
    label: "Courses",
    path: "/courses",
    icon: BookOpen,
    roles: ["INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
  {
    label: "Students",
    path: "/students",
    icon: Users,
    roles: ["INSTITUTION_ADMIN"],
  },
  {
    label: "Team members",
    path: "/staff",
    icon: GraduationCap,
    roles: ["INSTITUTION_ADMIN"],
  },
  {
    label: "Results & grading",
    path: "/results",
    icon: ClipboardCheck,
    roles: ["INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
  {
    label: "Manual grading",
    path: "/grading",
    icon: FileText,
    roles: ["INSTITUTION_ADMIN", "EXAMINER"],
  },
  {
    label: "Payments",
    path: "/payments",
    icon: Wallet,
    roles: ["INSTITUTION_ADMIN", "STUDENT"],
  },
  {
    label: "Certificates",
    path: "/certificates",
    icon: Award,
    roles: ["INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
  {
    label: "Reports & insights",
    path: "/reports",
    icon: ChartNoAxesCombined,
    roles: ["INSTITUTION_ADMIN", "EXAMINER"],
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
    roles: ["INSTITUTION_ADMIN"],
  },
  {
    label: "Platform overview",
    path: "/",
    icon: Building2,
    roles: ["SUPER_ADMIN"],
  },
  {
    label: "My account",
    path: "/account",
    icon: LockKeyhole,
    roles: ["SUPER_ADMIN", "INSTITUTION_ADMIN", "EXAMINER", "STUDENT"],
  },
];
function Shell() {
  const { user, logout } = useAuth(),
    location = useLocation(),
    navigate = useNavigate();
  const [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [globalSearch, setGlobalSearch] = useState("");
  const links = navItems.filter((i) => i.roles.includes(user.role));
  const current = links.find((i) => i.path === location.pathname);
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  const components = {
    "/": user.role === "SUPER_ADMIN" ? <Platform /> : <Dashboard />,
    "/exams": <Exams />,
    "/questions": <Questions />,
    "/courses": <Courses />,
    "/students": <People />,
    "/staff": <People staff />,
    "/results": <Results />,
    "/grading": <Grading />,
    "/payments": <Payments />,
    "/certificates": <Certificates />,
    "/reports": <Reports />,
    "/settings": <SettingsPage />,
    "/account": <AccountPage />,
    "/monitoring": <Monitoring />,
  };
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-shade" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to="/">
          <Logo />
        </Link>
        <div className="workspace-switch">
          <div className="institution-avatar">
            {user.institution?.name?.slice(0, 1) || "A"}
          </div>
          <div>
            <strong>{user.institution?.name || "AssessmentDesk"}</strong>
            <small>
              {user.role === "SUPER_ADMIN"
                ? "Platform workspace"
                : "Institution workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {links
            .filter((i) => i.path !== "/settings")
            .map(({ path, label, icon: Icon }) => (
              <NavLink end={path === "/"} key={path} to={path}>
                <Icon size={18} />
                <span>{label}</span>
                {path === "/exams" && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <BookOpen size={18} />
            </span>
            <strong>A little guidance?</strong>
            <p>Explore the workspace guide and get ready for your next exam.</p>
            <button onClick={() => navigate("/courses")}>
              Explore courses <ArrowUpRight size={14} />
            </button>
          </div>
          {user.role === "INSTITUTION_ADMIN" && (
            <NavLink className="settings-link" to="/settings">
              <Settings size={18} /> Settings
            </NavLink>
          )}
          <button className="profile" onClick={logout} title="Sign out">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role.replaceAll("_", " ").toLowerCase()}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{current?.label || "Page not found"}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="top-search"
              onSubmit={(e) => {
                e.preventDefault();
                if (globalSearch.trim()) {
                  navigate(`/exams?search=${encodeURIComponent(globalSearch)}`);
                  setGlobalSearch("");
                }
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search examinations"
                placeholder="Search examinations…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <button
              className="notification-btn"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
            </button>
            <span className="topbar-divider" />
            <Link
              to="/account"
              aria-label="My account"
              className="avatar small"
            >
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </Link>
          </div>
          {notifications && (
            <div className="notification-panel">
              <strong>You’re all caught up</strong>
              <p>
                Exam results and payment updates are available in their
                workspace sections.
              </p>
              <button
                className="text-btn"
                onClick={() => setNotifications(false)}
              >
                Dismiss
              </button>
            </div>
          )}
        </header>
        <main className="page-content">
          {current ? (
            components[location.pathname]
          ) : (
            <div className="empty">
              <h1>Page not found</h1>
              <Link className="btn" to="/">
                Back to overview
              </Link>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} AssessmentDesk</span>
          <span>
            <span className="status-dot" /> Your assessment workspace
          </span>
        </footer>
      </div>
    </div>
  );
}
