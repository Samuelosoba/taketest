import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Users,
  FileText,
  Wallet,
  TrendingUp,
  CalendarDays,
  ChevronDown,
  Download,
  MoreHorizontal,
  Clock,
  BookOpen,
  Search,
  SlidersHorizontal,
  Check,
  Library,
  GraduationCap,
  CheckCircle2,
  Play,
  LockKeyhole,
  Pencil,
  Trash2,
  Award,
  ShieldCheck,
  ExternalLink,
  Activity,
  Copy,
} from "lucide-react";
import { api, get, money, date, message, downloadCSV } from "./api";
import { useAuth } from "./App";
import CameraMonitor from "./CameraMonitor";
import {
  Badge,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeading,
  Submit,
  useToast,
} from "./ui";

export function Results() {
  const q = useData("/results"),
    { user } = useAuth(),
    save = useSave();
  return (
    <>
      <PageHeading
        eyebrow="RESULTS & GRADING"
        title="See the progress behind the numbers."
        description="Review outcomes, release results, and celebrate achievement."
      >
        {user.role !== "STUDENT" && (
          <Link className="btn" to="/grading">
            Manual grading <ArrowRight size={16} />
          </Link>
        )}
      </PageHeading>
      <Gate query={q}>
        {(rows) => (
          <DataTable
            rows={rows}
            searchPlaceholder="Search student or examination…"
            actions={
              <button
                className="btn"
                onClick={() =>
                  downloadCSV(
                    "assessment-results.csv",
                    rows.map((r) => ({
                      student: r.attempt.student.name,
                      exam: r.attempt.exam.title,
                      marks: r.obtainedMarks,
                      total: r.totalMarks,
                      percentage: r.percentage,
                      grade: r.grade,
                      status: r.status,
                      released: r.released,
                    })),
                  )
                }
              >
                <Download size={15} /> Export results
              </button>
            }
            columns={[
              {
                label: "Student / Examination",
                render: (r) => (
                  <div className="question-cell">
                    <strong>{r.attempt.student.name}</strong>
                    <small>{r.attempt.exam.title}</small>
                  </div>
                ),
              },
              {
                label: "Score",
                render: (r) => (
                  <div className="score-cell">
                    <strong>
                      {r.obtainedMarks} / {r.totalMarks}
                    </strong>
                    <div className="progress-track">
                      <span style={{ width: `${r.percentage}%` }} />
                    </div>
                  </div>
                ),
              },
              {
                label: "Grade",
                render: (r) => (
                  <strong>
                    {r.grade} <span className="muted">({r.percentage}%)</span>
                  </strong>
                ),
              },
              {
                label: "Outcome",
                render: (r) => (
                  <Badge
                    value={
                      r.status === "UNDER_REVIEW"
                        ? "UNDER_REVIEW"
                        : r.passed
                          ? "PASSED"
                          : "FAILED"
                    }
                  />
                ),
              },
              {
                label: "Visibility",
                render: (r) => (
                  <Badge value={r.released ? "RELEASED" : "HELD"} />
                ),
              },
              {
                label: "Actions",
                render: (r) => (
                  <div className="row-actions">
                    {!r.released &&
                      r.status === "GRADED" &&
                      user.role !== "STUDENT" && (
                        <button
                          className="text-btn"
                          disabled={save.busy}
                          onClick={() =>
                            save.run(
                              () => api.post(`/results/${r.id}/release`),
                              "Result released",
                            )
                          }
                        >
                          Release
                        </button>
                      )}
                    {r.passed &&
                      r.released &&
                      (r.certificate ? (
                        <Link className="text-btn" to="/certificates">
                          Certificate <Award size={15} />
                        </Link>
                      ) : (
                        <button
                          className="text-btn"
                          disabled={save.busy}
                          onClick={() =>
                            save.run(
                              () => api.post(`/certificates/${r.id}`),
                              "Certificate issued",
                            )
                          }
                        >
                          Issue certificate
                        </button>
                      ))}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Gate>
    </>
  );
}
export function Grading() {
  const q = useData("/grading"),
    [selected, setSelected] = useState(null),
    save = useSave();
  return (
    <>
      <PageHeading
        eyebrow="MANUAL GRADING"
        title="Give thoughtful answers their due."
        description="Review subjective responses and add meaningful feedback."
      />
      <Gate query={q}>
        {(rows) => (
          <DataTable
            rows={rows}
            searchPlaceholder="Search the grading queue…"
            columns={[
              {
                label: "Student",
                render: (r) => <strong>{r.attempt.student.name}</strong>,
              },
              { label: "Examination", render: (r) => r.attempt.exam.title },
              {
                label: "Submitted",
                render: (r) => date(r.attempt.submittedAt),
              },
              {
                label: "Review signals",
                render: (r) => `${r.attempt.violations.length} recorded events`,
              },
              { label: "Status", render: (r) => <Badge value={r.status} /> },
              {
                label: "Action",
                render: (r) => (
                  <button
                    className="btn small-btn"
                    onClick={() => setSelected(r)}
                  >
                    Review answers <ArrowRight size={14} />
                  </button>
                ),
              },
            ]}
            emptyTitle="Your grading queue is clear"
          />
        )}
      </Gate>
      {selected && (
        <Modal
          title={`Review · ${selected.attempt.student.name}`}
          onClose={() => setSelected(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const grades = selected.attempt.snapshot.questions
                .filter((q) => q.type === "ESSAY")
                .map((q) => ({
                  questionId: q.id,
                  awarded: Number(f.get(`mark-${q.id}`)),
                  comment: f.get(`comment-${q.id}`),
                }));
              if (
                await save.run(
                  () => api.post(`/grading/${selected.id}`, { grades }),
                  "Grading saved",
                )
              )
                setSelected(null);
            }}
          >
            <p className="muted">{selected.attempt.exam.title}</p>
            {selected.attempt.snapshot.questions
              .filter((q) => q.type === "ESSAY")
              .map((q) => (
                <section className="grading-question" key={q.id}>
                  <h3>{q.text}</h3>
                  <div className="student-response">
                    {selected.attempt.answers[q.id] || "No response submitted."}
                  </div>
                  <Field label={`Awarded marks (maximum ${q.marks})`}>
                    <input
                      type="number"
                      name={`mark-${q.id}`}
                      required
                      min={0}
                      max={q.marks}
                      step="0.5"
                      defaultValue={
                        selected.breakdown.find((b) => b.questionId === q.id)
                          ?.awarded ?? ""
                      }
                    />
                  </Field>
                  <Field label="Feedback">
                    <textarea
                      name={`comment-${q.id}`}
                      defaultValue={
                        selected.breakdown.find((b) => b.questionId === q.id)
                          ?.comment
                      }
                    />
                  </Field>
                </section>
              ))}
            <div className="form-actions">
              <Submit pending={save.busy}>Save grading</Submit>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Payments() {
  const q = useData("/payments"),
    save = useSave(),
    [params, setParams] = useSearchParams();
  const reference = params.get("reference");
  return (
    <>
      <PageHeading
        eyebrow="PAYMENTS"
        title="Every transaction, accounted for."
        description="Track verified examination payments and access."
      />
      {reference && (
        <div className="payment-return">
          <div>
            <strong>Back from checkout?</strong>
            <p>
              Confirm the transaction with Paystack to update your exam access.
            </p>
          </div>
          <button
            className="btn primary"
            disabled={save.busy}
            onClick={async () => {
              if (
                await save.run(
                  () => api.post("/payments/verify", { reference }),
                  "Payment verified. Your exam is unlocked.",
                )
              )
                setParams({});
            }}
          >
            Verify payment
          </button>
        </div>
      )}
      <Gate query={q}>
        {(rows) => (
          <>
            <div className="stats-grid three">
              <Stat
                label="Verified payments"
                value={money(
                  rows
                    .filter((r) => r.status === "SUCCESS")
                    .reduce((s, r) => s + r.amount, 0),
                )}
                icon={Wallet}
                caption="Successfully confirmed by Paystack"
              />
              <Stat
                label="Successful transactions"
                value={rows.filter((r) => r.status === "SUCCESS").length}
                icon={CheckCircle2}
                index={1}
                caption="Examination access granted"
              />
              <Stat
                label="Pending transactions"
                value={rows.filter((r) => r.status === "PENDING").length}
                icon={Clock}
                index={3}
                caption="Awaiting provider confirmation"
              />
            </div>
            <DataTable
              rows={rows}
              searchPlaceholder="Search payments…"
              columns={[
                {
                  label: "Student",
                  render: (p) => (
                    <div className="question-cell">
                      <strong>{p.student.name}</strong>
                      <small>{p.student.email}</small>
                    </div>
                  ),
                },
                { label: "Examination", render: (p) => p.exam.title },
                {
                  label: "Amount",
                  render: (p) => <strong>{money(p.amount)}</strong>,
                },
                { label: "Status", render: (p) => <Badge value={p.status} /> },
                { label: "Date", render: (p) => date(p.createdAt) },
                {
                  label: "Reference",
                  render: (p) => (
                    <span className="reference" title={p.reference}>
                      {p.reference.slice(0, 16)}…
                    </span>
                  ),
                },
              ]}
            />
          </>
        )}
      </Gate>
    </>
  );
}
export function Certificates() {
  const q = useData("/certificates"),
    save = useSave();
  const download = async (c) =>
    save.run(async () => {
      const r = await api.get(`/certificates/${c.id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data),
        a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${c.code}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Certificate downloaded");
  return (
    <>
      <PageHeading
        eyebrow="CERTIFICATES"
        title="Achievement deserves recognition."
        description="Verifiable certificates for meaningful milestones."
      >
        <Link className="btn" to="/results">
          View eligible results <ArrowRight size={16} />
        </Link>
      </PageHeading>
      <Gate query={q}>
        {(rows) =>
          rows.length ? (
            <div className="certificate-grid">
              {rows.map((c) => (
                <article className="panel certificate-card" key={c.id}>
                  <div className="certificate-preview">
                    <div className="certificate-border">
                      <GraduationCap size={27} />
                      <small>CERTIFICATE OF ACHIEVEMENT</small>
                      <h3>{c.result.attempt.student.name}</h3>
                      <p>{c.result.attempt.exam.title}</p>
                      <Award size={33} />
                    </div>
                  </div>
                  <div className="course-body">
                    <strong>{c.result.attempt.exam.title}</strong>
                    <p>
                      Issued {date(c.createdAt)} · {c.result.percentage}%
                    </p>
                    <footer>
                      <Link to={`/verify/${c.code}`} className="text-btn">
                        Verify <ExternalLink size={14} />
                      </Link>
                      <button
                        className="btn small-btn"
                        disabled={save.busy}
                        onClick={() => download(c)}
                      >
                        <Download size={14} /> Download PDF
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Your achievements belong here"
              description="Issue a certificate from a released, passing result to get started."
              action={
                <Link className="btn primary" to="/results">
                  View results <ArrowRight size={16} />
                </Link>
              }
            />
          )
        }
      </Gate>
    </>
  );
}
export function SettingsPage() {
  const q = useData("/settings"),
    save = useSave(),
    { setUser } = useAuth();
  return (
    <>
      <PageHeading
        eyebrow="SETTINGS"
        title="Make this workspace yours."
        description="Manage institution details and your grading standards."
      />
      <Gate query={q}>
        {(s) => (
          <div className="settings-layout">
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <h2>Institution profile</h2>
                  <p>The details that bring your workspace together.</p>
                </div>
                <ShieldCheck size={22} />
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  let bands;
                  try {
                    bands = JSON.parse(f.bands);
                  } catch {
                    await save.run(() =>
                      Promise.reject(
                        new Error("Grading bands must be valid JSON."),
                      ),
                    );
                    return;
                  }
                  const result = await save.run(() =>
                    api.patch("/settings", {
                      name: f.name,
                      email: f.email,
                      phone: f.phone,
                      address: f.address,
                      website: f.website,
                      description: f.description,
                      settings: { gradingBands: bands },
                    }),
                  );
                  if (result)
                    setUser((u) => ({ ...u, institution: result.data }));
                }}
              >
                <div className="form-grid">
                  <Field label="Institution name">
                    <input name="name" required defaultValue={s.name} />
                  </Field>
                  <Field label="Contact email">
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={s.email}
                    />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" defaultValue={s.phone} />
                  </Field>
                  <Field label="Website">
                    <input name="website" type="url" defaultValue={s.website} />
                  </Field>
                </div>
                <Field label="Address">
                  <input name="address" defaultValue={s.address} />
                </Field>
                <Field label="About your institution">
                  <textarea name="description" defaultValue={s.description} />
                </Field>
                <Field
                  label="Grading bands"
                  hint="Each band has a minimum percentage and grade. Include a band starting at 0. New attempts use these settings."
                >
                  <textarea
                    className="code-input"
                    name="bands"
                    rows={8}
                    defaultValue={JSON.stringify(
                      s.settings.gradingBands,
                      null,
                      2,
                    )}
                  />
                </Field>
                <div className="form-actions">
                  <Submit pending={save.busy} />
                </div>
              </form>
            </section>
            <aside>
              <section className="panel workspace-details">
                <span className="eyebrow">WORKSPACE DETAILS</span>
                <h3>{s.name}</h3>
                <Badge value={s.status} />
                <p>Invite students to register with your workspace slug:</p>
                <code>{s.slug}</code>
                <p>Member since {date(s.createdAt)}</p>
              </section>
              <PasswordForm />
            </aside>
          </div>
        )}
      </Gate>
    </>
  );
}
export function AccountPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeading
        eyebrow="MY ACCOUNT"
        title="A little care for your account."
        description="Keep your sign-in details secure."
      />
      <div className="settings-layout">
        <section className="panel workspace-details">
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge value={user.role} />
          <p>{user.institution?.name || "Platform workspace"}</p>
          <p>
            Email verification:{" "}
            {user.emailVerified ? "Verified" : "Not verified"}
          </p>
        </section>
        <PasswordForm />
      </div>
    </>
  );
}
function PasswordForm() {
  const save = useSave();
  return (
    <section className="panel workspace-details">
      <h3>Change your password</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (
            await save.run(
              () =>
                api.post(
                  "/auth/change-password",
                  Object.fromEntries(new FormData(form)),
                ),
              "Password changed",
            )
          )
            form.reset();
        }}
      >
        <Field label="Current password">
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password">
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
          />
        </Field>
        <Submit pending={save.busy}>Update password</Submit>
      </form>
    </section>
  );
}
export function Reports() {
  const q = useData("/dashboard");
  return (
    <>
      <PageHeading
        eyebrow="REPORTS & INSIGHTS"
        title="Turn outcomes into understanding."
        description="A clear view of your institution’s assessment activity."
      />
      <Gate query={q}>
        {(d) => (
          <>
            <div className="stats-grid">
              <Stat
                label="Total attempts"
                value={d.attemptCount}
                icon={FileText}
                caption="Across your institution"
              />
              <Stat
                label="Overall pass rate"
                value={`${d.passRate}%`}
                icon={TrendingUp}
                index={1}
                caption="Fully graded results"
              />
              <Stat
                label="Awaiting review"
                value={d.pendingGrading}
                icon={Clock}
                index={2}
                caption="Subjective answers to grade"
              />
              <Stat
                label="Active courses"
                value={d.courses}
                icon={BookOpen}
                index={3}
                caption="Learning spaces in your workspace"
              />
            </div>
            <section className="panel report-panel">
              <h2>Assessment activity · Last seven days</h2>
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <AreaChart
                    data={d.chart}
                    margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area dataKey="attempts" stroke="#246b54" fill="#e0eee6" />
                    <Area
                      dataKey="completed"
                      stroke="#a5bcb0"
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <button
                className="btn"
                onClick={() => downloadCSV("weekly-activity.csv", d.chart)}
              >
                <Download size={16} /> Export activity
              </button>
            </section>
            <div className="info-box">
              These reports use saved attempts and fully graded results.{" "}
              <Link to="/results">Open results</Link> to export individual
              student outcomes.
            </div>
          </>
        )}
      </Gate>
    </>
  );
}
export function Platform() {
  const q = useData("/platform"),
    save = useSave(),
    [subscription, setSubscription] = useState(null);
  return (
    <>
      <PageHeading
        eyebrow="PLATFORM OPERATIONS"
        title="The bigger picture, made clear."
        description="Manage institutions and keep your assessment community moving."
      />
      <Gate query={q}>
        {(d) => (
          <>
            <div className="stats-grid">
              <Stat
                label="Institutions"
                value={d.institutions.length}
                icon={GraduationCap}
                caption="Across the platform"
              />
              <Stat
                label="Active workspaces"
                value={
                  d.institutions.filter((i) => i.status === "ACTIVE").length
                }
                icon={CheckCircle2}
                index={1}
                caption="Ready to deliver assessments"
              />
              <Stat
                label="Platform users"
                value={d.users}
                icon={Users}
                index={2}
                caption="All roles and institutions"
              />
              <Stat
                label="Exam revenue"
                value={money(d.revenue)}
                icon={Wallet}
                index={3}
                caption="Verified payments across tenants"
              />
            </div>
            <DataTable
              rows={d.institutions}
              searchPlaceholder="Search institutions…"
              columns={[
                {
                  label: "Institution",
                  render: (i) => (
                    <div className="question-cell">
                      <strong>{i.name}</strong>
                      <small>
                        {i.slug} · {i.email}
                      </small>
                    </div>
                  ),
                },
                { label: "Users", render: (i) => i._count.users },
                { label: "Exams", render: (i) => i._count.exams },
                {
                  label: "Subscription",
                  render: (i) => (
                    <button
                      className="text-btn"
                      onClick={() => setSubscription(i)}
                    >
                      {i.subscriptions.at(-1)?.plan || "No plan"}{" "}
                      <Pencil size={13} />
                    </button>
                  ),
                },
                { label: "Status", render: (i) => <Badge value={i.status} /> },
                {
                  label: "Manage status",
                  render: (i) => (
                    <select
                      aria-label={`Status of ${i.name}`}
                      value={i.status}
                      disabled={save.busy}
                      onChange={(e) => {
                        const status = e.target.value;
                        if (
                          status !== "SUSPENDED" ||
                          window.confirm(`Suspend access for ${i.name}?`)
                        )
                          save.run(
                            () =>
                              api.patch(`/platform/institutions/${i.id}`, {
                                status,
                              }),
                            "Institution status updated",
                          );
                      }}
                    >
                      <option>ACTIVE</option>
                      <option>PENDING</option>
                      <option>SUSPENDED</option>
                    </select>
                  ),
                },
              ]}
            />
            <h2 className="section-heading">Audit activity</h2>
            <DataTable
              rows={d.audit}
              columns={[
                {
                  label: "Action",
                  render: (a) => a.action.replaceAll("_", " "),
                },
                {
                  label: "Record",
                  render: (a) => <code>{a.targetId.slice(0, 24)}</code>,
                },
                {
                  label: "Time",
                  render: (a) => new Date(a.createdAt).toLocaleString(),
                },
              ]}
            />
          </>
        )}
      </Gate>
      {subscription && (
        <Modal
          title={`Subscription · ${subscription.name}`}
          onClose={() => setSubscription(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              if (
                await save.run(
                  () =>
                    api.post("/platform/subscriptions", {
                      ...f,
                      institutionId: subscription.id,
                      endsAt: new Date(f.endsAt).toISOString(),
                    }),
                  "Subscription record saved",
                )
              )
                setSubscription(null);
            }}
          >
            <div className="info-box">
              This records an institution plan. Automated subscription billing
              is not connected.
            </div>
            <Field label="Plan">
              <select name="plan">
                <option>STARTER</option>
                <option>GROWTH</option>
                <option>ENTERPRISE</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status">
                <option>TRIAL</option>
                <option>ACTIVE</option>
                <option>EXPIRED</option>
                <option>CANCELLED</option>
              </select>
            </Field>
            <Field label="End date">
              <input name="endsAt" type="date" required />
            </Field>
            <Submit pending={save.busy} />
          </form>
        </Modal>
      )}
    </>
  );
}
const useData = (path) =>
  useQuery({ queryKey: [path], queryFn: () => get(path) });
function Gate({ query, children }) {
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <ErrorState error={query.error} retry={query.refetch} />;
  return children(query.data);
}
function useSave() {
  const [busy, setBusy] = useState(false);
  const toast = useToast(),
    cache = useQueryClient();
  return {
    busy,
    run: async (fn, success = "Changes saved") => {
      setBusy(true);
      try {
        const result = await fn();
        await cache.invalidateQueries();
        toast(success);
        return result || true;
      } catch (e) {
        toast(message(e), true);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
const iconColors = ["green", "blue", "purple", "orange"];
function Stat({ label, value, icon: Icon, caption, index = 0 }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${iconColors[index]}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="stat-caption">
        <span className="mini-dot" />
        {caption}
      </div>
    </div>
  );
}
function ExamIcon({ index = 0 }) {
  return (
    <span className={`exam-icon ${iconColors[index % 4]}`}>
      <FileText size={21} />
    </span>
  );
}
export function Dashboard() {
  const q = useData("/dashboard"),
    { user } = useAuth();
  const student = user.role === "STUDENT";
  return (
    <Gate query={q}>
      {(d) => (
        <>
          <PageHeading
            eyebrow="A LITTLE CLARITY. A LOT OF POSSIBILITY."
            title={`Welcome back, ${user.name.split(" ")[0]} 👋`}
            description={
              student
                ? "Your next achievement starts with a little preparation."
                : "Here’s what’s happening across your institution today."
            }
          >
            <span className="date-pill">
              <CalendarDays size={16} />
              {date(new Date())}
            </span>
            {!student && (
              <Link className="btn primary" to="/exams?create=1">
                <Plus size={17} /> Create examination
              </Link>
            )}
          </PageHeading>
          <section className="welcome-banner">
            <div>
              <span className="banner-tag">
                <span /> YOUR WORKSPACE, CONNECTED
              </span>
              <h2>
                {student
                  ? "Big ambitions. One question at a time."
                  : "Better assessments. Brighter futures."}
              </h2>
              <p>
                {student
                  ? "Find your next assessment, keep track of your progress, and make your knowledge count."
                  : "From the first question to the final result, bring every part of your assessment journey together."}
              </p>
              <Link to={student ? "/exams" : "/questions"}>
                {student
                  ? "Explore available exams"
                  : "Explore your question bank"}{" "}
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="art-card back">
                <div />
                <div />
                <div />
              </div>
              <div className="art-card front">
                <span className="art-icon">
                  <GraduationCap size={29} />
                </span>
                <div className="art-line" />
                <div className="art-line short" />
                <div className="art-check">
                  <Check size={13} /> Ready for what’s next
                </div>
              </div>
              <span className="floating-star">✦</span>
              <span className="floating-check">
                <Check size={20} />
              </span>
            </div>
          </section>
          <div className="stats-grid">
            <Stat
              label={student ? "Available exams" : "Total students"}
              value={student ? d.published : d.students.toLocaleString()}
              icon={student ? FileText : Users}
              caption={
                student
                  ? "Published and ready to explore"
                  : "Active learners in your workspace"
              }
            />
            <Stat
              label={student ? "My attempts" : "Published examinations"}
              value={student ? d.attemptCount : d.published}
              icon={FileText}
              caption={
                student
                  ? "Your assessment journey"
                  : `${d.examCount} examinations in total`
              }
              index={1}
            />
            <Stat
              label={student ? "My exam payments" : "Examination revenue"}
              value={money(d.revenue)}
              icon={Wallet}
              caption="Verified payments only"
              index={2}
            />
            <Stat
              label="Pass rate"
              value={`${d.passRate}%`}
              icon={TrendingUp}
              caption={
                student
                  ? "Across your released results"
                  : "Across all completed results"
              }
              index={3}
            />
          </div>
          <div className="dashboard-charts">
            <section className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Assessment activity</h2>
                  <p>A little progress, every day.</p>
                </div>
                <span className="subtle-pill">
                  Last 7 days <ChevronDown size={13} />
                </span>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot green-dot" /> Attempts started
                </span>
                <span>
                  <i className="legend-dot pale-dot" /> Completed
                </span>
              </div>
              <div className="area-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={d.chart}
                    margin={{ top: 15, right: 20, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="activityGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#38876d"
                          stopOpacity={0.17}
                        />
                        <stop
                          offset="100%"
                          stopColor="#38876d"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 5"
                      vertical={false}
                      stroke="#e9edea"
                    />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#87908a", fontSize: 11 }}
                      dy={9}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#87908a", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e1e9e4",
                        borderRadius: 10,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="attempts"
                      stroke="#29785e"
                      strokeWidth={2.5}
                      fill="url(#activityGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      stroke="#9fc2b2"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel performance-panel">
              <div className="panel-heading">
                <div>
                  <h2>Results at a glance</h2>
                  <p>Every outcome is a step forward.</p>
                </div>
                <TrendingUp size={18} color="#86928a" />
              </div>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={
                        d.distribution.some((x) => x.value)
                          ? d.distribution
                          : [{ name: "No results", value: 1 }]
                      }
                      dataKey="value"
                      innerRadius={65}
                      outerRadius={84}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {["#24765b", "#d7e8dc", "#e7cfa8"].map((c) => (
                        <Cell key={c} fill={c} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>
                    {d.passRate}
                    <small>%</small>
                  </strong>
                  <span>Overall pass rate</span>
                </div>
              </div>
              <div className="distribution">
                {d.distribution.map((v, i) => (
                  <div key={v.name}>
                    <span>
                      <i
                        style={{
                          background: ["#24765b", "#d7e8dc", "#e7cfa8"][i],
                        }}
                      />
                      {v.name}
                    </span>
                    <strong>{v.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="panel recent-exams">
            <div className="panel-heading">
              <div>
                <h2>
                  {student ? "Ready when you are" : "Recent examinations"}
                </h2>
                <p>
                  {student
                    ? "Find your next opportunity to shine."
                    : "Your assessments, all in one place."}
                </p>
              </div>
              <Link className="text-btn" to="/exams">
                View all examinations <ArrowRight size={15} />
              </Link>
            </div>
            {d.exams.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Examination</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Questions</th>
                      <th>{student ? "Fee" : "Attempts"}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.exams.slice(0, 4).map((e, i) => (
                      <tr key={e.id}>
                        <td>
                          <div className="cell-title">
                            <ExamIcon index={i} />
                            <div>
                              <strong>{e.title}</strong>
                              <small>{e.course.title}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge value={e.status} />
                        </td>
                        <td>
                          <span className="inline-icon">
                            <Clock size={14} />
                            {e.duration} mins
                          </span>
                        </td>
                        <td>{e._count.questions} questions</td>
                        <td>
                          {student
                            ? e.price
                              ? money(e.price)
                              : "Free"
                            : e._count.attempts}
                        </td>
                        <td>
                          <Link
                            className="icon-btn"
                            aria-label={`View ${e.title}`}
                            to={`/exams?search=${encodeURIComponent(e.title)}`}
                          >
                            <ArrowUpRight size={18} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Your first exam starts here"
                description="Create a course, add some questions, and bring your assessment to life."
              />
            )}
          </section>
          <div className="bottom-panels">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent attempts</h2>
                  <p>The latest steps in your learning community.</p>
                </div>
                <Activity size={18} color="#8d968f" />
              </div>
              <div className="activity-list">
                {d.recentAttempts.length ? (
                  d.recentAttempts.slice(0, 3).map((a) => (
                    <div key={a.id}>
                      <span className="avatar soft">
                        {a.student.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <strong>{a.student.name}</strong>
                        <p>{a.exam.title}</p>
                      </div>
                      <Badge value={a.status} />
                    </div>
                  ))
                ) : (
                  <p className="muted">Exam attempts will appear here.</p>
                )}
              </div>
            </section>
            <section className="next-step">
              <span className="eyebrow">A GOOD NEXT STEP</span>
              <h2>
                {student
                  ? "Make your progress official."
                  : "Give every question a purpose."}
              </h2>
              <p>
                {student
                  ? "View your results and download certificates for your achievements."
                  : "Build a reusable question bank and spend more time on what matters: your learners."}
              </p>
              <Link className="btn" to={student ? "/results" : "/questions"}>
                {student ? "View my results" : "Open question bank"}{" "}
                <ArrowUpRight size={16} />
              </Link>
            </section>
          </div>
        </>
      )}
    </Gate>
  );
}
export function Courses() {
  const q = useData("/courses"),
    { user } = useAuth(),
    [edit, setEdit] = useState(null);
  const canEdit = user.role !== "STUDENT";
  return (
    <>
      <PageHeading
        title="A place for every subject."
        eyebrow="COURSES"
        description="Organize learning. Give your assessments a home."
      >
        {canEdit && (
          <button className="btn primary" onClick={() => setEdit({})}>
            <Plus size={17} /> Create course
          </button>
        )}
      </PageHeading>
      <Gate query={q}>
        {(rows) =>
          rows.length ? (
            <div className="course-grid">
              {rows.map((c, i) => (
                <article className="panel course-card" key={c.id}>
                  <div className={`course-art ${iconColors[i % 4]}`}>
                    <BookOpen size={38} />
                    <span>{c.code}</span>
                  </div>
                  <div className="course-body">
                    <Badge value={c.status} />
                    <h2>{c.title}</h2>
                    <p>{c.description || "A new opportunity to learn."}</p>
                    <footer>
                      <span>
                        <FileText size={15} />
                        {c._count.exams} examinations
                      </span>
                      {canEdit ? (
                        <button className="text-btn" onClick={() => setEdit(c)}>
                          Edit course <Pencil size={14} />
                        </button>
                      ) : (
                        <Link to="/exams" className="text-btn">
                          Explore <ArrowRight size={14} />
                        </Link>
                      )}
                    </footer>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Make room for learning"
              description="Create your first course to organize examinations."
            />
          )
        }
      </Gate>
      {edit && <CourseForm course={edit} close={() => setEdit(null)} />}
    </>
  );
}
function CourseForm({ course, close }) {
  const save = useSave();
  return (
    <Modal
      title={course.id ? "Edit course" : "Create a course"}
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          if (
            await save.run(() =>
              course.id
                ? api.patch(`/courses/${course.id}`, data)
                : api.post("/courses", data),
            )
          )
            close();
        }}
      >
        <Field label="Course title">
          <input name="title" required defaultValue={course.title} />
        </Field>
        <Field label="Course code">
          <input
            name="code"
            required
            defaultValue={course.code}
            placeholder="e.g. MTH 101"
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            defaultValue={course.description}
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={course.status || "PUBLISHED"}>
            <option>DRAFT</option>
            <option>PUBLISHED</option>
            <option>ARCHIVED</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <Submit pending={save.busy} />
        </div>
      </form>
    </Modal>
  );
}
export function People({ staff = false }) {
  const q = useData("/users"),
    save = useSave(),
    [edit, setEdit] = useState(null),
    [history, setHistory] = useState(null);
  return (
    <>
      <PageHeading
        title={
          staff
            ? "Good people. Great possibilities."
            : "Every learner, in one place."
        }
        eyebrow={staff ? "TEAM MEMBERS" : "STUDENTS"}
        description={
          staff
            ? "Build the team behind your assessments."
            : "Manage your community and keep learning moving."
        }
      >
        <button
          className="btn primary"
          onClick={() => setEdit({ role: staff ? "EXAMINER" : "STUDENT" })}
        >
          <Plus size={17} /> Add {staff ? "team member" : "student"}
        </button>
      </PageHeading>
      <Gate query={q}>
        {(rows) => (
          <DataTable
            rows={rows.filter((u) =>
              staff ? u.role !== "STUDENT" : u.role === "STUDENT",
            )}
            searchPlaceholder={`Search ${staff ? "team members" : "students"}…`}
            columns={[
              {
                label: "Name",
                render: (u) => (
                  <div className="cell-title">
                    <span className="avatar soft">
                      {u.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>{u.name}</strong>
                      <small>{u.email}</small>
                    </div>
                  </div>
                ),
              },
              {
                label: staff ? "Role" : "Student ID",
                render: (u) =>
                  staff
                    ? u.role.replaceAll("_", " ")
                    : u.studentNumber || "Not assigned",
              },
              {
                label: "Status",
                render: (u) => (
                  <Badge value={u.active ? "ACTIVE" : "INACTIVE"} />
                ),
              },
              { label: "Joined", render: (u) => date(u.createdAt) },
              {
                label: "Actions",
                render: (u) => (
                  <div className="row-actions">
                    <button className="text-btn" onClick={() => setEdit(u)}>
                      Edit
                    </button>
                    {!staff && (
                      <button
                        className="text-btn"
                        onClick={async () => {
                          const r = await save.run(
                            () => get(`/users/${u.id}/history`),
                            "Student history loaded",
                          );
                          if (r) setHistory(r);
                        }}
                      >
                        History
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            actions={
              <button
                className="btn"
                onClick={() =>
                  downloadCSV(
                    "students.csv",
                    rows
                      .filter((u) =>
                        staff ? u.role !== "STUDENT" : u.role === "STUDENT",
                      )
                      .map(({ name, email, role, active, studentNumber }) => ({
                        name,
                        email,
                        role,
                        active,
                        studentNumber,
                      })),
                  )
                }
              >
                <Download size={15} /> Export
              </button>
            }
          />
        )}
      </Gate>
      {edit && (
        <Modal
          title={
            edit.id
              ? "Edit account"
              : `Add ${staff ? "team member" : "student"}`
          }
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              const data = { ...f, active: f.active === "true" };
              if (
                await save.run(() =>
                  edit.id
                    ? api.patch(`/users/${edit.id}`, data)
                    : api.post("/users", data),
                )
              )
                setEdit(null);
            }}
          >
            <Field label="Full name">
              <input name="name" required defaultValue={edit.name} />
            </Field>
            <Field label="Email address">
              <input
                name="email"
                type="email"
                required
                defaultValue={edit.email}
              />
            </Field>
            {!edit.id && (
              <Field
                label="Temporary password"
                hint="Share securely with the account holder. Minimum 10 characters."
              >
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                />
              </Field>
            )}
            {staff ? (
              <Field label="Role">
                <select name="role" defaultValue={edit.role}>
                  <option value="EXAMINER">Examiner</option>
                  <option value="INSTITUTION_ADMIN">Institution admin</option>
                </select>
              </Field>
            ) : (
              <>
                <input name="role" type="hidden" value="STUDENT" />
                <Field label="Student ID">
                  <input
                    name="studentNumber"
                    defaultValue={edit.studentNumber}
                  />
                </Field>
              </>
            )}
            <Field label="Account status">
              <select
                name="active"
                defaultValue={edit.active === false ? "false" : "true"}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Field>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <Submit pending={save.busy} />
            </div>
          </form>
        </Modal>
      )}
      {history && (
        <Modal
          title={`${history.user.name} · History`}
          onClose={() => setHistory(null)}
        >
          <h3>Attempts</h3>
          {history.attempts.length ? (
            history.attempts.map((a) => (
              <div className="history-item" key={a.id}>
                <strong>{a.exam.title}</strong>
                <Badge value={a.status} />
                <span>
                  {a.result ? `${a.result.percentage}%` : "In progress"}
                </span>
              </div>
            ))
          ) : (
            <p>No attempts yet.</p>
          )}
          <h3>Payments</h3>
          {history.payments.length ? (
            history.payments.map((p) => (
              <div className="history-item" key={p.id}>
                {money(p.amount)}
                <Badge value={p.status} />
              </div>
            ))
          ) : (
            <p>No payments yet.</p>
          )}
        </Modal>
      )}
    </>
  );
}
export function Questions() {
  const q = useData("/questions"),
    [edit, setEdit] = useState(null),
    [type, setType] = useState("ALL"),
    save = useSave();
  return (
    <>
      <PageHeading
        eyebrow="QUESTION BANK"
        title="Great assessments start here."
        description="A thoughtful collection of questions, ready to make an impact."
      >
        <button className="btn primary" onClick={() => setEdit({})}>
          <Plus size={17} /> Add question
        </button>
      </PageHeading>
      <Gate query={q}>
        {(rows) => (
          <>
            <div className="mini-stats">
              <span>
                <Library /> <strong>{rows.length}</strong> questions in your
                bank
              </span>
              <span>
                <CheckCircle2 /> Reuse across examinations
              </span>
            </div>
            <DataTable
              rows={rows.filter((q) => type === "ALL" || q.type === type)}
              searchPlaceholder="Search question text or subject…"
              searchText={(q) => `${q.text} ${q.subject}`}
              filter={
                <select
                  value={type}
                  aria-label="Filter question type"
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="ALL">All question types</option>
                  {["SINGLE", "MULTIPLE", "TRUE_FALSE", "SHORT", "ESSAY"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              }
              columns={[
                {
                  label: "Question",
                  render: (q) => (
                    <div className="question-cell">
                      <strong>{q.text}</strong>
                      <small>{q.subject || "General"}</small>
                    </div>
                  ),
                },
                { label: "Type", render: (q) => <Badge value={q.type} /> },
                {
                  label: "Difficulty",
                  render: (q) => <Badge value={q.difficulty} />,
                },
                { label: "Marks", render: (q) => q.marks },
                {
                  label: "Actions",
                  render: (q) => (
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        aria-label="Edit question"
                        onClick={() => setEdit(q)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label="Delete question"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete this question from your bank?",
                            )
                          )
                            save.run(
                              () => api.delete(`/questions/${q.id}`),
                              "Question deleted",
                            );
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </>
        )}
      </Gate>
      {edit && <QuestionForm question={edit} close={() => setEdit(null)} />}
    </>
  );
}
function QuestionForm({ question, close }) {
  const [type, setType] = useState(question.type || "SINGLE"),
    [options, setOptions] = useState(
      question.options?.length
        ? question.options
        : [
            { id: "o1", text: "", correct: true },
            { id: "o2", text: "", correct: false },
            { id: "o3", text: "", correct: false },
            { id: "o4", text: "", correct: false },
          ],
    );
  const save = useSave();
  const objective = ["SINGLE", "MULTIPLE", "TRUE_FALSE"].includes(type);
  return (
    <Modal
      title={question.id ? "Edit question" : "Add to your question bank"}
      onClose={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const data = {
            text: f.text,
            type,
            marks: Number(f.marks),
            difficulty: f.difficulty,
            subject: f.subject,
            imageUrl: f.imageUrl,
            options: objective ? options : [],
            acceptedAnswers:
              type === "SHORT"
                ? f.acceptedAnswers
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [],
          };
          if (
            await save.run(
              () =>
                question.id
                  ? api.put(`/questions/${question.id}`, data)
                  : api.post("/questions", data),
              "Question saved",
            )
          )
            close();
        }}
      >
        <div className="form-grid">
          <Field label="Question type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (e.target.value === "TRUE_FALSE")
                  setOptions([
                    { id: "true", text: "True", correct: true },
                    { id: "false", text: "False", correct: false },
                  ]);
              }}
            >
              <option value="SINGLE">Single-answer MCQ</option>
              <option value="MULTIPLE">Multiple-answer MCQ</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="SHORT">Short answer</option>
              <option value="ESSAY">Essay / subjective</option>
            </select>
          </Field>
          <Field label="Marks">
            <input
              type="number"
              name="marks"
              required
              min={1}
              max={100}
              defaultValue={question.marks || 5}
            />
          </Field>
        </div>
        <Field label="Question">
          <textarea
            name="text"
            required
            minLength={3}
            rows={3}
            defaultValue={question.text}
            placeholder="What would you like your students to think about?"
          />
        </Field>
        {objective && (
          <div className="option-editor">
            <div className="section-label">
              Answer options{" "}
              <small>
                Select the correct {type === "MULTIPLE" ? "answers" : "answer"}
              </small>
            </div>
            {options.map((o, i) => (
              <div className="option-edit" key={o.id}>
                <input
                  type={type === "MULTIPLE" ? "checkbox" : "radio"}
                  name="correct"
                  aria-label={`Option ${i + 1} is correct`}
                  checked={o.correct}
                  onChange={(e) =>
                    setOptions(
                      options.map((v) => ({
                        ...v,
                        correct:
                          v.id === o.id
                            ? e.target.checked
                            : type === "MULTIPLE"
                              ? v.correct
                              : false,
                      })),
                    )
                  }
                />
                <span>{String.fromCharCode(65 + i)}</span>
                <input
                  required
                  aria-label={`Option ${i + 1} text`}
                  value={o.text}
                  onChange={(e) =>
                    setOptions(
                      options.map((v) =>
                        v.id === o.id ? { ...v, text: e.target.value } : v,
                      ),
                    )
                  }
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove option"
                    onClick={() =>
                      setOptions(options.filter((v) => v.id !== o.id))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {type !== "TRUE_FALSE" && options.length < 10 && (
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  setOptions([
                    ...options,
                    { id: crypto.randomUUID(), text: "", correct: false },
                  ])
                }
              >
                <Plus size={14} /> Add option
              </button>
            )}
          </div>
        )}
        {type === "SHORT" && (
          <Field
            label="Accepted answers"
            hint="One answer per line. Comparison ignores capitalization and extra whitespace."
          >
            <textarea
              name="acceptedAnswers"
              required
              defaultValue={question.acceptedAnswers?.join("\n")}
            />
          </Field>
        )}
        {type === "ESSAY" && (
          <div className="info-box">
            Essay answers remain under review until an examiner awards marks.
          </div>
        )}
        <div className="form-grid">
          <Field label="Subject">
            <input name="subject" defaultValue={question.subject} />
          </Field>
          <Field label="Difficulty">
            <select
              name="difficulty"
              defaultValue={question.difficulty || "MEDIUM"}
            >
              <option>EASY</option>
              <option>MEDIUM</option>
              <option>HARD</option>
            </select>
          </Field>
        </div>
        <Field label="Question image URL (optional)">
          <input
            type="url"
            name="imageUrl"
            placeholder="https://…"
            defaultValue={question.imageUrl}
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <Submit pending={save.busy}>Save question</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function Exams() {
  const q = useData("/exams"),
    { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    [edit, setEdit] = useState(null),
    [instructions, setInstructions] = useState(null),
    [cameraReady, setCameraReady] = useState(false),
    [filter, setFilter] = useState("ALL"),
    save = useSave(),
    navigate = useNavigate();
  const student = user.role === "STUDENT";
  useEffect(() => {
    if (params.get("create") && !student) {
      setEdit({});
      setParams({});
    }
  }, [params, student, setParams]);
  const search = params.get("search") || "";
  return (
    <>
      <PageHeading
        eyebrow="EXAMINATIONS"
        title={
          student ? "Your next opportunity awaits." : "Make knowledge count."
        }
        description={
          student
            ? "Explore your assessments and take the next step in your learning."
            : "Create, manage, and deliver assessments with confidence."
        }
      >
        {!student && (
          <button className="btn primary" onClick={() => setEdit({})}>
            <Plus size={17} /> Create examination
          </button>
        )}
      </PageHeading>
      <Gate query={q}>
        {(rows) => (
          <>
            <div className="tabs">
              <button
                className={filter === "ALL" ? "active" : ""}
                onClick={() => setFilter("ALL")}
              >
                All examinations <span>{rows.length}</span>
              </button>
              {!student &&
                ["PUBLISHED", "DRAFT", "ARCHIVED"].map((v) => (
                  <button
                    key={v}
                    className={filter === v ? "active" : ""}
                    onClick={() => setFilter(v)}
                  >
                    {v.toLowerCase()}{" "}
                    <span>{rows.filter((e) => e.status === v).length}</span>
                  </button>
                ))}
            </div>
            {search && (
              <div className="search-notice">
                Showing results for “{search}”{" "}
                <button className="text-btn" onClick={() => setParams({})}>
                  Clear search
                </button>
              </div>
            )}
            <DataTable
              rows={rows.filter(
                (e) =>
                  (filter === "ALL" || e.status === filter) &&
                  e.title.toLowerCase().includes(search.toLowerCase()),
              )}
              searchPlaceholder="Search examinations…"
              columns={[
                {
                  label: "Examination",
                  render: (e) => (
                    <div className="cell-title">
                      <ExamIcon />
                      <div>
                        <strong>{e.title}</strong>
                        <small>
                          {e.course.code} · {e._count.questions} questions ·{" "}
                          {e.totalMarks} marks
                        </small>
                      </div>
                    </div>
                  ),
                },
                { label: "Status", render: (e) => <Badge value={e.status} /> },
                {
                  label: "Duration",
                  render: (e) => (
                    <span className="inline-icon">
                      <Clock size={14} />
                      {e.duration} mins
                    </span>
                  ),
                },
                {
                  label: "Fee",
                  render: (e) =>
                    e.price ? (
                      money(e.price)
                    ) : (
                      <span className="free-tag">Free</span>
                    ),
                },
                {
                  label: student ? "My attempts" : "Attempts",
                  render: (e) =>
                    student
                      ? `${e.myAttempts.length} / ${e.maxAttempts}`
                      : e._count.attempts,
                },
                {
                  label: "Actions",
                  render: (e) =>
                    student ? (
                      <button
                        className="btn small-btn"
                        onClick={() => {
                          setCameraReady(false);
                          setInstructions(e);
                        }}
                      >
                        {e.myAttempts.some((a) => a.status === "STARTED")
                          ? "Resume"
                          : e.hasAccess
                            ? "View exam"
                            : "Unlock exam"}{" "}
                        <ArrowUpRight size={14} />
                      </button>
                    ) : (
                      <button className="text-btn" onClick={() => setEdit(e)}>
                        Manage <Pencil size={14} />
                      </button>
                    ),
                },
              ]}
            />
          </>
        )}
      </Gate>
      {edit && <ExamForm exam={edit} close={() => setEdit(null)} />}
      {instructions && (
        <Modal
          title="A moment to prepare"
          onClose={() => setInstructions(null)}
        >
          <div className="exam-instructions">
            <ExamIcon />
            <h2>{instructions.title}</h2>
            <p>{instructions.description}</p>
            <div className="instruction-stats">
              <span>
                <Clock />
                {instructions.duration} minutes
              </span>
              <span>
                <FileText />
                {instructions._count.questions} questions
              </span>
              <span>
                <TrendingUp />
                {instructions.passMark}% to pass
              </span>
            </div>
            <ul>
              <li>
                Your timer starts when you begin and continues if you close the
                browser.
              </li>
              <li>
                Answers are saved as you go. Check the save indicator before
                leaving.
              </li>
              <li>
                When time runs out, your saved answers are submitted
                automatically.
              </li>
              <li>Tab changes and fullscreen exits are recorded for review.</li>
              <li>
                Leaving, refreshing, or closing the exam page may be recorded.
                Lost connections are flagged, and the exam timer keeps running.
              </li>
            </ul>
            {instructions.cameraRequired && instructions.hasAccess && (
              <CameraMonitor key={instructions.id} onReady={setCameraReady} />
            )}
            {instructions.cameraRequired && !instructions.hasAccess && (
              <div className="info-box">
                This examination requires a camera. You will complete a camera
                check before starting.
              </div>
            )}
            {instructions.startsAt && (
              <p>Opens: {new Date(instructions.startsAt).toLocaleString()}</p>
            )}
            {instructions.endsAt && (
              <p>Closes: {new Date(instructions.endsAt).toLocaleString()}</p>
            )}
            <button
              className="btn primary full-width"
              disabled={
                save.busy ||
                (instructions.hasAccess &&
                  instructions.cameraRequired &&
                  !cameraReady)
              }
              onClick={async () => {
                if (!instructions.hasAccess) {
                  const r = await save.run(
                    () =>
                      api.post("/payments/initialize", {
                        examId: instructions.id,
                      }),
                    "Opening secure checkout",
                  );
                  if (r) window.location.assign(r.data.url);
                } else {
                  const r = await save.run(
                    () =>
                      api.post(`/exams/${instructions.id}/start`, {
                        cameraReady,
                      }),
                    "Your exam is ready",
                  );
                  if (r) navigate(`/attempt/${r.data.id}`);
                }
              }}
            >
              {save.busy ? (
                "Preparing…"
              ) : instructions.hasAccess ? (
                <>
                  <Play size={17} />{" "}
                  {instructions.myAttempts.some((a) => a.status === "STARTED")
                    ? "Resume examination"
                    : "Begin examination"}
                </>
              ) : (
                <>
                  <LockKeyhole size={17} /> Pay {money(instructions.price)} &
                  unlock
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ExamForm({ exam, close }) {
  const courses = useData("/courses"),
    questions = useData("/questions"),
    save = useSave(),
    [selected, setSelected] = useState(exam.questionIds || []),
    [step, setStep] = useState("details");
  const [search, setSearch] = useState("");
  const local = (d) =>
    d
      ? new Date(
          new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <Modal
      title={exam.id ? "Manage examination" : "Create an examination"}
      onClose={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const data = {
            title: f.title,
            description: f.description,
            courseId: f.courseId,
            duration: Number(f.duration),
            passMark: Number(f.passMark),
            price: Math.round(Number(f.price) * 100),
            maxAttempts: Number(f.maxAttempts),
            status: f.status,
            startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
            endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
            shuffleQuestions: !!f.shuffleQuestions,
            shuffleOptions: !!f.shuffleOptions,
            releaseResults: !!f.releaseResults,
            fullscreen: !!f.fullscreen,
            cameraRequired: !!f.cameraRequired,
            questionIds: selected,
          };
          if (
            await save.run(
              () =>
                exam.id
                  ? api.put(`/exams/${exam.id}`, data)
                  : api.post("/exams", data),
              "Examination saved",
            )
          )
            close();
        }}
      >
        <div className="tabs form-tabs">
          <button
            type="button"
            className={step === "details" ? "active" : ""}
            onClick={() => setStep("details")}
          >
            1. Exam details
          </button>
          <button
            type="button"
            className={step === "questions" ? "active" : ""}
            onClick={() => setStep("questions")}
          >
            2. Questions ({selected.length})
          </button>
        </div>
        <div style={{ display: step === "details" ? "block" : "none" }}>
          <Field label="Examination title">
            <input name="title" required defaultValue={exam.title} />
          </Field>
          <Field label="Description & instructions">
            <textarea
              name="description"
              rows={3}
              defaultValue={exam.description}
            />
          </Field>
          <div className="form-grid">
            <Field label="Course">
              <select
                name="courseId"
                required
                defaultValue={exam.courseId || ""}
              >
                <option value="">Select a course</option>
                {courses.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Publication status">
              <select name="status" defaultValue={exam.status || "DRAFT"}>
                <option>DRAFT</option>
                <option>PUBLISHED</option>
                <option>ARCHIVED</option>
              </select>
            </Field>
            <Field label="Duration (minutes)">
              <input
                name="duration"
                type="number"
                required
                min={1}
                max={600}
                defaultValue={exam.duration || 30}
              />
            </Field>
            <Field label="Pass mark (%)">
              <input
                name="passMark"
                type="number"
                required
                min={0}
                max={100}
                defaultValue={exam.passMark ?? 50}
              />
            </Field>
            <Field label="Price (NGN)" hint="Enter 0 for a free examination.">
              <input
                name="price"
                type="number"
                required
                min={0}
                step="0.01"
                defaultValue={(exam.price || 0) / 100}
              />
            </Field>
            <Field label="Maximum attempts">
              <input
                name="maxAttempts"
                type="number"
                required
                min={1}
                max={20}
                defaultValue={exam.maxAttempts || 1}
              />
            </Field>
            <Field label="Available from (optional)">
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={local(exam.startsAt)}
              />
            </Field>
            <Field label="Available until (optional)">
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={local(exam.endsAt)}
              />
            </Field>
          </div>
          <div className="checkbox-grid">
            {[
              ["shuffleQuestions", "Shuffle questions"],
              ["shuffleOptions", "Shuffle answer options"],
              ["releaseResults", "Release results when fully graded"],
              ["fullscreen", "Request fullscreen during exam"],
              ["cameraRequired", "Require camera and face-presence monitoring"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={exam[key] ?? key !== "fullscreen"}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: step === "questions" ? "block" : "none" }}>
          <p className="muted">
            Choose reusable questions from your bank. Total marks:{" "}
            <strong>
              {questions.data
                ?.filter((q) => selected.includes(q.id))
                .reduce((s, q) => s + q.marks, 0) || 0}
            </strong>
          </p>
          <label className="search-box">
            <Search size={17} />
            <input
              placeholder="Find a question…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {questions.isPending ? (
            <Loading />
          ) : questions.isError ? (
            <ErrorState error={questions.error} retry={questions.refetch} />
          ) : !questions.data.length ? (
            <Empty
              title="Your question bank is empty"
              description="Add questions in the Question bank section, then return here."
            />
          ) : (
            <div className="question-picker">
              {questions.data
                .filter((q) =>
                  q.text.toLowerCase().includes(search.toLowerCase()),
                )
                .map((q) => (
                  <label
                    key={q.id}
                    className={selected.includes(q.id) ? "chosen" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(q.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, q.id]
                            : selected.filter((id) => id !== q.id),
                        )
                      }
                    />
                    <div>
                      <strong>{q.text}</strong>
                      <small>
                        {q.type} · {q.subject} · {q.marks} marks
                      </small>
                    </div>
                  </label>
                ))}
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          {step === "details" ? (
            <button
              type="button"
              className="btn primary"
              onClick={(e) => {
                if (e.currentTarget.form.reportValidity()) setStep("questions");
              }}
            >
              Select questions <ArrowRight size={16} />
            </button>
          ) : (
            <Submit pending={save.busy}>Save examination</Submit>
          )}
        </div>
      </form>
    </Modal>
  );
}
