const TITLE_MAP = {
  Grandmaster: "GM",
  "International Master": "IM",
  "FIDE Master": "FM",
  "Candidate Master": "CM",
  "Woman Grandmaster": "WGM",
  "Woman International Master": "WIM",
  "Woman FIDE Master": "WFM",
  "Woman Candidate Master": "WCM",
};

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: "Provide a numeric FIDE ID." });
    return;
  }

  let html;
  try {
    const response = await fetch(`https://ratings.fide.com/profile/${id}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
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

  const name = extract(html, /<h1 class="player-title">([^<]+)<\/h1>/);
  if (!name) {
    res.status(404).json({ error: "No FIDE profile found for that ID." });
    return;
  }

  const byear = extract(html, /<p class="profile-info-byear[^"]*">\s*(\d{4})\s*<\/p>/);
  const titleFull = extract(html, /<div class="profile-info-title[^"]*">\s*<p>\s*([^<]+?)\s*<\/p>/);
  const fedRaw = extract(html, /<div class="profile-info-country[^"]*">([\s\S]*?)<\/div>/);
  const std = extract(html, /<div class="profile-standart profile-game[^"]*">[\s\S]*?<p>\s*(\d+)\s*<\/p>/);
  const rapid = extract(html, /<div class="profile-rapid profile-game[^"]*">[\s\S]*?<p>\s*(\d+)\s*<\/p>/);
  const blitz = extract(html, /<div class="profile-blitz profile-game[^"]*">[\s\S]*?<p>\s*(\d+)\s*<\/p>/);

  const federation = fedRaw ? fedRaw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : null;

  // FIDE always embeds a base64 image here, but players without a submitted photo get a
  // tiny blank placeholder — filter those out by size rather than trying to detect it exactly.
  const photoRaw = extract(html, /profile-top__photo"\s+src="(data:image\/[a-zA-Z]+;base64,[^"]+)"/);
  const photo = photoRaw && photoRaw.length > 5000 ? photoRaw : null;

  res.status(200).json({
    fideId: id,
    name: name.trim(),
    federation: federation || null,
    birthYear: byear ? parseInt(byear, 10) : null,
    title: titleFull && titleFull.trim() !== "None" ? TITLE_MAP[titleFull.trim()] || titleFull.trim() : null,
    standard: std ? parseInt(std, 10) : null,
    rapid: rapid ? parseInt(rapid, 10) : null,
    blitz: blitz ? parseInt(blitz, 10) : null,
    photo,
  });
}
