require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { renderScoreboard, renderPartyCard, renderRankUpCard, renderLeaderboard, TIER_NAMES } = require("./valo-scoreboard");

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

const fs = require("fs");
const path = require("path");

// =======================
// ⚙️ CONFIG
// =======================
const TEXT_CHANNEL_ID = "1492441547583524954";
const VOICE_CHANNEL_ID = "1488854856633680083";

const PANEL_TITLE = "🪪 BETLEHEM KTP";
const PANEL_IMAGE = "https://media.discordapp.net/attachments/1487590787284734143/1492489699225243729/ktp-bg.png.png?ex=69db84d9&is=69da3359&hm=bb337a5cf83a3c88c88d38b4a6c88146a28d1a224b03b7f14639dc94af8c33a1&=&format=webp&quality=lossless";
const LOGO_URL = "https://media.discordapp.net/attachments/1487590787284734143/1492050545219862598/bthl.png";
const FOOTER_TEXT = "Dante • Copyright ©2018 - BTHL";

// 🎯 VALORANT TRACKER
// API key gratis dari HenrikDev (https://api.henrikdev.xyz/dashboard).
// Isi di .env / Railway Variables: HENRIK_API_KEY=HDEV-xxxx
const HENRIK_API_KEY = process.env.HENRIK_API_KEY || "";
const VALO_COLOR = 0xff4655;

// 🎉 Channel announce rank up (kosongkan = tidak announce, data tetap dipantau)
const RANKUP_CHANNEL_ID = process.env.RANKUP_CHANNEL_ID || "";
const RANKUP_CHECK_EVERY = 20000; // cek 1 member tiap 20 detik (hemat kuota API)

// Folder data. Di Railway, pasang Volume lalu isi env DATA_DIR = path mount-nya
// (misal /data) supaya database KTP tidak hilang saat redeploy.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const dbPath = path.join(DATA_DIR, "database.json");

// =======================
// 🔤 FONT
// =======================
GlobalFonts.registerFromPath(path.join(__dirname, "assets/Roboto-Bold.ttf"), "Roboto");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// =======================
// 💾 DATABASE
// =======================
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return {};
  }
}

function saveDB(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.log("⚠️ Gagal simpan database:", err.message);
  }
}

// No KTP 16 digit, dibuat sekali dan tidak berubah-ubah
function generateNoKTP() {
  let no = String(Math.floor(Math.random() * 9) + 1);
  while (no.length < 16) no += Math.floor(Math.random() * 10);
  return no;
}

// =======================
// 🎨 EMBED
// =======================
function baseEmbed(guild) {
  return new EmbedBuilder()
    .setAuthor({ name: "BETLEHEM", iconURL: LOGO_URL })
    .setFooter({ text: FOOTER_TEXT, iconURL: guild?.iconURL() || undefined })
    .setTimestamp();
}

function ktpButtons(hasKTP) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("buat_ktp")
      .setLabel("Buat / Lihat KTP")
      .setEmoji("🪪")
      .setStyle(ButtonStyle.Primary)
  );
  if (hasKTP) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("edit_ktp")
        .setLabel("Edit KTP")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return row;
}

// =======================
// 🔥 AUTO JOIN + AUTO REJOIN VC
// =======================
async function connectToVC() {
  try {
    const vc = await client.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
    if (!vc || vc.type !== ChannelType.GuildVoice) {
      return console.log("❌ VC tidak ditemukan");
    }

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    console.log("🎤 Bot masuk voice channel");

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch {
        console.log("🔄 Bot keluar VC, rejoin...");
        try { connection.destroy(); } catch {}
        setTimeout(connectToVC, 3000);
      }
    });
  } catch (err) {
    console.log("❌ Error join VC:", err);
    setTimeout(connectToVC, 5000);
  }
}

// =======================
// 📦 PANEL (TIDAK NYAMPAH)
// =======================
async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(TEXT_CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Channel panel tidak ditemukan");

  const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const panels = recent
    ? [...recent.filter(m =>
        m.author.id === client.user.id &&
        m.embeds[0]?.title === PANEL_TITLE
      ).values()] // urut terbaru dulu
    : [];

  for (const m of panels.slice(1)) {
    await m.delete().catch(() => {});
    console.log(`🧹 Hapus panel duplikat ${m.id}`);
  }

  const embed = baseEmbed(channel.guild)
    .setColor("#c30e0e")
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Klik tombol di bawah untuk **membuat** atau **melihat** KTP kamu 🪪\n\n" +
      "> Data KTP hanya bisa dilihat oleh kamu sendiri."
    )
    .setImage(PANEL_IMAGE);

  const payload = { embeds: [embed], components: [ktpButtons(false)] };

  if (panels[0]) {
    try {
      await panels[0].edit(payload);
      console.log("♻️ Panel di-update");
      return;
    } catch {
      await panels[0].delete().catch(() => {});
    }
  }

  await channel.send(payload);
  console.log("✅ Panel dikirim");
}

