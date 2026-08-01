import React, { useState } from "react";
import { AlertTriangle, Search, MapPin } from "lucide-react";

export default function AnalysisSidePanel({ game }) {
  const { fenInput, setFenInput, loadError, handleLoadFen, gameHeaders, ply, movePairs, goTo } = game;

  const [fideId, setFideId] = useState("");
  const [fideResult, setFideResult] = useState(null);
  const [fideStatus, setFideStatus] = useState("");
  const [fideLoading, setFideLoading] = useState(false);
  const [showFenInput, setShowFenInput] = useState(false);

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

  function submitFen() {
    handleLoadFen();
    setShowFenInput(false);
  }

  return (
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

      <label className="field-label">Position</label>
      {!showFenInput ? (
        <button className="btn ghost" onClick={() => setShowFenInput(true)}><MapPin size={14} /> Load position</button>
      ) : (
        <div className="fide-row">
          <div>
            <input
              type="text"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="Paste a FEN…"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submitFen()}
            />
          </div>
          <button className="btn ghost btn-icon" onClick={submitFen}>Load</button>
        </div>
      )}
      {loadError && (
        <div className="board-warning"><AlertTriangle size={13} /> {loadError}</div>
      )}

      <label className="field-label">Moves</label>
      <div className="move-list">
        {movePairs.length === 0 && <div className="desc">Play a move on the board, or load a position.</div>}
        <div className="move-list-flow">
          {movePairs.map((mp) => (
            <React.Fragment key={mp.num}>
              <span className="move-num">{mp.num}.</span>
              {mp.whiteSan && (
                <span className={`move-san ${ply === mp.whitePly ? "active" : ""}`} onClick={() => goTo(mp.whitePly)}>
                  {mp.whiteSan}
                </span>
              )}
              {mp.blackSan && (
                <span className={`move-san ${ply === mp.blackPly ? "active" : ""}`} onClick={() => goTo(mp.blackPly)}>
                  {mp.blackSan}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
