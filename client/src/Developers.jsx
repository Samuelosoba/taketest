// Institution-admin settings for the partner API: API keys, webhooks, and the
// origins partners may use as launch return URLs.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  KeyRound,
  Webhook,
  Globe,
  Plus,
  Copy,
  Send,
  Trash2,
  List,
  Pause,
  Play,
  ExternalLink,
} from "lucide-react";
import { api, get, date, message } from "./api";
import {
  Badge,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeading,
  Submit,
  useToast,
} from "./ui";

const SCOPES = [
  "courses:read",
  "courses:write",
  "questions:read",
  "questions:write",
  "questions:answers",
  "exams:read",
  "exams:write",
  "students:read",
  "students:write",
  "launches:write",
  "attempts:read",
  "results:read",
  "results:write",
  "certificates:read",
];
const EVENTS = [
  "attempt.started",
  "attempt.submitted",
  "result.ready",
  "result.pending_grading",
  "result.graded",
  "result.released",
  "certificate.issued",
];

function useAction() {
  const [busy, setBusy] = useState(false);
  const toast = useToast(),
    cache = useQueryClient();
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const r = await fn();
      await cache.invalidateQueries({ queryKey: ["developer"] });
      if (success) toast(success);
      return r?.data ?? true;
    } catch (e) {
      toast(message(e), true);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
const useDev = (path) =>
  useQuery({
    queryKey: ["developer", path],
    queryFn: () => get(`/developer/${path}`),
  });
// render(data) draws the loaded content; children (dialogs) render alongside.
function Section({
  icon: Icon,
  title,
  description,
  action,
  query,
  render,
  children,
}) {
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action || <Icon size={22} />}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        render(query.data)
      )}
      {children}
    </section>
  );
}
function Secret({ title, value, note, onClose }) {
  const toast = useToast();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{note}</p>
      <div className="secret-value">
        <code>{value}</code>
        <button
          className="btn"
          onClick={() =>
            navigator.clipboard
              ?.writeText(value)
              .then(() => toast("Copied"))
              .catch(() => toast("Copy failed. Select the text instead.", true))
          }
        >
          <Copy size={15} /> Copy
        </button>
      </div>
      <div className="form-actions">
        <button className="btn primary" onClick={onClose}>
          I've stored it safely
        </button>
      </div>
    </Modal>
  );
}
function Checks({ name, values, defaults }) {
  return (
    <div className="checkbox-grid">
      {values.map((v) => (
        <label key={v}>
          <input
            type="checkbox"
            name={name}
            value={v}
            defaultChecked={defaults.includes(v)}
          />
          <code>{v}</code>
        </label>
      ))}
    </div>
  );
}

