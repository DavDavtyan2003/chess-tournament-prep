import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import { X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RotateCw, AlertTriangle } from "lucide-react";
import ChessBoard from "./ChessBoard.jsx";

function buildPositions(moves) {
  const chess = new Chess();
  const positions = [{ fen: chess.fen(), from: null, to: null, san: null }];
  let stoppedAtPly = null;
  for (let i = 0; i < moves.length; i++) {
    let result = null;
    try {
      result = chess.move(moves[i]);
    } catch (e) {
      result = null;
    }
    if (!result) { stoppedAtPly = i + 1; break; }
    positions.push({ fen: result.after, from: result.from, to: result.to, san: result.san });
  }
  return { positions, stoppedAtPly };
}

export default function GameViewer({ game, orientation: initialOrientation, onClose }) {
  const { positions, stoppedAtPly } = useMemo(() => buildPositions(game.moves), [game]);
  const [ply, setPly] = useState(positions.length - 1);
  const [orientation, setOrientation] = useState(initialOrientation === "black" ? "black" : "white");

  const lastPly = positions.length - 1;
  const goTo = useCallback((n) => setPly(Math.max(0, Math.min(lastPly, n))), [lastPly]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") goTo(ply + 1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(lastPly);
      else if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ply, lastPly, goTo, onClose]);

  const current = positions[ply];
  const white = game.headers.White || "White";
  const black = game.headers.Black || "Black";

  const movePairs = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    movePairs.push({
      num: i / 2 + 1,
      whitePly: i + 1,
      whiteSan: positions[i + 1]?.san,
      blackPly: i + 2,
      blackSan: positions[i + 2]?.san,
    });
  }

  return (
    <div className="board-modal-backdrop" onClick={onClose}>
      <div className="board-modal" onClick={(e) => e.stopPropagation()}>
        <button className="board-modal-close" onClick={onClose}><X size={18} /></button>

        <div className="board-modal-header">
          <div className="board-modal-title">{white} <span className="vs">vs</span> {black}</div>
          <div className="board-modal-sub">
            {game.headers.Event || "—"}{game.headers.Date ? ` · ${game.headers.Date}` : ""}{game.headers.Result ? ` · ${game.headers.Result}` : ""}
          </div>
        </div>

        <div className="board-modal-body">
          <div className="board-modal-board">
            <ChessBoard fen={current.fen} lastMove={{ from: current.from, to: current.to }} orientation={orientation} />
            <div className="board-controls">
              <button className="btn ghost btn-icon" onClick={() => goTo(0)} title="First move"><ChevronsLeft size={15} /></button>
              <button className="btn ghost btn-icon" onClick={() => goTo(ply - 1)} title="Previous move"><ChevronLeft size={15} /></button>
              <span className="board-ply-indicator">{ply} / {lastPly}</span>
              <button className="btn ghost btn-icon" onClick={() => goTo(ply + 1)} title="Next move"><ChevronRight size={15} /></button>
              <button className="btn ghost btn-icon" onClick={() => goTo(lastPly)} title="Last move"><ChevronsRight size={15} /></button>
              <button className="btn ghost btn-icon" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} title="Flip board"><RotateCw size={15} /></button>
            </div>
            {stoppedAtPly && (
              <div className="board-warning"><AlertTriangle size={13} /> Move list stopped at move {Math.ceil(stoppedAtPly / 2)} — the rest couldn't be replayed (likely a PGN formatting issue).</div>
            )}
          </div>

          <div className="board-modal-moves">
            <div className="move-list">
              {movePairs.map((mp) => (
                <div className="move-list-row" key={mp.num}>
                  <span className="move-list-num">{mp.num}.</span>
                  {mp.whiteSan && (
                    <span
                      className={`move-list-san ${ply === mp.whitePly ? "active" : ""}`}
                      onClick={() => goTo(mp.whitePly)}
                    >
                      {mp.whiteSan}
                    </span>
                  )}
                  {mp.blackSan && (
                    <span
                      className={`move-list-san ${ply === mp.blackPly ? "active" : ""}`}
                      onClick={() => goTo(mp.blackPly)}
                    >
                      {mp.blackSan}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