// =======================
// 🚀 READY
// =======================
client.once("clientReady", async () => {
  console.log(`✅ ${client.user.tag} aktif`);

  setTimeout(connectToVC, 3000);

  try {
    await sendOrUpdatePanel();
  } catch (err) {
    console.log("❌ Error setup panel:", err);
  }

  // Slash command /valo
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.create({
      name: "valo",
      description: "Cek rank & match terakhir akun VALORANT",
      dm_permission: false,
      options: [{
        type: 3, // STRING
        name: "akun",
        description: "Riot ID (Nama#TAG) atau tag @member — kosongkan = akun kamu",
        required: false,
        max_length: 60
      }]
    }).catch(err => console.log(`⚠️ Gagal daftar /valo di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "match",
      description: "Scoreboard match VALORANT terakhir (10 pemain)",
      dm_permission: false,
      options: [
        {
          type: 3, // STRING
          name: "akun",
          description: "Riot ID (Nama#TAG) atau tag @member — kosongkan = akun kamu",
          required: false,
          max_length: 60
        },
        {
          type: 3,
          name: "mode",
          description: "Mode match (default: semua mode)",
          required: false,
          choices: [
            { name: "Competitive", value: "competitive" },
            { name: "Unrated", value: "unrated" },
            { name: "Swiftplay", value: "swiftplay" },
            { name: "Premier", value: "premier" }
          ]
        }
      ]
    }).catch(err => console.log(`⚠️ Gagal daftar /match di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "party",
      description: "Buat & share party code VALORANT ke channel ini",
      dm_permission: false
    }).catch(err => console.log(`⚠️ Gagal daftar /party di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "link",
      description: "Hubungkan akun VALORANT kamu (untuk announce rank up)",
      dm_permission: false,
      options: [
        { type: 3, name: "riot_id", description: "Riot ID, contoh: Nama#TAG", required: true, max_length: 40 },
        { type: 6, name: "member", description: "(Admin) hubungkan akun untuk member lain", required: false }
      ]
    }).catch(err => console.log(`⚠️ Gagal daftar /link di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "leaderboard",
      description: "Top rank VALORANT member server",
      dm_permission: false
    }).catch(err => console.log(`⚠️ Gagal daftar /leaderboard di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "unlink",
      description: "Lepas akun VALORANT yang terhubung",
      dm_permission: false
    }).catch(err => console.log(`⚠️ Gagal daftar /unlink di ${guild.name}:`, err.message));

    await guild.commands.create({
      name: "rankuptest",
      description: "Preview announce rank up di channel ini",
      default_member_permissions: "32", // Manage Server
      dm_permission: false
    }).catch(err => console.log(`⚠️ Gagal daftar /rankuptest di ${guild.name}:`, err.message));
  }

  // pantau rank member yang sudah /link
  setInterval(checkNextRank, RANKUP_CHECK_EVERY);
});

// =======================
// 🎯 VALORANT TRACKER (/valo)
// =======================
const valoCache = new Map(); // "nama#tag" → { time, payload }
const VALO_CACHE_MS = 60000;

async function henrik(pathname) {
  const res = await fetch(`https://api.henrikdev.xyz${pathname}`, {
    headers: { Authorization: HENRIK_API_KEY },
    signal: AbortSignal.timeout(15000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.errors?.[0]?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function rankIcon(tierId) {
  return tierId > 2
    ? `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${tierId}/largeicon.png`
    : null;
}

function cardWide(card) {
  if (!card) return null;
  if (typeof card === "string") return `https://media.valorant-api.com/playercards/${card}/wideart.png`;
  return card.wide || null;
}

async function buildValoProfile(name, tag) {
  const n = encodeURIComponent(name);
  const t = encodeURIComponent(tag);

  const account = await henrik(`/valorant/v1/account/${n}/${t}`);
  const region = account.region || "ap";

  const [mmr, matches] = await Promise.all([
    henrik(`/valorant/v3/mmr/${region}/pc/${n}/${t}`).catch(() => null),
    henrik(`/valorant/v4/matches/${region}/pc/${n}/${t}?mode=competitive&size=5`).catch(() => null)
  ]);

  // ===== RANK =====
  const current = mmr?.current;
  const peak = mmr?.peak;
  const tierId = current?.tier?.id ?? 0;
  const rankName = tierId > 2 ? current.tier.name : "Unrated";
  const lastChange = current?.last_change;

  // ===== MATCH TERAKHIR =====
  const lines = [];
  let k = 0, d = 0, a = 0, hs = 0, shots = 0, win = 0;

  for (const m of (Array.isArray(matches) ? matches : [])) {
    const p = m.players?.find(pl => pl.puuid === account.puuid);
    if (!p) continue;

    const team = m.teams?.find(tm => tm.team_id === p.team_id);
    const enemy = m.teams?.find(tm => tm.team_id !== p.team_id);
    const won = team?.won;
    const draw = team && enemy && team.rounds?.won === enemy.rounds?.won;
    if (won) win++;

    const s = p.stats || {};
    k += s.kills || 0; d += s.deaths || 0; a += s.assists || 0;
    hs += s.headshots || 0;
    shots += (s.headshots || 0) + (s.bodyshots || 0) + (s.legshots || 0);

    const map = typeof m.metadata?.map === "string" ? m.metadata.map : m.metadata?.map?.name;
    const agent = p.agent?.name || p.character || "?";
    const skor = team ? `${team.rounds?.won ?? "?"}-${team.rounds?.lost ?? "?"}` : "";
    const icon = draw ? "⚪" : won ? "🟢" : "🔴";
    const waktu = m.metadata?.started_at ? ` • <t:${Math.floor(new Date(m.metadata.started_at) / 1000)}:R>` : "";

    lines.push(`${icon} **${map || "?"}** • ${agent} • \`${s.kills ?? 0}/${s.deaths ?? 0}/${s.assists ?? 0}\` • ${skor}${waktu}`);
  }

  // ===== EMBED =====
  const riotId = `${account.name}#${account.tag}`;
  const embed = new EmbedBuilder()
    .setColor(VALO_COLOR)
    .setAuthor({ name: "VALORANT TRACKER", iconURL: LOGO_URL })
    .setTitle(riotId)
    .setURL(`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(riotId)}/overview`)
    .addFields(
      { name: "🎚️ Level", value: `> ${account.account_level ?? "-"}`, inline: true },
      { name: "🌏 Region", value: `> ${region.toUpperCase()}`, inline: true },
      { name: "​", value: "​", inline: true },
      {
        name: "🏆 Rank Sekarang",
        value: `> **${rankName}**` + (tierId > 2 ? ` — ${current.rr ?? 0} RR` : "") +
          (typeof lastChange === "number" && tierId > 2 ? ` (${lastChange >= 0 ? "+" : ""}${lastChange})` : ""),
        inline: true
      },
      {
        name: "⛰️ Peak Rank",
        value: peak?.tier?.name
          ? `> **${peak.tier.name}**${peak.season?.short ? ` (${peak.season.short.toUpperCase()})` : ""}`
          : "> -",
        inline: true
      }
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  const icon = rankIcon(tierId);
  if (icon) embed.setThumbnail(icon);

  const card = cardWide(account.card);
  if (card) embed.setImage(card);

  if (lines.length) {
    const kd = d ? (k / d).toFixed(2) : k.toFixed(2);
    const hsp = shots ? Math.round((hs / shots) * 100) : 0;
    embed.addFields(
      {
        name: `📊 ${lines.length} Competitive Terakhir`,
        value: `> Win **${win}/${lines.length}** • K/D **${kd}** • HS **${hsp}%**`
      },
      { name: "🕹️ Riwayat Match", value: lines.join("\n").slice(0, 1024) }
    );
  } else {
    embed.addFields({ name: "🕹️ Riwayat Match", value: "> Belum ada match competitive terbaru." });
  }

  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("Tracker.gg")
    .setURL(`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(riotId)}/overview`);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

// =======================
// 🔗 LINK AKUN + 🎉 RANK UP
// =======================
const LINKS_FILE = path.join(DATA_DIR, "valo-links.json");

function loadLinks() {
  try { return JSON.parse(fs.readFileSync(LINKS_FILE, "utf8")); } catch { return {}; }
}
function saveLinks(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.log("⚠️ Gagal simpan valo-links:", err.message);
  }
}

// ambil rank sekarang (pakai puuid supaya tetap jalan walau ganti nama)
async function fetchCurrentRank(link) {
  let mmr;
  try {
    mmr = await henrik(`/valorant/v3/by-puuid/mmr/${link.region}/pc/${link.puuid}`);
  } catch (err) {
    if (err.status === 429 || err.status === 401 || err.status === 403) throw err;
    mmr = await henrik(`/valorant/v3/mmr/${link.region}/pc/${encodeURIComponent(link.name)}/${encodeURIComponent(link.tag)}`);
  }
  return {
    tier: mmr?.current?.tier?.id ?? 0,
    rr: mmr?.current?.rr ?? null,
    name: mmr?.account?.name || link.name,
    tag: mmr?.account?.tag || link.tag
  };
}

async function rankUpPayload({ member, link, oldTier, newTier, rr, test = false }) {
  const card = await renderRankUpCard({
    name: member.displayName,
    riotId: `${link.name}#${link.tag}`,
    avatarUrl: member.user.displayAvatarURL({ extension: "png", size: 256 }),
    oldTier,
    newTier,
    rr
  }).catch(err => { console.log("⚠️ Gagal render rank up:", err.message); return null; });

  const embed = new EmbedBuilder()
    .setColor(VALO_COLOR)
    .setDescription(`🎉 Selamat ${member}! Rank naik dari **${TIER_NAMES[oldTier]}** ke **${TIER_NAMES[newTier]}**${rr != null ? ` (${rr} RR)` : ""}.`)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();
  if (card) embed.setImage("attachment://rankup.png");

  return {
    content: `${test ? "🧪 **[TEST]** " : ""}🎉 ${member} naik ke **${TIER_NAMES[newTier]}**!`,
    embeds: [embed],
    files: card ? [new AttachmentBuilder(card, { name: "rankup.png" })] : [],
    allowedMentions: test ? { parse: [] } : { users: [member.id] }
  };
}

let rankCursor = 0;
let rankChecking = false;

async function checkNextRank() {
  if (rankChecking || !HENRIK_API_KEY) return;
  const links = loadLinks();
  const ids = Object.keys(links);
  if (!ids.length) return;

  rankChecking = true;
  const userId = ids[rankCursor % ids.length];
  rankCursor++;

  try {
    const link = links[userId];
    const now = await fetchCurrentRank(link);
    const oldTier = link.tier ?? 0;

    // naik rank (dari rank yang sudah ada, bukan dari unrated/placement)
    if (oldTier > 2 && now.tier > oldTier && RANKUP_CHANNEL_ID) {
      const guild = client.guilds.cache.get(link.guildId);
      const member = await guild?.members.fetch(userId).catch(() => null);
      const ch = await client.channels.fetch(RANKUP_CHANNEL_ID).catch(() => null);
      if (member && ch) {
        await ch.send(await rankUpPayload({ member, link: { ...link, ...now }, oldTier, newTier: now.tier, rr: now.rr }));
        console.log(`🎉 ${member.user.tag} rank up ${TIER_NAMES[oldTier]} → ${TIER_NAMES[now.tier]}`);
      }
    }

    // simpan rank terbaru (ambil ulang file supaya tidak menimpa /link yang baru)
    const fresh = loadLinks();
    if (fresh[userId]) {
      Object.assign(fresh[userId], { tier: now.tier, rr: now.rr, name: now.name, tag: now.tag, checked: Date.now() });
      saveLinks(fresh);
    }
  } catch (err) {
    if (err.status !== 429) console.log("⚠️ Cek rank gagal:", err.status || "", err.message);
  } finally {
    rankChecking = false;
  }
}

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || !["link", "unlink", "rankuptest", "leaderboard"].includes(i.commandName)) return;

  try {
    // ===== /leaderboard =====
    if (i.commandName === "leaderboard") {
      await i.deferReply();

      const all = Object.entries(loadLinks()).filter(([, l]) => !l.guildId || l.guildId === i.guild.id);
      const sorted = all
        .sort(([, a], [, b]) => (b.tier ?? 0) - (a.tier ?? 0) || (b.rr ?? 0) - (a.rr ?? 0))
        .slice(0, 10);

      const rows = await Promise.all(sorted.map(async ([userId, l]) => {
        const member = await i.guild.members.fetch(userId).catch(() => null);
        return {
          name: member?.displayName || l.name,
          riotId: `${l.name}#${l.tag}`,
          avatarUrl: member?.user.displayAvatarURL({ extension: "png", size: 128 }) || null,
          tier: l.tier ?? 0,
          rr: l.rr
        };
      }));

      const card = await renderLeaderboard({
        title: `TOP ${i.guild.name.toUpperCase()}`,
        subtitle: `${all.length} member terhubung • rank diperbarui otomatis`,
        rows
      });

      return i.editReply({
        embeds: [new EmbedBuilder()
          .setColor(VALO_COLOR)
          .setDescription(all.length ? "🏆 Peringkat rank VALORANT member server." : "Belum ada member yang `/link`.")
          .setImage("attachment://leaderboard.png")
          .setFooter({ text: `Hubungkan akunmu dengan /link • ${FOOTER_TEXT}` })
          .setTimestamp()],
        files: [new AttachmentBuilder(card, { name: "leaderboard.png" })]
      });
    }
    // ===== /link =====
    if (i.commandName === "link") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      if (!HENRIK_API_KEY) {
        return i.editReply({ embeds: [errorEmbedDante("> Fitur tracker belum aktif. **ADMIN** perlu mengisi `HENRIK_API_KEY`.", i.guild)] });
      }

      const id = parseRiotId(i.options.getString("riot_id"));
      if (!id) {
        return i.editReply({ embeds: [errorEmbedDante("> Format Riot ID salah. Contoh: `/link riot_id: Nama#TAG`", i.guild)] });
      }

      // admin boleh link-kan akun member lain
      const targetUser = i.options.getUser("member") || i.user;
      const forOther = targetUser.id !== i.user.id;
      if (forOther && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return i.editReply({ embeds: [errorEmbedDante("> Cuma **ADMIN** yang bisa menghubungkan akun member lain.", i.guild)] });
      }
      if (targetUser.bot) {
        return i.editReply({ embeds: [errorEmbedDante("> Tidak bisa menghubungkan akun ke bot.", i.guild)] });
      }

      const account = await henrik(`/valorant/v1/account/${encodeURIComponent(id.name)}/${encodeURIComponent(id.tag)}`);
      const link = {
        guildId: i.guild.id,
        puuid: account.puuid,
        region: account.region || "ap",
        name: account.name,
        tag: account.tag,
        tier: 0,
        rr: null
      };
      const now = await fetchCurrentRank(link).catch(() => null);
      if (now) Object.assign(link, { tier: now.tier, rr: now.rr });

      const links = loadLinks();
      links[targetUser.id] = link;
      saveLinks(links);

      const icon = link.tier > 2
        ? `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${link.tier}/largeicon.png`
        : null;
      const embed = baseEmbed(i.guild)
        .setColor("#00f1ff")
        .setTitle("🔗 Akun Terhubung")
        .setDescription(
          (forOther ? `> Member: ${targetUser}\n` : "") +
          `> Riot ID: **${link.name}#${link.tag}**\n` +
          `> Rank sekarang: **${TIER_NAMES[link.tier] || "Unrated"}**${link.rr != null && link.tier > 2 ? ` (${link.rr} RR)` : ""}\n\n` +
          "Kalau rank kamu naik, bot akan otomatis mengumumkannya 🎉"
        );
      if (icon) embed.setThumbnail(icon);
      return i.editReply({ embeds: [embed] });
    }

    // ===== /unlink =====
    if (i.commandName === "unlink") {
      const links = loadLinks();
      if (!links[i.user.id]) {
        return i.reply(ephem(errorEmbedDante("> Kamu belum menghubungkan akun VALORANT.", i.guild)));
      }
      const old = links[i.user.id];
      delete links[i.user.id];
      saveLinks(links);
      return i.reply(ephem(baseEmbed(i.guild)
        .setColor("#00f1ff")
        .setTitle("🔓 Akun Dilepas")
        .setDescription(`> **${old.name}#${old.tag}** sudah tidak terhubung lagi.`)));
    }

    // ===== /rankuptest =====
    if (i.commandName === "rankuptest") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      const link = loadLinks()[i.user.id];
      const newTier = link?.tier > 3 ? link.tier : 18; // default contoh: Diamond 1
      const oldTier = newTier - 1;
      const payload = await rankUpPayload({
        member: i.member,
        link: link || { name: "Contoh", tag: "TEST" },
        oldTier,
        newTier,
        rr: link?.rr ?? 12,
        test: true
      });
      await i.channel.send(payload);

      return i.editReply({ embeds: [baseEmbed(i.guild)
        .setColor("#00f1ff")
        .setTitle("✅ Preview Terkirim")
        .setDescription(
          "> Preview announce rank up dikirim ke channel ini." +
          (link ? "" : "\n> Kamu belum `/link`, jadi pakai data contoh.") +
          (RANKUP_CHANNEL_ID ? "" : "\n> ⚠️ `RANKUP_CHANNEL_ID` belum diisi, announce asli belum aktif.")
        )] });
    }
  } catch (err) {
    console.log(`❌ Error /${i.commandName}:`, err.status || "", err.message);
    const desc =
      err.status === 404 ? "> Akun tidak ditemukan. Cek lagi **Nama#TAG**-nya ya." :
      err.status === 429 ? "> Terlalu banyak request, coba lagi sebentar lagi ya." :
      "> Terjadi kendala, coba lagi nanti ya.";
    const fail = errorEmbedDante(desc, i.guild);
    if (i.deferred) i.editReply({ embeds: [fail] }).catch(() => {});
    else if (!i.replied) i.reply(ephem(fail)).catch(() => {});
  }
});

// =======================
// 🎮 PARTY CODE (/party)
// =======================
const PARTY_DURATION = 10 * 60 * 1000; // party otomatis hilang setelah 10 menit
const parties = new Map();    // messageId → { ownerId, code, timer }
const partyByUser = new Map(); // userId → messageId (1 user 1 party aktif)

const ephem = embed => ({ embeds: [embed], flags: MessageFlags.Ephemeral });
const errorEmbedDante = (desc, guild) =>
  baseEmbed(guild).setColor("#ED4245").setTitle("⚠️ Gagal").setDescription(desc);

const PARTY_MODES = ["Competitive", "Unrated", "Swiftplay", "Premier", "Spike Rush", "Deathmatch", "Custom"];

function partyModal() {
  const input = (id, label, placeholder, opts = {}) => {
    const t = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(opts.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(!!opts.required)
      .setMaxLength(opts.max || 40);
    if (opts.min) t.setMinLength(opts.min);
    if (opts.value) t.setValue(opts.value);
    return new ActionRowBuilder().addComponents(t);
  };

  return new ModalBuilder()
    .setCustomId("modal_party")
    .setTitle("🎮 Buat Party VALORANT")
    .addComponents(
      input("code", "🔑 Party Code", "Contoh: SKS456", { required: true, min: 4, max: 10 }),
      input("need", "👥 Butuh Berapa Orang? (1 - 4)", "Contoh: 2", { required: true, max: 2 }),
      input("mode", "🎮 Mode", "Competitive / Unrated / Swiftplay / Premier", { max: 20, value: "Competitive" }),
      input("rank", "🏆 Rank yang Dicari", "Contoh: Gold - Plat (kosongkan = bebas)", { max: 40 }),
      input("note", "📝 Catatan", "Contoh: santai, no toxic, wajib mic", { long: true, max: 150 })
    );
}

async function removeParty(messageId, channel) {
  const party = parties.get(messageId);
  if (party) {
    clearTimeout(party.timer);
    parties.delete(messageId);
    if (partyByUser.get(party.ownerId) === messageId) partyByUser.delete(party.ownerId);
  }
  const msg = await channel?.messages.fetch(messageId).catch(() => null);
  await msg?.delete().catch(() => {});
}

client.on("interactionCreate", async (i) => {
  try {
    // ===== /party → buka form =====
    if (i.isChatInputCommand() && i.commandName === "party") {
      return i.showModal(partyModal());
    }

    // ===== form dikirim =====
    if (i.isModalSubmit() && i.customId === "modal_party") {
      const code = i.fields.getTextInputValue("code").replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z0-9]{4,10}$/.test(code)) {
        return i.reply(ephem(errorEmbedDante("> Party code cuma boleh huruf & angka. Contoh: `SKS456`", i.guild)));
      }

      const need = parseInt(i.fields.getTextInputValue("need").replace(/[^0-9]/g, ""), 10);
      if (!(need >= 1 && need <= 4)) {
        return i.reply(ephem(errorEmbedDante("> Jumlah orang yang dibutuhkan harus **1 - 4**.", i.guild)));
      }

      const modeRaw = i.fields.getTextInputValue("mode").trim();
      const mode = PARTY_MODES.find(m => m.toLowerCase().startsWith(modeRaw.toLowerCase().slice(0, 4))) ||
        (modeRaw || "Competitive");
      const rank = i.fields.getTextInputValue("rank").trim();
      const catatan = i.fields.getTextInputValue("note").trim();

      await i.deferReply({ flags: MessageFlags.Ephemeral });

      const vc = i.member.voice?.channel;
      const expires = Math.floor((Date.now() + PARTY_DURATION) / 1000);

      const card = await renderPartyCard({
        code,
        need,
        mode,
        rank,
        note: catatan,
        name: i.member.displayName,
        avatarUrl: i.user.displayAvatarURL({ extension: "png", size: 256 })
      }).catch(err => { console.log("⚠️ Gagal render party:", err.message); return null; });

      const embed = new EmbedBuilder()
        .setColor(VALO_COLOR)
        .setAuthor({ name: `${i.member.displayName} mencari party!`, iconURL: i.user.displayAvatarURL() })
        .setDescription(
          `🔑 Party Code: \`${code}\`  •  👥 Butuh **-${need}**  •  🎮 **${mode}**\n` +
          `🏆 Rank: **${rank || "Bebas"}**` +
          (vc ? `\n🔊 Voice: ${vc}` : "") +
          (catatan ? `\n📝 ${catatan}` : "") +
          `\n⏳ Kadaluarsa <t:${expires}:R>`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();
      if (card) embed.setImage("attachment://party.png");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("party_copy").setLabel("Salin Kode").setEmoji("📋").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("party_close").setLabel("Party Penuh").setEmoji("✅").setStyle(ButtonStyle.Secondary)
      );
      if (vc) {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Join Voice")
            .setURL(`https://discord.com/channels/${i.guild.id}/${vc.id}`)
        );
      }

      // party lama dari user yang sama dihapus dulu
      const oldId = partyByUser.get(i.user.id);
      if (oldId) await removeParty(oldId, i.channel);

      const msg = await i.channel.send({
        content: `🎮 **${i.member.displayName}** butuh **-${need}** buat **${mode}**!`,
        embeds: [embed],
        components: [row],
        files: card ? [new AttachmentBuilder(card, { name: "party.png" })] : []
      });
      const timer = setTimeout(() => removeParty(msg.id, msg.channel), PARTY_DURATION);
      parties.set(msg.id, { ownerId: i.user.id, code, timer });
      partyByUser.set(i.user.id, msg.id);

      return i.editReply({ embeds: [baseEmbed(i.guild)
        .setColor("#00f1ff")
        .setTitle("✅ Party Dikirim")
        .setDescription(`> Party \`${code}\` sudah diposting dan otomatis hilang <t:${expires}:R>.\n> Tekan **Party Penuh** kalau sudah lengkap.`)] });
    }

    if (!i.isButton() || !["party_copy", "party_close"].includes(i.customId)) return;

    const party = parties.get(i.message.id);

    // ===== SALIN KODE =====
    if (i.customId === "party_copy") {
      const code = party?.code || i.message.embeds[0]?.description?.match(/`([A-Z0-9]{4,10})`/)?.[1];
      // dikirim sebagai teks biasa supaya gampang di-copy (tahan lama di HP)
      return i.reply({ content: code || "Kode tidak ditemukan.", flags: MessageFlags.Ephemeral });
    }

    // ===== PARTY PENUH =====
    const isOwner = party?.ownerId === i.user.id;
    const isMod = i.memberPermissions?.has("ManageMessages");
    if (!isOwner && !isMod) {
      return i.reply(ephem(errorEmbedDante("> Cuma pembuat party yang bisa menutup party ini.", i.guild)));
    }

    await i.deferUpdate();
    await removeParty(i.message.id, i.channel);
  } catch (err) {
    console.log("❌ Error party:", err.message);
    const fail = errorEmbedDante("> Gagal memproses party. Cek izin bot (Send Messages, Embed Links, Attach Files) di channel ini.", i.guild);
    if (i.deferred) {
      i.editReply({ embeds: [fail] }).catch(() => {});
    } else if (i.isRepliable() && !i.replied) {
      i.reply(ephem(fail)).catch(() => {});
    }
  }
});

