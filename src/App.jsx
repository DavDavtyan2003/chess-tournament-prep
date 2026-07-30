import React, { useState } from "react";
import { Swords } from "lucide-react";
import AnalysisBoard from "./components/AnalysisBoard.jsx";
import OpponentPrep from "./components/OpponentPrep.jsx";

export default function ChessPrepApp() {
  const [mode, setMode] = useState("board");

  return (
    <div className="app">
      <style>{`
        .app { min-height: 100vh; background: #14171C; color: #E8E3D8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .app * { box-sizing: border-box; }
        .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
        .muted { color: #8B93A1; }

        .topbar { display:flex; align-items:center; justify-content: space-between; padding: 14px 32px; border-bottom: 1px solid #2A313C; flex-shrink: 0; }
        .topbar-brand { display:flex; align-items:center; gap: 8px; font-weight: 700; font-size: 15px; }
        .mode-switch { display:inline-flex; background: #1C2129; border: 1px solid #2A313C; border-radius: 8px; padding: 3px; }
        .mode-switch button { background: transparent; border: none; color: #8B93A1; padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .mode-switch button.active { background: #C9A227; color: #14171C; font-weight: 600; }

        .main { flex: 1; padding: 28px 32px; overflow-y: auto; }

        .field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8B93A1; margin-bottom: 4px; display:block; margin-top: 12px; }
        input[type=text], input[type=number], textarea, select {
          width: 100%; background: #14171C; border: 1px solid #2A313C; color: #E8E3D8;
          border-radius: 6px; padding: 7px 9px; font-size: 13px; font-family: inherit;
        }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #C9A227; }

        .btn { display:flex; align-items:center; justify-content:center; gap: 6px; padding: 9px 12px; border-radius: 6px; border: 1px solid #2A313C; background: #232935; color: #E8E3D8; cursor: pointer; font-size: 13px; width: 100%; margin-top: 10px; transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease; }
        .btn:hover { border-color: #C9A227; }
        .btn:active { transform: scale(0.98); }
        .btn.ghost { background: transparent; }
        .btn:disabled { opacity: 0.5; cursor: default; }
        .btn-row { display:flex; gap: 8px; }
        .btn-row .btn { margin-top: 10px; }
        .fide-row { display:flex; gap: 8px; align-items: flex-end; }
        .fide-row > div { flex: 1; }
        .btn-icon { width: auto; flex-shrink: 0; padding: 7px 10px; margin-top: 0; }

        .status-line { font-size: 11.5px; color: #8B93A1; margin-top: 6px; min-height: 14px; }
        .desc { color: #8B93A1; font-size: 12.5px; }

        .board-modal-backdrop { position: fixed; inset: 0; background: rgba(10,12,16,0.72); display:flex; align-items:center; justify-content:center; z-index: 100; padding: 24px; animation: fade-in 0.12s ease; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .board-modal { position: relative; background: #1C2129; border: 1px solid #2A313C; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 20px 22px 24px; }
        .board-modal-close { position:absolute; top: 14px; right: 14px; background: transparent; border: none; color: #8B93A1; cursor: pointer; padding: 4px; border-radius: 4px; }
        .board-modal-close:hover { color: #E8E3D8; background: #232935; }
        .board-modal-header { margin-bottom: 16px; padding-right: 28px; }
        .board-modal-title { font-weight: 700; font-size: 17px; }
        .board-modal-title .vs { color: #8B93A1; font-size: 13px; margin: 0 4px; }
        .board-modal-sub { color: #8B93A1; font-size: 12.5px; margin-top: 4px; }
        .board-modal-body { display:flex; gap: 24px; flex-wrap: wrap; }
        .board-modal-board { flex: 1 1 380px; max-width: 460px; }
        .board-modal-moves { flex: 1 1 220px; min-width: 200px; max-height: 460px; overflow-y: auto; border: 1px solid #2A313C; border-radius: 8px; padding: 8px 10px; background: #14171C; }

        .chess-board { width: 100%; aspect-ratio: 1 / 1; border-radius: 4px; overflow: hidden; border: 6px solid #4A3826; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
        .chess-board-grid { width: 100%; height: 100%; display: flex; flex-direction: column; }
        .chess-board-row { flex: 1; display: flex; }
        .chess-square { position: relative; flex: 1; display:flex; align-items:center; justify-content:center; }
        .chess-square.light { background: linear-gradient(135deg, #EDE0C8 0%, #E3D2AC 50%, #EDE0C8 100%); }
        .chess-square.dark { background: linear-gradient(135deg, #8D6B45 0%, #6E4F30 50%, #8D6B45 100%); }
        .chess-square.last-move.light { background: linear-gradient(135deg, #F0DE97 0%, #E7CE7C 100%); }
        .chess-square.last-move.dark { background: linear-gradient(135deg, #C9A24E 0%, #B08B3C 100%); }
        .chess-piece { width: 82%; height: 82%; display:flex; align-items:center; justify-content:center; user-select: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35)); }
        .piece-svg { width: 100%; height: 100%; }
        .chess-rank-label { position:absolute; top: 2px; left: 3px; font-size: 9px; color: rgba(0,0,0,0.4); font-weight: 600; }
        .chess-file-label { position:absolute; bottom: 1px; right: 3px; font-size: 9px; color: rgba(0,0,0,0.4); font-weight: 600; }
        .chess-square.interactive { cursor: pointer; }
        .chess-square.interactive .chess-piece { cursor: grab; }
        .chess-square.interactive .chess-piece:active { cursor: grabbing; }
        .chess-square.selected { box-shadow: inset 0 0 0 3px rgba(201,162,39,0.85); }
        .move-hint { position: absolute; width: 28%; height: 28%; border-radius: 50%; background: rgba(20,23,28,0.35); pointer-events: none; }
        .move-hint.capture { width: 92%; height: 92%; background: transparent; border-radius: 50%; box-shadow: inset 0 0 0 4px rgba(20,23,28,0.4); }

        .analysis-board-layout { display:flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
        .analysis-board-main { flex: 1 1 420px; max-width: 520px; }
        .analysis-board-side { flex: 1 1 240px; min-width: 220px; }
        .analysis-board-eval-row { display:flex; gap: 10px; align-items: stretch; }
        .eval-bar-wrap { width: 22px; border-radius: 4px; overflow: hidden; background: #1B1F26; border: 1px solid #2A313C; position: relative; display:flex; flex-direction: column; justify-content: flex-end; flex-shrink: 0; }
        .eval-bar-wrap.eval-bar-flipped { justify-content: flex-start; }
        .eval-bar-fill { background: #E8E3D8; width: 100%; transition: height 0.25s ease; }
        .eval-bar-label { position:absolute; bottom: 4px; left: 50%; transform: translateX(-50%); font-size: 9px; font-family: "JetBrains Mono", monospace; color: #8B93A1; white-space: nowrap; }
        .analysis-eval-line { margin-top: 10px; font-size: 13px; color: #C9C3B4; display:flex; align-items:center; gap: 6px; min-height: 18px; }
        .analysis-eval-line .muted { color: #8B93A1; font-size: 11.5px; }
        .eval-error { display:flex; align-items:center; gap: 6px; color: #E8C778; font-size: 12.5px; }
        .analysis-pgn-input { min-height: 90px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; }
        .info-card { background: #14171C; border: 1px solid #2A313C; border-radius: 8px; padding: 10px 12px; margin-top: 6px; margin-bottom: 4px; }
        .info-card-name { font-size: 13px; font-weight: 600; }
        .info-card-name .muted { color: #8B93A1; font-weight: 400; font-size: 11.5px; }
        .info-card-sub { color: #8B93A1; font-size: 11.5px; margin-top: 3px; }
        .info-card-ratings { display:flex; gap: 10px; margin-top: 6px; font-size: 11.5px; color: #C9C3B4; font-family: "JetBrains Mono", monospace; }
        .analysis-board-side .move-list { max-height: 360px; overflow-y: auto; border: 1px solid #2A313C; border-radius: 8px; padding: 8px 10px; background: #14171C; margin-top: 6px; }

        .board-controls { display:flex; align-items:center; justify-content:center; gap: 6px; margin-top: 12px; }
        .board-controls .btn-icon { width: auto; }
        .board-ply-indicator { font-size: 11.5px; color: #8B93A1; min-width: 52px; text-align:center; font-family: "JetBrains Mono", monospace; }
        .board-warning { display:flex; align-items:center; gap: 6px; color: #E8C778; font-size: 11.5px; margin-top: 10px; background: #2A2418; border: 1px solid #6b5a1f; border-radius: 6px; padding: 7px 9px; }

        .move-list-row { display:flex; align-items:center; gap: 8px; padding: 3px 2px; font-size: 12.5px; font-family: "JetBrains Mono", monospace; }
        .move-list-num { color: #8B93A1; width: 26px; flex-shrink: 0; }
        .move-list-san { flex: 1; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
        .move-list-san:hover { background: #232935; }
        .move-list-san.active { background: #C9A227; color: #14171C; font-weight: 600; }

        /* ---- Opponent Prep ---- */
        .opponent-prep { max-width: 1100px; margin: 0 auto; }

        .setup-card { background: #1C2129; border-radius: 10px; padding: 22px 24px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); }
        .setup-grid { display:grid; grid-template-columns: 2fr 1fr 1.4fr; gap: 16px; }
        .setup-grid-compact { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin-top: 4px; }
        .setup-field { display:flex; flex-direction: column; }
        .color-toggle { display:flex; border: 1px solid #2A313C; border-radius: 6px; overflow: hidden; margin-top: 6px; }
        .color-toggle button { flex:1; padding: 8px; background: #14171C; color: #8B93A1; border: none; cursor: pointer; font-size: 13px; }
        .color-toggle button.active { background: #C9A227; color: #14171C; font-weight: 600; }
        .setup-import-row { margin-top: 18px; padding-top: 16px; border-top: 1px solid #2A313C; display:flex; flex-direction: column; gap: 10px; }
        .setup-import-controls { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
        .setup-import-controls .btn { width: auto; margin-top: 0; }
        .setup-pgn-input { min-height: 120px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; }
        .setup-actions { display:flex; align-items:center; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
        .setup-actions .btn { width: auto; margin-top: 0; }
        .back-link { width: auto; background: transparent; border: none; color: #8B93A1; padding: 0; margin: 0 0 16px 0; font-size: 12.5px; justify-content: flex-start; }
        .back-link:hover { color: #C9A227; border-color: transparent; }

        .saved-chips { display:flex; align-items:center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .saved-chip { display:inline-flex; align-items:center; gap: 6px; background: #14171C; border: 1px solid #2A313C; border-radius: 20px; padding: 5px 6px 5px 12px; font-size: 12.5px; cursor: pointer; transition: border-color 0.15s ease; }
        .saved-chip:hover { border-color: #C9A227; }
        .saved-chip button { background: #232935; border: none; color: #8B93A1; cursor: pointer; padding: 3px; border-radius: 50%; display:flex; }
        .saved-chip button:hover { color: #B25550; }

        .setup-strip { display:flex; align-items:center; justify-content: space-between; background: #1C2129; border-radius: 10px; padding: 14px 20px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); flex-wrap: wrap; gap: 12px; }
        .setup-strip-info { display:flex; align-items:baseline; gap: 14px; flex-wrap: wrap; }
        .setup-strip-name { font-size: 15px; font-weight: 700; }
        .setup-strip-meta { color: #8B93A1; font-size: 12.5px; }
        .setup-strip-color { color: #8B93A1; font-size: 12.5px; }
        .setup-strip-color strong { color: #E8E3D8; }
        .setup-strip-actions { display:flex; gap: 8px; }
        .setup-strip-actions .btn { width: auto; margin-top: 0; }

        .warning-box { display:flex; gap:8px; align-items:flex-start; background: #2A2418; border: 1px solid #6b5a1f; color: #E8C778; padding: 10px 12px; border-radius: 6px; font-size: 12.5px; margin-bottom: 16px; }
        .h2h-banner { background: #2A1E1E; border: 1px solid #6b3030; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display:flex; align-items:center; gap: 10px; }
        .h2h-banner .n { color: #E89494; font-weight:600; }

        .tabs { display:flex; gap: 4px; border-bottom: 1px solid #2A313C; margin-bottom: 24px; flex-wrap: wrap; }
        .tab { padding: 10px 16px; font-size: 13.5px; font-weight: 500; color: #8B93A1; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.15s ease, border-color 0.15s ease; }
        .tab:hover { color: #C9C3B4; }
        .tab.active { color: #E8E3D8; border-bottom-color: #C9A227; }

        .hero-stat { background: #1C2129; border-radius: 10px; padding: 22px 24px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); }
        .hero-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8B93A1; margin-bottom: 10px; }
        .hero-stat-row { display:flex; align-items: baseline; gap: 20px; flex-wrap: wrap; }
        .hero-stat-value { font-size: 42px; font-weight: 700; line-height: 1; color: #E8E3D8; }
        .hero-stat-details { display:flex; flex-direction: column; gap: 6px; }
        .hero-stat-wdl { font-size: 14px; }
        .hero-stat-wdl .muted { color: #8B93A1; font-size: 12.5px; }
        .hero-stat-empty { color: #8B93A1; font-size: 13.5px; padding-top: 2px; }

        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .grid-secondary { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
        .stat-card { background: #1C2129; border-radius: 8px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.16); }
        .stat-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #8B93A1; margin-bottom: 6px; }
        .stat-card .value { font-size: 20px; font-weight: 700; }
        .stat-card .sub { font-size: 12px; color: #8B93A1; margin-top: 4px; }

        .panel { background: #1C2129; border-radius: 10px; padding: 20px 22px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); }
        .panel h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px 0; }
        .panel .desc { color: #8B93A1; font-size: 12.5px; margin-bottom: 14px; }

        .segmented { display:inline-flex; background: #14171C; border: 1px solid #2A313C; border-radius: 7px; padding: 3px; margin-bottom: 16px; }
        .segmented-btn { background: transparent; border: none; color: #8B93A1; padding: 6px 14px; border-radius: 5px; font-size: 12.5px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .segmented-btn.active { background: #C9A227; color: #14171C; font-weight: 600; }

        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align:left; color: #8B93A1; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; padding: 6px 8px; border-bottom: 1px solid #2A313C; }
        td { padding: 7px 8px; border-bottom: 1px solid #232935; vertical-align: middle; }
        tr.h2h-row { background: rgba(178,85,80,0.08); }
        tr.row-clickable { cursor: pointer; transition: background 0.12s ease; }
        tr.row-clickable:hover { background: #232935; }

        .score-pill { display:flex; align-items:center; height: 16px; width: 90px; border-radius: 3px; overflow:hidden; background:#232935; position: relative; }
        .sp-seg { height: 100%; }
        .sp-win { background: #5FA777; }
        .sp-draw { background: #8B93A1; }
        .sp-loss { background: #B25550; }
        .sp-label { position:absolute; right: -38px; font-size: 11px; color: #8B93A1; width: 34px; }

        .conf-badge { font-size: 10.5px; padding: 2px 7px; border-radius: 10px; border: 1px solid; white-space: nowrap; }
        .conf-low { color: #B25550; border-color: #B25550; }
        .conf-med { color: #C9A227; border-color: #C9A227; }
        .conf-high { color: #5FA777; border-color: #5FA777; }

        .tree-branch {}
        .tree-row { display:flex; align-items:center; gap: 8px; padding: 4px 4px; border-radius: 4px; font-size: 12.5px; }
        .tree-row.clickable { cursor: pointer; }
        .tree-row.clickable:hover { background: #232935; }
        .tree-caret { color: #8B93A1; display:flex; }
        .tree-move { font-family: "JetBrains Mono", monospace; min-width: 90px; }
        .tree-bar-wrap { width: 80px; height: 6px; background: #232935; border-radius: 3px; overflow: hidden; }
        .tree-bar { display:block; height: 100%; background: #C9A227; }
        .tree-pct { width: 42px; color: #8B93A1; }
        .tree-n { width: 48px; color: #8B93A1; }
        .tree-score { width: 40px; }
        .tree-score.good { color: #5FA777; }
        .tree-score.bad { color: #B25550; }
        .tree-more { font-size: 11.5px; color: #8B93A1; padding: 3px 0; }

        .info-line { display:flex; align-items:flex-start; gap: 8px; color: #8B93A1; font-size: 12px; margin-top: 10px; }
        select.recency-select { width: auto; display:inline-block; margin-left: 8px; }

        @media (max-width: 820px) {
          .main { height: auto; }
          .setup-grid { grid-template-columns: 1fr; }
          .topbar { flex-direction: column; align-items: flex-start; gap: 10px; }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><Swords size={18} color="#C9A227" /> Chess Prep</div>
        <div className="mode-switch">
          <button className={mode === "board" ? "active" : ""} onClick={() => setMode("board")}>Analysis Board</button>
          <button className={mode === "prep" ? "active" : ""} onClick={() => setMode("prep")}>Opponent Prep</button>
        </div>
      </div>

      <div className="main">
        <div style={{ display: mode === "board" ? "block" : "none" }}><AnalysisBoard /></div>
        <div style={{ display: mode === "prep" ? "block" : "none" }}><OpponentPrep /></div>
      </div>
    </div>
  );
}
