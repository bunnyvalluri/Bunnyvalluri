/**
 * Generates an animated GitHub contribution heatmap SVG featuring a compact space rocket 🚀
 * perfectly proportioned and padded inside the card frame, emitting particle trails,
 * crosshair target locks, and vertical laser streams.
 *
 * Environment variables:
 *   GH_USERNAME  - GitHub username (default: bunnyvalluri)
 *   GH_TOKEN     - token with access to the GraphQL API (required).
 *   OUTPUT_PATH  - where to write the SVG (default: dist/github-jet.svg)
 */

import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "bunnyvalluri";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OUTPUT = process.env.OUTPUT_PATH || "dist/github-jet.svg";
const COLS = 34; // weeks shown
const ROWS = 7;
const CELL = 11;
const STEP = 14; // cell + gap
const GRID_X = 20;
const GRID_Y = 22;
const WIDTH = 513;
const HEIGHT = 175;
const ROCKET_X_START = 35;
const ROCKET_X_END = 478;
const ROCKET_Y_POS = 128; // Centered vertically inside bottom area (128 + 28 max flame = 156, well inside 175)
const NOSE_LAUNCH_Y = 108; // Exact nose cone tip height
const LOOP_DUR = 20; // seconds, one full pass
const MAX_TARGETS = 14; // busiest days target count
const FLASH_COLOR = "#38bdf8";
const SECONDARY_FLASH = "#34d399";
const BLAST_COLOR = "#38bdf8";

if (!USERNAME) {
  console.error("Missing GH_USERNAME env var");
  process.exit(1);
}

const QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

async function fetchWeeks() {
  if (!TOKEN || TOKEN.startsWith("fake-token")) {
    console.warn("Using fallback calendar dataset for preview...");
    return mockWeeks();
  }

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
    });
    if (!res.ok) {
      console.warn(`GitHub API GraphQL returned ${res.status}, using preview dataset`);
      return mockWeeks();
    }
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data.user.contributionsCollection.contributionCalendar.weeks;
  } catch (err) {
    console.warn("GraphQL error, using mock data:", err.message);
    return mockWeeks();
  }
}

function mockWeeks() {
  const COLORS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
  const weeks = [];
  for (let w = 0; w < COLS; w++) {
    const days = [];
    for (let d = 0; d < ROWS; d++) {
      const seed = (w * 7 + d) % 13;
      const count = seed === 0 ? 12 : seed < 3 ? 4 : seed < 7 ? 1 : 0;
      const level = count === 0 ? 0 : count < 2 ? 1 : count < 5 ? 2 : count < 10 ? 3 : 4;
      days.push({ date: `2026-W${w}-${d}`, contributionCount: count, color: COLORS[level] });
    }
    weeks.push({ contributionDays: days });
  }
  return weeks;
}

function buildCells(weeks) {
  const recent = weeks.slice(-COLS);
  const padCount = COLS - recent.length;
  const padded = Array.from({ length: padCount }, () => ({
    contributionDays: Array.from({ length: ROWS }, () => ({
      contributionCount: 0,
      color: "#161b22",
      date: null,
    })),
  })).concat(recent);

  const cells = [];
  padded.forEach((week, col) => {
    week.contributionDays.forEach((day, row) => {
      cells.push({
        col,
        row,
        x: GRID_X + col * STEP,
        y: GRID_Y + row * STEP,
        color: day.color || "#161b22",
        count: day.contributionCount || 0,
        date: day.date,
      });
    });
  });
  return cells;
}

function pickTargets(cells) {
  return [...cells]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TARGETS)
    .sort((a, b) => a.col - b.col || a.row - b.row);
}

function keyTimeForCol(col, direction) {
  const span = 0.46;
  const t = 0.02 + (col / (COLS - 1)) * span;
  return direction === "forward" ? t : 1 - t;
}

function fmt(n) {
  return Number(n.toFixed(4));
}

