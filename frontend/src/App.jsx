import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function App() {
  const [rows, setRows] = useState(() => new Map()); // awbNo -> row
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [connected, setConnected] = useState(false);
  const cursorRef = useRef("0");

  // Initial paginated snapshot load (so a fresh page load isn't empty
  // while waiting for the worker to cycle back around).
  useEffect(() => {
    async function loadSnapshot() {
      let cursor = "0";
      do {
        const res = await fetch(
          `${API_BASE}/api/awbs?cursor=${cursor}&count=500`
        );
        const data = await res.json();
        setRows((prev) => {
          const next = new Map(prev);
          data.rows.forEach((r) => next.set(r.awbNo, r));
          return next;
        });
        cursor = data.nextCursor;
      } while (cursor !== "0");
    }

    loadSnapshot().catch(console.error);

    fetch(`${API_BASE}/api/analysis`)
      .then((r) => r.json())
      .then(setSummary)
      .catch(console.error);
  }, []);

  // Live socket connection for real-time row + summary updates.
  useEffect(() => {
    const socket = io(API_BASE, { transports: ["websocket"] });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("awb:update", (row) => {
      setRows((prev) => {
        const next = new Map(prev);
        next.set(row.awbNo, row);
        return next;
      });
    });

    socket.on("analysis:update", (s) => setSummary(s));

    return () => socket.disconnect();
  }, []);

  const filteredRows = useMemo(() => {
    let list = Array.from(rows.values());
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.awbNo?.toLowerCase().includes(q) ||
          r.refNo?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    return list.sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1));
  }, [rows, search, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(Array.from(rows.values()).map((r) => r.status));
    return ["ALL", ...Array.from(set).filter(Boolean)];
  }, [rows]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>AWB Tracker</h1>
        <span style={{ ...styles.badge, ...(connected ? styles.badgeOk : styles.badgeOff) }}>
          {connected ? "live" : "disconnected"}
        </span>
      </header>

      {summary && (
        <section style={styles.summaryGrid}>
          <SummaryCard label="Total tracked" value={summary.totalTracked} />
          <SummaryCard
            label="Fetched so far"
            value={`${summary.fetchedCount ?? 0}/${summary.totalTracked}`}
          />
          <SummaryCard label="Delivered / terminal" value={summary.terminalCount} />
          <SummaryCard label="Active" value={summary.activeCount} />
          <SummaryCard label="Failed" value={summary.failedCount ?? 0} warn />
        </section>
      )}

      <section style={styles.controls}>
        <input
          style={styles.input}
          placeholder="Search AWB or Ref No..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={styles.input}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span style={styles.count}>{filteredRows.length} rows shown</span>
      </section>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>AWB No</th>
              <th style={styles.th}>Ref No</th>
              <th style={styles.th}>Booking Date</th>
              <th style={styles.th}>EDD</th>
              <th style={styles.th}>Event Date</th>
              <th style={styles.th}>Event Time</th>
              <th style={styles.th}>City</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(0, 1000).map((r) => (
              <tr key={r.awbNo}>
                <td style={styles.td}>{r.awbNo}</td>
                <td style={styles.td}>{r.refNo}</td>
                <td style={styles.td}>{r.bookingDate}</td>
                <td style={styles.td}>{r.edd}</td>
                <td style={styles.td}>{r.eventDate}</td>
                <td style={styles.td}>{r.eventTime}</td>
                <td style={styles.td}>{r.city}</td>
                <td style={styles.td}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length > 1000 && (
          <p style={styles.note}>
            Showing first 1000 of {filteredRows.length} matching rows — narrow your
            search/filter to see more precisely.
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, warn }) {
  return (
    <div style={{ ...styles.card, ...(warn ? styles.cardWarn : {}) }}>
      <div style={styles.cardValue}>{value ?? "—"}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

const styles = {
  page: { fontFamily: "system-ui, sans-serif", padding: "24px", maxWidth: 1200, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  h1: { margin: 0, fontSize: 22 },
  badge: { fontSize: 12, padding: "2px 8px", borderRadius: 12 },
  badgeOk: { background: "#dcfce7", color: "#166534" },
  badgeOff: { background: "#fee2e2", color: "#991b1b" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  card: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, textAlign: "center" },
  cardWarn: { background: "#fff7ed", borderColor: "#fed7aa" },
  cardValue: { fontSize: 24, fontWeight: 700 },
  cardLabel: { fontSize: 12, color: "#64748b" },
  controls: { display: "flex", gap: 8, marginBottom: 12, alignItems: "center" },
  input: { padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14 },
  count: { fontSize: 12, color: "#64748b", marginLeft: "auto" },
  tableWrap: { border: "1px solid #e2e8f0", borderRadius: 8, overflow: "auto", maxHeight: "70vh" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, background: "#f1f5f9", textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0" },
  td: { padding: "6px 10px", borderBottom: "1px solid #f1f5f9" },
  note: { fontSize: 12, color: "#64748b", padding: 8 },
};
