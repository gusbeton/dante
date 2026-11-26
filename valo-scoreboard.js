// =======================
// 🖼️ VALORANT SCOREBOARD RENDERER
// Menggambar scoreboard match (gaya tracker.gg) jadi gambar PNG.
// Input: 1 match dari HenrikDev API v4 + puuid pemain yang dicari.
// =======================
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const FONT = "Roboto, 'Segoe UI', 'Noto Sans', 'Noto Sans Thai', sans-serif";

const TIER_NAMES = [
  "Unrated", "Unused", "Unused",
  "Iron 1", "Iron 2", "Iron 3",
  "Bronze 1", "Bronze 2", "Bronze 3",
  "Silver 1", "Silver 2", "Silver 3",
  "Gold 1", "Gold 2", "Gold 3",
  "Platinum 1", "Platinum 2", "Platinum 3",
  "Diamond 1", "Diamond 2", "Diamond 3",
  "Ascendant 1", "Ascendant 2", "Ascendant 3",
  "Immortal 1", "Immortal 2", "Immortal 3",
  "Radiant"
];

const C = {
  bg: "#0f1923",
  rowA: "#16222e",
  rowB: "#1b2836",
  acsCol: "rgba(255,255,255,0.06)",
  win: "#0f5c52",
  lose: "#5c1f2c",
  winText: "#3ee6c1",
  loseText: "#ff5a6e",
  text: "#ffffff",
  sub: "#8b97a3",
  green: "#4ade80",
  red: "#f87171",
  me: "#facc15",
  parties: ["#22d3ee", "#a3e635", "#f97316", "#e879f9", "#60a5fa"]
};

// =======================
// 📥 GAMBAR (di-cache)
// =======================
const imgCache = new Map();

function getImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, (async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(res.status);
        return await loadImage(Buffer.from(await res.arrayBuffer()));
      } catch {
        imgCache.delete(url);
        return null;
      }
    })());
  }
  return imgCache.get(url);
}

const agentIcon = id => id ? `https://media.valorant-api.com/agents/${id}/displayicon.png` : null;
const rankIcon = tier => `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${tier > 2 ? tier : 0}/smallicon.png`;

// =======================
// 📊 HITUNG STATISTIK
// =======================
function computeStats(match) {
  const players = match.players || [];
  const teamOf = new Map(players.map(p => [p.puuid, p.team_id]));

  const R =
    (Array.isArray(match.rounds) && match.rounds.length) ||
    ((match.teams?.[0]?.rounds?.won ?? 0) + (match.teams?.[0]?.rounds?.lost ?? 0)) ||
    1;

  const kills = Array.isArray(match.kills) ? match.kills : [];
  const hasKills = kills.length > 0;

  // kelompokkan kill per ronde, urut waktu
  const byRound = new Map();
  for (const k of kills) {
    const r = k.round ?? 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(k);
  }
  for (const list of byRound.values()) {
    list.sort((a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0));
  }

  const extra = new Map(players.map(p => [p.puuid, { fk: 0, fd: 0, mk: 0, kast: 0 }]));

  if (hasKills) {
    for (let r = 0; r < R; r++) {
      const list = byRound.get(r) || [];
      if (list[0]) {
        extra.get(list[0].killer?.puuid) && extra.get(list[0].killer.puuid).fk++;
        extra.get(list[0].victim?.puuid) && extra.get(list[0].victim.puuid).fd++;
      }

      for (const p of players) {
        const id = p.puuid;
        const myKills = list.filter(k => k.killer?.puuid === id).length;
        if (myKills >= 3) extra.get(id).mk++;

        const assisted = list.some(k => (k.assistants || []).some(a => a.puuid === id));
        const death = list.find(k => k.victim?.puuid === id);
        const survived = !death;

        // trade: pembunuh kita dibunuh tim kita dalam 5 detik
        let traded = false;
        if (death) {
          const killerId = death.killer?.puuid;
          traded = list.some(k =>
            k.victim?.puuid === killerId &&
            teamOf.get(k.killer?.puuid) === p.team_id &&
            (k.time_in_round_in_ms ?? 0) - (death.time_in_round_in_ms ?? 0) <= 5000 &&
            (k.time_in_round_in_ms ?? 0) >= (death.time_in_round_in_ms ?? 0)
          );
        }

        if (myKills > 0 || assisted || survived || traded) extra.get(id).kast++;
      }
    }
  }

  return players.map(p => {
    const s = p.stats || {};
    const dealt = s.damage?.dealt ?? s.damage_made ?? 0;
    const received = s.damage?.received ?? s.damage_received ?? 0;
    const shots = (s.headshots || 0) + (s.bodyshots || 0) + (s.legshots || 0);
    const e = extra.get(p.puuid);
    return {
      p,
      tier: p.tier?.id ?? p.currenttier ?? 0,
      acs: Math.round((s.score || 0) / R),
      k: s.kills || 0,
      d: s.deaths || 0,
      a: s.assists || 0,
      pm: (s.kills || 0) - (s.deaths || 0),
      kd: s.deaths ? (s.kills || 0) / s.deaths : (s.kills || 0),
      ddd: Math.round((dealt - received) / R),
      adr: dealt / R,
      hs: shots ? Math.round(((s.headshots || 0) / shots) * 100) : 0,
      kast: hasKills ? Math.round((e.kast / R) * 100) : null,
      fk: hasKills ? e.fk : null,
      fd: hasKills ? e.fd : null,
      mk: hasKills ? e.mk : null
    };
  });
}

