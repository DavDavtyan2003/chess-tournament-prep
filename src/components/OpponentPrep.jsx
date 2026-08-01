import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer
} from "recharts";
import {
  Save, RefreshCw, ChevronRight, ChevronDown,
  Info, Swords, AlertTriangle, FolderOpen, X, ClipboardPaste, Pencil, Upload
} from "lucide-react";
import { storage } from "../storage.js";
import { ECO_NAMES } from "../data/ecoNames.js";
import FideLookup from "./FideLookup.jsx";

const TREE_MAX_PLY = 14;
const TREE_MAX_CHILDREN = 5;
const COLORS = ["#C9A227", "#5FA777", "#8B93A1", "#B25550", "#6E8FB0", "#A57BC7", "#C9865A"];

/* ============================== PGN PARSING ============================== */

function splitGames(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];
  return trimmed.split(/\n\s*(?=\[Event\s)/i).map((s) => s.trim()).filter(Boolean);
}

function parseHeaders(block) {
  const headers = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(block))) headers[m[1]] = m[2];
  return headers;
}

function extractMoves(block) {
  let text = block.replace(/\[(\w+)\s+"([^"]*)"\]/g, "");
  text = text.replace(/\{[^}]*\}/g, " ");
  text = text.replace(/\$\d+/g, " ");
  let prevLen;
  do {
    prevLen = text.length;
    text = text.replace(/\([^()]*\)/g, " ");
  } while (text.length !== prevLen);
  text = text.replace(/1-0|0-1|1\/2-1\/2|\*/g, " ");
  text = text.replace(/\d+\.(\.\.)?/g, " ");
  return text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function parsePGNText(raw) {
  return splitGames(raw).map((block, idx) => {
    const headers = parseHeaders(block);
    const moves = extractMoves(block);
    return { id: idx, headers, moves };
  });
}

/* ============================== CLASSIFICATION ============================== */

function normName(s) {
  return (s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function nameMatches(pgnName, target) {
  if (!pgnName || !target) return false;
  const a = normName(pgnName);
  const b = normName(target);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 3));
  const bTokens = b.split(" ").filter((t) => t.length >= 3);
  return bTokens.some((t) => aTokens.has(t));
}

function classifyGame(game, opponentName, myName) {
  const white = game.headers.White || "";
  const black = game.headers.Black || "";
  const oppWhite = nameMatches(white, opponentName);
  const oppBlack = nameMatches(black, opponentName);
  let opponentColor = null;
  if (oppWhite && !oppBlack) opponentColor = "white";
  else if (oppBlack && !oppWhite) opponentColor = "black";
  else if (oppWhite && oppBlack) opponentColor = "ambiguous";

  let isH2H = false;
  if (myName && (opponentColor === "white" || opponentColor === "black")) {
    const other = opponentColor === "white" ? black : white;
    if (nameMatches(other, myName)) isH2H = true;
  }
  return { ...game, opponentColor, isH2H };
}

function opponentScore(game) {
  const result = game.headers.Result;
  if (!result || !game.opponentColor || game.opponentColor === "ambiguous") return null;
  if (result === "1/2-1/2") return 0.5;
  if (result === "1-0") return game.opponentColor === "white" ? 1 : 0;
  if (result === "0-1") return game.opponentColor === "black" ? 1 : 0;
  return null;
}

function opposingElo(game) {
  const key = game.opponentColor === "white" ? "BlackElo" : "WhiteElo";
  const v = parseInt(game.headers[key], 10);
  return isNaN(v) ? null : v;
}

function ratingBand(elo) {
  if (elo == null) return "Unrated / unknown";
  if (elo < 1800) return "< 1800";
  if (elo < 2000) return "1800–1999";
  if (elo < 2200) return "2000–2199";
  if (elo < 2400) return "2200–2399";
  return "2400+";
}

function confidenceLabel(n) {
  if (n < 3) return { label: "Low", cls: "conf-low" };
  if (n < 8) return { label: "Medium", cls: "conf-med" };
  return { label: "High", cls: "conf-high" };
}

function parsePgnDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (isNaN(y)) return null;
  const mo = m[2] === "??" ? 6 : parseInt(m[2], 10);
  const d = m[3] === "??" ? 15 : parseInt(m[3], 10);
  return new Date(y, (mo || 1) - 1, d || 1);
}

