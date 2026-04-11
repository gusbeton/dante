const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// optional font (kalau ada)
try {
  registerFont(path.join(__dirname, "assets/arialbd.ttf"), {
    family: "ArialBold"
  });
} catch {}

function randomNIK() {
  return Math.floor(1000000000000000 + Math.random() * 9000000000000000);
}

async function generateKTP(user, data) {
  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  // ===== BACKGROUND =====
  const bg = await loadImage(path.join(__dirname, "assets/ktp-bg.png"));
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  // overlay tipis biar teks kebaca
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ===== TITLE =====
  ctx.fillStyle = "#0f0f0f";
  ctx.textAlign = "center";

  ctx.font = "bold 26px Arial";
  ctx.fillText("KARTU TANDA PENDUDUK", 400, 55);

  ctx.font = "bold 20px Arial";
  ctx.fillText("BETLEHEM", 400, 85);

  ctx.textAlign = "left";

  // ===== BOX AREA (BIAR MIRIP KTP ASLI) =====
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, 115, 420, 250);

  // ===== DATA =====
  ctx.font = "18px Arial";
  ctx.fillStyle = "#111";

  const labelX = 80;
  const colonX = 250;
  const valueX = 270;

  const startY = 150;
  const gap = 38;

  const fields = [
    ["No KTP", randomNIK()],
    ["Nama", data.nama],
    ["Jenis Kelamin", data.kelamin],
    ["Domisili", data.domisili],
    ["Agama", data.agama],
    ["Hobi", data.hobi]
  ];

  fields.forEach(([label, value], i) => {
    const y = startY + i * gap;

    ctx.fillText(label, labelX, y);
    ctx.fillText(":", colonX, y);
    ctx.fillText(value, valueX, y);
  });

  // ===== FOTO =====
  const avatar = await loadImage(
    user.displayAvatarURL({ extension: "png", size: 256 })
  );

  // frame foto
  ctx.fillStyle = "#fff";
  ctx.fillRect(545, 135, 165, 205);

  ctx.drawImage(avatar, 555, 145, 145, 185);

  // ===== TANGGAL =====
  ctx.font = "14px Arial";
  ctx.fillStyle = "#111";

  ctx.fillText("Tanggal Pembuatan:", 540, 360);
  ctx.fillText(
    new Date().toLocaleDateString("id-ID"),
    580,
    385
  );

  return canvas.toBuffer();
}

module.exports = generateKTP;
