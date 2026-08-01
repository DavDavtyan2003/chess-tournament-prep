const ROW_RE = /<tr>\s*<td data-label="FIDEID"[^>]*>(\d+)<\/td>\s*<td data-label="Name"><a[^>]*>([^<]+)<\/a>[\s\S]*?<td data-label="title">\s*([^<]*?)\s*<\/td>[\s\S]*?<img src="[^"]*" alt="([A-Za-z]+)">[\s\S]*?<td data-label="Rtg">([^<]*)<\/td>\s*<td data-label="Rtg">([^<]*)<\/td>\s*<td data-label="Rtg">([^<]*)<\/td>\s*<td data-label="B-Year">([^<]*)<\/td>/g;

function toIntOrNull(s) {
  const n = parseInt(String(s).trim(), 10);
  return isNaN(n) ? null : n;
}

export default async function handler(req, res) {
  const name = String(req.query.name || "").trim();
  if (!name) {
    res.status(400).json({ error: "Provide a name to search for." });
    return;
  }

  let html;
  try {
    const response = await fetch(`https://ratings.fide.com/incl_search_l.php?search=${encodeURIComponent(name)}&simple=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://ratings.fide.com/",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!response.ok) {
      res.status(502).json({ error: `FIDE site returned ${response.status}.` });
      return;
    }
    html = await response.text();
  } catch (e) {
    res.status(502).json({ error: "Could not reach the FIDE ratings site." });
    return;
  }

  const results = [];
  let m;
  ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(html))) {
    results.push({
      fideId: m[1],
      name: m[2].trim(),
      title: m[3].trim() || null,
      federation: m[4],
      standard: toIntOrNull(m[5]),
      rapid: toIntOrNull(m[6]),
      blitz: toIntOrNull(m[7]),
      birthYear: toIntOrNull(m[8]),
    });
  }

  res.status(200).json({ results });
}