// =======================
// 📋 MATCH SCOREBOARD (/match)
// =======================
function parseRiotId(input) {
  const s = String(input).trim();
  const idx = s.lastIndexOf("#");
  const name = idx > 0 ? s.slice(0, idx).trim() : "";
  const tag = idx > 0 ? s.slice(idx + 1).trim() : "";
  return name && tag ? { name, tag } : null;
}

// Isian "akun": Riot ID (Nama#TAG), tag @member, atau kosong = akun sendiri (/link)
function resolveRiotTarget(i) {
  const cmd = i.commandName;
  const typed = (i.options.getString("akun") || "").trim();

  // @member → Discord mengirimnya sebagai <@123456>
  const mention = typed.match(/^<@!?(\d+)>$/);
  let userId = mention ? mention[1] : null;

  if (typed && !mention) {
    return parseRiotId(typed) || {
      error: `> Format salah. Isi **Riot ID** (\`Nama#TAG\`) atau **tag member** (\`@nama\`).\n> Contoh: \`/${cmd} akun: Nama#TAG\``
    };
  }

  userId = userId || i.user.id;
  const link = loadLinks()[userId];
  if (link) return { name: link.name, tag: link.tag };

  return {
    error: userId === i.user.id
      ? `> Kamu belum menghubungkan akun.\n> Pakai \`/link riot_id: Nama#TAG\` dulu, atau isi Riot ID langsung.`
      : `> <@${userId}> belum menghubungkan akun VALORANT-nya.\n> Minta dia pakai \`/link\` dulu ya.`
  };
}

