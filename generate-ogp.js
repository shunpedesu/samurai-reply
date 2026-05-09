/**
 * Generate OGP image (1200×630) for Samurai Reply
 * Run: node generate-ogp.js
 */
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&amp;display=swap');
    </style>
    <!-- Noise overlay -->
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="overlay" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
    <!-- Glow for gold text -->
    <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feFlood flood-color="#c8a040" flood-opacity="0.6" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feFlood flood-color="#00cfff" flood-opacity="0.5" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- BG -->
  <rect width="${W}" height="${H}" fill="#08080c"/>

  <!-- Grid lines -->
  ${Array.from({length:13},(_,i)=>`<line x1="${i*100}" y1="0" x2="${i*100}" y2="${H}" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>`).join('')}
  ${Array.from({length:7},(_,i)=>`<line x1="0" y1="${i*105}" x2="${W}" y2="${i*105}" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>`).join('')}

  <!-- Diagonal accent lines (top-left) -->
  <line x1="-50" y1="0"   x2="350" y2="${H}" stroke="#c8a040" stroke-opacity="0.08" stroke-width="1.5"/>
  <line x1="0"   y1="0"   x2="400" y2="${H}" stroke="#c8a040" stroke-opacity="0.05" stroke-width="1"/>
  <line x1="50"  y1="0"   x2="450" y2="${H}" stroke="#c8a040" stroke-opacity="0.03" stroke-width="0.8"/>

  <!-- Right dark panel -->
  <rect x="700" y="0" width="500" height="${H}" fill="#0a0a10" opacity="0.6"/>

  <!-- ── SAMURAI FIGURE (right side, simplified) ── -->
  <g transform="translate(820, 30) scale(1.15)" opacity="0.9">
    <!-- Hakama -->
    <path fill="#c8a040" d="M 90 332 L 210 332 Q 228 350 256 598 L 174 598 Q 163 495 150 472 Q 137 495 126 598 L 44 598 Q 72 350 90 332 Z"/>
    <line stroke="#7a5c18" stroke-width="2" x1="150" y1="332" x2="150" y2="472"/>
    <!-- Koshi belt -->
    <path fill="#c8a040" d="M84 303 L216 303 L220 338 L80 338 Z"/>
    <!-- Do (chest) -->
    <path fill="#c8a040" d="M88 152 L212 152 L218 306 L82 306 Z"/>
    <line stroke="#7a5c18" stroke-width="2" x1="88"  y1="183" x2="212" y2="183"/>
    <line stroke="#7a5c18" stroke-width="2" x1="87"  y1="213" x2="213" y2="213"/>
    <line stroke="#7a5c18" stroke-width="2" x1="86"  y1="243" x2="214" y2="243"/>
    <line stroke="#7a5c18" stroke-width="2" x1="85"  y1="273" x2="215" y2="273"/>
    <!-- Sode L/R -->
    <path fill="#c8a040" d="M40 142 L90 142 L90 248 L44 236 Z"/>
    <path fill="#c8a040" d="M210 142 L260 142 L256 236 L210 248 Z"/>
    <!-- Arms -->
    <path fill="#c8a040" d="M40 150 L90 150 L90 316 L40 308 Z"/>
    <path fill="#c8a040" d="M210 150 L260 150 L260 308 L210 316 Z"/>
    <!-- Fists -->
    <path fill="#c8a040" d="M32 307 Q30 322 40 330 Q56 337 66 326 Q72 315 62 306 Z"/>
    <path fill="#c8a040" d="M268 307 Q270 322 260 330 Q244 337 234 326 Q228 315 238 306 Z"/>
    <!-- Neck -->
    <rect fill="#c8a040" x="134" y="126" width="32" height="30" rx="5"/>
    <ellipse fill="#c8a040" cx="150" cy="100" rx="32" ry="30" opacity="0.6"/>
    <!-- Kabuto shikoro -->
    <path fill="#c8a040" d="M93 110 Q60 116 56 148 L80 138 Z"/>
    <path fill="#c8a040" d="M56 148 Q46 176 52 200 L78 182 Z"/>
    <path fill="#c8a040" d="M52 200 Q46 224 56 244 L83 224 Z"/>
    <path fill="#c8a040" d="M207 110 Q240 116 244 148 L220 138 Z"/>
    <path fill="#c8a040" d="M244 148 Q254 176 248 200 L222 182 Z"/>
    <path fill="#c8a040" d="M248 200 Q254 224 244 244 L217 224 Z"/>
    <!-- Kabuto bowl -->
    <path fill="#c8a040" d="M 90 118 Q 86 58 150 50 Q 214 58 210 118 Q 190 130 150 133 Q 110 130 90 118 Z"/>
    <path fill="#c8a040" d="M 90 98 Q 70 85 74 60 Q 83 72 93 88 Z"/>
    <path fill="#c8a040" d="M 210 98 Q 230 85 226 60 Q 217 72 207 88 Z"/>
    <!-- Maedate crescent -->
    <path fill="#c8a040" d="M 125 52 Q 108 28 120 8 Q 134 -4 150 0 Q 166 -4 180 8 Q 192 28 175 52 Q 163 42 150 40 Q 137 42 125 52 Z"/>
    <path fill="#110900" opacity="0.9" d="M 134 50 Q 122 30 132 14 Q 140 5 150 7 Q 160 5 168 14 Q 178 30 166 50 Q 158 42 150 40 Q 142 42 134 50 Z"/>
    <rect fill="#c8a040" x="140" y="49" width="20" height="10" rx="2"/>
    <circle fill="#c8a040" cx="150" cy="51" r="6"/>
    <circle fill="#7a5c18" cx="150" cy="51" r="3"/>
    <!-- Katana in saya -->
    <path fill="#c8a040" d="M97 268 L108 258 L52 492 L40 500 Z"/>
  </g>

  <!-- ── LEFT CONTENT ── -->

  <!-- Gold accent bar -->
  <rect x="60" y="80" width="5" height="90" fill="#c8a040" rx="2"/>

  <!-- App name -->
  <text x="82" y="138" font-family="Arial Black, sans-serif" font-weight="900" font-size="78" letter-spacing="-2" fill="#c8a040" filter="url(#glow-gold)">SAMURAI</text>
  <text x="82" y="200" font-family="Arial Black, sans-serif" font-weight="900" font-size="78" letter-spacing="-2" fill="#ffffff">REPLY</text>

  <!-- Tagline -->
  <text x="84" y="245" font-family="'IBM Plex Mono', Courier New, monospace" font-size="19" fill="#9090b0" letter-spacing="1">The reply you couldn't write.</text>

  <!-- Divider -->
  <line x1="60" y1="270" x2="660" y2="270" stroke="#c8a040" stroke-opacity="0.3" stroke-width="1"/>

  <!-- 5 reply types -->
  <!-- Pro -->
  <rect x="60" y="290" width="160" height="52" rx="6" fill="#0d1f14"/>
  <rect x="60" y="290" width="3"   height="52" rx="1.5" fill="#00ff88"/>
  <text x="75" y="311" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#00ff88" letter-spacing="1">POLISHED</text>
  <text x="75" y="332" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa">Diplomatic &amp; safe</text>

  <!-- Honest -->
  <rect x="232" y="290" width="160" height="52" rx="6" fill="#1a1a0d"/>
  <rect x="232" y="290" width="3"   height="52" rx="1.5" fill="#ffcc00"/>
  <text x="247" y="311" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#ffcc00" letter-spacing="1">HONEST</text>
  <text x="247" y="332" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa">The real truth</text>

  <!-- Rage -->
  <rect x="404" y="290" width="160" height="52" rx="6" fill="#1f0a0a"/>
  <rect x="404" y="290" width="3"   height="52" rx="1.5" fill="#ff3344"/>
  <text x="419" y="311" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#ff3344" letter-spacing="1">RAGE 💢</text>
  <text x="419" y="332" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa">Never send this</text>

  <!-- Ghost -->
  <rect x="60" y="354" width="160" height="52" rx="6" fill="#120a1f"/>
  <rect x="60" y="354" width="3"   height="52" rx="1.5" fill="#9966ff"/>
  <text x="75" y="375" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#9966ff" letter-spacing="1">GHOST 👻</text>
  <text x="75" y="396" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa">One dry line</text>

  <!-- Samurai -->
  <rect x="232" y="354" width="332" height="52" rx="6" fill="#1a1100"/>
  <rect x="232" y="354" width="3"   height="52" rx="1.5" fill="#c8a040"/>
  <text x="247" y="375" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#c8a040" letter-spacing="1">⚔ SAMURAI</text>
  <text x="247" y="396" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa">Honor. Steel. Slightly unhinged.</text>

  <!-- Bottom bar -->
  <rect x="0" y="570" width="${W}" height="60" fill="#0d0d12"/>
  <line x1="0" y1="570" x2="${W}" y2="570" stroke="#c8a040" stroke-opacity="0.4" stroke-width="1"/>

  <!-- URL -->
  <text x="62" y="604" font-family="'IBM Plex Mono', Courier New, monospace" font-size="16" fill="#666688" letter-spacing="1">samurai-reply.vercel.app</text>

  <!-- Free badge -->
  <rect x="900" y="580" width="238" height="30" rx="4" fill="#0f2010"/>
  <rect x="900" y="580" width="3"   height="30" rx="1.5" fill="#00ff88"/>
  <text x="914" y="601" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#00ff88" letter-spacing="0.5">Free to try — No signup</text>

</svg>`;

const outPath = path.join(__dirname, 'ogp.png');

sharp(Buffer.from(svg))
  .png()
  .toFile(outPath)
  .then(info => console.log(`✓ ogp.png created: ${info.width}×${info.height}px`))
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
