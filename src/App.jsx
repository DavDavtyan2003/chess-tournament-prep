import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer
} from "recharts";
import {
  Save, Trash2, Upload, RefreshCw, ChevronRight, ChevronDown,
  Info, Swords, AlertTriangle, FolderOpen, X, ClipboardPaste, Search, Pencil
} from "lucide-react";
import { storage } from "./storage.js";
import { ECO_NAMES } from "./data/ecoNames.js";
import GameViewer from "./components/GameViewer.jsx";

/* ============================== CONSTANTS ============================== */

const TREE_MAX_PLY = 14;      // 7 full moves deep in the visual tree
const TREE_MAX_CHILDREN = 5;  // branching cap per node for readability
const COLORS = ["#C9A227", "#5FA777", "#8B93A1", "#B25550", "#6E8FB0", "#A57BC7", "#C9865A"];

/* ============================== PGN PARSING ============================== */

function splitGames(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\n\s*(?=\[Event\s)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
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
  return (s || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function opponentOwnElo(game) {
  const key = game.opponentColor === "white" ? "WhiteElo" : "BlackElo";
  const v = parseInt(game.headers[key], 10);
  return isNaN(v) ? null : v;
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
  const root = { san: null, ply: 0, count: 0, wins: 0, draws: 0, losses: 0, children: {} };
  games.forEach((g) => {
    let node = root;
    node.count++;
    const s = opponentScore(g);
    if (s === 1) node.wins++; else if (s === 0.5) node.draws++; else if (s === 0) node.losses++;
    const maxPly = Math.min(g.moves.length, TREE_MAX_PLY);
    for (let i = 0; i < maxPly; i++) {
      const mv = g.moves[i];
      if (!node.children[mv]) {
        node.children[mv] = { san: mv, ply: i + 1, count: 0, wins: 0, draws: 0, losses: 0, children: {} };
      }
      node = node.children[mv];
      node.count++;
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
    pool.forEach((g) => {
      const mv = g.moves[ply];
      if (mv) counts[mv] = (counts[mv] || 0) + 1;
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) break;
    entries.sort((a, b) => b[1] - a[1]);
    const [bestMove, bestCount] = entries[0];
    if (bestCount / pool.length < 0.4 && entries.length > 1) break; // no clear majority
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
    for (let i = 0; i < path.length; i++) {
      if (g.moves[i] === path[i]) matched++;
      else break;
    }
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

/* ============================== TREE COMPONENT ============================== */

function TreeNode({ node, parentCount, depth }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const childrenArr = Object.values(node.children).sort((a, b) => b.count - a.count);
  const shown = childrenArr.slice(0, TREE_MAX_CHILDREN);
  const hidden = childrenArr.length - shown.length;
  const pct = parentCount ? ((node.count / parentCount) * 100).toFixed(1) : "100.0";
  const scoreTotal = node.wins + node.draws * 0.5;
  const scorePct = node.count ? ((scoreTotal / node.count) * 100).toFixed(0) : "0";
  const moveNum = Math.ceil(node.ply / 2);
  const label = node.ply % 2 === 1 ? `${moveNum}.${node.san}` : `${moveNum}...${node.san}`;

  return (
    <div className="tree-branch">
      <div
        className={`tree-row ${childrenArr.length ? "clickable" : ""}`}
        style={{ paddingLeft: depth * 18 }}
        onClick={() => childrenArr.length && setExpanded((e) => !e)}
      >
        <span className="tree-caret">
          {childrenArr.length ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13, display: "inline-block" }} />}
        </span>
        <span className="tree-move">{label}</span>
        <span className="tree-bar-wrap"><span className="tree-bar" style={{ width: `${pct}%` }} /></span>
        <span className="tree-pct">{pct}%</span>
        <span className="tree-n">n={node.count}</span>
        <span className={`tree-score ${scorePct >= 55 ? "good" : scorePct <= 45 ? "bad" : ""}`}>{scorePct}%</span>
      </div>
      {expanded && shown.map((child) => (
        <TreeNode key={child.san + child.ply} node={child} parentCount={node.count} depth={depth + 1} />
      ))}
      {expanded && hidden > 0 && (
        <div className="tree-more" style={{ paddingLeft: (depth + 1) * 18 + 13 }}>+{hidden} more branch{hidden > 1 ? "es" : ""}</div>
      )}
    </div>
  );
}

/* ============================== MAIN APP ============================== */

export default function ChessPrepApp() {
  const [profile, setProfile] = useState({
    name: "", country: "", age: "", fideId: "", title: "",
    ratingStd: "", ratingRapid: "", ratingBlitz: "",
  });
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState("white");
  const [rawPgn, setRawPgn] = useState("");
  const [games, setGames] = useState(null); // classified games, null = not parsed yet
  const [activeTab, setActiveTab] = useState("overview");
  const [recencyMonths, setRecencyMonths] = useState(12);
  const [parseWarning, setParseWarning] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef(null);
  const [viewingGame, setViewingGame] = useState(null);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [performanceView, setPerformanceView] = useState("recency");

  const [savedList, setSavedList] = useState([]);
  const [storageStatus, setStorageStatus] = useState("");
  const [fideStatus, setFideStatus] = useState("");
  const [fideLoading, setFideLoading] = useState(false);

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
    } catch (e) {
      setSavedList([]);
    }
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
    } catch (e) {
      setStorageStatus("Save failed — try again.");
    }
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
    } catch (e) {
      setStorageStatus("Couldn't load that profile.");
    }
  }

  async function handleDelete(key) {
    try {
      await storage.delete(key);
      refreshSavedList();
      setStorageStatus("Deleted.");
    } catch (e) {
      setStorageStatus("Delete failed.");
    }
  }

  async function handleFideLookup() {
    const id = profile.fideId.trim();
    if (!id) { setFideStatus("Enter a FIDE ID first."); return; }
    setFideLoading(true);
    setFideStatus("Looking up…");
    try {
      const res = await fetch(`/api/fide?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setProfile((p) => ({
        ...p,
        name: data.name || p.name,
        country: data.federation || p.country,
        age: data.birthYear ? String(new Date().getFullYear() - data.birthYear) : p.age,
        title: data.title || p.title,
        ratingStd: data.standard != null ? String(data.standard) : p.ratingStd,
        ratingRapid: data.rapid != null ? String(data.rapid) : p.ratingRapid,
        ratingBlitz: data.blitz != null ? String(data.blitz) : p.ratingBlitz,
      }));
      setFideStatus("Filled from FIDE profile.");
    } catch (e) {
      setFideStatus(e.message === "Failed to fetch" ? "Lookup failed — check the ID and try again." : `Lookup failed: ${e.message}`);
    } finally {
      setFideLoading(false);
    }
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
    if (classified.length > 0) setFormCollapsed(true);
  }

  function handleParseClick() { doParse(rawPgn, profile.name, myName); }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
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

  /* ---------- derived data ---------- */

  const relevant = useMemo(() => {
    if (!games) return [];
    const wantOpponentColor = myColor === "white" ? "black" : "white";
    return games.filter((g) => g.opponentColor === wantOpponentColor);
  }, [games, myColor]);

  const h2hGames = useMemo(() => (games || []).filter((g) => g.isH2H), [games]);
  const unmatchedGames = useMemo(() => (games || []).filter((g) => !g.opponentColor), [games]);
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
    relevant.forEach((g) => {
      const key = openingKey(g);
      if (!map[key]) map[key] = [];
      map[key].push(g);
    });
    return Object.entries(map)
      .map(([name, gs]) => {
        const scores = gs.map(opponentScore).filter((s) => s !== null);
        const w = scores.filter((s) => s === 1).length;
        const d = scores.filter((s) => s === 0.5).length;
        const l = scores.filter((s) => s === 0).length;
        const dev = avgDeviationPly(gs);
        return {
          name, games: gs, count: gs.length, w, d, l,
          scorePct: scores.length ? ((w + d * 0.5) / scores.length) * 100 : 0,
          freqPct: relevant.length ? (gs.length / relevant.length) * 100 : 0,
          devMoveNum: dev != null ? (Math.ceil(dev / 2)) : null,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [relevant]);

  const ratingBandStats = useMemo(() => {
    const map = {};
    relevant.forEach((g) => {
      const band = ratingBand(opposingElo(g));
      if (!map[band]) map[band] = [];
      map[band].push(g);
    });
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
    <div className="app">
      <style>{`
        .app { min-height: 100vh; background: #14171C; color: #E8E3D8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; }
        .app * { box-sizing: border-box; }
        .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }

        .sidebar { width: 340px; min-width: 280px; background: #1C2129; border-right: 1px solid #2A313C; padding: 22px; overflow-y: auto; height: 100vh; position: sticky; top: 0; }
        .main { flex: 1; padding: 28px 32px; overflow-y: auto; height: 100vh; }

        .brand { display:flex; align-items:center; gap:8px; margin-bottom: 4px; }
        .brand h1 { font-size: 17px; font-weight: 700; margin: 0; letter-spacing: 0.1px; }
        .brand-sub { color: #8B93A1; font-size: 12px; margin-bottom: 20px; }

        .back-link { width: auto; background: transparent; border: none; color: #8B93A1; padding: 0; margin: 0 0 16px 0; font-size: 12.5px; justify-content: flex-start; }
        .back-link:hover { color: #C9A227; border-color: transparent; }

        .compact-profile { background: #14171C; border: 1px solid #2A313C; border-radius: 8px; padding: 14px 16px; margin-top: 4px; }
        .compact-profile-name { font-size: 16px; font-weight: 700; }
        .compact-profile-meta { color: #8B93A1; font-size: 12px; margin-top: 3px; }
        .compact-profile-color { font-size: 12.5px; color: #8B93A1; margin-top: 8px; }
        .compact-profile-color strong { color: #E8E3D8; }
        .compact-profile .btn-row .btn { margin-top: 12px; }

        .field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8B93A1; margin-bottom: 4px; display:block; margin-top: 12px; }
        .field-row { display:flex; gap: 8px; }
        input[type=text], input[type=number], textarea, select {
          width: 100%; background: #14171C; border: 1px solid #2A313C; color: #E8E3D8;
          border-radius: 6px; padding: 7px 9px; font-size: 13px; font-family: inherit;
        }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #C9A227; }
        textarea { min-height: 140px; resize: vertical; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; line-height: 1.5; }

        .color-toggle { display:flex; border: 1px solid #2A313C; border-radius: 6px; overflow: hidden; margin-top: 6px; }
        .color-toggle button { flex:1; padding: 8px; background: #14171C; color: #8B93A1; border: none; cursor: pointer; font-size: 13px; }
        .color-toggle button.active { background: #C9A227; color: #14171C; font-weight: 600; }

        .btn { display:flex; align-items:center; justify-content:center; gap: 6px; padding: 9px 12px; border-radius: 6px; border: 1px solid #2A313C; background: #232935; color: #E8E3D8; cursor: pointer; font-size: 13px; width: 100%; margin-top: 10px; transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease; }
        .btn:hover { border-color: #C9A227; }
        .btn:active { transform: scale(0.98); }
        .btn.primary { background: #C9A227; color: #14171C; border-color: #C9A227; font-weight: 600; }
        .btn.primary:hover { background: #dbb32e; }
        .btn.ghost { background: transparent; }
        .btn:disabled { opacity: 0.5; cursor: default; }
        .btn-row { display:flex; gap: 8px; }
        .btn-row .btn { margin-top: 10px; }
        .fide-row { display:flex; gap: 8px; align-items: flex-end; }
        .fide-row > div { flex: 1; }
        .btn-icon { width: auto; flex-shrink: 0; padding: 7px 10px; margin-top: 0; }

        .saved-list { margin-top: 10px; max-height: 160px; overflow-y: auto; border: 1px solid #2A313C; border-radius: 6px; }
        .saved-item { display:flex; align-items:center; justify-content:space-between; padding: 7px 9px; font-size: 12.5px; border-bottom: 1px solid #2A313C; cursor: pointer; }
        .saved-item:last-child { border-bottom: none; }
        .saved-item:hover { background: #232935; }
        .saved-item button { background: none; border: none; color: #8B93A1; cursor: pointer; padding: 2px; }
        .saved-item button:hover { color: #B25550; }

        .status-line { font-size: 11.5px; color: #8B93A1; margin-top: 6px; min-height: 14px; }
        .warning-box { display:flex; gap:8px; align-items:flex-start; background: #2A2418; border: 1px solid #6b5a1f; color: #E8C778; padding: 10px 12px; border-radius: 6px; font-size: 12.5px; margin-bottom: 16px; }

        .tabs { display:flex; gap: 4px; border-bottom: 1px solid #2A313C; margin-bottom: 24px; flex-wrap: wrap; }
        .tab { padding: 10px 16px; font-size: 13.5px; font-weight: 500; color: #8B93A1; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.15s ease, border-color 0.15s ease; }
        .tab:hover { color: #C9C3B4; }
        .tab.active { color: #E8E3D8; border-bottom-color: #C9A227; }

        .hero-stat { background: #1C2129; border-radius: 10px; padding: 22px 24px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); }
        .hero-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8B93A1; margin-bottom: 10px; }
        .hero-stat-row { display:flex; align-items: baseline; gap: 20px; flex-wrap: wrap; }
        .hero-stat-value { font-size: 42px; font-weight: 700; line-height: 1; color: #E8E3D8; }
        .hero-stat-details { display:flex; flex-direction: column; gap: 6px; }
        .hero-stat-wdl { font-size: 14px; }
        .hero-stat-wdl .muted { color: #8B93A1; font-size: 12.5px; }
        .hero-stat-empty { color: #8B93A1; font-size: 13.5px; padding-top: 2px; }

        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .grid-secondary { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
        .stat-card { background: #1C2129; border-radius: 8px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.16); }
        .stat-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #8B93A1; margin-bottom: 6px; }
        .stat-card .value { font-size: 20px; font-weight: 700; }
        .stat-card .sub { font-size: 12px; color: #8B93A1; margin-top: 4px; }

        .panel { background: #1C2129; border-radius: 10px; padding: 20px 22px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.16); }
        .panel h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px 0; }
        .panel .desc { color: #8B93A1; font-size: 12.5px; margin-bottom: 14px; }

        .segmented { display:inline-flex; background: #14171C; border: 1px solid #2A313C; border-radius: 7px; padding: 3px; margin-bottom: 16px; }
        .segmented-btn { background: transparent; border: none; color: #8B93A1; padding: 6px 14px; border-radius: 5px; font-size: 12.5px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .segmented-btn.active { background: #C9A227; color: #14171C; font-weight: 600; }

        .h2h-banner { background: #2A1E1E; border: 1px solid #6b3030; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display:flex; align-items:center; gap: 10px; }
        .h2h-banner .n { color: #E89494; font-weight:600; }

        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align:left; color: #8B93A1; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; padding: 6px 8px; border-bottom: 1px solid #2A313C; }
        td { padding: 7px 8px; border-bottom: 1px solid #232935; vertical-align: middle; }
        tr.h2h-row { background: rgba(178,85,80,0.08); }
        tr.row-clickable { cursor: pointer; transition: background 0.12s ease; }
        tr.row-clickable:hover { background: #232935; }

        .score-pill { display:flex; align-items:center; height: 16px; width: 90px; border-radius: 3px; overflow:hidden; background:#232935; position: relative; }
        .sp-seg { height: 100%; }
        .sp-win { background: #5FA777; }
        .sp-draw { background: #8B93A1; }
        .sp-loss { background: #B25550; }
        .sp-label { position:absolute; right: -38px; font-size: 11px; color: #8B93A1; width: 34px; }

        .conf-badge { font-size: 10.5px; padding: 2px 7px; border-radius: 10px; border: 1px solid; white-space: nowrap; }
        .conf-low { color: #B25550; border-color: #B25550; }
        .conf-med { color: #C9A227; border-color: #C9A227; }
        .conf-high { color: #5FA777; border-color: #5FA777; }

        .tree-branch {}
        .tree-row { display:flex; align-items:center; gap: 8px; padding: 4px 4px; border-radius: 4px; font-size: 12.5px; }
        .tree-row.clickable { cursor: pointer; }
        .tree-row.clickable:hover { background: #232935; }
        .tree-caret { color: #8B93A1; display:flex; }
        .tree-move { font-family: "JetBrains Mono", monospace; min-width: 90px; }
        .tree-bar-wrap { width: 80px; height: 6px; background: #232935; border-radius: 3px; overflow: hidden; }
        .tree-bar { display:block; height: 100%; background: #C9A227; }
        .tree-pct { width: 42px; color: #8B93A1; }
        .tree-n { width: 48px; color: #8B93A1; }
        .tree-score { width: 40px; }
        .tree-score.good { color: #5FA777; }
        .tree-score.bad { color: #B25550; }
        .tree-more { font-size: 11.5px; color: #8B93A1; padding: 3px 0; }

        .info-line { display:flex; align-items:flex-start; gap: 8px; color: #8B93A1; font-size: 12px; margin-top: 10px; }

        .empty-state { text-align:center; padding: 60px 20px; color: #8B93A1; }
        .empty-state h2 { color: #E8E3D8; font-weight: 700; font-size: 20px; margin-bottom: 8px; }

        select.recency-select { width: auto; display:inline-block; margin-left: 8px; }

        .board-modal-backdrop { position: fixed; inset: 0; background: rgba(10,12,16,0.72); display:flex; align-items:center; justify-content:center; z-index: 100; padding: 24px; animation: fade-in 0.12s ease; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .board-modal { position: relative; background: #1C2129; border: 1px solid #2A313C; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 20px 22px 24px; }
        .board-modal-close { position:absolute; top: 14px; right: 14px; background: transparent; border: none; color: #8B93A1; cursor: pointer; padding: 4px; border-radius: 4px; }
        .board-modal-close:hover { color: #E8E3D8; background: #232935; }
        .board-modal-header { margin-bottom: 16px; padding-right: 28px; }
        .board-modal-title { font-weight: 700; font-size: 17px; }
        .board-modal-title .vs { color: #8B93A1; font-size: 13px; margin: 0 4px; }
        .board-modal-sub { color: #8B93A1; font-size: 12.5px; margin-top: 4px; }
        .board-modal-body { display:flex; gap: 24px; flex-wrap: wrap; }
        .board-modal-board { flex: 1 1 380px; max-width: 460px; }
        .board-modal-moves { flex: 1 1 220px; min-width: 200px; max-height: 460px; overflow-y: auto; border: 1px solid #2A313C; border-radius: 8px; padding: 8px 10px; background: #14171C; }

        .chess-board { width: 100%; aspect-ratio: 1 / 1; border-radius: 4px; overflow: hidden; border: 2px solid #2A313C; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
        .chess-board-grid { width: 100%; height: 100%; display: flex; flex-direction: column; }
        .chess-board-row { flex: 1; display: flex; }
        .chess-square { position: relative; flex: 1; display:flex; align-items:center; justify-content:center; }
        .chess-square.light { background: #D9CDB4; }
        .chess-square.dark { background: #7C6A50; }
        .chess-square.last-move.light { background: #E8D68A; }
        .chess-square.last-move.dark { background: #C9AA4E; }
        .chess-piece { font-size: min(6.5vw, 42px); line-height: 1; user-select: none; color: #1B1F26; }
        .chess-piece.piece-w { color: #F6F1E4; -webkit-text-stroke: 1px #1B1F26; text-shadow: 0 1px 1px rgba(0,0,0,0.3); }
        .chess-piece.piece-b { color: #1B1F26; text-shadow: 0 1px 1px rgba(0,0,0,0.25); }
        .chess-rank-label { position:absolute; top: 2px; left: 3px; font-size: 9px; color: rgba(0,0,0,0.4); font-weight: 600; }
        .chess-file-label { position:absolute; bottom: 1px; right: 3px; font-size: 9px; color: rgba(0,0,0,0.4); font-weight: 600; }

        .board-controls { display:flex; align-items:center; justify-content:center; gap: 6px; margin-top: 12px; }
        .board-controls .btn-icon { width: auto; }
        .board-ply-indicator { font-size: 11.5px; color: #8B93A1; min-width: 52px; text-align:center; font-family: "JetBrains Mono", monospace; }
        .board-warning { display:flex; align-items:center; gap: 6px; color: #E8C778; font-size: 11.5px; margin-top: 10px; background: #2A2418; border: 1px solid #6b5a1f; border-radius: 6px; padding: 7px 9px; }

        .move-list-row { display:flex; align-items:center; gap: 8px; padding: 3px 2px; font-size: 12.5px; font-family: "JetBrains Mono", monospace; }
        .move-list-num { color: #8B93A1; width: 26px; flex-shrink: 0; }
        .move-list-san { flex: 1; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
        .move-list-san:hover { background: #232935; }
        .move-list-san.active { background: #C9A227; color: #14171C; font-weight: 600; }

        @media (max-width: 820px) {
          .app { flex-direction: column; }
          .sidebar { width: 100%; height: auto; position: relative; border-right: none; border-bottom: 1px solid #2A313C; }
          .main { height: auto; }
        }
      `}</style>

      {/* ---------------- SIDEBAR ---------------- */}
      <div className="sidebar">
        <div className="brand">
          <Swords size={20} color="#C9A227" />
          <h1>Opponent Scouting</h1>
        </div>
        <div className="brand-sub">Tournament prep dossier</div>

        {formCollapsed && games !== null ? (
          <div className="compact-profile">
            <div className="compact-profile-name">{profile.name || "Unnamed opponent"}</div>
            {(profile.title || profile.ratingStd || profile.country) && (
              <div className="compact-profile-meta">
                {[profile.title, profile.ratingStd, profile.country].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="compact-profile-color">You play <strong>{myColor === "white" ? "White" : "Black"}</strong></div>

            <div className="btn-row">
              <button className="btn ghost" onClick={() => setFormCollapsed(false)}><Pencil size={14} /> Edit</button>
              <button className="btn ghost" onClick={handleSave}><Save size={14} /> Save</button>
            </div>
            <div className="status-line">{storageStatus}</div>

            {savedList.length > 0 && (
              <>
                <label className="field-label"><FolderOpen size={12} style={{ verticalAlign: "-2px" }} /> Saved opponents</label>
                <div className="saved-list">
                  {savedList.map((item) => (
                    <div className="saved-item" key={item.key} onClick={() => handleLoad(item.key)}>
                      <span>{item.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.key); }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
        <>
        {games !== null && (
          <button className="btn ghost back-link" onClick={() => setFormCollapsed(true)}>‹ Back to summary</button>
        )}

        <label className="field-label">Opponent name (as in PGN)</label>
        <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Lastname, Firstname" />

        <div className="field-row">
          <div style={{ flex: 1 }}>
            <label className="field-label">Country</label>
            <input type="text" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Age</label>
            <input type="number" value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })} />
          </div>
        </div>

        <label className="field-label">FIDE ID</label>
        <div className="fide-row">
          <div>
            <input type="text" value={profile.fideId} onChange={(e) => setProfile({ ...profile, fideId: e.target.value })} placeholder="e.g. 13300474" />
          </div>
          <button className="btn ghost btn-icon" onClick={handleFideLookup} disabled={fideLoading} title="Fetch from FIDE">
            <Search size={14} /> {fideLoading ? "…" : "Fetch"}
          </button>
        </div>
        <div className="status-line">{fideStatus}</div>

        <label className="field-label">Title</label>
        <input type="text" value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} placeholder="FM / IM / GM…" />

        <label className="field-label">Ratings — Std / Rapid / Blitz</label>
        <div className="field-row">
          <input type="number" value={profile.ratingStd} onChange={(e) => setProfile({ ...profile, ratingStd: e.target.value })} placeholder="Std" />
          <input type="number" value={profile.ratingRapid} onChange={(e) => setProfile({ ...profile, ratingRapid: e.target.value })} placeholder="Rapid" />
          <input type="number" value={profile.ratingBlitz} onChange={(e) => setProfile({ ...profile, ratingBlitz: e.target.value })} placeholder="Blitz" />
        </div>

        <label className="field-label">Your name (for head-to-head detection)</label>
        <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Optional, e.g. Davtyan, Davit" />

        <label className="field-label">You will play</label>
        <div className="color-toggle">
          <button className={myColor === "white" ? "active" : ""} onClick={() => setMyColor("white")}>White</button>
          <button className={myColor === "black" ? "active" : ""} onClick={() => setMyColor("black")}>Black</button>
        </div>

        <label className="field-label">Import PGN(s)</label>
        <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} /> Upload .pgn file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pgn,.txt,text/plain"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <div className="status-line">{importStatus}</div>

        <label className="field-label">…or paste PGN text below</label>
        <textarea value={rawPgn} onChange={(e) => setRawPgn(e.target.value)} placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n[Result "1-0"]\n\n1.e4 c5 2.Nf3 ...'} />

        <button className="btn primary" onClick={handleParseClick}><ClipboardPaste size={15} /> Parse &amp; analyze</button>

        <div className="btn-row">
          <button className="btn ghost" onClick={handleSave}><Save size={14} /> Save profile</button>
          <button className="btn ghost" onClick={() => { setProfile({ name: "", country: "", age: "", fideId: "", title: "", ratingStd: "", ratingRapid: "", ratingBlitz: "" }); setMyName(""); setRawPgn(""); setGames(null); setParseWarning(""); setFideStatus(""); setImportStatus(""); setFormCollapsed(false); }}>
            <RefreshCw size={14} /> Clear
          </button>
        </div>
        <div className="status-line">{storageStatus}</div>

        {savedList.length > 0 && (
          <>
            <label className="field-label"><FolderOpen size={12} style={{ verticalAlign: "-2px" }} /> Saved opponents</label>
            <div className="saved-list">
              {savedList.map((item) => (
                <div className="saved-item" key={item.key} onClick={() => handleLoad(item.key)}>
                  <span>{item.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.key); }}><X size={13} /></button>
                </div>
              ))}
            </div>
          </>
        )}
        </>
        )}
      </div>

      {/* ---------------- MAIN ---------------- */}
      <div className="main">
        {games === null ? (
          <div className="empty-state">
            <h2>No games analyzed yet</h2>
            <p>Fill in the opponent's name, paste their PGNs on the left, and hit "Parse &amp; analyze".</p>
          </div>
        ) : (
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
                    <TreeNode key={child.san + child.ply} node={child} parentCount={tree.count} depth={0} />
                  ))}
                </div>

                <div className="panel">
                  <h2>Opening breakdown &amp; deviation point</h2>
                  <div className="desc">"Leaves theory" is estimated from the opponent's own most-repeated move order in that line — not an external opening database.</div>
                  <table>
                    <thead>
                      <tr><th>Opening</th><th>Games</th><th>Freq.</th><th>Score</th><th>Avg. deviation</th><th>Confidence</th></tr>
                    </thead>
                    <tbody>
                      {openingGroups.map((o) => (
                        <tr key={o.name}>
                          <td>{o.name}</td>
                          <td>{o.count}</td>
                          <td>{o.freqPct.toFixed(0)}%</td>
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
                              <tr key={b.band}>
                                <td>{b.band}</td><td>{b.n}</td><td>{b.w}–{b.d}–{b.l}</td>
                                <td>{b.scorePct.toFixed(0)}%</td><td><ConfBadge n={b.n} /></td>
                              </tr>
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
                      {relevant.map((g) => {
                        const other = g.opponentColor === "white" ? g.headers.Black : g.headers.White;
                        return (
                          <tr key={g.id} className={`row-clickable ${g.isH2H ? "h2h-row" : ""}`} onClick={() => setViewingGame(g)}>
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
                        {unmatchedGames.map((g) => (
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

      {viewingGame && (
        <GameViewer game={viewingGame} orientation={myColor} onClose={() => setViewingGame(null)} />
      )}
    </div>
  );
}
