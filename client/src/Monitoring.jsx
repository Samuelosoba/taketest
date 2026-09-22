import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, date, downloadCSV } from "./api";
import {
  Badge,
  DataTable,
  Empty,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
} from "./ui";
import { signalLabels } from "./proctoring-signals";
import { ShieldCheck, Download } from "lucide-react";

export default function Monitoring() {
  const query = useQuery({
    queryKey: ["/monitoring"],
    queryFn: () => get("/monitoring"),
    refetchInterval: 15000,
  });
  const [selected, setSelected] = useState(null);
  return (
    <>
      <PageHeading
        eyebrow="EXAM INTEGRITY"
        title="Review the signals. Understand the context."
        description="Camera, browser, and connection events from your students’ exam sessions."
      />
      <div className="info-box">
        Flags are observations, not cheating verdicts. Page-exit events can mean
        a refresh, navigation, or a closed tab/window. Connection gaps can also
        mean lost internet, device sleep, or a browser crash. Review the context
        before taking action. No camera footage is stored.
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <DataTable
          rows={query.data}
          searchPlaceholder="Search student or examination…"
          columns={[
            {
              label: "Student / Examination",
              render: (a) => (
                <div className="question-cell">
                  <strong>{a.student.name}</strong>
                  <small>{a.exam.title}</small>
                </div>
              ),
            },
            { label: "Attempt", render: (a) => <Badge value={a.status} /> },
            {
              label: "Camera",
              render: (a) => (a.cameraRequired ? "Required" : "Not required"),
            },
            {
              label: "Connection",
              render: (a) =>
                a.status !== "STARTED"
                  ? "Completed"
                  : a.disconnectedAt
                    ? "Connection gap"
                    : a.lastSeenAt
                      ? "Last seen " +
                        new Date(a.lastSeenAt).toLocaleTimeString()
                      : "Not monitored",
            },
            { label: "Events", render: (a) => a._count.violations },
            { label: "Started", render: (a) => date(a.startedAt) },
            {
              label: "Review",
              render: (a) => (
                <button
                  className="btn small-btn"
                  onClick={() => setSelected(a.id)}
                >
                  <ShieldCheck size={15} /> View timeline
                </button>
              ),
            },
          ]}
        />
      )}
      {selected && (
        <IntegrityTimeline id={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
function IntegrityTimeline({ id, close }) {
  const q = useQuery({
    queryKey: ["integrity", id],
    queryFn: () => get(`/attempts/${id}/integrity`),
    refetchInterval: 10000,
  });
  return (
    <Modal title="Monitoring timeline" onClose={close} wide>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <h3>{q.data.student.name}</h3>
          <p className="muted">{q.data.exam.title}</p>
          <div className="integrity-toolbar">
            <Badge value={q.data.status} />
            <button
              className="btn small-btn"
              onClick={() =>
                downloadCSV(
                  `monitoring-${id}.csv`,
                  q.data.violations.map((e) => ({
                    time: e.createdAt,
                    event: e.type,
                    description: signalLabels[e.type] || e.type,
                    source: e.type.startsWith("CONNECTION_")
                      ? "Server heartbeat"
                      : "Browser-reported",
                  })),
                )
              }
              disabled={!q.data.violations.length}
            >
              <Download size={14} /> Export events
            </button>
          </div>
          {q.data.violations.length ? (
            <ol className="integrity-timeline">
              {q.data.violations.map((e) => (
                <li key={e.id}>
                  <span className="integrity-dot" />
                  <div>
                    <strong>{signalLabels[e.type] || e.type}</strong>
                    <small>
                      {new Date(e.createdAt).toLocaleString()} ·{" "}
                      {e.type.startsWith("CONNECTION_")
                        ? "Server heartbeat"
                        : "Browser-reported"}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty
              title="No recorded events"
              description="An empty timeline does not guarantee that an attempt was free of misconduct."
            />
          )}
        </>
      )}
    </Modal>
  );
}