const pad = (v, n) => {
  const s = String(v);
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
};

async function buildMatchScoreboard(name, tag, mode) {
  const n = encodeURIComponent(name);
  const t = encodeURIComponent(tag);

  const account = await henrik(`/valorant/v1/account/${n}/${t}`);
  const region = account.region || "ap";

  const query = `size=1${mode ? `&mode=${mode}` : ""}`;
  const matches = await henrik(`/valorant/v4/matches/${region}/pc/${n}/${t}?${query}`);
  const m = Array.isArray(matches) ? matches[0] : null;
  if (!m) return null;

  const players = m.players || [];
  const me = players.find(p => p.puuid === account.puuid);

  const totalRounds =
    (Array.isArray(m.rounds) && m.rounds.length) ||
    ((m.teams?.[0]?.rounds?.won ?? 0) + (m.teams?.[0]?.rounds?.lost ?? 0)) ||
    1;

  const acs = p => Math.round((p.stats?.score || 0) / totalRounds);
  const mvp = [...players].sort((a, b) => acs(b) - acs(a))[0];

  const row = p => {
    const s = p.stats || {};
    const mark = p.puuid === account.puuid ? "▶" : p === mvp ? "★" : " ";
    const kda = `${s.kills ?? 0}/${s.deaths ?? 0}/${s.assists ?? 0}`;
    return `${mark}${pad(p.agent?.name || p.character || "?", 9)}${pad(p.name || "?", 13)}${pad(kda, 9)}${acs(p)}`;
  };
  const header = ` ${pad("Agent", 9)}${pad("Nama", 13)}${pad("K/D/A", 9)}ACS`;
  const table = list =>
    "```\n" + [header, ...list.sort((a, b) => acs(b) - acs(a)).map(row)].join("\n") + "\n```";

  const map = typeof m.metadata?.map === "string" ? m.metadata.map : m.metadata?.map?.name;
  const queue = m.metadata?.queue?.name || m.metadata?.mode || mode || "-";
  const started = m.metadata?.started_at ? Math.floor(new Date(m.metadata.started_at) / 1000) : null;
  const durasi = m.metadata?.game_length_in_ms
    ? `${Math.round(m.metadata.game_length_in_ms / 60000)} menit`
    : null;

  const embed = new EmbedBuilder()
    .setColor(VALO_COLOR)
    .setAuthor({ name: "VALORANT MATCH", iconURL: LOGO_URL })
    .setTitle(`${map || "?"} • ${queue}`)
    .setFooter({ text: `▶ = ${account.name}#${account.tag}  ★ = MVP • ${FOOTER_TEXT}` })
    .setTimestamp();

  const info = [];
  if (started) info.push(`🕒 <t:${started}:f> (<t:${started}:R>)`);
  if (durasi) info.push(`⏱️ ${durasi} • ${totalRounds} ronde`);

  const teams = m.teams || [];
  if (teams.length === 2 && me) {
    // Tim pemain yang dicari ditaruh di atas
    const myTeam = teams.find(tm => tm.team_id === me.team_id) || teams[0];
    const enemy = teams.find(tm => tm !== myTeam);
    const hasil =
      myTeam.rounds?.won === enemy.rounds?.won ? "⚪ SERI" : myTeam.won ? "🟢 MENANG" : "🔴 KALAH";

    embed
      .setColor(myTeam.won ? 0x16a34a : myTeam.rounds?.won === enemy.rounds?.won ? 0x9ca3af : VALO_COLOR)
      .setDescription(
        `## ${hasil}  ${myTeam.rounds?.won ?? "?"} - ${enemy.rounds?.won ?? "?"}\n` + info.join("\n")
      )
      .addFields(
        {
          name: `Tim ${account.name} (${myTeam.team_id})`,
          value: table(players.filter(p => p.team_id === myTeam.team_id)).slice(0, 1024)
        },
        {
          name: `Tim Lawan (${enemy.team_id})`,
          value: table(players.filter(p => p.team_id === enemy.team_id)).slice(0, 1024)
        }
      );
  } else {
    // Deathmatch dll: satu daftar saja
    embed
      .setDescription(info.join("\n") || null)
      .addFields({ name: "Scoreboard", value: table(players.slice(0, 14)).slice(0, 1024) });
  }

  // Scoreboard bergambar (ikon agent & rank). Kalau gagal, tetap pakai tabel teks di atas.
  let files = [];
  try {
    const buffer = await renderScoreboard(m, account.puuid);
    files = [new AttachmentBuilder(buffer, { name: "scoreboard.png" })];
    embed.setFields([]).setImage("attachment://scoreboard.png");
  } catch (err) {
    console.log("⚠️ Gagal render scoreboard:", err.message);
  }

  const matchId = m.metadata?.match_id;
  const components = matchId
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Detail di Tracker.gg")
          .setURL(`https://tracker.gg/valorant/match/${matchId}`)
      )]
    : [];

  return { embeds: [embed], components, files };
}

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== "match") return;

  const errorReply = desc => ({
    embeds: [baseEmbed(i.guild).setColor("#ED4245").setTitle("⚠️ Gagal").setDescription(desc)]
  });

  try {
    await i.deferReply();

    if (!HENRIK_API_KEY) {
      return i.editReply(errorReply("> Fitur tracker belum aktif. **ADMIN** perlu mengisi `HENRIK_API_KEY`."));
    }

    const id = resolveRiotTarget(i);
    if (id.error) return i.editReply(errorReply(id.error));

    const mode = i.options.getString("mode") || "";
    const key = `match:${id.name}#${id.tag}:${mode}`.toLowerCase();
    const cached = valoCache.get(key);
    if (cached && Date.now() - cached.time < VALO_CACHE_MS) {
      return i.editReply(cached.payload);
    }

    const payload = await buildMatchScoreboard(id.name, id.tag, mode);
    if (!payload) {
      return i.editReply(errorReply(`> Belum ada match${mode ? ` **${mode}**` : ""} terbaru untuk akun ini.`));
    }

    valoCache.set(key, { time: Date.now(), payload });
    return i.editReply(payload);
  } catch (err) {
    console.log("❌ Error /match:", err.status || "", err.message);
    const desc =
      err.status === 404 ? "> Akun atau match tidak ditemukan. Cek lagi **Nama#TAG**-nya ya." :
      err.status === 429 ? "> Terlalu banyak request, coba lagi sebentar lagi ya." :
      err.status === 401 || err.status === 403 ? "> API key tracker tidak valid. Hubungi **ADMIN**." :
      "> Gagal mengambil data match, coba lagi nanti ya.";
    i.editReply(errorReply(desc)).catch(() => {});
  }
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== "valo") return;

  const errorReply = desc => ({
    embeds: [baseEmbed(i.guild).setColor("#ED4245").setTitle("⚠️ Gagal").setDescription(desc)]
  });

  try {
    await i.deferReply();

    if (!HENRIK_API_KEY) {
      return i.editReply(errorReply("> Fitur tracker belum aktif. **ADMIN** perlu mengisi `HENRIK_API_KEY`."));
    }

    const target = resolveRiotTarget(i);
    if (target.error) return i.editReply(errorReply(target.error));
    const { name, tag } = target;

    const key = `${name}#${tag}`.toLowerCase();
    const cached = valoCache.get(key);
    if (cached && Date.now() - cached.time < VALO_CACHE_MS) {
      return i.editReply(cached.payload);
    }

    const payload = await buildValoProfile(name, tag);
    valoCache.set(key, { time: Date.now(), payload });
    return i.editReply(payload);
  } catch (err) {
    console.log("❌ Error /valo:", err.status || "", err.message);
    const desc =
      err.status === 404 ? "> Akun tidak ditemukan. Cek lagi **Nama#TAG**-nya ya." :
      err.status === 429 ? "> Terlalu banyak request, coba lagi sebentar lagi ya." :
      err.status === 401 || err.status === 403 ? "> API key tracker tidak valid. Hubungi **ADMIN**." :
      "> Gagal mengambil data VALORANT, coba lagi nanti ya.";
    i.editReply(errorReply(desc)).catch(() => {});
  }
});

