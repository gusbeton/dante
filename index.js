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
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ======================
// READY
// ======================
client.once("ready", () => {
  console.log(`✅ Bot nyala: ${client.user.tag}`);
});

// ======================
// COMMAND PANEL
// ======================
client.on("messageCreate", async (message) => {
  if (message.content === "!panelktp") {

    const embed = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("📄 Kartu Tanda Penduduk")
      .setDescription("GANG DESA • Klik tombol di bawah untuk membuat KTP");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("buat_ktp")
        .setLabel("Buat KTP")
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

// ======================
// BUTTON → MODAL
// ======================
client.on("interactionCreate", async (interaction) => {

  if (interaction.isButton()) {
    if (interaction.customId === "buat_ktp") {

      const modal = new ModalBuilder()
        .setCustomId("modal_ktp")
        .setTitle("Isi Data KTP Kamu");

      const nama = new TextInputBuilder()
        .setCustomId("nama")
        .setLabel("Nama Lengkap")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const kelamin = new TextInputBuilder()
        .setCustomId("kelamin")
        .setLabel("Jenis Kelamin")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const domisili = new TextInputBuilder()
        .setCustomId("domisili")
        .setLabel("Domisili")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const agama = new TextInputBuilder()
        .setCustomId("agama")
        .setLabel("Agama")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const hobi = new TextInputBuilder()
        .setCustomId("hobi")
        .setLabel("Hobi")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nama),
        new ActionRowBuilder().addComponents(kelamin),
        new ActionRowBuilder().addComponents(domisili),
        new ActionRowBuilder().addComponents(agama),
        new ActionRowBuilder().addComponents(hobi)
      );

      await interaction.showModal(modal);
    }
  }

  // ======================
  // MODAL SUBMIT → KTP
  // ======================
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "modal_ktp") {

      const nama = interaction.fields.getTextInputValue("nama");
      const kelamin = interaction.fields.getTextInputValue("kelamin");
      const domisili = interaction.fields.getTextInputValue("domisili");
      const agama = interaction.fields.getTextInputValue("agama");
      const hobi = interaction.fields.getTextInputValue("hobi");

      const ktp = new EmbedBuilder()
        .setColor("#2b2d31")
        .setAuthor({
          name: `KTP • ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`
\`\`\`yaml
KARTU TANDA PENDUDUK
GANG DESA
━━━━━━━━━━━━━━━━━━━━
Nama          : ${nama}
Jenis Kelamin : ${kelamin}
Domisili      : ${domisili}
Agama         : ${agama}
Hobi          : ${hobi}
━━━━━━━━━━━━━━━━━━━━
\`\`\`
`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setFooter({ text: "KTP Digital • Premium System" })
        .setTimestamp();

      await interaction.reply({
        embeds: [ktp],
        ephemeral: false
      });
    }
  }

});

// ======================
// LOGIN
// ======================
client.login(process.env.TOKEN);
