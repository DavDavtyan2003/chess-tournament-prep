import React, { useState } from "react";
import { Search } from "lucide-react";

export default function FideLookup({ defaultQuery = "", onResult }) {
  const [query, setQuery] = useState(defaultQuery);
  const [candidates, setCandidates] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function selectCandidate(fideId) {
    setLoading(true);
    setStatus("Loading profile…");
    try {
      const res = await fetch(`/api/fide?id=${fideId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setProfile(data);
      setCandidates(null);
      setStatus("");
      onResult?.(data);
    } catch (e) {
      setStatus(e.message === "Failed to fetch" ? "Lookup failed — try again." : `Lookup failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) { setStatus("Enter a name first."); return; }
    setLoading(true);
    setStatus("Searching…");
    setCandidates(null);
    setProfile(null);
    try {
      const res = await fetch(`/api/fide-search?name=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      if (!data.results || data.results.length === 0) {
        setStatus("No FIDE players found with that name.");
        setLoading(false);
      } else if (data.results.length === 1) {
        await selectCandidate(data.results[0].fideId);
      } else {
        setStatus(`${data.results.length} matches — pick one:`);
        setCandidates(data.results);
        setLoading(false);
      }
    } catch (e) {
      setStatus(e.message === "Failed to fetch" ? "Search failed — try again." : `Search failed: ${e.message}`);
      setLoading(false);
    }
  }

  const age = profile?.birthYear ? new Date().getFullYear() - profile.birthYear : null;

  return (
    <div className="fide-lookup">
      <div className="fide-row">
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Opponent name, e.g. Penades Ordaz, Victor"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button className="btn ghost btn-icon" onClick={handleSearch} disabled={loading} title="Search FIDE by name">
          <Search size={14} /> {loading ? "…" : "Search"}
        </button>
      </div>
      {status && <div className="status-line">{status}</div>}

      {candidates && (
        <div className="fide-candidates">
          {candidates.map((c) => (
            <div className="fide-candidate" key={c.fideId} onClick={() => selectCandidate(c.fideId)}>
              <img className="fide-candidate-flag" src={`https://ratings.fide.com/svg/${c.federation}.svg`} alt={c.federation} />
              <div className="fide-candidate-info">
                <div className="fide-candidate-name">{c.title ? `${c.title} ` : ""}{c.name}</div>
                <div className="fide-candidate-meta">
                  {[c.federation, c.standard != null && `Std ${c.standard}`, c.birthYear && `b. ${c.birthYear}`].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {profile && (
        <div className="info-card fide-profile-card">
          <div className="fide-profile-top">
            {profile.photo ? (
              <img className="fide-avatar" src={profile.photo} alt={profile.name} />
            ) : (
              <div className="fide-avatar fide-avatar-placeholder">{profile.name.charAt(0)}</div>
            )}
            <div>
              <div className="info-card-name">{profile.name}</div>
              <div className="info-card-sub">
                {[profile.title, profile.federation, age && `Age ${age}`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="info-card-ratings">
            {profile.standard != null && <span>Std {profile.standard}</span>}
            {profile.rapid != null && <span>Rapid {profile.rapid}</span>}
            {profile.blitz != null && <span>Blitz {profile.blitz}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
