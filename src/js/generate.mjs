/**
 * Masterpiece Animated GitHub Contribution Heatmap SVG
 * Engineered by Senior UI/UX & Web Graphics Standards.
 *
 * Features:
 *   - Sleek cyber stealth jet with glowing cyan wing accents & dual plasma thrusters
 *   - Perfectly proportioned canvas height (145px) eliminating empty bottom space
 *   - High-speed vertical laser streams launching directly from cannon points
 *   - Dual shockwave energy rings & bright neon cell pulses on impact
 *   - Twinkling starfield background & gradient card frame
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
const GRID_Y = 16;
const WIDTH = 513;
const HEIGHT = 145; // Perfectly proportioned height without empty space
const JET_X_START = 35;
const JET_X_END = 478;
const JET_Y_POS = 124; // Jet vertical position
const LOOP_DUR = 20; // seconds, one full pass
const MAX_TARGETS = 14; // target count
const FLASH_COLOR = "#38bdf8";
const SECONDARY_FLASH = "#34d399";
const BLAST_COLOR = "#38bdf8";
const PAD_Y = 118; // Laser launching point

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

      // Rotating Target Lock Ring
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="7" fill="none" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 2">` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;1;0.8;0;0"/>` +
        `</circle>` +
        `</g>\n`;

      // Vertical Laser Energy Pulse
      bullets += `<g opacity="0">` +
        `<line x1="${cx}" y1="${PAD_Y}" x2="${cx}" y2="${targetY}" stroke="url(#laserGrad)" stroke-width="2.2"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;0.9;1;0;0"/>` +
        `</g>\n`;

      // Expanding Shockwave Burst
      blasts += `<g opacity="0">` +
        `<circle cx="${cx}" cy="${targetY}" r="0" fill="none" stroke="${BLAST_COLOR}" stroke-width="2">` +
        `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 3)};1" values="0;2;12;12"/>` +
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
    [10, 14, 1.2], [10, 55, 1.6], [10, 100, 2.0],
    [503, 18, 1.2], [503, 62, 1.6], [503, 108, 2.0],
    [45, 134, 1.4], [465, 134, 1.8], [255, 135, 2.2]
  ];
  return pts.map(([x, y, dur]) =>
    `<circle cx="${x}" cy="${y}" r="1" fill="#38bdf8" opacity="0.5"><animate attributeName="opacity" values="0.2;0.9;0.2" dur="${dur}s" repeatCount="indefinite"/></circle>`
  ).join("\n");
}

function buildCyberJet() {
  return `<g id="jet-wrapper">
  <!-- Motion Trajectory Translation -->
  <g transform="translate(0, ${JET_Y_POS})">
    <animateTransform attributeName="transform" type="translate"
      dur="${LOOP_DUR}s" repeatCount="indefinite"
      keyTimes="0;0.48;0.50;0.98;1"
      values="${JET_X_START},${JET_Y_POS};${JET_X_END},${JET_Y_POS};${JET_X_END},${JET_Y_POS};${JET_X_START},${JET_Y_POS};${JET_X_START},${JET_Y_POS}"/>

    <!-- Dynamic Banking Rotation Physics -->
    <g>
      <animateTransform attributeName="transform" type="rotate"
        dur="${LOOP_DUR}s" repeatCount="indefinite"
        keyTimes="0;0.47;0.50;0.97;1"
        values="10 0 0; 10 0 0; -10 0 0; -10 0 0; 10 0 0"/>

      <!-- Sleek Stealth Interceptor Jet Model -->
      <polygon points="0,-18 11,8 5,4 -5,4 -11,8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.4"/>
      <polygon points="-11,8 -16,13 -5,9" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      <polygon points="11,8 16,13 5,9" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      
      <!-- Cyan Wing Muzzles -->
      <circle cx="-14" cy="10" r="1.5" fill="#38bdf8"/>
      <circle cx="14" cy="10" r="1.5" fill="#38bdf8"/>
      
      <!-- Glowing Cockpit -->
      <path d="M-3,-6 Q0,-12 3,-6 Q0,-2 -3,-6 Z" fill="#e0f2fe" stroke="#38bdf8" stroke-width="0.8"/>
      
      <!-- Plasma Dual Thruster Flames -->
      <g>
        <polygon points="-4,8 -1,8 -2.5,18" fill="url(#thrusterGrad)">
          <animate attributeName="opacity" values="0.6;1;0.7;1" dur="0.15s" repeatCount="indefinite"/>
        </polygon>
        <polygon points="1,8 4,8 2.5,18" fill="url(#thrusterGrad)">
          <animate attributeName="opacity" values="0.7;1;0.6;1" dur="0.18s" repeatCount="indefinite"/>
        </polygon>
      </g>
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
  <!-- Linear Gradient for Vertical Laser Beams -->
  <linearGradient id="laserGrad" x1="0%" y1="100%" x2="0%" y2="0%">
    <stop offset="0%" stop-color="#38bdf8" stop-opacity="1"/>
    <stop offset="60%" stop-color="#34d399" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
  </linearGradient>

  <!-- Thruster Plasma Flame Gradient -->
  <linearGradient id="thrusterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#38bdf8"/>
    <stop offset="50%" stop-color="#fbbf24"/>
    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
  </linearGradient>

  <!-- Futuristic Cyber Border Gradient -->
  <linearGradient id="frameBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#38bdf8"/>
    <stop offset="50%" stop-color="#818cf8"/>
    <stop offset="100%" stop-color="#34d399"/>
  </linearGradient>
</defs>

<!-- Outer Cyber Card Frame Container -->
<rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="10" ry="10" fill="#090d16" stroke="url(#frameBorderGrad)" stroke-width="1.2" opacity="0.95"/>

${buildStars()}

<!-- Contribution Grid -->
<g id="grid">
${buildGrid(cells, targets)}</g>

<!-- High-Speed Dual Laser Streams -->
<g id="bullets">
${bullets}</g>

<!-- Dynamic Impact Shockwaves -->
<g id="blasts">
${blasts}</g>

<!-- Cyber Stealth Jet Fighter -->
${buildCyberJet()}
</svg>`;
}

async function main() {
  console.log(`Generating masterpiece SVG jet heatmap for ${USERNAME}...`);
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
