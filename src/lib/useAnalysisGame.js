import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { useStockfish } from "./useStockfish.js";

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

// Owns the analysis board's live game state (position, moves, engine eval) so it can be
// shared between a persistent board pane and whichever side panel is currently shown.
export function useAnalysisGame() {
  const [positions, setPositions] = useState([{ fen: START_FEN, from: null, to: null, san: null }]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState("white");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [pgnInput, setPgnInput] = useState("");
  const [loadError, setLoadError] = useState("");
  const [gameHeaders, setGameHeaders] = useState(null);
  const gameRef = useRef(new Chess());

  const { ready, thinking, evaluation, bestMoveUci, depth, evaluate, engineError } = useStockfish();

  const current = positions[ply];
  const lastPly = positions.length - 1;

  useEffect(() => {
    gameRef.current = new Chess(current.fen);
    setSelectedSquare(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, positions]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => evaluate(current.fen), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current.fen]);

  const goTo = useCallback((n) => setPly((p) => Math.max(0, Math.min(lastPly, n))), [lastPly]);

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

  return {
    current, lastPly, ply, orientation, setOrientation, selectedSquare, legalTargets,
    goTo, handleSquareClick, handlePieceDragStart, handlePieceDrop, handleReset,
    pgnInput, setPgnInput, loadError, handleLoadPgn, gameHeaders,
    ready, thinking, evaluation, depth, engineError, bestMoveSan, winPct, evalLabel,
    movePairs,
  };
}