function openingKey(g) {
  if (g.headers.Opening) return g.headers.Opening + (g.headers.ECO ? ` (${g.headers.ECO})` : "");
  if (g.headers.ECO) {
    const name = ECO_NAMES[g.headers.ECO.toUpperCase()];
    return name ? `${name} (${g.headers.ECO})` : `ECO ${g.headers.ECO}`;
  }
  return g.moves.slice(0, 4).join(" ") || "Unclassified";
}

/* ============================== TREE BUILDING ============================== */

function buildTree(games) {
  const root = { san: null, ply: 0, count: 0, wins: 0, draws: 0, losses: 0, children: {}, games: [] };
  games.forEach((g) => {
    let node = root;
    node.count++;
    node.games.push(g);
    const s = opponentScore(g);
    if (s === 1) node.wins++; else if (s === 0.5) node.draws++; else if (s === 0) node.losses++;
    const maxPly = Math.min(g.moves.length, TREE_MAX_PLY);
    for (let i = 0; i < maxPly; i++) {
      const mv = g.moves[i];
      if (!node.children[mv]) node.children[mv] = { san: mv, ply: i + 1, count: 0, wins: 0, draws: 0, losses: 0, children: {}, games: [] };
      node = node.children[mv];
      node.count++;
      node.games.push(g);
      if (s === 1) node.wins++; else if (s === 0.5) node.draws++; else if (s === 0) node.losses++;
    }
  });
  return root;
}

function modalPath(games) {
  const path = [];
  let pool = games;
  for (let ply = 0; ply < TREE_MAX_PLY; ply++) {
    const counts = {};
    pool.forEach((g) => { const mv = g.moves[ply]; if (mv) counts[mv] = (counts[mv] || 0) + 1; });
    const entries = Object.entries(counts);
    if (entries.length === 0) break;
    entries.sort((a, b) => b[1] - a[1]);
    const [bestMove, bestCount] = entries[0];
    if (bestCount / pool.length < 0.4 && entries.length > 1) break;
    path.push(bestMove);
    pool = pool.filter((g) => g.moves[ply] === bestMove);
    if (pool.length < 2) break;
  }
  return path;
}

function avgDeviationPly(games) {
  if (games.length === 0) return null;
  const path = modalPath(games);
  if (path.length === 0) return null;
  let total = 0;
  games.forEach((g) => {
    let matched = 0;
    for (let i = 0; i < path.length; i++) { if (g.moves[i] === path[i]) matched++; else break; }
    total += matched;
  });
  return total / games.length;
}

/* ============================== SMALL UI HELPERS ============================== */

function ScorePill({ wins, draws, losses }) {
  const n = wins + draws + losses;
  const score = n ? ((wins + draws * 0.5) / n) * 100 : 0;
  return (
    <span className="score-pill">
      <span className="sp-seg sp-win" style={{ flexGrow: wins || 0.0001 }} />
      <span className="sp-seg sp-draw" style={{ flexGrow: draws || 0.0001 }} />
      <span className="sp-seg sp-loss" style={{ flexGrow: losses || 0.0001 }} />
      <span className="sp-label">{score.toFixed(0)}%</span>
    </span>
  );
}

function ConfBadge({ n }) {
  const c = confidenceLabel(n);
  return <span className={`conf-badge ${c.cls}`}>{c.label} conf · n={n}</span>;
}

