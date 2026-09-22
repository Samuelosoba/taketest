import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
} from "lucide-react";
export const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(text, error = false) => setToast({ text, error })}
    >
      {children}
      {toast && (
        <div role="status" className={`toast ${toast.error ? "error" : ""}`}>
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Badge({ value }) {
  return (
    <span
      className={`badge ${String(value).toLowerCase().replaceAll("_", "-")}`}
    >
      <i />
      {String(value).replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" /> Loading your workspace…
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="empty">
      <AlertCircle />
      <h3>We couldn’t load this page</h3>
      <p>{error?.response?.data?.message || error?.message}</p>
      <button className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Your records will appear here.",
  action,
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const before = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        );
        const first = nodes?.[0],
          last = nodes?.[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({ label, children, hint }) {
  const id = useId();
  const direct =
    React.isValidElement(children) &&
    ["input", "select", "textarea"].includes(children.type);
  return (
    <label className="field" htmlFor={direct ? id : undefined}>
      <span id={`${id}-label`}>{label}</span>
      {direct
        ? React.cloneElement(children, {
            id,
            "aria-labelledby": `${id}-label`,
            "aria-describedby": hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function PageHeading({
  eyebrow = "YOUR WORKSPACE",
  title,
  description,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function DataTable({
  rows,
  columns,
  searchPlaceholder = "Search records…",
  filter,
  searchText,
  emptyTitle,
  actions,
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const filtered = rows.filter((row) =>
    (searchText ? searchText(row) : JSON.stringify(row))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages);
  return (
    <section className="panel">
      <div className="table-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="toolbar-right">
          {filter}
          {actions}
        </div>
      </div>
      {!filtered.length ? (
        <Empty
          title={emptyTitle || "No matching records"}
          description="Try a different search or add your first record."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice((current - 1) * 8, current * 8).map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="table-footer">
        <span>
          Showing {filtered.length ? (current - 1) * 8 + 1 : 0}–
          {Math.min(current * 8, filtered.length)} of {filtered.length} records
        </span>
        <div>
          <button
            className="icon-btn"
            aria-label="Previous page"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="page-number">{current}</span>
          <button
            className="icon-btn"
            aria-label="Next page"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </section>
  );
}
export function Submit({ pending, children = "Save changes" }) {
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} className="spin" /> Saving…
        </>
      ) : (
        children
      )}
    </button>
  );
}
