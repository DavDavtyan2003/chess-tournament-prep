import React from "react";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RotateCw, RefreshCw, AlertTriangle } from "lucide-react";
import ChessBoard from "./ChessBoard.jsx";

export default function BoardPane({ game }) {
  const {
    current, lastPly, ply, orientation, setOrientation, selectedSquare, legalTargets,
    goToStart, goBack, goForward, goToEnd, handleSquareClick, handlePieceDragStart, handlePieceDrop, handleReset,
    ready, thinking, evaluation, depth, engineError, bestMoveSan, winPct, evalLabel,
  } = game;

  return (
    <div className="board-pane">
      <div className="analysis-board-eval-row">
        <div className={`eval-bar-wrap ${orientation === "black" ? "eval-bar-flipped" : ""}`} title={evalLabel}>
          <div className="eval-bar-fill" style={{ height: `${winPct}%` }} />
          <div className="eval-bar-label">{evalLabel}</div>
        </div>
        <ChessBoard
          fen={current.fen}
          lastMove={{ from: current.from, to: current.to }}
          orientation={orientation}
          interactive
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          onSquareClick={handleSquareClick}
          onDragStart={handlePieceDragStart}
          onDrop={handlePieceDrop}
        />
      </div>

      <div className="board-controls">
        <button className="btn ghost btn-icon" onClick={goToStart} title="First move"><ChevronsLeft size={15} /></button>
        <button className="btn ghost btn-icon" onClick={goBack} title="Previous move"><ChevronLeft size={15} /></button>
        <span className="board-ply-indicator">{ply} / {lastPly}</span>
        <button className="btn ghost btn-icon" onClick={goForward} title="Next move"><ChevronRight size={15} /></button>
        <button className="btn ghost btn-icon" onClick={goToEnd} title="Last move"><ChevronsRight size={15} /></button>
        <button className="btn ghost btn-icon" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} title="Flip board"><RotateCw size={15} /></button>
        <button className="btn ghost btn-icon" onClick={handleReset} title="Reset board"><RefreshCw size={15} /></button>
      </div>

      <div className="analysis-eval-line">
        {engineError ? (
          <span className="eval-error"><AlertTriangle size={13} /> {engineError}</span>
        ) : !ready ? (
          "Loading engine…"
        ) : thinking && !evaluation ? (
          "Thinking…"
        ) : (
          <>
            <strong>{evalLabel}</strong>
            {bestMoveSan && <> · best: <span className="mono">{bestMoveSan}</span></>}
            {depth > 0 && <span className="muted"> (depth {depth})</span>}
          </>
        )}
      </div>
    </div>
  );
}
