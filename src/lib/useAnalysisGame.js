import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { useStockfish } from "./useStockfish.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROOT_ID = "root";

function makeRoot(fen) {
  return { id: ROOT_ID, fen, from: null, to: null, san: null, parentId: null, children: [] };
}

function getDepth(nodes, id) {
  let d = 0;
  let cur = nodes[id];
  while (cur && cur.parentId) { d++; cur = nodes[cur.parentId]; }
  return d;
}

// Follows children[0] (the main continuation) from id forward to a leaf.
function getLeafId(nodes, id) {
  let cur = nodes[id];
  while (cur && cur.children.length > 0) cur = nodes[cur.children[0]];
  return cur ? cur.id : id;
}

// Builds a printable move tree: a chain of moves along children[0], with any
// sibling variations at each step attached (recursively) as nested chains.
function buildChain(nodes, startId, startPly) {
  const segments = [];
  let id = startId;
  let ply = startPly;
  while (id) {
    const node = nodes[id];
    if (!node) break;
    segments.push({ type: "move", id: node.id, san: node.san, ply });
    const [, ...variationIds] = node.children;
    if (variationIds.length > 0) {
      segments.push({
        type: "variations",
        chains: variationIds.map((vid) => buildChain(nodes, vid, ply + 1)),
      });
    }
    id = node.children[0] || null;
    ply += 1;
  }
  return segments;
}

