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
  MessageFlags
} = require("discord.js");

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

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
  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(path.join(__dirname, "assets/ktp-bg.png"));
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 5;

  // TITLE
  ctx.textAlign = "center";
  ctx.font = "26px Roboto";
  ctx.fillText("KARTU TANDA PENDUDUK", 400, 55);

  ctx.font = "20px Roboto";
  ctx.fillText("BETLEHEM", 400, 85);

  ctx.textAlign = "left";

  // DATA
  ctx.font = "18px Roboto";

  const labelX = 90;
  const colonX = 260;
  const valueX = 280;
  const maxValueWidth = 250; // supaya teks panjang tidak menabrak foto

  const startY = 150;
  const gap = 36;

  const rows = [
    ["No KTP", data.noKTP],
    ["Nama", data.nama],
    ["Jenis Kelamin", data.kelamin],
    ["Domisili", data.domisili],
    ["Agama", data.agama],
    ["Hobi", data.hobi]
  ];

  rows.forEach(([k, v], i) => {
    const y = startY + i * gap;
    ctx.fillText(k, labelX, y);
    ctx.fillText(":", colonX, y);
    ctx.fillText(String(v ?? "-"), valueX, y, maxValueWidth);
  });

  // FOTO (avatar di-crop tengah supaya tidak gepeng)
  const photoX = 555, photoY = 145, photoW = 145, photoH = 185;

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(photoX - 10, photoY - 10, photoW + 20, photoH + 20);

  try {
    const avatar = await loadAvatar(user);
    const ratio = photoW / photoH;
    const sw = avatar.height * ratio;
    const sx = (avatar.width - sw) / 2;
    ctx.drawImage(avatar, sx, 0, sw, avatar.height, photoX, photoY, photoW, photoH);
  } catch {
    ctx.fillStyle = "#999999";
    ctx.fillRect(photoX, photoY, photoW, photoH);
  }

  // TANGGAL PEMBUATAN
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 5;
  ctx.textAlign = "center";
  ctx.font = "14px Roboto";

  const centerX = photoX + photoW / 2;
  ctx.fillText("Tanggal Pembuatan", centerX, 360);
  ctx.fillText(
    new Date(data.dibuat || Date.now()).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }),
    centerX,
    385
  );

  return canvas.toBuffer("image/png");
}

// =======================
// 🛡️ ANTI CRASH
// =======================
process.on("unhandledRejection", err => console.log("Unhandled Rejection:", err));
process.on("uncaughtException", err => console.log("Uncaught Exception:", err));

client.login(process.env.TOKEN);
