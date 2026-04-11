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

const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const {
  joinVoiceChannel
} = require("@discordjs/voice");

const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
const TEXT_CHANNEL_ID = "1492441547583524954";
const VOICE_CHANNEL_ID = "1488854856633680083";

// ===== FONT =====
registerFont(path.join(__dirname, "assets/Roboto-Bold.ttf"), {
  family: "Roboto"
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const dbPath = "./database.json";

// ===== DATABASE =====
function loadDB() {
  return JSON.parse(fs.readFileSync(dbPath));
}
function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ===== READY =====
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif`);

  // AUTO JOIN VOICE
  const vc = await client.channels.fetch(VOICE_CHANNEL_ID);
  joinVoiceChannel({
    channelId: vc.id,
    guildId: vc.guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
  });

  // PANEL
  const channel = await client.channels.fetch(TEXT_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🪪 BETLEHEM KTP")
    .setDescription("Klik tombol untuk membuat atau melihat KTP kamu")
    .setImage("https://media.discordapp.net/attachments/1487590787284734143/1492489699225243729/ktp-bg.png.png?ex=69db84d9&is=69da3359&hm=bb337a5cf83a3c88c88d38b4a6c88146a28d1a224b03b7f14639dc94af8c33a1&=&format=webp&quality=lossless");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("buat_ktp")
      .setLabel("Buat / Lihat KTP")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
});

// ===== INTERACTION =====
client.on("interactionCreate", async (interaction) => {

  // BUTTON
  if (interaction.isButton()) {
    if (interaction.customId === "buat_ktp") {

      const db = loadDB();

      if (db[interaction.user.id]) {
        const buffer = await generateKTP(interaction.user, db[interaction.user.id]);
        const file = new AttachmentBuilder(buffer, { name: "ktp.png" });

        return interaction.reply({
          content: `📄 **Kartu Tanda Penduduk milik ${interaction.user}**`,
          files: [file],
          ephemeral: true
        });
      }

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

  // MODAL
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
        .setImage("attachment://ktp.png")
        .setFooter({
          text: `${interaction.guild.name} • ketuk button dibawah untuk melihat KTP`,
          iconURL: interaction.guild.iconURL({ dynamic: true })
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("buat_ktp")
          .setLabel("Buat / Lihat KTP")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        content: `🪪 **Kartu Tanda Penduduk milik ${interaction.user}**`,
        embeds: [embed],
        files: [file],
        components: [row]
      });
    }
  }

});

// ===== CANVAS =====
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

  // AVATAR
  const avatar = await loadImage(
    user.displayAvatarURL({ extension: "png", size: 256 })
  );

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(545, 135, 165, 205);
  ctx.drawImage(avatar, 555, 145, 145, 185);

  // TANGGAL CENTER
  const photoX = 555;
  const photoWidth = 145;
  const centerX = photoX + photoWidth / 2;

  ctx.textAlign = "center";
  ctx.font = "14px Roboto";

  ctx.fillText("Tanggal Pembuatan", centerX, 360);
  ctx.fillText(
    new Date().toLocaleDateString("id-ID"),
    centerX,
    385
  );

  ctx.textAlign = "left";

  return canvas.toBuffer();
}

client.login(process.env.TOKEN);