// Replays a raw SAN move list (e.g. from the custom PGN parser) into a fresh tree,
// stopping gracefully if a move can't be replayed.
function treeFromSanList(moves) {
  const chess = new Chess();
  const root = makeRoot(chess.fen());
  const nodes = { [ROOT_ID]: root };
  let parentId = ROOT_ID;
  let nextId = 1;
  let stoppedAtPly = null;
  for (let i = 0; i < (moves || []).length; i++) {
    let result = null;
    try { result = chess.move(moves[i]); } catch (e) { result = null; }
    if (!result) { stoppedAtPly = i + 1; break; }
    const id = String(nextId++);
    nodes[id] = { id, fen: result.after, from: result.from, to: result.to, san: result.san, parentId, children: [] };
    nodes[parentId].children.push(id);
    parentId = id;
  }
  return { nodes, lastId: parentId, stoppedAtPly, nextId };
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

// Owns the analysis board's live game state as a move TREE (main line + variations,
// ChessBase-style) so it can be shared between a persistent board pane and whichever
// side panel is currently shown.
export function useAnalysisGame() {
  const [nodes, setNodes] = useState(() => ({ [ROOT_ID]: makeRoot(START_FEN) }));
  const [currentId, setCurrentId] = useState(ROOT_ID);
  const [orientation, setOrientation] = useState("white");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [fenInput, setFenInput] = useState("");
  const [loadError, setLoadError] = useState("");
  const [gameHeaders, setGameHeaders] = useState(null);
  const gameRef = useRef(new Chess());
  const nextIdRef = useRef(1);

  const { ready, thinking, evaluation, bestMoveUci, depth, evaluate, engineError } = useStockfish();

  const current = nodes[currentId] || nodes[ROOT_ID];
  const ply = getDepth(nodes, currentId);
  const lastPly = getDepth(nodes, getLeafId(nodes, currentId));

  useEffect(() => {
    gameRef.current = new Chess(current.fen);
    setSelectedSquare(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, nodes]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => evaluate(current.fen), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current.fen]);

  const goToNode = useCallback((id) => setCurrentId((prev) => (nodes[id] ? id : prev)), [nodes]);
  const goToStart = useCallback(() => setCurrentId(ROOT_ID), []);
  const goBack = useCallback(() => {
    setCurrentId((id) => {
      const n = nodes[id];
      return n && n.parentId ? n.parentId : id;
    });
  }, [nodes]);
  const goForward = useCallback(() => {
    setCurrentId((id) => {
      const n = nodes[id];
      return n && n.children[0] ? n.children[0] : id;
    });
  }, [nodes]);
  const goToEnd = useCallback(() => setCurrentId((id) => getLeafId(nodes, id)), [nodes]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goBack();
      else if (e.key === "ArrowRight") goForward();
      else if (e.key === "Home") goToStart();
      else if (e.key === "End") goToEnd();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goBack, goForward, goToStart, goToEnd]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return gameRef.current.moves({ square: selectedSquare, verbose: true }).map((m) => m.to);
  }, [selectedSquare, current.fen]);

  // Plays a move from the current node. If it matches an existing child, just
  // navigates there; otherwise adds it as a new variation (never overwrites siblings).
  function attemptMove(from, to) {
    const chess = gameRef.current;
    const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
    setSelectedSquare(null);
    if (!legal) return false;
    const result = chess.move({ from, to, promotion: "q" });
    if (!result) return false;

    const parent = nodes[currentId];
    const existingChildId = parent.children.find((cid) => {
      const c = nodes[cid];
      return c && c.from === result.from && c.to === result.to && c.san === result.san;
    });
    if (existingChildId) {
      setCurrentId(existingChildId);
      return true;
    }

    const id = String(nextIdRef.current++);
    const newNode = { id, fen: result.after, from: result.from, to: result.to, san: result.san, parentId: currentId, children: [] };
    setNodes((prev) => ({
      ...prev,
      [currentId]: { ...prev[currentId], children: [...prev[currentId].children, id] },
      [id]: newNode,
    }));
    setCurrentId(id);
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
    nextIdRef.current = 1;
    setNodes({ [ROOT_ID]: makeRoot(START_FEN) });
    setCurrentId(ROOT_ID);
    setSelectedSquare(null);
    setLoadError("");
    setGameHeaders(null);
  }

  function handleLoadFen() {
    if (!fenInput.trim()) return;
    try {
      const chess = new Chess();
      chess.load(fenInput.trim());
      nextIdRef.current = 1;
      setNodes({ [ROOT_ID]: makeRoot(chess.fen()) });
      setCurrentId(ROOT_ID);
      setSelectedSquare(null);
      setLoadError("");
      setGameHeaders(null);
    } catch (e) {
      setLoadError("That doesn't look like a valid FEN — check the format and try again.");
    }
  }

  // Loads a game from the shape produced by the custom PGN parser ({ moves: SAN[], headers }),
  // used e.g. when opening a game from the Opponent Prep games list. Replaces the whole tree.
  function loadGame(moves, headers) {
    const { nodes: newNodes, lastId, stoppedAtPly, nextId } = treeFromSanList(moves);
    nextIdRef.current = nextId;
    setNodes(newNodes);
    setCurrentId(lastId);
    setSelectedSquare(null);
    setLoadError(stoppedAtPly ? `Move list stopped at move ${Math.ceil(stoppedAtPly / 2)} — the rest couldn't be replayed.` : "");
    setGameHeaders(headers && (headers.White || headers.Black) ? headers : null);
  }

  // Reorders the node's parent's children so it becomes the main line.
  function makeMainLine(id) {
    const node = nodes[id];
    if (!node || !node.parentId) return;
    const parent = nodes[node.parentId];
    setNodes((prev) => ({
      ...prev,
      [parent.id]: { ...parent, children: [id, ...parent.children.filter((cid) => cid !== id)] },
    }));
  }

  // Removes a node and its whole subtree. Can't delete the root.
  function deleteNode(id) {
    const node = nodes[id];
    if (!node || !node.parentId) return;
    const parent = nodes[node.parentId];
    const toRemove = new Set();
    (function collect(nid) {
      toRemove.add(nid);
      (nodes[nid]?.children || []).forEach(collect);
    })(id);

    const next = { ...nodes };
    toRemove.forEach((rid) => delete next[rid]);
    next[parent.id] = { ...parent, children: parent.children.filter((cid) => cid !== id) };
    setNodes(next);
    if (toRemove.has(currentId)) setCurrentId(parent.id);
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

  const moveTree = useMemo(() => {
    const root = nodes[ROOT_ID];
    if (!root || !root.children[0]) return [];
    return buildChain(nodes, root.children[0], 1);
  }, [nodes]);

  return {
    current, ply, lastPly, currentId, orientation, setOrientation, selectedSquare, legalTargets,
    goToStart, goBack, goForward, goToEnd, goToNode,
    handleSquareClick, handlePieceDragStart, handlePieceDrop, handleReset,
    fenInput, setFenInput, loadError, handleLoadFen, loadGame, gameHeaders,
    makeMainLine, deleteNode,
    ready, thinking, evaluation, depth, engineError, bestMoveSan, winPct, evalLabel,
    moveTree,
  };
}
