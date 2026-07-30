import React from "react";
import AnalysisBoard from "./components/AnalysisBoard.jsx";

export default function ChessPrepApp() {
  return (
    <div className="app">
      <style>{`
        .app { min-height: 100vh; background: #14171C; color: #E8E3D8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; }
        .app * { box-sizing: border-box; }
        .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
        .muted { color: #8B93A1; }

        .main { flex: 1; padding: 28px 32px; overflow-y: auto; height: 100vh; }

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

        @media (max-width: 820px) {
          .main { height: auto; }
        }
      `}</style>

      <div className="main">
        <AnalysisBoard />
      </div>
    </div>
  );
}
