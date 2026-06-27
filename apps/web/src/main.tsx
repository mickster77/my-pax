import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Replay, StateView, TournamentResult } from "@lab/core";
import { PaxBoard } from "./games/pax";

// Custom per-game board renderers (keyed by game id). Games without one fall back
// to the generic describeState panels.
const CUSTOM_RENDERERS: Record<string, (snapshot: unknown) => ReactNode> = {
  pax: (snapshot) => <PaxBoard snapshot={snapshot} />,
};

// Strategy Lab web UI. Two game-agnostic views over the lab's output:
//   - Results dashboard: a tournament's --out summary JSON (win rates + CIs,
//     head-to-head matrix, how games ended).
//   - Replay inspector: a --replay JSON, stepped frame by frame, rendering each
//     game's own describeState() panels (no per-game UI code lives here).
//
// Default sample data is served from /public; load your own via the file pickers.

type Summary = Omit<TournamentResult, "records">;

const C = {
  bg: "#14151a",
  card: "#1e2029",
  cardAlt: "#23262f",
  border: "#2f333f",
  text: "#e6e6e6",
  muted: "#9aa0ad",
  accent: "#6ea8fe",
  bar: "#3ddc97",
  barTrack: "#2a2d38",
};

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const safePct = (n: number, total: number): string => (total > 0 ? pct(n / total) : "—");

function isSummary(d: unknown): d is Summary {
  const s = d as Summary;
  return !!s && Array.isArray(s.perStrategy) && !!s.headToHead && Array.isArray(s.lineup) && typeof s.games === "number";
}
function isReplay(d: unknown): d is Replay {
  const r = d as Replay;
  return !!r && Array.isArray(r.frames) && !!r.result && Array.isArray(r.players);
}

function loadJsonFile<T>(onLoad: (data: T) => void) {
  return (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onLoad(JSON.parse(String(reader.result)) as T);
      } catch (err) {
        alert(`Could not parse JSON: ${String(err)}`);
      }
    };
    reader.readAsText(file);
  };
}

