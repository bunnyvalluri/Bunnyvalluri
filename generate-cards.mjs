import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "bunnyvalluri";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

async function fetchRepoLanguages() {
  const headers = { "User-Agent": "BunnyValluri-Profile-Generator" };
  if (TOKEN) headers["Authorization"] = `token ${TOKEN}`;
  
  try {
    const res = await fetch(`https://api.github.com/users/${USERNAME}/repos?per_page=100`, { headers });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const repos = await res.json();
    
    const counts = {};
    let total = 0;
    repos.forEach(r => {
      if (r.language && !r.fork) {
        counts[r.language] = (counts[r.language] || 0) + 1;
        total++;
      }
    });

    if (total === 0) {
      counts["JavaScript"] = 16;
      counts["TypeScript"] = 6;
      counts["HTML"] = 5;
      counts["Python"] = 3;
      counts["CSS"] = 2;
      total = 32;
    }

    return { counts, total };
  } catch (err) {
    console.warn("Fallback to default stats due to API error:", err.message);
    return {
      counts: { JavaScript: 16, TypeScript: 6, HTML: 5, Python: 3, CSS: 2 },
      total: 32
    };
  }
}

const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  Python: "#3572A5",
  CSS: "#563d7c",
  Other: "#8b949e"
};

function buildLanguagesSvg(counts, total) {
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalSelected = sorted.reduce((sum, [, c]) => sum + c, 0);

  let currentX = 25;
  const barWidth = 300;
  const barSegments = sorted.map(([lang, count]) => {
    const pct = count / totalSelected;
    const w = pct * barWidth;
    const color = LANG_COLORS[lang] || LANG_COLORS.Other;
    const seg = `<rect x="${currentX.toFixed(1)}" y="65" width="${w.toFixed(1)}" height="10" fill="${color}" />`;
    currentX += w;
    return seg;
  }).join("\n    ");

  let legendY = 95;
  const legends = sorted.map(([lang, count], idx) => {
    const pct = ((count / totalSelected) * 100).toFixed(1);
    const color = LANG_COLORS[lang] || LANG_COLORS.Other;
    const xCol = idx % 2 === 0 ? 25 : 175;
    const yRow = 95 + Math.floor(idx / 2) * 28;

    return `
      <circle cx="${xCol + 5}" cy="${yRow}" r="5" fill="${color}" />
      <text x="${xCol + 18}" y="${yRow + 4}" fill="#c9d1d9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600">${lang}</text>
      <text x="${xCol + 115}" y="${yRow + 4}" fill="#8b949e" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="12">${pct}%</text>
    `;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="200" viewBox="0 0 350 200" fill="none">
  <style>
    .title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; fill: #38bdf8; }
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1px; rx: 10px; }
  </style>
  <rect class="card" width="350" height="200" rx="10" />
  
  <!-- Header -->
  <g transform="translate(25, 35)">
    <path d="M0 -4 L6 2 L0 8 M10 -4 L4 2 L10 8" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="20" y="4" class="title">Most Used Languages</text>
  </g>

  <!-- Progress Bar Container -->
  <rect x="25" y="65" width="300" height="10" rx="5" fill="#21262d" />
  <g clip-path="url(#bar-clip)">
    <clipPath id="bar-clip">
      <rect x="25" y="65" width="300" height="10" rx="5" />
    </clipPath>
    ${barSegments}
  </g>

  <!-- Legends -->
  <g>
    ${legends}
  </g>
</svg>`;
}

function buildStatsSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="200" viewBox="0 0 350 200" fill="none">
  <style>
    .title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; fill: #38bdf8; }
    .label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; fill: #c9d1d9; }
    .val { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; fill: #38bdf8; }
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1px; rx: 10px; }
  </style>
  <rect class="card" width="350" height="200" rx="10" />
  
  <!-- Header -->
  <g transform="translate(25, 35)">
    <path d="M0 0 H12 V12 H0 Z" stroke="#38bdf8" stroke-width="2" fill="none"/>
    <text x="20" y="4" class="title">Engineering Stats Overview</text>
  </g>

  <g transform="translate(25, 70)">
    <!-- Row 1 -->
    <text x="0" y="0" class="label">⚡ Total Contributions</text>
    <text x="300" y="0" class="val" text-anchor="end">Active</text>
    
    <!-- Row 2 -->
    <text x="0" y="30" class="label">💼 Featured Repositories</text>
    <text x="300" y="30" class="val" text-anchor="end">32+</text>

    <!-- Row 3 -->
    <text x="0" y="60" class="label">🎨 Specialization</text>
    <text x="300" y="60" class="val" text-anchor="end">Frontend / 3D UI</text>

    <!-- Row 4 -->
    <text x="0" y="90" class="label">🎓 Degree Status</text>
    <text x="300" y="90" class="val" text-anchor="end">B.Tech CSE '25</text>
  </g>
</svg>`;
}

async function main() {
  console.log(`Generating local SVG cards for ${USERNAME}...`);
  const { counts, total } = await fetchRepoLanguages();
  
  const langSvg = buildLanguagesSvg(counts, total);
  const statsSvg = buildStatsSvg();

  const distDir = path.resolve("dist");
  fs.mkdirSync(distDir, { recursive: true });

  fs.writeFileSync(path.join(distDir, "languages.svg"), langSvg, "utf8");
  fs.writeFileSync(path.join(distDir, "stats.svg"), statsSvg, "utf8");

  console.log("Successfully generated dist/languages.svg and dist/stats.svg!");
}

main().catch(console.error);