// =======================
// 📝 MODAL
// =======================
const FIELDS = [
  { id: "nama",     label: "Nama Lengkap",  max: 32 },
  { id: "kelamin",  label: "Jenis Kelamin", max: 20 },
  { id: "domisili", label: "Domisili",      max: 28 },
  { id: "agama",    label: "Agama",         max: 20 },
  { id: "hobi",     label: "Hobi",          max: 28 }
];

function buildModal(existing) {
  const modal = new ModalBuilder()
    .setCustomId("modal_ktp")
    .setTitle(existing ? "Edit Data KTP Kamu" : "Isi Data KTP Kamu");

  for (const f of FIELDS) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(f.max)
      .setRequired(true);

    if (existing?.[f.id]) input.setValue(existing[f.id]);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

// =======================
// 🎯 INTERACTION
// =======================
client.on("interactionCreate", async (interaction) => {
  try {
    // ===== BUTTON =====
    if (interaction.isButton()) {
      if (!["buat_ktp", "edit_ktp"].includes(interaction.customId)) return;

      const db = loadDB();
      const data = db[interaction.user.id];

      // Edit, atau belum punya KTP → buka form
      if (interaction.customId === "edit_ktp" || !data) {
        return interaction.showModal(buildModal(data));
      }

      // Sudah punya → tampilkan KTP (hanya untuk dia)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!data.noKTP) {
        data.noKTP = generateNoKTP();
        db[interaction.user.id] = data;
        saveDB(db);
      }

      const buffer = await generateKTP(interaction.user, data);
      const file = new AttachmentBuilder(buffer, { name: "ktp.png" });

      return interaction.editReply({
        embeds: [
          baseEmbed(interaction.guild)
            .setColor("#c30e0e")
            .setTitle("🪪 KTP KAMU")
            .setDescription(`> Kartu Tanda Penduduk milik ${interaction.user}`)
            .setImage("attachment://ktp.png")
        ],
        files: [file],
        components: [ktpButtons(true)]
      });
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit() && interaction.customId === "modal_ktp") {
      await interaction.deferReply();

      const db = loadDB();
      const old = db[interaction.user.id];

      const data = { noKTP: old?.noKTP || generateNoKTP(), dibuat: old?.dibuat || Date.now() };
      for (const f of FIELDS) {
        data[f.id] = interaction.fields.getTextInputValue(f.id).trim();
      }

      db[interaction.user.id] = data;
      saveDB(db);

      const buffer = await generateKTP(interaction.user, data);
      const file = new AttachmentBuilder(buffer, { name: "ktp.png" });

      return interaction.editReply({
        content: `🪪 **Kartu Tanda Penduduk milik ${interaction.user}**`,
        embeds: [
          baseEmbed(interaction.guild)
            .setColor("#00f1ff")
            .setTitle(old ? "✏️ KTP DIPERBARUI" : "✅ KTP BERHASIL DIBUAT")
            .setImage("attachment://ktp.png")
        ],
        files: [file],
        components: [ktpButtons(false)]
      });
    }
  } catch (err) {
    console.log("❌ Error interaction:", err);
    const msg = {
      embeds: [
        baseEmbed(interaction.guild)
          .setColor("#ED4245")
          .setTitle("⚠️ Gagal")
          .setDescription("> Terjadi kendala saat memproses KTP, silahkan hubungi **ADMIN** ya.")
      ],
      flags: MessageFlags.Ephemeral
    };
    if (interaction.deferred || interaction.replied) {
      interaction.editReply(msg).catch(() => {});
    } else if (interaction.isRepliable()) {
      interaction.reply(msg).catch(() => {});
    }
  }
});

// =======================
// 🖼️ CANVAS
// =======================
async function loadAvatar(user) {
  const url = user.displayAvatarURL({ extension: "png", size: 256 });
  const res = await fetch(url);
  return loadImage(Buffer.from(await res.arrayBuffer()));
}

async function generateKTP(user, data) {
  const canvas = createCanvas