function FileButton<T>(props: { label: string; onLoad: (data: T) => void }) {
  return (
    <label
      style={{
        display: "inline-block",
        padding: "6px 12px",
        background: C.cardAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        color: C.text,
      }}
    >
      {props.label}
      <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={loadJsonFile(props.onLoad)} />
    </label>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    fetch("/sample.summary.json")
      .then((r) => r.json())
      .then((d: unknown) => isSummary(d) && setSummary(d))
      .catch(() => undefined);
  }, []);

  const loadSummary = (d: Summary): void => {
    if (!isSummary(d)) {
      alert("That doesn't look like a tournament summary JSON (expected perStrategy, headToHead, lineup).");
      return;
    }
    setSummary(d);
  };

  if (!summary) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.muted }}>Loading sample… or load a tournament summary JSON.</span>
        <FileButton<Summary> label="Load summary JSON…" onLoad={loadSummary} />
      </div>
    );
  }

  const chance = summary.games > 0 ? ((summary.games - summary.noSingleWinner) / summary.games) / summary.seatCount : 0;
  const maxRate = Math.max(0.0001, ...summary.perStrategy.map((s) => s.ci95[1]));
  const { names, outscoreRate, counts } = summary.headToHead;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ color: C.muted, fontSize: 14 }}>
          <b style={{ color: C.text }}>{summary.gameId}</b> · {summary.games} games · {summary.seatCount} seats ·
          rotation {summary.rotateSeats ? "on" : "off"} · lineup [{summary.lineup.join(", ")}]
        </div>
        <FileButton<Summary> label="Load summary JSON…" onLoad={loadSummary} />
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Win rate per seat-game</h3>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
        Dashed line = no-skill baseline ({pct(chance)}). Bars scaled to {pct(maxRate)}.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {summary.perStrategy.map((s) => (
          <div key={s.name} style={{ display: "grid", gridTemplateColumns: "110px 1fr 220px", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 500 }}>{s.name}</div>
            <div style={{ position: "relative", height: 22, background: C.barTrack, borderRadius: 4 }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(s.winRate / maxRate) * 100}%`, background: C.bar, borderRadius: 4 }} />
              <div style={{ position: "absolute", left: `${(chance / maxRate) * 100}%`, top: -3, bottom: -3, width: 0, borderLeft: `2px dashed ${C.accent}` }} />
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
              <b style={{ color: C.text }}>{pct(s.winRate)}</b> [{pct(s.ci95[0])}, {pct(s.ci95[1])}] · {s.wins}/{s.seatGames} · score {s.meanScore.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {names.length > 1 && (
        <>
          <h3 style={{ marginTop: 28, marginBottom: 8 }}>Head-to-head (row outscored column)</h3>
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 10px" }} />
                {names.map((n) => (
                  <th key={n} style={{ padding: "4px 10px", color: C.muted, fontWeight: 500 }}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((a) => (
                <tr key={a}>
                  <td style={{ padding: "4px 10px", color: C.muted, fontWeight: 500 }}>{a}</td>
                  {names.map((b) => {
                    const r = outscoreRate[a][b];
                    const bg = r === null ? "transparent" : `rgba(61,220,151,${0.12 + 0.5 * r})`;
                    return (
                      <td key={b} title={r === null ? "" : `n=${counts[a][b]}`} style={{ padding: "4px 10px", textAlign: "center", background: bg, border: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" }}>
                        {r === null ? "—" : pct(r)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 8 }}>How games ended</h3>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: C.muted }}>
        {Object.entries(summary.byEndReason).map(([reason, count]) => (
          <div key={reason}><b style={{ color: C.text }}>{count}</b> {reason} ({safePct(count, summary.games)})</div>
        ))}
        {summary.noSingleWinner > 0 && <div>{summary.noSingleWinner} with no single winner</div>}
      </div>
    </div>
  );
}

function Panels({ view }: { view: StateView }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {view.panels.map((panel, i) => (
        <div key={i} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{panel.title}</div>
          {panel.rows.map((row, j) => (
            <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, padding: "1px 0" }}>
              <span>{row.label}</span>
              <span style={{ color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "pre" }}>{row.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReplayViewer() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [boardView, setBoardView] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/sample-replay.json")
      .then((r) => r.json())
      .then((d: unknown) => isReplay(d) && setReplay(d))
      .catch(() => undefined);
  }, []);

  const frameCount = replay?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || frameCount === 0) return;
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= frameCount - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, frameCount]);

  const load = (r: Replay): void => {
    if (!isReplay(r)) {
      alert("That doesn't look like a replay JSON (expected frames, result, players).");
      return;
    }
    setReplay(r);
    setIdx(0);
    setPlaying(false);
  };

  const btn = { padding: "6px 12px", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 } as const;

  if (!replay) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.muted }}>Loading sample… or load a replay JSON.</span>
        <FileButton<Replay> label="Load replay JSON…" onLoad={load} />
      </div>
    );
  }

  const frames = replay.frames;
  if (frames.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.muted }}>This replay has no frames.</span>
        <FileButton<Replay> label="Load replay JSON…" onLoad={load} />
      </div>
    );
  }
  const frame = frames[Math.min(idx, frames.length - 1)];
  const renderer: ((snapshot: unknown) => ReactNode) | undefined = CUSTOM_RENDERERS[replay.gameId];
  const hasSnapshot = frame.snapshot != null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ color: C.muted, fontSize: 14 }}>
          <b style={{ color: C.text }}>{replay.gameName}</b> · seed {replay.seed} · players [{replay.players.join(", ")}] ·
          result: {replay.result.endReason}{replay.result.winnerIds.length ? ` → ${replay.result.winnerIds.join(", ")}` : ""}
        </div>
        <FileButton<Replay> label="Load replay JSON…" onLoad={load} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button style={btn} onClick={() => { setPlaying(false); setIdx(0); }}>⏮</button>
        <button style={btn} onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }}>‹ prev</button>
        <button style={{ ...btn, minWidth: 70 }} onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ pause" : "▶ play"}</button>
        <button style={btn} onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }}>next ›</button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={Math.min(idx, frames.length - 1)}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
          style={{ flex: 1, accentColor: C.accent }}
        />
        <div style={{ fontVariantNumeric: "tabular-nums", color: C.muted, fontSize: 13, minWidth: 110, textAlign: "right" }}>
          frame {frame.index}/{frames.length - 1}
        </div>
      </div>

      <div style={{ margin: "16px 0", padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15 }}>{frame.view.summary}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {frame.actionLabel ? `last action: ${frame.actionLabel}` : "initial state"}
            {frame.actor ? ` · ${frame.actor} to move` : " · game over"}
          </div>
        </div>
        {renderer !== undefined && hasSnapshot && (
          <div style={{ display: "flex", gap: 4 }}>
            <button style={{ ...btn, background: boardView ? C.accent : C.cardAlt, color: boardView ? "#0b1220" : C.text }} onClick={() => setBoardView(true)}>Board</button>
            <button style={{ ...btn, background: boardView ? C.cardAlt : C.accent, color: boardView ? C.text : "#0b1220" }} onClick={() => setBoardView(false)}>Data</button>
          </div>
        )}
      </div>

      {renderer !== undefined && hasSnapshot && boardView ? renderer(frame.snapshot) : <Panels view={frame.view} />}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<"dashboard" | "replay">("dashboard");
  const tabStyle = (active: boolean) => ({
    padding: "8px 16px",
    background: active ? C.card : "transparent",
    border: `1px solid ${active ? C.border : "transparent"}`,
    borderBottom: active ? `1px solid ${C.card}` : `1px solid ${C.border}`,
    borderRadius: "8px 8px 0 0",
    color: active ? C.text : C.muted,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  });

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 60px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 4px" }}>Strategy Lab</h1>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
        Bot strategy results and replays · Pax · Monopoly · Catan
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}` }}>
        <button id="tab-dashboard" style={tabStyle(tab === "dashboard")} onClick={() => setTab("dashboard")}>Results dashboard</button>
        <button id="tab-replay" style={tabStyle(tab === "replay")} onClick={() => setTab("replay")}>Replay inspector</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: 20 }}>
        {tab === "dashboard" ? <Dashboard /> : <ReplayViewer />}
      </div>
    </div>
  );
}

// Reuse one root across HMR updates (re-running createRoot on the same container warns and breaks events).
const container = document.getElementById("root")!;
const globalForRoot = window as unknown as { __labRoot?: ReturnType<typeof createRoot> };
const root = globalForRoot.__labRoot ?? (globalForRoot.__labRoot = createRoot(container));
root.render(<App />);
