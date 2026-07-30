import React from "react";

// "cburnett" piece set (same as lichess/Wikipedia default) — see public/pieces/NOTICE.md
const PIECE_LETTER = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };

export default function ChessPieceIcon({ type, color, size = "100%" }) {
  const file = `${color}${PIECE_LETTER[type]}`;
  return (
    <img
      src={`/pieces/${file}.svg`}
      alt={file}
      className="piece-svg"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
