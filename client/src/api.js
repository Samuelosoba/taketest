import axios from "axios";
export const api = axios.create({ baseURL: "/api", withCredentials: true });
let accessToken = "";
let refreshing;
export const setToken = (t) => {
  accessToken = t || "";
};
// A launch session is a partner student inside one exam. It has no refresh
// cookie, so it is kept for this tab only and survives a page refresh.
const LAUNCH_KEY = "assessmentdesk-launch";
export function getLaunchSession() {
  try {
    return JSON.parse(sessionStorage.getItem(LAUNCH_KEY) || "null");
  } catch {
    return null;
  }
}
export function setLaunchSession(session) {
  try {
    if (session) sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(LAUNCH_KEY);
  } catch {}
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      !config._retry &&
      !config.url.startsWith("/auth/") &&
      !config.url.startsWith("/launch/") &&
      !getLaunchSession()
    ) {
      config._retry = true;
      try {
        refreshing ||= api
          .post("/auth/refresh")
          .then((r) => {
            setToken(r.data.token);
            return r;
          })
          .finally(() => {
            refreshing = null;
          });
        await refreshing;
        return api(config);
      } catch {
        setToken("");
        window.dispatchEvent(new Event("session-expired"));
      }
    }
    return Promise.reject(error);
  },
);
export const get = async (path) => (await api.get(path)).data;
export const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n / 100);
export const date = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export const message = (e) =>
  e.response?.data?.message || e.message || "Something went wrong.";
export function downloadCSV(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(
      [
        [keys, ...rows.map((r) => keys.map((k) => r[k]))]
          .map((r) => r.map(cell).join(","))
          .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
