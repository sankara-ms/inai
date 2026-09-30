// One-off generator for media/icon.png (real 128x128 RGBA PNG, no deps).
// Renders INAI's geometric neural-N mark to match media/icon.svg.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 128;
const H = 128;
const RADIUS = 27;
const SAMPLES = 4;

const surfaceA = [0x11, 0x18, 0x2f];
const surfaceB = [0x07, 0x0b, 0x18];
const violet = [0xa8, 0x55, 0xf7];
const indigo = [0x63, 0x66, 0xf1];
const cyan = [0x22, 0xd3, 0xee];
const white = [0xf8, 0xfa, 0xfc];
const slate = [0x94, 0xa3, 0xb8];
const nodeDark = [0x0b, 0x12, 0x27];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, amount) {
  const t = clamp(amount);
  return a.map((channel, i) => channel + (b[i] - channel) * t);
}

function blend(base, overlay, alpha) {
  return mix(base, overlay, clamp(alpha));
}

function insideRoundedRect(x, y) {
  const r = RADIUS;
  if (x >= r && x <= W - r) return true;
  if (y >= r && y <= H - r) return true;
  const cx = x < r ? r : W - r;
  const cy = y < r ? r : H - r;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / lengthSquared);
  const px = ax + t * vx;
  const py = ay + t * vy;
  return Math.hypot(x - px, y - py);
}

const hexagon = [
  [64, 15],
  [107, 40],
  [107, 88],
  [64, 113],
  [21, 88],
  [21, 40],
  [64, 15],
];

function hexDistance(x, y) {
  let distance = Infinity;
  for (let i = 0; i < hexagon.length - 1; i++) {
    distance = Math.min(
      distance,
      distanceToSegment(x, y, ...hexagon[i], ...hexagon[i + 1]),
    );
  }
  return distance;
}

function signalDistance(x, y) {
  return Math.min(
    distanceToSegment(x, y, 34, 94, 34, 34),
    distanceToSegment(x, y, 34, 34, 94, 94),
    distanceToSegment(x, y, 94, 94, 94, 34),
  );
}

function signalColor(x, y) {
  const t = clamp((x - y + 86) / 172);
  return t < 0.52 ? mix(violet, indigo, t / 0.52) : mix(indigo, cyan, (t - 0.52) / 0.48);
}

function sample(x, y) {
  if (!insideRoundedRect(x, y)) return [0, 0, 0, 0];

  const surfaceT = clamp((x + y - 20) / 216);
  let color = mix(surfaceA, surfaceB, surfaceT);

  const glowDistance = Math.hypot((x - 66) / 58, (y - 61) / 58);
  if (glowDistance < 1) {
    const glow = mix([0x5b, 0x21, 0xb6], [0x16, 0x4e, 0x63], clamp(glowDistance));
    color = blend(color, glow, (1 - glowDistance) * 0.34);
  }

  const frameDistance = hexDistance(x, y);
  if (frameDistance <= 1.25) {
    color = blend(color, slate, 0.25 * (1 - frameDistance / 1.25));
  }

  const markDistance = signalDistance(x, y);
  if (markDistance <= 6) {
    color = signalColor(x, y);
  }

  if (Math.hypot(x - 34, y - 34) <= 5.5 || Math.hypot(x - 94, y - 94) <= 5.5) {
    color = white;
  }

  const diamondDistance = Math.abs(x - 64) + Math.abs(y - 64);
  if (diamondDistance <= 11) color = white;
  if (diamondDistance <= 7.5) color = nodeDark;
  if (diamondDistance <= 4) color = cyan;

  return [...color, 255];
}

// Four-by-four supersampling keeps the 128 px marketplace icon crisp.
const raw = Buffer.alloc((W * 4 + 1) * H);
let offset = 0;
for (let y = 0; y < H; y++) {
  raw[offset++] = 0;
  for (let x = 0; x < W; x++) {
    const total = [0, 0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const pixel = sample(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES);
        for (let channel = 0; channel < 4; channel++) total[channel] += pixel[channel];
      }
    }
    const divisor = SAMPLES * SAMPLES;
    for (const value of total) raw[offset++] = Math.round(value / divisor);
  }
}

function crc32(buffer) {
  let checksum = ~0;
  for (const value of buffer) {
    checksum ^= value;
    for (let bit = 0; bit < 8; bit++) {
      checksum = checksum & 1 ? (checksum >>> 1) ^ 0xedb88320 : checksum >>> 1;
    }
  }
  return ~checksum >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const output = path.join(__dirname, "..", "media", "icon.png");
fs.writeFileSync(output, png);
console.log(`Wrote ${output} (${png.length} bytes)`);