function buildGrid(cells, targets) {
  const targetKey = new Set(targets.map((t) => `${t.col}-${t.row}`));
  let svg = "";
  for (const c of cells) {
    const isTarget = targetKey.has(`${c.col}-${c.row}`);
    if (!isTarget) {
      svg += `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${c.color}"/>\n`;
      continue;
    }
    const tFwd = keyTimeForCol(c.col, "forward");
    const tBack = keyTimeForCol(c.col, "backward");
    const [t1, t2] = [Math.min(tFwd, tBack), Math.max(tFwd, tBack)];
    const dur = 0.006;
    svg += `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2.5" ry="2.5" fill="${c.color}">` +
      `<animate attributeName="fill" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
      `keyTimes="0;${fmt(t1)};${fmt(t1 + dur)};${fmt(t1 + dur * 2)};${fmt(t2)};${fmt(t2 + dur)};${fmt(t2 + dur * 2)};1" ` +
      `values="${c.color};${c.color};${FLASH_COLOR};${SECONDARY_FLASH};${c.color};${FLASH_COLOR};${SECONDARY_FLASH};${c.color}"/>` +
      `</rect>\n`;
  }
  return svg;
}

function buildBulletsAndBlasts(targets) {
  let bullets = "";
  let blasts = "";
  const dur = 0.006;

  for (const dir of ["forward", "backward"]) {
    const ordered = dir === "forward" ? targets : [...targets].reverse();
    for (const c of ordered) {
      const t = keyTimeForCol(c.col, dir);
      const rise = t - dur * 2.5;
      const arrive = t;
      const fadeEnd = t + dur * 1.5;
      const cx = fmt(c.x + CELL / 2);
      const targetY = fmt(c.y + CELL / 2);

      // Target Lock Crosshair
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="7" fill="none" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 2">` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;1;0.8;0;0"/>` +
        `</circle>` +
        `</g>\n`;

      // Vertical Laser Energy Stream
      bullets += `<g opacity="0">` +
        `<line x1="${cx}" y1="${NOSE_LAUNCH_Y}" x2="${cx}" y2="${targetY}" stroke="url(#rocketLaserGrad)" stroke-width="2"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;0.9;1;0;0"/>` +
        `</g>\n`;

      // Expanding Shockwave Burst
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="0" fill="none" stroke="${BLAST_COLOR}" stroke-width="1.8">` +
        `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 3)};1" values="0;2;12;12"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 3)};1" values="0;1;0;0"/>` +
        `</circle>` +
        `</g>\n`;
    }
  }
  return { bullets, blasts };
}

function buildStars() {
  const pts = [
    [12, 14, 1.2], [12, 65, 1.6], [12, 115, 2.0],
    [501, 18, 1.2], [501, 72, 1.6], [501, 122, 2.0],
    [45, 162, 1.4], [465, 162, 1.8], [255, 164, 2.2]
  ];
  return pts.map(([x, y, dur]) =>
    `<circle cx="${x}" cy="${y}" r="1" fill="#38bdf8" opacity="0.5"><animate attributeName="opacity" values="0.2;0.9;0.2" dur="${dur}s" repeatCount="indefinite"/></circle>`
  ).join("\n");
}

function buildRealRocket() {
  return `<g id="rocket-wrapper">
  <!-- Rocket Motion Trajectory Translation (Positioned safely at Y=${ROCKET_Y_POS}) -->
  <g transform="translate(0, ${ROCKET_Y_POS})">
    <animateTransform attributeName="transform" type="translate"
      dur="${LOOP_DUR}s" repeatCount="indefinite"
      keyTimes="0;0.48;0.50;0.98;1"
      values="${ROCKET_X_START},${ROCKET_Y_POS};${ROCKET_X_END},${ROCKET_Y_POS};${ROCKET_X_END},${ROCKET_Y_POS};${ROCKET_X_START},${ROCKET_Y_POS};${ROCKET_X_START},${ROCKET_Y_POS}"/>

    <!-- Subtle Flight Hover Pitch -->
    <g>
      <animateTransform attributeName="transform" type="rotate"
        dur="${LOOP_DUR}s" repeatCount="indefinite"
        keyTimes="0;0.25;0.50;0.75;1"
        values="3 0 0; -3 0 0; 3 0 0; -3 0 0; 3 0 0"/>

      <!-- Proportioned Space Rocket 🚀 Model -->

      <!-- Outer Orange Flame -->
      <polygon points="-4,18 4,18 0,34" fill="url(#outerRocketFlame)">
        <animate attributeName="points" values="-4,18 4,18 0,34; -5,18 5,18 0,38; -4,18 4,18 0,32; -4,18 4,18 0,34" dur="0.12s" repeatCount="indefinite"/>
      </polygon>

      <!-- Inner Yellow Flame -->
      <polygon points="-2.5,18 2.5,18 0,28" fill="url(#innerRocketFlame)">
        <animate attributeName="points" values="-2.5,18 2.5,18 0,28; -3,18 3,18 0,31; -2,18 2,18 0,26; -2.5,18 2.5,18 0,28" dur="0.08s" repeatCount="indefinite"/>
      </polygon>

      <!-- Left Swept Red Fin -->
      <path d="M-5,6 L-12,18 L-5,15 Z" fill="#ef4444" stroke="#dc2626" stroke-width="0.8"/>

      <!-- Right Swept Red Fin -->
      <path d="M5,6 L12,18 L5,15 Z" fill="#ef4444" stroke="#dc2626" stroke-width="0.8"/>

      <!-- Cylindrical White Body Stage -->
      <rect x="-5" y="-5" width="10" height="21" rx="1.5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
      
      <!-- Red Accent Band -->
      <rect x="-5" y="0" width="10" height="3" fill="#ef4444"/>

      <!-- Cyan Porthole Window -->
      <circle cx="0" cy="6" r="2.5" fill="#0284c7" stroke="#38bdf8" stroke-width="1"/>
      <circle cx="-0.8" cy="5.2" r="0.8" fill="#ffffff"/>

      <!-- Aerodynamic Red Nose Cone Tip -->
      <path d="M0,-20 Q-5,-10 -5,-5 L5,-5 Q5,-10 0,-20 Z" fill="#ef4444" stroke="#dc2626" stroke-width="0.8"/>
      <path d="M0,-18 Q-3,-9 -3,-5" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.6"/>

      <!-- Rocket Engine Bell Nozzle -->
      <polygon points="-4,16 4,16 3,19 -3,19" fill="#475569"/>
    </g>
  </g>
