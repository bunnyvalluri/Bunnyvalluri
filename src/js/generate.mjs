/**
 * Generates an animated GitHub contribution heatmap SVG featuring an authentic space rocket 🚀
 * that traverses active contribution days, fires vertical laser streams from its nose cone,
 * locks onto target cells with crosshairs, and emits dynamic fiery rocket exhaust plumes.
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
const GRID_Y = 24;
const WIDTH = 513;
const HEIGHT = 175;
const ROCKET_X_START = 35;
const ROCKET_X_END = 478;
const LOOP_DUR = 20; // seconds, one full pass
const MAX_TARGETS = 14; // busiest days target count
const FLASH_COLOR = "#38bdf8";
const SECONDARY_FLASH = "#34d399";
const BLAST_COLOR = "#38bdf8";
const NOSE_LAUNCH_Y = 120; // Nose cone tip rocket launch point

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

      // Rotating Target Crosshair Lock
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="7" fill="none" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 2">` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;1;0.8;0;0"/>` +
        `</circle>` +
        `</g>\n`;

      // Vertical Rocket Energy Beam
      bullets += `<g opacity="0">` +
        `<line x1="${cx}" y1="${NOSE_LAUNCH_Y}" x2="${cx}" y2="${targetY}" stroke="url(#rocketLaserGrad)" stroke-width="2.2"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;0.9;1;0;0"/>` +
        `</g>\n`;

      // Expanding Shockwave Burst + Particle Sparks
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="0" fill="none" stroke="${BLAST_COLOR}" stroke-width="2">` +
        `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 3)};1" values="0;2;13;13"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 3)};1" values="0;1;0;0"/>` +
        `</circle>` +
        `<circle cx="${cx}" cy="${targetY}" r="0" fill="none" stroke="#34d399" stroke-width="1.2">` +
        `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 2)};1" values="0;1;8;8"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 2)};1" values="0;0.9;0;0"/>` +
        `</circle>` +
        `</g>\n`;
    }
  }
  return { bullets, blasts };
}

function buildStars() {
  const pts = [
    [12, 16, 1.2], [12, 68, 1.6], [12, 118, 2.0],
    [501, 22, 1.2], [501, 78, 1.6], [501, 128, 2.0],
    [45, 168, 1.4], [465, 168, 1.8], [255, 169, 2.2]
  ];
  return pts.map(([x, y, dur]) =>
    `<circle cx="${x}" cy="${y}" r="1.1" fill="#38bdf8" opacity="0.6"><animate attributeName="opacity" values="0.2;1;0.2" dur="${dur}s" repeatCount="indefinite"/></circle>`
  ).join("\n");
}

function buildRealRocket() {
  return `<g id="rocket-wrapper">
  <!-- Rocket Motion Trajectory Translation across canvas -->
  <g transform="translate(0, 142)">
    <animateTransform attributeName="transform" type="translate"
      dur="${LOOP_DUR}s" repeatCount="indefinite"
      keyTimes="0;0.48;0.50;0.98;1"
      values="${ROCKET_X_START},142;${ROCKET_X_END},142;${ROCKET_X_END},142;${ROCKET_X_START},142;${ROCKET_X_START},142"/>

    <!-- Subtle Upright Hover Flight Tilt -->
    <g>
      <animateTransform attributeName="transform" type="rotate"
        dur="${LOOP_DUR}s" repeatCount="indefinite"
        keyTimes="0;0.25;0.50;0.75;1"
        values="4 0 0; -4 0 0; 4 0 0; -4 0 0; 4 0 0"/>

      <!-- Authentic Space Rocket 🚀 Model -->

      <!-- Outer Fiery Exhaust Plume -->
      <polygon points="-5,22 5,22 0,44" fill="url(#outerRocketFlame)">
        <animate attributeName="points" values="-5,22 5,22 0,44; -6,22 6,22 0,48; -5,22 5,22 0,42; -5,22 5,22 0,44" dur="0.12s" repeatCount="indefinite"/>
      </polygon>

      <!-- Inner Hot Core Flame -->
      <polygon points="-3,22 3,22 0,36" fill="url(#innerRocketFlame)">
        <animate attributeName="points" values="-3,22 3,22 0,36; -3.5,22 3.5,22 0,39; -2.5,22 2.5,22 0,34; -3,22 3,22 0,36" dur="0.08s" repeatCount="indefinite"/>
      </polygon>

      <!-- White Hot Thruster Spark Core -->
      <ellipse cx="0" cy="24" rx="2" ry="3" fill="#ffffff">
        <animate attributeName="ry" values="3;5;2.5;3" dur="0.1s" repeatCount="indefinite"/>
      </ellipse>

      <!-- Left Swept Aerodynamic Rocket Fin -->
      <path d="M-7,8 L-16,23 L-7,19 Z" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>

      <!-- Right Swept Aerodynamic Rocket Fin -->
      <path d="M7,8 L16,23 L7,19 Z" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>

      <!-- Main White Cylindrical Fuselage Stage -->
      <rect x="-7" y="-5" width="14" height="25" rx="1.5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>
      
      <!-- Red Fuselage Accent Stripe -->
      <rect x="-7" y="1" width="14" height="3.5" fill="#ef4444"/>

      <!-- Cyan Circular Porthole Window -->
      <circle cx="0" cy="8" r="3.2" fill="#0284c7" stroke="#38bdf8" stroke-width="1.2"/>
      <circle cx="-1" cy="7" r="1" fill="#ffffff"/>

      <!-- Aerodynamic Red Rocket Nose Cone -->
      <path d="M0,-27 Q-7,-12 -7,-5 L7,-5 Q7,-12 0,-27 Z" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
      <!-- Nose Cone Specular Highlight -->
      <path d="M0,-24 Q-4,-12 -4,-6" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>

      <!-- Rocket Engine Bell Nozzle -->
      <polygon points="-5,20 5,20 4,24 -4,24" fill="#475569" stroke="#334155" stroke-width="0.8"/>
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

  <!-- Outer Orange/Red Rocket Flame Gradient -->
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

<!-- Authentic Space Rocket 🚀 -->
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
