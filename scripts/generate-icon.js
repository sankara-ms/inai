// One-off generator for media/icon.png (real 128x128 PNG, no external deps).
// Renders a rounded gradient tile with a simple "U" mark to match icon.svg.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 128;
const H = 128;
const RADIUS = 28;

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// gradient endpoints (matches icon.svg)
const c0 = [0x7c, 0x3a, 0xed];
const c1 = [0x25, 0x63, 0xeb];
const white = [0xff, 0xff, 0xff];

function insideRoundedRect(x, y) {
  const r = RADIUS;
  if (x >= r && x <= W - 1 - r) return true;
  if (y >= r && y <= H - 1 - r) return true;
  const cx = x < r ? r : W - 1 - r;
  const cy = y < r ? r : H - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// A crude "U" glyph: two vertical bars + bottom arc, plus a dot on top.
function isMark(x, y) {
  // top dot
  const ddx = x - 64;
  const ddyTop = y - 30;
  if (ddx * ddx + ddyTop * ddyTop <= 7 * 7) return true;
  // U shape stroke ~10px wide
  const strokeHalf = 5;
  // left/right verticals between y=40..74
  if (y >= 40 && y <= 74) {
    if (Math.abs(x - 40) <= strokeHalf) return true;
    if (Math.abs(x - 88) <= strokeHalf) return true;
  }
  // bottom arc center (64,74) radius 24
  const dx = x - 64;
  const dy = y - 74;
  if (dy >= 0) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dist - 24) <= strokeHalf) return true;
  }
  return false;
}

// Build raw RGBA scanlines with PNG filter byte 0 per row.
const raw = Buffer.alloc((W * 4 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; // filter type: none
  for (let x = 0; x < W; x++) {
    let r, g, b, a;
    if (!insideRoundedRect(x, y)) {
      r = g = b = a = 0; // transparent outside rounded rect
    } else {
      const t = (x + y) / (W + H);
      if (isMark(x, y)) {
        [r, g, b] = white;
      } else {
        r = lerp(c0[0], c1[0], t);
        g = lerp(c0[1], c1[1], t);
        b = lerp(c0[2], c1[2], t);
      }
      a = 255;
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = a;
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const idat = zlib.deflateSync(raw);
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "media", "icon.png");
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