function ApiKeys() {
  const q = useDev("keys"),
    action = useAction();
  const [creating, setCreating] = useState(false),
    [secret, setSecret] = useState(null);
  return (
    <Section
      icon={KeyRound}
      title="API keys"
      description="Your partner server authenticates with these keys. Keep them secret and never use them in a browser."
      query={q}
      action={
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New key
        </button>
      }
      render={(keys) =>
        !keys.length ? (
          <Empty
            title="No API keys yet"
            description="Create a key to start using the API."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Scopes</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td>
                      <code>{k.prefix}…</code>
                    </td>
                    <td>
                      {k.scopes.length === SCOPES.length
                        ? "All"
                        : k.scopes.length}
                    </td>
                    <td>{k.lastUsedAt ? date(k.lastUsedAt) : "Never"}</td>
                    <td>
                      <Badge value={k.revokedAt ? "REVOKED" : "ACTIVE"} />
                    </td>
                    <td>
                      {!k.revokedAt && (
                        <button
                          className="text-btn danger"
                          disabled={action.busy}
                          onClick={() =>
                            window.confirm(
                              `Revoke "${k.name}"? Requests using it will fail immediately.`,
                            ) &&
                            action.run(
                              () => api.post(`/developer/keys/${k.id}/revoke`),
                              "Key revoked",
                            )
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    >
      {creating && (
        <Modal title="Create an API key" onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const created = await action.run(() =>
                api.post("/developer/keys", {
                  name: f.get("name"),
                  scopes: f.getAll("scopes"),
                }),
              );
              if (created) {
                setCreating(false);
                setSecret(created.key);
              }
            }}
          >
            <Field label="Name" hint="For example: Klar production server">
              <input name="name" required maxLength={100} />
            </Field>
            <p className="muted">Scopes</p>
            <Checks
              name="scopes"
              values={SCOPES}
              defaults={SCOPES.filter((s) => s !== "questions:answers")}
            />
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <Submit pending={action.busy}>Create key</Submit>
            </div>
          </form>
        </Modal>
      )}
      {secret && (
        <Secret
          title="Your new API key"
          value={secret}
          note="Copy this key now. For your security it will not be shown again."
          onClose={() => setSecret(null)}
        />
      )}
    </Section>
  );
}

function Deliveries({ endpoint, onClose }) {
  const q = useDev(`webhooks/${endpoint.id}/deliveries`),
    action = useAction();
  return (
    <Modal title="Recent deliveries" onClose={onClose} wide>
      <p className="muted">{endpoint.url}</p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !q.data.length ? (
        <Empty
          title="No deliveries yet"
          description="Send a test event or start an exam."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Tries</th>
                <th>Response</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <code>{d.eventType}</code>
                  </td>
                  <td>
                    <Badge value={d.status} />
                  </td>
                  <td>{d.attempts}</td>
                  <td>{d.lastError || d.lastStatus || "—"}</td>
                  <td>{new Date(d.createdAt).toLocaleString()}</td>
                  <td>
                    {d.status !== "PENDING" && (
                      <button
                        className="text-btn"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            () =>
                              api.post(`/developer/deliveries/${d.id}/resend`),
                            "Queued again",
                          )
                        }
                      >
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Webhooks() {
  const q = useDev("webhooks"),
    action = useAction();
  const [creating, setCreating] = useState(false),
    [secret, setSecret] = useState(null),
    [log, setLog] = useState(null);
  return (
    <Section
      icon={Webhook}
      title="Webhooks"
      description="We send signed POST requests to these URLs when attempts start, finish, and are graded."
      query={q}
      action={
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New webhook
        </button>
      }
      render={(hooks) =>
        !hooks.length ? (
          <Empty
            title="No webhooks yet"
            description="Add an HTTPS endpoint on your server."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id}>
                    <td className="break">{h.url}</td>
                    <td>
                      {h.events.includes("*")
                        ? "All events"
                        : h.events.join(", ")}
                    </td>
                    <td>
                      <Badge value={h.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-btn"
                        title="Send test event"
                        aria-label="Send test event"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            () => api.post(`/developer/webhooks/${h.id}/test`),
                            "Test event queued",
                          )
                        }
                      >
                        <Send size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Deliveries"
                        aria-label="View deliveries"
                        onClick={() => setLog(h)}
                      >
                        <List size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title={h.active ? "Pause" : "Resume"}
                        aria-label={
                          h.active ? "Pause webhook" : "Resume webhook"
                        }
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            () =>
                              api.patch(`/developer/webhooks/${h.id}`, {
                                active: !h.active,
                              }),
                            h.active ? "Webhook paused" : "Webhook resumed",
                          )
                        }
                      >
                        {h.active ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button
                        className="icon-btn"
                        title="Delete"
                        aria-label="Delete webhook"
                        disabled={action.busy}
                        onClick={() =>
                          window.confirm(
                            "Delete this webhook and its delivery log?",
                          ) &&
                          action.run(
                            () => api.delete(`/developer/webhooks/${h.id}`),
                            "Webhook deleted",
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    >
      {creating && (
        <Modal title="Add a webhook" onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const events = f.getAll("events");
              const created = await action.run(() =>
                api.post("/developer/webhooks", {
                  url: f.get("url"),
                  events: events.length === EVENTS.length ? ["*"] : events,
                }),
              );
              if (created) {
                setCreating(false);
                setSecret(created.secret);
              }
            }}
          >
            <Field label="Endpoint URL" hint="Must use https.">
              <input
                name="url"
                type="url"
                required
                placeholder="https://dashboard.example.com/assessmentdesk/webhooks"
              />
            </Field>
            <p className="muted">Events</p>
            <Checks name="events" values={EVENTS} defaults={EVENTS} />
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <Submit pending={action.busy}>Add webhook</Submit>
            </div>
          </form>
        </Modal>
      )}
      {secret && (
        <Secret
          title="Webhook signing secret"
          value={secret}
          note="Use this secret to verify the AssessmentDesk-Signature header. It will not be shown again."
          onClose={() => setSecret(null)}
        />
      )}
      {log && <Deliveries endpoint={log} onClose={() => setLog(null)} />}
    </Section>
  );
}

function Origins() {
  const q = useDev("origins"),
    action = useAction();
  return (
    <Section
      icon={Globe}
      title="Allowed origins"
      description="Sites students may be sent back to after a launched exam (returnUrl). One per line."
      query={q}
      render={(data) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const origins = new FormData(e.currentTarget)
              .get("origins")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            action.run(
              () => api.put("/developer/origins", { origins }),
              "Origins saved",
            );
          }}
        >
          <Field
            label="Origins"
            hint="For example: https://dashboard.example.com"
          >
            <textarea
              name="origins"
              rows={4}
              defaultValue={data.origins.join("\n")}
              key={data.origins.join()}
            />
          </Field>
          <div className="form-actions">
            <Submit pending={action.busy} />
          </div>
        </form>
      )}
    />
  );
}

export default function Developers() {
  return (
    <>
      <PageHeading
        eyebrow="DEVELOPERS"
        title="Connect your platform."
        description="Manage exams from your own dashboard with the AssessmentDesk API."
      >
        <Link className="btn" to="/docs" target="_blank" rel="noopener">
          API documentation <ExternalLink size={15} />
        </Link>
      </PageHeading>
      <div className="developer-layout">
        <ApiKeys />
        <Webhooks />
        <Origins />
      </div>
    </>
  );
}
