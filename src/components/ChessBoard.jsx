import React from "react";
import ChessPieceIcon from "./ChessPieceIcon.jsx";

function parseFenBoard(fen) {
  const boardPart = (fen || "").split(" ")[0];
  const rows = boardPart.split("/");
  // board2D[0] = rank 8 (a8..h8), board2D[7] = rank 1 (a1..h1)
  return rows.map((row, r) => {
    const rank = 8 - r;
    const cells = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push(null);
      } else {
        const file = String.fromCharCode("a".charCodeAt(0) + cells.length);
        cells.push({ square: `${file}${rank}`, type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" });
      }
    }
    return cells;
  });
}

export default function ChessBoard({ fen, lastMove, orientation = "white", interactive = false, selectedSquare = null, legalTargets = [], onSquareClick, onDragStart, onDrop }) {
  const board2D = parseFenBoard(fen);
  const displayRows = orientation === "black"
    ? [...board2D].reverse().map((row) => [...row].reverse())
    : board2D;

  const fileLabels = orientation === "black"
    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
    : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const rankLabels = orientation === "black"
    ? [1, 2, 3, 4, 5, 6, 7, 8]
    : [8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className="chess-board">
      <div className="chess-board-grid">
        {displayRows.map((row, r) => (
          <div className="chess-board-row" key={r}>
            {row.map((cell, c) => {
              const fileIndex = orientation === "black" ? 7 - c : c;
              const rank = rankLabels[r];
              const light = (fileIndex + rank) % 2 === 0;
              const squareName = `${String.fromCharCode("a".charCodeAt(0) + fileIndex)}${rank}`;
              const isLastMove = lastMove && (squareName === lastMove.from || squareName === lastMove.to);
              const isSelected = selectedSquare === squareName;
              const isLegalTarget = legalTargets.includes(squareName);
              return (
                <div
                  key={c}
                  className={`chess-square ${light ? "light" : "dark"} ${isLastMove ? "last-move" : ""} ${isSelected ? "selected" : ""} ${interactive ? "interactive" : ""}`}
                  onClick={interactive && onSquareClick ? () => onSquareClick(squareName) : undefined}
                  onDragOver={interactive ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
                  onDrop={interactive ? (e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/plain");
                    if (from) onDrop?.(from, squareName);
                  } : undefined}
                >
                  {cell && (
                    <span
                      className="chess-piece"
                      draggable={interactive}
                      onDragStart={interactive ? (e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", squareName);
                        onDragStart?.(squareName);
                      } : undefined}
                    >
                      <ChessPieceIcon type={cell.type} color={cell.color} />
                    </span>
                  )}
                  {isLegalTarget && <span className={`move-hint ${cell ? "capture" : ""}`} />}
                  {c === 0 && <span className="chess-rank-label">{rankLabels[r]}</span>}
                  {r === 7 && <span className="chess-file-label">{fileLabels[c]}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