// =======================
// 🎨 HELPER GAMBAR
// =======================
function fitText(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function sign(n) {
  return n > 0 ? `+${n}` : String(n);
}

function colorOf(n, good = 0) {
  return n > good ? C.green : n < good ? C.red : C.text;
}

// kolom: [label, x tengah, fungsi nilai, fungsi warna]
const COLS = [
  ["ACS", 520, s => s.acs],
  ["K", 590, s => s.k],
  ["D", 645, s => s.d],
  ["A", 700, s => s.a],
  ["+/-", 765, s => sign(s.pm), s => colorOf(s.pm)],
  ["K/D", 835, s => s.kd.toFixed(1), s => colorOf(s.kd, 1)],
  ["DDΔ", 910, s => sign(s.ddd), s => colorOf(s.ddd)],
  ["ADR", 990, s => s.adr.toFixed(1)],
  ["HS%", 1065, s => `${s.hs}%`],
  ["KAST", 1140, s => s.kast == null ? "-" : `${s.kast}%`],
  ["FK", 1210, s => s.fk ?? "-"],
  ["FD", 1265, s => s.fd ?? "-"],
  ["MK", 1320, s => s.mk ?? "-"]
];

const W = 1360;
const HEADER_H = 120;
const TEAM_H = 36;
const ROW_H = 58;

// =======================
// 🖼️ RENDER
// =======================
async function renderScoreboard(match, mePuuid) {
  const stats = computeStats(match);
  const me = stats.find(s => s.p.puuid === mePuuid);
  const teams = match.teams || [];

  // grup tim: tim pemain yang dicari di atas
  let groups;
  if (teams.length === 2 && me) {
    const mine = teams.find(t => t.team_id === me.p.team_id) || teams[0];
    const enemy = teams.find(t => t !== mine);
    groups = [mine, enemy].map(t => ({
      team: t,
      list: stats.filter(s => s.p.team_id === t.team_id).sort((a, b) => b.acs - a.acs)
    }));
  } else {
    groups = [{ team: null, list: [...stats].sort((a, b) => b.acs - a.acs) }];
  }

  const H = HEADER_H + groups.reduce((h, g) => h + TEAM_H + g.list.length * ROW_H, 0) + 12;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // preload semua ikon
  const icons = new Map();
  await Promise.all(stats.flatMap(s => [
    getImage(agentIcon(s.p.agent?.id)).then(img => icons.set(`a:${s.p.puuid}`, img)),
    getImage(rankIcon(s.tier)).then(img => icons.set(`r:${s.p.puuid}`, img))
  ]));

  // warna party (hanya party berisi > 1 orang)
  const partyCount = new Map();
  for (const s of stats) if (s.p.party_id) partyCount.set(s.p.party_id, (partyCount.get(s.p.party_id) || 0) + 1);
  const partyColor = new Map();
  for (const [id, n] of partyCount) if (n > 1) partyColor.set(id, C.parties[partyColor.size % C.parties.length]);

  // ===== HEADER =====
  const map = typeof match.metadata?.map === "string" ? match.metadata.map : match.metadata?.map?.name;
  const queue = match.metadata?.queue?.name || match.metadata?.mode || "";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillText(map || "?", 24, 36);
  ctx.fillStyle = C.sub;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(queue, 24, 64);

  if (groups.length === 2) {
    const [a, b] = groups.map(g => g.team);
    const draw = a.rounds?.won === b.rounds?.won;
    const label = draw ? "SERI" : a.won ? "MENANG" : "KALAH";
    const colA = draw ? C.text : a.won ? C.winText : C.loseText;
    const colB = draw ? C.text : a.won ? C.loseText : C.winText;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = colA;
    ctx.fillText(String(a.rounds?.won ?? 0), 24, 100);
    const wA = ctx.measureText(String(a.rounds?.won ?? 0)).width;
    ctx.fillStyle = C.sub;
    ctx.fillText(" : ", 24 + wA, 100);
    const wSep = ctx.measureText(" : ").width;
    ctx.fillStyle = colB;
    ctx.fillText(String(b.rounds?.won ?? 0), 24 + wA + wSep, 100);
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = draw ? C.sub : a.won ? C.green : C.red;
    ctx.fillText(label, 24 + wA + wSep + ctx.measureText("00").width + 40, 100);

    // timeline ronde
    const rounds = Array.isArray(match.rounds) ? match.rounds : [];
    if (rounds.length) {
      const x0 = 300, x1 = W - 30;
      const step = Math.min(42, (x1 - x0) / rounds.length);
      rounds.forEach((r, idx) => {
        const winner = r.winning_team ?? r.winning_team_id;
        const mineWon = winner === a.team_id;
        const cx = x0 + step * idx + step / 2 + (idx >= 12 ? 6 : 0); // jeda halftime
        const cy = mineWon ? 48 : 84;
        ctx.fillStyle = mineWon ? colA : colB;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(9, step / 2.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.sub;
        ctx.font = `11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(String(idx + 1), cx, 108);
        ctx.textAlign = "left";
      });
      ctx.fillStyle = C.sub;
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(fitText(ctx, `Tim ${me?.p.name || "A"}`, 150), x0 - 12, 48);
      ctx.fillText("Lawan", x0 - 12, 84);
      ctx.textAlign = "left";
    }
  }

  // ===== TABEL =====
  let y = HEADER_H;

  for (const [gi, g] of groups.entries()) {
    const won = g.team?.won;
    const draw = groups.length === 2 && groups[0].team.rounds?.won === groups[1].team.rounds?.won;

    // header tim
    ctx.fillStyle = !g.team ? C.rowB : draw ? "#374151" : won ? C.win : C.lose;
    ctx.fillRect(0, y, W, TEAM_H);

    const ranked = g.list.filter(s => s.tier > 2);
    const avg = ranked.length ? Math.round(ranked.reduce((t, s) => t + s.tier, 0) / ranked.length) : 0;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = !g.team ? C.text : won ? C.winText : C.loseText;
    ctx.textAlign = "left";
    const teamLabel = !g.team ? "Scoreboard" : gi === 0 ? `Tim ${me?.p.name || ""} (${g.team.team_id})` : `Tim Lawan (${g.team.team_id})`;
    ctx.fillText(teamLabel + (avg ? `  •  Avg. Rank: ${TIER_NAMES[avg]}` : ""), 24, y + TEAM_H / 2);

    ctx.fillStyle = C.sub;
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Rank", 440, y + TEAM_H / 2);
    for (const [label, x] of COLS) ctx.fillText(label, x, y + TEAM_H / 2);
    y += TEAM_H;

    g.list.forEach((s, idx) => {
      const isMe = s.p.puuid === mePuuid;
      ctx.fillStyle = idx % 2 ? C.rowB : C.rowA;
      ctx.fillRect(0, y, W, ROW_H);
      ctx.fillStyle = C.acsCol;
      ctx.fillRect(485, y, 70, ROW_H);

      // garis party / pemain dicari
      const pc = partyColor.get(s.p.party_id);
      if (pc) { ctx.fillStyle = pc; ctx.fillRect(0, y + 6, 5, ROW_H - 12); }
      if (isMe) {
        ctx.strokeStyle = C.me;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, y + 1, W - 2, ROW_H - 2);
      }

      // ikon agent
      const aImg = icons.get(`a:${s.p.puuid}`);
      if (aImg) ctx.drawImage(aImg, 18, y + 7, 44, 44);
      else { ctx.fillStyle = "#2a3744"; ctx.fillRect(18, y + 7, 44, 44); }

      // level
      if (s.p.level != null) {
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        const lv = String(s.p.level);
        ctx.fillRect(18, y + 39, ctx.measureText(lv).width + 6, 13);
        ctx.fillStyle = C.text;
        ctx.fillText(lv, 21, y + 46);
      }

      // nama + tag
      ctx.textAlign = "left";
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillStyle = isMe ? C.me : C.text;
      const nm = fitText(ctx, s.p.name || "?", 210);
      ctx.fillText(nm, 76, y + 22);
      const nmW = ctx.measureText(nm).width;
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = C.sub;
      ctx.fillText(fitText(ctx, `#${s.p.tag || ""}`, 90), 76 + nmW + 8, y + 23);

      // agent + rank text
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`${s.p.agent?.name || "?"} • ${TIER_NAMES[s.tier] || "Unrated"}`, 76, y + 42);

      // ikon rank
      const rImg = icons.get(`r:${s.p.puuid}`);
      if (rImg) ctx.drawImage(rImg, 440 - 18, y + ROW_H / 2 - 18, 36, 36);

      // angka
      ctx.textAlign = "center";
      for (const [label, x, val, col] of COLS) {
        ctx.font = label === "ACS" ? `bold 20px ${FONT}` : `bold 18px ${FONT}`;
        ctx.fillStyle = col ? col(s) : C.text;
        ctx.fillText(String(val(s)), x, y + ROW_H / 2);
      }

      y += ROW_H;
    });
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderScoreboard, computeStats };