function TreeNode({ node, parentCount, depth, onOpenGame }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showGames, setShowGames] = useState(false);
  const childrenArr = Object.values(node.children).sort((a, b) => b.count - a.count);
  const shown = childrenArr.slice(0, TREE_MAX_CHILDREN);
  const hidden = childrenArr.length - shown.length;
  const pct = parentCount ? ((node.count / parentCount) * 100).toFixed(1) : "100.0";
  const scoreTotal = node.wins + node.draws * 0.5;
  const scorePct = node.count ? ((scoreTotal / node.count) * 100).toFixed(0) : "0";
  const moveNum = Math.ceil(node.ply / 2);
  const label = node.ply % 2 === 1 ? `${moveNum}.${node.san}` : `${moveNum}...${node.san}`;
  const hasGames = node.ply > 0 && node.count > 0;

  return (
    <div className="tree-branch">
      <div className={`tree-row ${childrenArr.length ? "clickable" : ""}`} style={{ paddingLeft: depth * 18 }} onClick={() => childrenArr.length && setExpanded((e) => !e)}>
        <span className="tree-caret">
          {childrenArr.length ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13, display: "inline-block" }} />}
        </span>
        <span className="tree-move">{label}</span>
        <span className="tree-bar-wrap"><span className="tree-bar" style={{ width: `${pct}%` }} /></span>
        <span className="tree-pct">{pct}%</span>
        <span className="tree-n">n={node.count}</span>
        <span className={`tree-score ${scorePct >= 55 ? "good" : scorePct <= 45 ? "bad" : ""}`}>{scorePct}%</span>
        {hasGames && (
          <span className="tree-games-toggle" onClick={(e) => { e.stopPropagation(); setShowGames((s) => !s); }}>
            {showGames ? "hide" : "show"} game{node.count > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {showGames && hasGames && (
        <div className="tree-games-list" style={{ paddingLeft: depth * 18 + 21 }}>
          {node.games.map((g) => {
            const other = g.opponentColor === "white" ? g.headers.Black : g.headers.White;
            return (
              <div className="tree-game-item" key={g.id} onClick={() => onOpenGame(g)}>
                <span className="tree-game-date">{g.headers.Date || "—"}</span>
                <span className="tree-game-opp">vs {other || "—"}</span>
                <span className="tree-game-result">{g.headers.Result || "—"}</span>
              </div>
            );
          })}
        </div>
      )}
      {expanded && shown.map((child) => (
        <TreeNode key={child.san + child.ply} node={child} parentCount={node.count} depth={depth + 1} onOpenGame={onOpenGame} />
      ))}
      {expanded && hidden > 0 && (
        <div className="tree-more" style={{ paddingLeft: (depth + 1) * 18 + 13 }}>+{hidden} more branch{hidden > 1 ? "es" : ""}</div>
      )}
    </div>
  );
}

/* ============================== MAIN COMPONENT ============================== */

const EMPTY_PROFILE = { name: "", country: "", age: "", title: "", ratingStd: "", ratingRapid: "", ratingBlitz: "", photo: null };

export default function OpponentPrep({ onOpenGame }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState("white");
  const [rawPgn, setRawPgn] = useState("");
  const [games, setGames] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [recencyMonths, setRecencyMonths] = useState(12);
  const [performanceView, setPerformanceView] = useState("recency");
  const [parseWarning, setParseWarning] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [showPasteBox, setShowPasteBox] = useState(false);
  const fileInputRef = useRef(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);

  const [savedList, setSavedList] = useState([]);
  const [storageStatus, setStorageStatus] = useState("");

  useEffect(() => { refreshSavedList(); }, []);

  async function refreshSavedList() {
    try {
      const res = await storage.list("opponent:");
      if (!res || !res.keys || res.keys.length === 0) { setSavedList([]); return; }
      const items = [];
      for (const key of res.keys) {
        try {
          const r = await storage.get(key);
          if (r && r.value) {
            const parsed = JSON.parse(r.value);
            items.push({ key, name: parsed.profile?.name || key, savedAt: parsed.savedAt });
          }
        } catch (e) { /* skip unreadable entry */ }
      }
      items.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      setSavedList(items);
    } catch (e) { setSavedList([]); }
  }

  function slugify(name) {
    return (name || "opponent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "opponent";
  }

  async function handleSave() {
    if (!profile.name.trim()) { setStorageStatus("Add the opponent's name before saving."); return; }
    setStorageStatus("Saving…");
    try {
      const key = `opponent:${slugify(profile.name)}`;
      const value = JSON.stringify({ profile, myName, myColor, rawPgn, savedAt: new Date().toISOString() });
      const res = await storage.set(key, value);
      if (!res) throw new Error("no result");
      setStorageStatus("Saved.");
      refreshSavedList();
    } catch (e) { setStorageStatus("Save failed — try again."); }
  }

  async function handleLoad(key) {
    setStorageStatus("Loading…");
    try {
      const r = await storage.get(key);
      if (!r || !r.value) throw new Error("missing");
      const parsed = JSON.parse(r.value);
      setProfile(parsed.profile || {});
      setMyName(parsed.myName || "");
      setMyColor(parsed.myColor || "white");
      setRawPgn(parsed.rawPgn || "");
      if (parsed.rawPgn) doParse(parsed.rawPgn, parsed.profile?.name || "", parsed.myName || "");
      setStorageStatus("Loaded.");
    } catch (e) { setStorageStatus("Couldn't load that profile."); }
  }

  async function handleDelete(key) {
    try {
      await storage.delete(key);
      refreshSavedList();
      setStorageStatus("Deleted.");
    } catch (e) { setStorageStatus("Delete failed."); }
  }

  function handleFideResult(data) {
    setProfile((p) => ({
      ...p,
      name: data.name || p.name,
      country: data.federation || p.country,
      age: data.birthYear ? String(new Date().getFullYear() - data.birthYear) : p.age,
      title: data.title || p.title,
      ratingStd: data.standard != null ? String(data.standard) : p.ratingStd,
      ratingRapid: data.rapid != null ? String(data.rapid) : p.ratingRapid,
      ratingBlitz: data.blitz != null ? String(data.blitz) : p.ratingBlitz,
      photo: data.photo || p.photo,
    }));
  }

  function doParse(pgnText, oppName, myNm) {
    const parsed = parsePGNText(pgnText);
    if (parsed.length === 0) { setParseWarning("No games found — check that the pasted text includes [Event \"...\"] headers."); setGames([]); return; }
    const classified = parsed.map((g) => classifyGame(g, oppName, myNm));
    const unmatched = classified.filter((g) => !g.opponentColor).length;
    setParseWarning(
      !oppName.trim()
        ? "Enter the opponent's name (as it appears in the PGN) so games can be matched to them."
        : unmatched > 0
        ? `${unmatched} of ${classified.length} pasted game(s) didn't match the opponent's name on either side — check spelling.`
        : ""
    );
    setGames(classified);
    setActiveTab("overview");
    if (classified.length > 0) setSetupCollapsed(true);
  }

  function handleParseClick() { doParse(rawPgn, profile.name, myName); }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRawPgn(text);
      doParse(text, profile.name, myName);
      setImportStatus(`Loaded ${file.name}`);
    };
    reader.onerror = () => setImportStatus(`Couldn't read ${file.name}.`);
    reader.readAsText(file);
  }

  function handleClear() {
    setProfile(EMPTY_PROFILE);
    setMyName("");
    setRawPgn("");
    setGames(null);
    setParseWarning("");
    setImportStatus("");
    setSetupCollapsed(false);
  }

  /* ---------- derived data ---------- */

  const relevant = useMemo(() => {
    if (!games) return [];
    const wantOpponentColor = myColor === "white" ? "black" : "white";
    return games.filter((g) => g.opponentColor === wantOpponentColor);
  }, [games, myColor]);

  const h2hGames = useMemo(() => (games || []).filter((g) => g.isH2H), [games]);
  const unmatchedGames = useMemo(() => (games || []).filter((g) => !g.opponentColor), [games]);

  function byNewestFirst(a, b) {
    const da = parsePgnDate(a.headers.Date);
    const db = parsePgnDate(b.headers.Date);
    if (da && db) return db - da;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return 0;
  }
  const relevantByDate = useMemo(() => [...relevant].sort(byNewestFirst), [relevant]);
  const unmatchedByDate = useMemo(() => [...unmatchedGames].sort(byNewestFirst), [unmatchedGames]);
  const otherSideCount = useMemo(() => {
    if (!games) return 0;
    const wantOpponentColor = myColor === "white" ? "black" : "white";
    return games.filter((g) => g.opponentColor && g.opponentColor !== wantOpponentColor && g.opponentColor !== "ambiguous").length;
  }, [games, myColor]);

  const overallScore = useMemo(() => {
    const scores = relevant.map(opponentScore).filter((s) => s !== null);
    if (scores.length === 0) return null;
    const w = scores.filter((s) => s === 1).length;
    const d = scores.filter((s) => s === 0.5).length;
    const l = scores.filter((s) => s === 0).length;
    return { w, d, l, n: scores.length };
  }, [relevant]);

  const tree = useMemo(() => buildTree(relevant), [relevant]);

  const openingGroups = useMemo(() => {
    const map = {};
    relevant.forEach((g) => { const key = openingKey(g); if (!map[key]) map[key] = []; map[key].push(g); });
    return Object.entries(map).map(([name, gs]) => {
      const scores = gs.map(opponentScore).filter((s) => s !== null);
      const w = scores.filter((s) => s === 1).length;
      const d = scores.filter((s) => s === 0.5).length;
      const l = scores.filter((s) => s === 0).length;
      const dev = avgDeviationPly(gs);
      return {
        name, games: gs, count: gs.length, w, d, l,
        scorePct: scores.length ? ((w + d * 0.5) / scores.length) * 100 : 0,
        freqPct: relevant.length ? (gs.length / relevant.length) * 100 : 0,
        devMoveNum: dev != null ? Math.ceil(dev / 2) : null,
      };
    }).sort((a, b) => b.count - a.count);
  }, [relevant]);

  const ratingBandStats = useMemo(() => {
    const map = {};
    relevant.forEach((g) => { const band = ratingBand(opposingElo(g)); if (!map[band]) map[band] = []; map[band].push(g); });
    const order = ["< 1800", "1800–1999", "2000–2199", "2200–2399", "2400+", "Unrated / unknown"];
    return order.filter((b) => map[b]).map((band) => {
      const gs = map[band];
      const scores = gs.map(opponentScore).filter((s) => s !== null);
      const w = scores.filter((s) => s === 1).length;
      const d = scores.filter((s) => s === 0.5).length;
      const l = scores.filter((s) => s === 0).length;
      return { band, n: gs.length, w, d, l, scorePct: scores.length ? ((w + d * 0.5) / scores.length) * 100 : 0 };
    });
  }, [relevant]);

  const recencyData = useMemo(() => {
    const now = new Date();
    const withDates = relevant.map((g) => ({ g, date: parsePgnDate(g.headers.Date) })).filter((x) => x.date);
    const recent = withDates.filter((x) => (now - x.date) / (1000 * 60 * 60 * 24 * 30.44) <= recencyMonths).map((x) => x.g);
    const older = withDates.filter((x) => (now - x.date) / (1000 * 60 * 60 * 24 * 30.44) > recencyMonths).map((x) => x.g);
    function groupPct(list) {
      const map = {};
      list.forEach((g) => { const k = openingKey(g); map[k] = (map[k] || 0) + 1; });
      const total = list.length || 1;
      return Object.entries(map).map(([name, c]) => ({ name, pct: (c / total) * 100, n: c }));
    }
    const recentGroups = groupPct(recent);
    const olderGroups = groupPct(older);
    const names = Array.from(new Set([...recentGroups.map((x) => x.name), ...olderGroups.map((x) => x.name)]));
    const combined = names.map((name) => ({
      name,
      recent: recentGroups.find((x) => x.name === name)?.pct || 0,
      older: olderGroups.find((x) => x.name === name)?.pct || 0,
    })).sort((a, b) => (b.recent + b.older) - (a.recent + a.older)).slice(0, 8);
    return { recentCount: recent.length, olderCount: older.length, combined, undated: relevant.length - withDates.length };
  }, [relevant, recencyMonths]);

  const pieData = openingGroups.slice(0, 7).map((o) => ({ name: o.name, value: o.count }));
  const oppLabel = myColor === "white" ? "his Black games" : "his White games";

  /* ============================== RENDER ============================== */

  return (
    <div className="opponent-prep">
      {setupCollapsed && games !== null ? (
        <div className="setup-strip">
          <div className="setup-strip-info">
            {profile.photo ? (
              <img className="fide-avatar fide-avatar-sm" src={profile.photo} alt={profile.name} />
            ) : (
              <div className="fide-avatar fide-avatar-sm fide-avatar-placeholder">{(profile.name || "?").charAt(0)}</div>
            )}
            <span className="setup-strip-name">{profile.name || "Unnamed opponent"}</span>
            {(profile.title || profile.ratingStd || profile.country) && (
              <span className="setup-strip-meta">{[profile.title, profile.ratingStd, profile.country].filter(Boolean).join(" · ")}</span>
            )}
            <span className="setup-strip-color">You play <strong>{myColor === "white" ? "White" : "Black"}</strong></span>
          </div>
          <div className="setup-strip-actions">
            <button className="btn ghost btn-icon" onClick={handleSave} title="Save profile"><Save size={14} /> Save</button>
            <button className="btn ghost btn-icon" onClick={() => setSetupCollapsed(false)} title="Edit setup"><Pencil size={14} /> Edit</button>
          </div>
        </div>
      ) : (
        <div className="setup-card">
          {games !== null && (
            <button className="btn ghost back-link" onClick={() => setSetupCollapsed(true)}>‹ Back to analysis</button>
          )}

          <div className="setup-fide-block">
            <label className="field-label" style={{ marginTop: 0 }}>FIDE lookup</label>
            <FideLookup defaultQuery={profile.name} onResult={handleFideResult} />
          </div>

          <div className="setup-grid">
            <div className="setup-field setup-field-wide">
              <label className="field-label">Opponent name (as in PGN)</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Lastname, Firstname" />
            </div>
            <div className="setup-field">
              <label className="field-label">You will play</label>
              <div className="color-toggle">
                <button className={myColor === "white" ? "active" : ""} onClick={() => setMyColor("white")}>White</button>
                <button className={myColor === "black" ? "active" : ""} onClick={() => setMyColor("black")}>Black</button>
              </div>
            </div>
          </div>

          <div className="setup-grid setup-grid-compact">
            <div className="setup-field"><label className="field-label">Country</label><input type="text" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} /></div>
            <div className="setup-field"><label className="field-label">Age</label><input type="number" value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })} /></div>
            <div className="setup-field"><label className="field-label">Title</label><input type="text" value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} placeholder="FM / IM / GM…" /></div>
            <div className="setup-field"><label className="field-label">Std</label><input type="number" value={profile.ratingStd} onChange={(e) => setProfile({ ...profile, ratingStd: e.target.value })} /></div>
            <div className="setup-field"><label className="field-label">Rapid</label><input type="number" value={profile.ratingRapid} onChange={(e) => setProfile({ ...profile, ratingRapid: e.target.value })} /></div>
            <div className="setup-field"><label className="field-label">Blitz</label><input type="number" value={profile.ratingBlitz} onChange={(e) => setProfile({ ...profile, ratingBlitz: e.target.value })} /></div>
            <div className="setup-field"><label className="field-label">Your name (h2h)</label><input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Optional" /></div>
          </div>

          <div className="setup-import-row">
            <div className="setup-import-controls">
              <button className="btn ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload .pgn file</button>
              <input ref={fileInputRef} type="file" accept=".pgn,.txt,text/plain" style={{ display: "none" }} onChange={handleFileUpload} />
              <button className="btn ghost" onClick={() => setShowPasteBox((s) => !s)}><ClipboardPaste size={14} /> {showPasteBox ? "Hide paste box" : "…or paste PGN text"}</button>
              {importStatus && <div className="status-line">{importStatus}</div>}
            </div>
            {showPasteBox && (
              <textarea className="setup-pgn-input" value={rawPgn} onChange={(e) => setRawPgn(e.target.value)} placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n[Result "1-0"]\n\n1.e4 c5 2.Nf3 ...'} />
            )}
          </div>

          <div className="setup-actions">
            <button className="btn primary" onClick={handleParseClick}><ClipboardPaste size={15} /> Parse &amp; analyze</button>
            <button className="btn ghost" onClick={handleSave}><Save size={14} /> Save profile</button>
            <button className="btn ghost" onClick={handleClear}><RefreshCw size={14} /> Clear</button>
          </div>
          <div className="status-line">{storageStatus}</div>

          {savedList.length > 0 && (
            <div className="saved-chips">
              <span className="field-label" style={{ marginTop: 0 }}><FolderOpen size={12} style={{ verticalAlign: "-2px" }} /> Saved</span>
              {savedList.map((item) => (
                <span className="saved-chip" key={item.key} onClick={() => handleLoad(item.key)}>
                  {item.name}
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.key); }}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {games !== null && (
        <>
          {parseWarning && (
            <div className="warning-box"><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{parseWarning}</span></div>
          )}

          {h2hGames.length > 0 && (
            <div className="h2h-banner">
              <Swords size={16} color="#E89494" />
              <span>You've played this opponent before — <span className="n">{h2hGames.length} head-to-head game{h2hGames.length > 1 ? "s" : ""}</span> found and excluded from the stats below. See the Games tab for details.</span>
            </div>
          )}

          <div className="tabs">
            {[["overview", "Overview"], ["tree", "Opening Tree"], ["performance", "Performance"], ["games", "Games"]].map(([key, label]) => (
              <div key={key} className={`tab ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>{label}</div>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
              <div className="hero-stat">
                <div className="hero-stat-label">Opponent's score ({oppLabel})</div>
                {overallScore ? (
                  <div className="hero-stat-row">
                    <div className="hero-stat-value">{(((overallScore.w + overallScore.d * 0.5) / overallScore.n) * 100).toFixed(0)}%</div>
                    <div className="hero-stat-details">
                      <div className="hero-stat-wdl">{overallScore.w}–{overallScore.d}–{overallScore.l} <span className="muted">in {overallScore.n} games</span></div>
                      <ConfBadge n={relevant.length} />
                    </div>
                  </div>
                ) : (
                  <div className="hero-stat-empty">No results found for {oppLabel}.</div>
                )}
              </div>

              <div className="grid grid-secondary">
                <div className="stat-card">
                  <div className="label">Games analyzed</div>
                  <div className="value">{relevant.length}</div>
                  <div className="sub">of {games.length} pasted</div>
                </div>
                <div className="stat-card">
                  <div className="label">Most common line</div>
                  <div className="value" style={{ fontSize: 15 }}>{openingGroups[0]?.name || "—"}</div>
                  <div className="sub">{openingGroups[0] ? `${openingGroups[0].freqPct.toFixed(0)}% of games` : ""}</div>
                </div>
              </div>

              {relevant.length > 0 ? (
                <div className="panel">
                  <h2>Opening distribution</h2>
                  <div className="desc">Share of {oppLabel} by opening, grouped from PGN Opening/ECO tags where available.</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name} ${((e.value / relevant.length) * 100).toFixed(0)}%`}>
                        {pieData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1C2129", border: "1px solid #2A313C" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="panel"><div className="desc">No games matched "{oppLabel}" for this opponent. Check the color toggle and name spelling.</div></div>
              )}

              <div className="info-line"><Info size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span>{otherSideCount} pasted game(s) had the opponent on the other color and are excluded here. {unmatchedGames.length} game(s) didn't match the opponent's name at all — see the Games tab.</span></div>
            </>
          )}

          {activeTab === "tree" && (
            <>
              <div className="panel">
                <h2>Move tree — {oppLabel}</h2>
                <div className="desc">Branches sorted by frequency (top {TREE_MAX_CHILDREN} shown per node, up to {TREE_MAX_PLY / 2} full moves deep). Percentage is bar + text; last column is opponent's score % from that node onward.</div>
                {relevant.length === 0 ? <div className="desc">No games to show.</div> : Object.values(tree.children).sort((a, b) => b.count - a.count).map((child) => (
                  <TreeNode key={child.san + child.ply} node={child} parentCount={tree.count} depth={0} onOpenGame={onOpenGame} />
                ))}
              </div>

              <div className="panel">
                <h2>Opening breakdown &amp; deviation point</h2>
                <div className="desc">"Leaves theory" is estimated from the opponent's own most-repeated move order in that line — not an external opening database.</div>
                <table>
                  <thead><tr><th>Opening</th><th>Games</th><th>Freq.</th><th>Score</th><th>Avg. deviation</th><th>Confidence</th></tr></thead>
                  <tbody>
                    {openingGroups.map((o) => (
                      <tr key={o.name}>
                        <td>{o.name}</td><td>{o.count}</td><td>{o.freqPct.toFixed(0)}%</td>
                        <td><ScorePill wins={o.w} draws={o.d} losses={o.l} /></td>
                        <td>{o.devMoveNum ? `~move ${o.devMoveNum}` : "n/a"}</td>
                        <td><ConfBadge n={o.count} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "performance" && (
            <div className="panel">
              <div className="segmented">
                <button className={`segmented-btn ${performanceView === "recency" ? "active" : ""}`} onClick={() => setPerformanceView("recency")}>Recency trend</button>
                <button className={`segmented-btn ${performanceView === "bands" ? "active" : ""}`} onClick={() => setPerformanceView("bands")}>Rating bands</button>
              </div>

              {performanceView === "recency" ? (
                <>
                  <h2>Recency trend
                    <select className="recency-select" value={recencyMonths} onChange={(e) => setRecencyMonths(Number(e.target.value))}>
                      <option value={6}>last 6 months</option>
                      <option value={12}>last 12 months</option>
                    </select>
                  </h2>
                  <div className="desc">Comparing opening frequency in the recent window ({recencyData.recentCount} games) vs older games ({recencyData.olderCount} games). {recencyData.undated > 0 ? `${recencyData.undated} game(s) have no usable date and are excluded from this view.` : ""}</div>
                  {recencyData.combined.length === 0 ? <div className="desc">Not enough dated games to compare.</div> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={recencyData.combined} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A313C" />
                        <XAxis type="number" stroke="#8B93A1" unit="%" />
                        <YAxis type="category" dataKey="name" stroke="#8B93A1" width={150} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#1C2129", border: "1px solid #2A313C" }} formatter={(v) => `${v.toFixed(0)}%`} />
                        <Legend />
                        <Bar dataKey="older" name="Older" fill="#8B93A1" />
                        <Bar dataKey="recent" name={`Last ${recencyMonths}mo`} fill="#C9A227" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </>
              ) : (
                <>
                  <h2>Performance vs rating bands</h2>
                  <div className="desc">Opponent's score % against players in each rating band ({oppLabel}). Use this to see whether he overperforms against weaker players or holds up against stronger ones.</div>
                  {ratingBandStats.length === 0 ? <div className="desc">No games to show.</div> : (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={ratingBandStats}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2A313C" />
                          <XAxis dataKey="band" stroke="#8B93A1" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#8B93A1" unit="%" />
                          <Tooltip contentStyle={{ background: "#1C2129", border: "1px solid #2A313C" }} formatter={(v) => `${v.toFixed(0)}%`} />
                          <Bar dataKey="scorePct" name="Score %" fill="#C9A227" />
                        </BarChart>
                      </ResponsiveContainer>
                      <table style={{ marginTop: 14 }}>
                        <thead><tr><th>Band</th><th>Games</th><th>W–D–L</th><th>Score</th><th>Confidence</th></tr></thead>
                        <tbody>
                          {ratingBandStats.map((b) => (
                            <tr key={b.band}><td>{b.band}</td><td>{b.n}</td><td>{b.w}–{b.d}–{b.l}</td><td>{b.scorePct.toFixed(0)}%</td><td><ConfBadge n={b.n} /></td></tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "games" && (
            <>
              <div className="panel">
                <h2>Relevant games ({oppLabel})</h2>
                <div className="desc">Click a game to open the board and step through the moves.</div>
                <table>
                  <thead><tr><th>Date</th><th>Event</th><th>Opponent's opponent</th><th>Elo</th><th>Opening</th><th>Result</th></tr></thead>
                  <tbody>
                    {relevantByDate.map((g) => {
                      const other = g.opponentColor === "white" ? g.headers.Black : g.headers.White;
                      return (
                        <tr key={g.id} className={`row-clickable ${g.isH2H ? "h2h-row" : ""}`} onClick={() => onOpenGame(g)}>
                          <td>{g.headers.Date || "—"}</td>
                          <td>{g.headers.Event || "—"}</td>
                          <td>{other || "—"} {g.isH2H && <Swords size={11} style={{ verticalAlign: "-1px", marginLeft: 4, color: "#E89494" }} />}</td>
                          <td>{opposingElo(g) ?? "—"}</td>
                          <td>{openingKey(g)}</td>
                          <td>{g.headers.Result || "—"}</td>
                        </tr>
                      );
                    })}
                    {relevant.length === 0 && <tr><td colSpan={6}>No relevant games.</td></tr>}
                  </tbody>
                </table>
              </div>

              {unmatchedGames.length > 0 && (
                <div className="panel">
                  <h2>Unmatched games</h2>
                  <div className="desc">Neither side matched the opponent's name — likely a spelling difference in the PGN.</div>
                  <table>
                    <thead><tr><th>Date</th><th>White</th><th>Black</th><th>Result</th></tr></thead>
                    <tbody>
                      {unmatchedByDate.map((g) => (
                        <tr key={g.id}><td>{g.headers.Date || "—"}</td><td>{g.headers.White || "—"}</td><td>{g.headers.Black || "—"}</td><td>{g.headers.Result || "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