</g>`;
}

function buildSvg(weeks) {
  const cells = buildCells(weeks);
  const targets = pickTargets(cells);
  const { bullets, blasts } = buildBulletsAndBlasts(targets);

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <!-- Rocket Laser Pulse Gradient -->
  <linearGradient id="rocketLaserGrad" x1="0%" y1="100%" x2="0%" y2="0%">
    <stop offset="0%" stop-color="#ef4444" stop-opacity="1"/>
    <stop offset="40%" stop-color="#38bdf8" stop-opacity="0.9"/>
    <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
  </linearGradient>

  <!-- Outer Rocket Flame Gradient -->
  <linearGradient id="outerRocketFlame" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#f97316"/>
    <stop offset="60%" stop-color="#ef4444"/>
    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
  </linearGradient>

  <!-- Inner Yellow Core Flame Gradient -->
  <linearGradient id="innerRocketFlame" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="40%" stop-color="#fef08a"/>
    <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.2"/>
  </linearGradient>

  <!-- Cyber Border Frame Gradient -->
  <linearGradient id="frameBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#38bdf8"/>
    <stop offset="50%" stop-color="#818cf8"/>
    <stop offset="100%" stop-color="#34d399"/>
  </linearGradient>
</defs>

<!-- Outer Cyber Card Frame Container -->
<rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="12" ry="12" fill="#090d16" stroke="url(#frameBorderGrad)" stroke-width="1.4" opacity="0.95"/>

${buildStars()}

<!-- Space Rocket Radar Status Header -->
<g transform="translate(20, 16)">
  <circle cx="4" cy="-3" r="3" fill="#ef4444">
    <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite"/>
  </circle>
  <text x="14" y="0" font-family="monospace" font-size="9" fill="#38bdf8" font-weight="bold" letter-spacing="1">ROCKET LAUNCH RADAR 🚀 // ACTIVE CONTRIBUTION MATRIX</text>
</g>

<!-- Contribution Grid -->
<g id="grid">
${buildGrid(cells, targets)}</g>

<!-- Vertical Rocket Energy Beams -->
<g id="bullets">
${bullets}</g>

<!-- Crosshairs & Explosive Shockwaves -->
<g id="blasts">
${blasts}</g>

<!-- Proportioned Space Rocket 🚀 -->
${buildRealRocket()}
</svg>`;
}

async function main() {
  console.log(`Generating space rocket 🚀 heatmap SVG for ${USERNAME}...`);
  const weeks = await fetchWeeks();
  const svg = buildSvg(weeks);
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, "utf8");
  console.log(`Successfully generated ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
