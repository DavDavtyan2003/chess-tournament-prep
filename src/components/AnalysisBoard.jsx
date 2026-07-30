import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import {
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RotateCw, RefreshCw,
  ClipboardPaste, AlertTriangle, Search
} from "lucide-react";
import ChessBoard from "./ChessBoard.jsx";
import { useStockfish } from "../lib/useStockfish.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function positionsFromChess(chess) {
  const verbose = chess.history({ verbose: true });
  const positions = [{ fen: START_FEN, from: null, to: null, san: null }];
  const tmp = new Chess();
  for (const m of verbose) {
    tmp.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
    positions.push({ fen: tmp.fen(), from: m.from, to: m.to, san: m.san });
  }
  return positions;
}

function evalToWinPct(evaluation) {
  if (!evaluation) return 50;
  if (evaluation.type === "mate") return evaluation.value > 0 ? 100 : 0;
  return 50 + 50 * Math.tanh(evaluation.value / 400);
}

function evalToLabel(evaluation) {
  if (!evaluation) return "—";
  if (evaluation.type === "mate") return `#${Math.abs(evaluation.value)}`;
  const v = evaluation.value / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

export default function AnalysisBoard() {
  const [positions, setPositions] = useState([{ fen: START_FEN, from: null, to: null, san: null }]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState("white");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [pgnInput, setPgnInput] = useState("");
  const [loadError, setLoadError] = useState("");
  const [gameHeaders, setGameHeaders] = useState(null);
  const [fideId, setFideId] = useState("");
  const [fideResult, setFideResult] = useState(null);
  const [fideStatus, setFideStatus] = useState("");
  const [fideLoading, setFideLoading] = useState(false);
  const gameRef = useRef(new Chess());

  const { ready, thinking, evaluation, bestMoveUci, depth, evaluate, engineError } = useStockfish();

  const current = positions[ply];
  const lastPly = positions.length - 1;

  // Keep the live chess.js instance (used for legal-move lookups and new moves) in sync with ply.
  useEffect(() => {
    gameRef.current = new Chess(current.fen);
    setSelectedSquare(null);
  }, [ply, positions]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => evaluate(current.fen), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current.fen]);

  const goTo = useCallback((n) => setPly(Math.max(0, Math.min(lastPly, n))), [lastPly]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") goTo(ply + 1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(lastPly);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ply, lastPly, goTo]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return gameRef.current.moves({ square: selectedSquare, verbose: true }).map((m) => m.to);
  }, [selectedSquare, current.fen]);

  function attemptMove(from, to) {
    const chess = gameRef.current;
    const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
    setSelectedSquare(null);
    if (!legal) return false;
    const result = chess.move({ from, to, promotion: "q" });
    if (!result) return false;
    const truncated = positions.slice(0, ply + 1);
    const newPositions = [...truncated, { fen: result.after, from: result.from, to: result.to, san: result.san }];
    setPositions(newPositions);
    setPly(newPositions.length - 1);
    return true;
  }

  function handleSquareClick(square) {
    const chess = gameRef.current;
    const piece = chess.get(square);

    if (selectedSquare === square) { setSelectedSquare(null); return; }

    if (selectedSquare && legalTargets.includes(square)) {
      attemptMove(selectedSquare, square);
      return;
    }

    if (piece && piece.color === chess.turn()) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  }

  function handlePieceDragStart(square) {
    const chess = gameRef.current;
    const piece = chess.get(square);
    if (piece && piece.color === chess.turn()) setSelectedSquare(square);
  }

  function handlePieceDrop(from, to) {
    if (from === to) return;
    attemptMove(from, to);
  }

  function handleReset() {
    setPositions([{ fen: START_FEN, from: null, to: null, san: null }]);
    setPly(0);
    setSelectedSquare(null);
    setLoadError("");
    setGameHeaders(null);
  }

  function handleLoadPgn() {
    if (!pgnInput.trim()) return;
    try {
      const chess = new Chess();
      chess.loadPgn(pgnInput.trim());
      const newPositions = positionsFromChess(chess);
      setPositions(newPositions);
      setPly(newPositions.length - 1);
      setLoadError("");
      const headers = chess.header();
      setGameHeaders(headers.White || headers.Black ? headers : null);
    } catch (e) {
      setLoadError("Couldn't parse that PGN — check the format and try again.");
    }
  }

  async function handleFideLookup() {
    const id = fideId.trim();
    if (!id) { setFideStatus("Enter a FIDE ID first."); return; }
    setFideLoading(true);
    setFideStatus("Looking up…");
    try {
      const res = await fetch(`/api/fide?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setFideResult(data);
      setFideStatus("");
    } catch (e) {
      setFideResult(null);
      setFideStatus(e.message === "Failed to fetch" ? "Lookup failed — check the ID and try again." : `Lookup failed: ${e.message}`);
    } finally {
      setFideLoading(false);
    }
  }

  const bestMoveSan = useMemo(() => {
    if (!bestMoveUci) return null;
    try {
      const tmp = new Chess(current.fen);
      const result = tmp.move({
        from: bestMoveUci.slice(0, 2),
        to: bestMoveUci.slice(2, 4),
        promotion: bestMoveUci[4] || "q",
      });
      return result?.san || null;
    } catch (e) {
      return null;
    }
  }, [bestMoveUci, current.fen]);

  const winPct = evalToWinPct(evaluation);
  const evalLabel = evalToLabel(evaluation);

  const movePairs = [];
  for (let i = 1; i < positions.length; i += 2) {
    movePairs.push({
      num: Math.ceil(i / 2),
      whitePly: i,
      whiteSan: positions[i]?.san,
      blackPly: i + 1,
      blackSan: positions[i + 1]?.san,
    });
  }

  return (
    <div className="analysis-board-layout">
      <div className="analysis-board-main">
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
          <button className="btn ghost btn-icon" onClick={() => goTo(0)} title="First move"><ChevronsLeft size={15} /></button>
          <button className="btn ghost btn-icon" onClick={() => goTo(ply - 1)} title="Previous move"><ChevronLeft size={15} /></button>
          <span className="board-ply-indicator">{ply} / {lastPly}</span>
          <button className="btn ghost btn-icon" onClick={() => goTo(ply + 1)} title="Next move"><ChevronRight size={15} /></button>
          <button className="btn ghost btn-icon" onClick={() => goTo(lastPly)} title="Last move"><ChevronsRight size={15} /></button>
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

      <div className="analysis-board-side">
        <label className="field-label">FIDE lookup</label>
        <div className="fide-row">
          <div>
            <input type="text" value={fideId} onChange={(e) => setFideId(e.target.value)} placeholder="FIDE ID, e.g. 13300474" />
          </div>
          <button className="btn ghost btn-icon" onClick={handleFideLookup} disabled={fideLoading} title="Fetch from FIDE">
            <Search size={14} /> {fideLoading ? "…" : "Fetch"}
          </button>
        </div>
        {fideStatus && <div className="status-line">{fideStatus}</div>}
        {fideResult && (
          <div className="info-card">
            <div className="info-card-name">{fideResult.name}</div>
            <div className="info-card-sub">
              {[fideResult.title, fideResult.federation, fideResult.birthYear].filter(Boolean).join(" · ")}
            </div>
            <div className="info-card-ratings">
              {fideResult.standard != null && <span>Std {fideResult.standard}</span>}
              {fideResult.rapid != null && <span>Rapid {fideResult.rapid}</span>}
              {fideResult.blitz != null && <span>Blitz {fideResult.blitz}</span>}
            </div>
          </div>
        )}

        {gameHeaders && (
          <>
            <label className="field-label">Game info</label>
            <div className="info-card">
              <div className="info-card-name">{gameHeaders.White || "?"} <span className="muted">vs</span> {gameHeaders.Black || "?"}</div>
              <div className="info-card-sub">
                {[gameHeaders.Event, gameHeaders.Date, gameHeaders.Result].filter((v) => v && v !== "?").join(" · ")}
              </div>
              {(gameHeaders.WhiteElo || gameHeaders.BlackElo) && (
                <div className="info-card-ratings">
                  {gameHeaders.WhiteElo && <span>White {gameHeaders.WhiteElo}</span>}
                  {gameHeaders.BlackElo && <span>Black {gameHeaders.BlackElo}</span>}
                </div>
              )}
            </div>
          </>
        )}

        <label className="field-label">Load a PGN</label>
        <textarea
          className="analysis-pgn-input"
          value={pgnInput}
          onChange={(e) => setPgnInput(e.target.value)}
          placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 ...'}
        />
        <div className="btn-row">
          <button className="btn ghost" onClick={handleLoadPgn}><ClipboardPaste size={14} /> Load PGN</button>
        </div>
        {loadError && (
          <div className="board-warning"><AlertTriangle size={13} /> {loadError}</div>
        )}

        <label className="field-label">Moves</label>
        <div className="move-list">
          {movePairs.length === 0 && <div className="desc">Play a move on the board, or load a PGN.</div>}
          {movePairs.map((mp) => (
            <div className="move-list-row" key={mp.num}>
              <span className="move-list-num">{mp.num}.</span>
              {mp.whiteSan && (
                <span className={`move-list-san ${ply === mp.whitePly ? "active" : ""}`} onClick={() => goTo(mp.whitePly)}>
                  {mp.whiteSan}
                </span>
              )}
              {mp.blackSan && (
                <span className={`move-list-san ${ply === mp.blackPly ? "active" : ""}`} onClick={() => goTo(mp.blackPly)}>
                  {mp.blackSan}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
