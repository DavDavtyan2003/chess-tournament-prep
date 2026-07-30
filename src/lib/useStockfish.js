import { useEffect, useRef, useState, useCallback } from "react";

const ENGINE_PATH = "/stockfish-18-lite-single.js";

// Wraps the Stockfish WASM worker over its UCI text protocol.
// Evaluation is normalized to White's perspective (positive = White is better).
export function useStockfish() {
  const workerRef = useRef(null);
  const turnRef = useRef("w");
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [evaluation, setEvaluation] = useState(null); // { type: "cp" | "mate", value }
  const [bestMoveUci, setBestMoveUci] = useState(null);
  const [depth, setDepth] = useState(0);
  const [engineError, setEngineError] = useState(null);

  useEffect(() => {
    let worker;
    try {
      worker = new Worker(ENGINE_PATH);
    } catch (e) {
      setEngineError("Couldn't start the analysis engine.");
      return;
    }
    workerRef.current = worker;

    worker.onerror = () => setEngineError("Analysis engine failed to load.");

    worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : "";
      if (line === "uciok") {
        worker.postMessage("isready");
      } else if (line === "readyok") {
        setReady(true);
      } else if (line.startsWith("info")) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const depthMatch = line.match(/\bdepth (\d+)/);
        const pvMatch = line.match(/\bpv (\S+)/);
        if (scoreMatch) {
          const type = scoreMatch[1];
          let value = parseInt(scoreMatch[2], 10);
          if (turnRef.current === "b") value = -value;
          setEvaluation({ type, value });
        }
        if (depthMatch) setDepth(parseInt(depthMatch[1], 10));
        if (pvMatch) setBestMoveUci(pvMatch[1]);
      } else if (line.startsWith("bestmove")) {
        const m = line.match(/bestmove (\S+)/);
        if (m && m[1] !== "(none)") setBestMoveUci(m[1]);
        setThinking(false);
      }
    };

    worker.postMessage("uci");
    return () => worker.terminate();
  }, []);

  const evaluate = useCallback((fen, depthLimit = 14) => {
    const worker = workerRef.current;
    if (!worker) return;
    turnRef.current = (fen.split(" ")[1] || "w").toLowerCase();
    setThinking(true);
    setEvaluation(null);
    setBestMoveUci(null);
    setDepth(0);
    worker.postMessage("stop");
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depthLimit}`);
  }, []);

  return { ready, thinking, evaluation, bestMoveUci, depth, evaluate, engineError };
}
