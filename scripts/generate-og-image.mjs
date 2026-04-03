import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SVG_PATH = path.join(PUBLIC_DIR, 'og_image.svg');
const PNG_PATH = path.join(PUBLIC_DIR, 'og_image.png');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
}

function formatMonthLabel(period) {
  if (!period) return 'Sin datos';
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, 2));
  const label = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function collectLatestMonth(people) {
  let latest = '';
  for (const person of people) {
    for (const record of person.historial || []) {
      if (record.fecha > latest) latest = record.fecha;
    }
    for (const familiar of person.familiares || []) {
      for (const record of familiar.historial || []) {
        if (record.fecha > latest) latest = record.fecha;
      }
    }
  }
  return latest;
}

function countFamiliares(people) {
  return people.reduce((total, person) => total + ((person.familiares || []).length), 0);
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, filename), 'utf8'));
}

async function main() {
  const [legislativoRaw, ejecutivoRaw, judicialRaw] = await Promise.all([
    readJson('legisladores_full.json'),
    readJson('politicos_full.json'),
    readJson('judicial_full.json'),
  ]);

  const legislativo = legislativoRaw.data;
  const legislativoCuits = new Set(legislativo.map((person) => person.cuit));
  const ejecutivo = ejecutivoRaw.data.filter((person) => !legislativoCuits.has(person.cuit));
  const ejecutivoCuits = new Set(ejecutivo.map((person) => person.cuit));
  const judicial = judicialRaw.data.filter((person) => !legislativoCuits.has(person.cuit) && !ejecutivoCuits.has(person.cuit));
  const personas = [...legislativo, ...ejecutivo, ...judicial];

  const stats = {
    personas: personas.length,
    legislativo: legislativo.length,
    ejecutivo: ejecutivo.length,
    judicial: judicial.length,
    familiares: countFamiliares(personas),
    ultimoMes: formatMonthLabel(collectLatestMonth(personas)),
  };

  const rows = [
    ['Legislativo', stats.legislativo.toLocaleString('es-AR')],
    ['Ejecutivo', stats.ejecutivo.toLocaleString('es-AR')],
    ['Judicial', stats.judicial.toLocaleString('es-AR')],
    ['Familiares declarados', stats.familiares.toLocaleString('es-AR')],
  ];

  const rowStartY = 292;
  const rowHeight = 44;
  const rowMarkup = rows.map(([label, value], index) => {
    const y = rowStartY + index * rowHeight;
    const separatorY = y + 26;
    return `
      <text x="758" y="${y}" font-size="24" fill="#334155" font-weight="700">${escapeXml(label)}</text>
      <text x="1088" y="${y}" text-anchor="end" font-size="24" fill="#0f172a" font-weight="800">${escapeXml(value)}</text>
      ${index < rows.length - 1 ? `<line x1="758" y1="${separatorY}" x2="1088" y2="${separatorY}" stroke="#e2e8f0" stroke-width="1" />` : ''}
    `;
  }).join('');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">¿Cuánto deben? — Open Graph</title>
  <desc id="desc">Resumen del proyecto con totales de personas relevadas en los poderes legislativo, ejecutivo y judicial, familiares declarados y último mes disponible.</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#eef2ff" />
    </linearGradient>
    <linearGradient id="cardShadow" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.10" />
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="206" cy="110" r="190" fill="#3b82f6" fill-opacity="0.08" />
  <circle cx="468" cy="504" r="200" fill="#0ea5e9" fill-opacity="0.07" />
  <circle cx="938" cy="112" r="128" fill="#6366f1" fill-opacity="0.08" />

  <rect x="0" y="0" width="14" height="630" fill="#2563eb" />
  <rect x="1186" y="0" width="14" height="157.5" fill="#2563eb" />
  <rect x="1186" y="157.5" width="14" height="157.5" fill="#ef4444" />
  <rect x="1186" y="315" width="14" height="157.5" fill="#22c55e" />
  <rect x="1186" y="472.5" width="14" height="157.5" fill="#f59e0b" />

  <text x="72" y="92" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3.6" fill="#2563eb">CENTRAL DE DEUDORES + DECLARACIONES JURADAS</text>
  <text x="72" y="184" font-family="DejaVu Serif, Georgia, serif" font-size="74" font-weight="700" fill="#0f172a">¿Cuánto deben?</text>

  <text x="72" y="250" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#334155">
    <tspan x="72" dy="0">Seguimiento mensual de deuda reportada por el BCRA</tspan>
    <tspan x="72" dy="38">cruzado con declaraciones juradas patrimoniales</tspan>
    <tspan x="72" dy="38">de funcionarios y legisladores argentinos.</tspan>
  </text>

  <text x="72" y="404" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">Qué muestra:</text>
  <text x="72" y="438" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" fill="#334155">
    <tspan x="72" dy="0">• evolución histórica por persona</tspan>
    <tspan x="72" dy="34">• comparación entre poderes del Estado</tspan>
    <tspan x="72" dy="34">• familiares declarados en DDJJ</tspan>
  </text>

  <g filter="url(#shadow)">
    <rect x="730" y="64" rx="28" ry="28" width="384" height="150" fill="url(#cardShadow)" />
    <rect x="730" y="236" rx="28" ry="28" width="384" height="252" fill="url(#cardShadow)" />
  </g>

  <text x="758" y="112" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#2563eb" font-weight="700">Personas relevadas</text>
  <text x="758" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" fill="#0f172a" font-weight="800">${escapeXml(stats.personas.toLocaleString('es-AR'))}</text>

  ${rowMarkup}

  <line x1="758" y1="444" x2="1088" y2="444" stroke="#cbd5e1" stroke-width="1.5" />
  <text x="758" y="472" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#64748b" font-weight="700">Último mes</text>
  <text x="1088" y="472" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#0f172a" font-weight="800">${escapeXml(stats.ultimoMes)}</text>
</svg>
`.trimStart();

  await fs.writeFile(SVG_PATH, svg, 'utf8');
  execFileSync('ffmpeg', ['-y', '-i', SVG_PATH, '-frames:v', '1', '-update', '1', PNG_PATH], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
