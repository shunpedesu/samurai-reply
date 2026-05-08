/**
 * Run once to generate PWA icons:
 *   node generate-icons.js
 *
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');

// SVG icon source
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0e"/>
  <!-- Neon R -->
  <text x="60" y="340" font-family="Arial Black, sans-serif"
        font-size="320" font-weight="900"
        fill="#ff2d55"
        style="text-shadow: 0 0 40px #ff2d55">R</text>
  <!-- Neon accent line -->
  <rect x="60" y="400" width="392" height="8" rx="4" fill="#ff2d55" opacity="0.6"/>
  <!-- ⚡ small -->
  <text x="310" y="200" font-size="100" fill="#ffd60a">⚡</text>
</svg>`;

const svgBuf = Buffer.from(svg);

async function generate() {
  await sharp(svgBuf).resize(192, 192).png().toFile('icon-192.png');
  await sharp(svgBuf).resize(512, 512).png().toFile('icon-512.png');
  console.log('✓ icon-192.png and icon-512.png generated');
}

generate().catch(console.error);
