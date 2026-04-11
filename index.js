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
  AttachmentBuilder
} = require("discord.js");

const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const dbPath = "./database.json";

// ================= DATABASE =================
function loadDB() {
  return JSON.parse(fs.readFileSync(dbPath));
}
function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif`);

  const channel = await client.channels.fetch("1492441547583524954");

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("📄 BETLEHEM KTP")
    .setDescription("BETLEHEM • Klik tombol untuk membuat atau melihat KTP kamu")
    .setImage("https://i.imgur.com/8XhFZkT.png"); // bebas (preview aja)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("buat_ktp")
      .setLabel("Buat / Lihat KTP")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
});

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {

  // BUTTON
  if (interaction.isButton()) {
    if (interaction.customId === "buat_ktp") {

      const db = loadDB();

      // kalau sudah punya
      if (db[interaction.user.id]) {
        const buffer = await generateKTP(interaction.user, db[interaction.user.id]);
        const file = new AttachmentBuilder(buffer, { name: "ktp.png" });

        return interaction.reply({
          content: "📄 Ini KTP kamu:",
          files: [file],
          ephemeral: true
        });
      }

      // modal
      const modal = new ModalBuilder()
        .setCustomId("modal_ktp")
        .setTitle("Isi Data KTP Kamu");

      const fields = ["nama", "kelamin", "domisili", "agama", "hobi"];
      const labels = ["Nama Lengkap", "Jenis Kelamin", "Domisili", "Agama", "Hobi"];

      fields.forEach((id, i) => {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(labels[i])
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      });

      await interaction.showModal(modal);
    }
  }

  // MODAL SUBMIT
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "modal_ktp") {

      const db = loadDB();

      const data = {
        nama: interaction.fields.getTextInputValue("nama"),
        kelamin: interaction.fields.getTextInputValue("kelamin"),
        domisili: interaction.fields.getTextInputValue("domisili"),
        agama: interaction.fields.getTextInputValue("agama"),
        hobi: interaction.fields.getTextInputValue("hobi")
      };

      db[interaction.user.id] = data;
      saveDB(db);

      const buffer = await generateKTP(interaction.user, data);
      const file = new AttachmentBuilder(buffer, { name: "ktp.png" });

      const embed = new EmbedBuilder()
        .setColor("#2b2d31")
        .setTitle(`📄 Kartu Tanda Penduduk milik ${interaction.user.username}`)
        .setDescription("GANG DESA • Data berhasil dibuat")
        .setImage("attachment://ktp.png");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("buat_ktp")
          .setLabel("Buat / Lihat KTP")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        embeds: [embed],
        files: [file],
        components: [row]
      });
    }
  }

});

// ================= CANVAS PERFECT =================
async function generateKTP(user, data) {
  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(path.join(__dirname, "assets/ktp-bg.png"));
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  // title
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "bold 26px Arial";
  ctx.fillText("KARTU TANDA PENDUDUK", 400, 55);
  ctx.font = "bold 20px Arial";
  ctx.fillText("GANG DESA", 400, 85);

  ctx.textAlign = "left";

  // data
  ctx.font = "18px Arial";
  ctx.fillStyle = "#111";

  const labelX = 90;
  const colonX = 260;
  const valueX = 280;

  const startY = 150;
  const gap = 36;

  const fields = [
    ["No KTP", Math.floor(Math.random()*9999999999999999)],
    ["Nama", data.nama],
    ["Jenis Kelamin", data.kelamin],
    ["Domisili", data.domisili],
    ["Agama", data.agama],
    ["Hobi", data.hobi]
  ];

  fields.forEach(([k, v], i) => {
    const y = startY + i * gap;
    ctx.fillText(k, labelX, y);
    ctx.fillText(":", colonX, y);
    ctx.fillText(v, valueX, y);
  });

  // foto
  const avatar = await loadImage(
    user.displayAvatarURL({ extension: "png", size: 256 })
  );

  ctx.fillStyle = "#fff";
  ctx.fillRect(545, 135, 165, 205);
  ctx.drawImage(avatar, 555, 145, 145, 185);

  // tanggal
  ctx.font = "14px Arial";
  ctx.fillText("Tanggal Pembuatan:", 540, 360);
  ctx.fillText(new Date().toLocaleDateString("id-ID"), 580, 385);

  return canvas.toBuffer();
}

client.login(process.env.TOKEN);
