// Génère les visuels julyanOS du README (assets/*-light.svg et *-dark.svg)
// et le README.md à partir de data.json. Thème clair "papier-systeme" uniquement.
// Usage : npm ci && node build/build.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as hb from "harfbuzzjs";
import fontverter from "fontverter";
import subsetFont from "subset-font";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "assets");
const data = JSON.parse(await fs.readFile(path.join(ROOT, "data.json"), "utf8"));

/* ------------------------------------------------------------------ */
/* Thèmes : valeurs relevées sur julyan.amc-i.fr                       */
/* clair = "papier-systeme", sombre = "violet-systeme"                 */
/* ------------------------------------------------------------------ */
const THEMES = {
  light: {
    bg: "#f3efe6", surface: "#ffffff", border: "#14110c", text: "#1c1a15",
    dim: "#55503f", faint: "#66614f", line: "#d8d0bc",
    accent: "#2563eb", accentText: "#1d4ed8", onAccent: "#ffffff",
    prompt: "#166534", shadow: "rgba(37,99,235,0.8)", shadowSoft: "rgba(37,99,235,0.35)",
    titleBg: "#14110c", titleFg: "#ffffff", avatarBg: "#f3efe6",
    stageBadge: "#166534",
    statut: { termine: "#55503f", production: "#166534", cours: "#92400e" },
    mono: "scp",
  },
  dark: {
    bg: "#000000", surface: "#0a0a0a", border: "#ffffff", text: "#e4e4e7",
    dim: "#a1a1aa", faint: "#8b8b94", line: "#52525b",
    accent: "#7c3aed", accentText: "#a78bfa", onAccent: "#ffffff",
    prompt: "#34d399", shadow: "rgba(124,58,237,0.8)", shadowSoft: "rgba(124,58,237,0.35)",
    titleBg: "#ffffff", titleFg: "#0a0a0a", avatarBg: "#000000",
    stageBadge: "#166534",
    statut: { termine: "#a1a1aa", production: "#34d399", cours: "#fbbf24" },
    mono: "jbm",
  },
};

const STATUTS = { termine: "Terminé", production: "En production", cours: "En cours" };

/* ------------------------------------------------------------------ */
/* Polices : Work Sans, Source Code Pro (clair), JetBrains Mono (sombre)*/
/* ------------------------------------------------------------------ */
const FS = (pkg, file) => path.join(ROOT, "node_modules/@fontsource", pkg, "files", file);
const FONT_FILES = {
  "sans-400": FS("work-sans", "work-sans-latin-400-normal.woff2"),
  "sans-600": FS("work-sans", "work-sans-latin-600-normal.woff2"),
  "sans-700": FS("work-sans", "work-sans-latin-700-normal.woff2"),
  "scp-400": FS("source-code-pro", "source-code-pro-latin-400-normal.woff2"),
  "scp-700": FS("source-code-pro", "source-code-pro-latin-700-normal.woff2"),
  "jbm-400": FS("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2"),
  "jbm-700": FS("jetbrains-mono", "jetbrains-mono-latin-700-normal.woff2"),
};
const FAMILY = { sans: "jsans", scp: "jmono", jbm: "jmono" };
const FALLBACK = { sans: "system-ui,sans-serif", scp: "ui-monospace,monospace", jbm: "ui-monospace,monospace" };

const fontCache = new Map();
async function loadFont(key) {
  if (fontCache.has(key)) return fontCache.get(key);
  const woff2 = await fs.readFile(FONT_FILES[key]);
  const sfnt = await fontverter.convert(woff2, "sfnt");
  const face = new hb.Face(new hb.Blob(sfnt));
  const font = new hb.Font(face);
  const entry = { woff2, face, font, upem: face.upem };
  fontCache.set(key, entry);
  return entry;
}
for (const k of Object.keys(FONT_FILES)) await loadFont(k);

function fontKey(fam, weight) {
  if (fam === "sans") return `sans-${weight >= 700 ? 700 : weight >= 600 ? 600 : 400}`;
  return `${fam}-${weight >= 600 ? 700 : 400}`;
}

const warned = new Set();
function measure(key, size, txt, ls = 0) {
  const { font, upem } = fontCache.get(key);
  const buf = new hb.Buffer();
  buf.addText(txt);
  buf.guessSegmentProperties();
  hb.shape(font, buf);
  const infos = buf.getGlyphInfos();
  infos.forEach((g, i) => {
    if (g.codepoint === 0 && !warned.has(key + txt[i])) {
      warned.add(key + txt[i]);
      console.warn(`! glyphe absent dans ${key} : "${txt[i]}"`);
    }
  });
  const adv = buf.getGlyphPositions().reduce((a, p) => a + p.xAdvance, 0);
  buf.destroy?.();
  return (adv / upem) * size + ls * [...txt].length;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* Contexte de rendu d'un SVG : enregistre les glyphes utilisés        */
/* ------------------------------------------------------------------ */
class Ctx {
  constructor(theme) {
    this.th = THEMES[theme];
    this.used = new Map();
  }
  fam(f) { return f === "mono" ? this.th.mono : "sans"; }
  key(f, w) { return fontKey(this.fam(f), w); }
  w(txt, { f = "sans", w = 400, s = 16, ls = 0, up = false } = {}) {
    return measure(this.key(f, w), s, up ? txt.toUpperCase() : txt, ls);
  }
  t(txt, { x, y, f = "sans", w = 400, s = 16, fill, anchor, ls = 0, up = false, cls } = {}) {
    const str = up ? txt.toLocaleUpperCase("fr") : txt;
    const k = this.key(f, w);
    if (!this.used.has(k)) this.used.set(k, new Set());
    for (const ch of str) this.used.get(k).add(ch);
    const fam = this.fam(f);
    const a = [`x="${r1(x)}"`, `y="${r1(y)}"`, `font-family="${FAMILY[fam]},${FALLBACK[fam]}"`,
      `font-size="${s}"`, `font-weight="${k.split("-")[1]}"`, `fill="${fill ?? this.th.text}"`];
    if (anchor) a.push(`text-anchor="${anchor}"`);
    if (ls) a.push(`letter-spacing="${ls}"`);
    if (cls) a.push(`class="${cls}"`);
    return `<text ${a.join(" ")}>${esc(str)}</text>`;
  }
  wrap(txt, maxW, opt) {
    const words = txt.split(" ");
    const lines = [];
    let cur = "";
    for (const wd of words) {
      const tryL = cur ? `${cur} ${wd}` : wd;
      if (this.w(tryL, opt) <= maxW || !cur) cur = tryL;
      else { lines.push(cur); cur = wd; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  async fontCss() {
    const out = [];
    for (const [k, set] of this.used) {
      const chars = [...set].join("") + " ";
      const sub = await subsetFont(fontCache.get(k).woff2, chars, { targetFormat: "woff2" });
      const fam = k.startsWith("sans") ? "jsans" : "jmono";
      out.push(`@font-face{font-family:${fam};font-weight:${k.split("-")[1]};src:url(data:font/woff2;base64,${sub.toString("base64")}) format("woff2")}`);
    }
    return out.join("");
  }
}

/* ------------------------------------------------------------------ */
/* Icônes (tracés du portfolio, style Lucide, grille 24x24)            */
/* ------------------------------------------------------------------ */
const ICONS = {
  about: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  parcours: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.3 7.3 15.7 10.7M8.3 16.7 15.7 13.3"/>',
  projets: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  stack: '<rect x="2" y="7" width="20" height="4"/><rect x="2" y="13" width="14" height="4"/>',
  notes: '<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 12h8M8 16h5"/>',
  terminal: '<rect x="2" y="4" width="20" height="16"/><path d="m6 9 3 3-3 3"/><path d="M12 15h6"/>',
  fichier: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  treemap: '<rect x="3" y="3" width="9" height="9"/><rect x="14" y="3" width="7" height="6"/><rect x="14" y="11" width="7" height="10"/><rect x="3" y="14" width="9" height="7"/>',
  serveur: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  epingle: '<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  visage: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  personnes: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="18" cy="8.5" r="2.2"/><path d="M15.3 14.3c2.6.5 4.4 2.8 4.4 5.7"/>',
  formes: '<circle cx="7" cy="7" r="4"/><rect x="13" y="3" width="8" height="8"/><path d="M12 21l4-8 4 8Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  fleche: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  externe: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
};
const icon = (name, x, y, size, color, sw = 2) =>
  `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(size / 24 * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;

/* ------------------------------------------------------------------ */
/* Briques julyanOS                                                    */
/* ------------------------------------------------------------------ */
const TITLE_H = 38;

// Fenêtre : ombre portée pleine, bordure 2px, barre de titre, boutons _ □ ×
function windowFrame(c, { x, y, w, h, title, focused = false, body = "" }) {
  const th = c.th;
  const tbBg = focused ? th.accent : th.titleBg;
  const tbFg = focused ? th.onAccent : th.titleFg;
  const ctl = [];
  for (let i = 0; i < 3; i++) {
    const bx = x + w - 14 - 22 * (3 - i) - 6 * (2 - i) + 0;
    const by = y + 9;
    ctl.push(`<rect x="${bx + 0.5}" y="${by + 0.5}" width="21" height="21" fill="none" stroke="${tbFg}"/>`);
    const cx = bx + 11, cy = by + 11;
    if (i === 0) ctl.push(`<path d="M${cx - 4} ${cy + 3}h8" stroke="${tbFg}" stroke-width="1.5"/>`);
    if (i === 1) ctl.push(`<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="none" stroke="${tbFg}" stroke-width="1.5"/>`);
    if (i === 2) ctl.push(`<path d="M${cx - 3.5} ${cy - 3.5}l7 7M${cx + 3.5} ${cy - 3.5}l-7 7" stroke="${tbFg}" stroke-width="1.5"/>`);
  }
  return `<rect x="${x + 8}" y="${y + 8}" width="${w}" height="${h}" fill="${focused ? th.shadow : th.shadowSoft}"/>`
    + `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" fill="${th.surface}" stroke="${th.border}" stroke-width="2"/>`
    + `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${TITLE_H - 2}" fill="${tbBg}"/>`
    + c.t(title, { x: x + 16, y: y + 25, f: "mono", w: 700, s: 13, ls: 0.6, up: true, fill: tbFg })
    + ctl.join("") + body;
}

function desktopBg(c, W, H) {
  return `<defs><pattern id="grille" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${c.th.line}" stroke-opacity="0.45"/></pattern></defs>`
    + `<rect width="${W}" height="${H}" fill="${c.th.bg}"/><rect width="${W}" height="${H}" fill="url(#grille)"/>`;
}

function desktopIcon(c, name, label, cx, y) {
  return `<rect x="${cx - 23}" y="${y + 1}" width="46" height="46" fill="${c.th.surface}" stroke="${c.th.border}" stroke-width="2"/>`
    + icon(name, cx - 12, y + 12, 24, c.th.text)
    + c.t(label, { x: cx, y: y + 66, f: "mono", s: 12, anchor: "middle", fill: c.th.text });
}

function button(c, { x, y, label, primary = false, iconName, h = 40, s = 13, up = true }) {
  const th = c.th;
  const tw = c.w(label, { f: "mono", w: 700, s, ls: 0.5, up });
  const iw = iconName ? 18 + 10 : 0;
  const w = 18 + iw + tw + 18;
  const fg = primary ? th.onAccent : th.text;
  let out = `<rect x="${x + 1}" y="${y + 1}" width="${r1(w - 2)}" height="${h - 2}" fill="${primary ? th.accent : th.surface}" stroke="${th.border}" stroke-width="2"/>`;
  if (iconName) out += icon(iconName, x + 18, y + (h - 18) / 2, 18, fg);
  out += c.t(label, { x: x + 18 + iw, y: y + h / 2 + s * 0.36, f: "mono", w: 700, s, ls: 0.5, up, fill: fg });
  return { svg: out, w };
}

const ANIM = `@keyframes pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`
  + `@keyframes blink{50%{opacity:0}}`
  + `.pop{animation:pop .55s cubic-bezier(.2,.8,.2,1) both}.d1{animation-delay:.12s}.d2{animation-delay:.24s}.d3{animation-delay:.36s}`
  + `.cur{animation:blink 1.1s steps(1) infinite}`
  + `text{font-variant-ligatures:none;font-kerning:normal}`
  + `@media (prefers-reduced-motion:reduce){.pop,.cur{animation:none}}`;

async function svgDoc(c, { W, H, title, desc, body }) {
  const css = (await c.fontCss()) + ANIM;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">`
    + `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>`
    + `<style>${css}</style>${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Visuels                                                             */
/* ------------------------------------------------------------------ */
const P = data.profil;
const L = data.liens;
const ALT = {};

// 1. Hero : bureau + fenêtre about.txt
async function hero(theme) {
  const c = new Ctx(theme), th = c.th;
  const W = 1000, H = 452;
  const icons = [["about", "about.txt"], ["parcours", "parcours.log"], ["projets", "projets/"], ["stack", "stack.sh"], ["mail", "contact.sh"]];
  let body = desktopBg(c, W, H);
  body += `<g class="pop">` + icons.map(([n, l], i) => desktopIcon(c, n, l, 64, 26 + i * 82)).join("") + `</g>`;

  const wx = 140, wy = 26, ww = 826, wh = 400;
  let inner = "";
  const bx = wx + 34, by = wy + TITLE_H + 32;
  inner += `<rect x="${bx + 1}" y="${by + 1}" width="98" height="98" fill="${th.avatarBg}" stroke="${th.border}" stroke-width="2"/>`;
  inner += c.t(P.initiales, { x: bx + 50, y: by + 61, f: "mono", w: 700, s: 34, anchor: "middle", fill: th.accentText });
  inner += c.t(P.nom, { x: bx + 128, y: by + 46, w: 700, s: 46, ls: -0.46, fill: th.text });
  inner += c.t(P.role, { x: bx + 128, y: by + 84, w: 600, s: 22, fill: th.accentText });
  const sepY = by + 132;
  inner += `<path d="M${bx} ${sepY}H${wx + ww - 34}" stroke="${th.line}" stroke-width="2"/>`;
  const lines = c.wrap(P.accroche, ww - 68, { s: 22 });
  lines.forEach((l, i) => { inner += c.t(l, { x: bx, y: sepY + 44 + i * 33, s: 22, fill: th.text }); });
  const btnY = sepY + 44 + lines.length * 33 + 8;
  const b = button(c, { x: bx, y: btnY, label: "Ouvrir le portfolio", primary: true, iconName: "fleche", h: 44 });
  inner += b.svg;
  inner += c.t(`> ${L.portfolioCourt}`, { x: bx + b.w + 20, y: btnY + 28, f: "mono", s: 15, fill: th.dim });
  body += `<g class="pop d1">` + windowFrame(c, { x: wx, y: wy, w: ww, h: wh, title: "about.txt", focused: true, body: inner }) + `</g>`;

  ALT.hero = `${P.nom}, ${P.role}. ${P.accroche} Ouvrir le portfolio julyanOS sur ${L.portfolioCourt}.`;
  return svgDoc(c, { W, H, title: `${P.nom} - about.txt`, desc: ALT.hero, body });
}

// 2. Boutons de la barre de liens
async function lien(theme, item) {
  const c = new Ctx(theme), th = c.th;
  const H = 48;
  const b = button(c, { x: 0, y: 0, label: item.label, primary: !!item.principal, iconName: item.icone, h: 44, s: 14, up: false });
  const W = Math.ceil(b.w + 4);
  const body = `<rect x="4" y="4" width="${r1(b.w)}" height="44" fill="${th.shadowSoft}"/>` + b.svg;
  return svgDoc(c, { W, H, title: item.label, desc: `${item.label} (${item.url.replace(/^mailto:/, "")})`, body });
}

// 3. Bandeau recherche de stage
async function stage(theme) {
  const c = new Ctx(theme), th = c.th, S = data.stage;
  const W = 1000, ww = 990, x0 = 0;
  let inner = "";
  const px = x0 + 30, top = TITLE_H + 26;
  // badge vert "■ RECHERCHE DE STAGE"
  const bw = c.w(S.badge, { f: "mono", w: 700, s: 13, ls: 0.5, up: true }) + 46;
  inner += `<rect x="${px + 1}" y="${top + 1}" width="${r1(bw - 2)}" height="32" fill="${th.stageBadge}" stroke="${th.border}" stroke-width="2"/>`;
  inner += `<rect x="${px + 14}" y="${top + 13}" width="8" height="8" fill="#ffffff"/>`;
  inner += c.t(S.badge, { x: px + 32, y: top + 21, f: "mono", w: 700, s: 13, ls: 0.5, up: true, fill: "#ffffff" });
  inner += c.t(S.dates, { x: px, y: top + 70, f: "mono", w: 700, s: 20, fill: th.text });
  // CTA
  const ctaW = c.w(S.cta, { f: "mono", w: 700, s: 13, ls: 0.5, up: true }) + 18 + 28 + 18;
  const cta = button(c, { x: x0 + ww - 30 - ctaW, y: top - 4, label: S.cta, primary: true, iconName: "fleche" });
  inner += cta.svg;
  // détails en colonnes
  const colW = (ww - 60) / S.details.length;
  let maxLines = 1;
  S.details.forEach((d, i) => {
    const cx = px + i * colW;
    inner += c.t(d.cle, { x: cx, y: top + 112, f: "mono", w: 700, s: 13, fill: th.accentText });
    const ls = c.wrap(d.valeur, colW - 24, { s: 17 });
    maxLines = Math.max(maxLines, ls.length);
    ls.forEach((l, j) => { inner += c.t(l, { x: cx, y: top + 138 + j * 24, s: 17, fill: th.text }); });
  });
  const wh = top + 138 + (maxLines - 1) * 24 + 26;
  const H = wh + 10;
  const body = `<g class="pop">` + windowFrame(c, { x: x0, y: 0, w: ww, h: wh, title: "recrutez-moi", body: inner }) + `</g>`;
  ALT.stage = `${S.badge} : ${S.dates}. ` + S.details.map((d) => `${d.cle} : ${d.valeur}`).join(". ") + `. ${S.cta} sur ${L.portfolioCourt}/recrutez-moi.`;
  return svgDoc(c, { W, H, title: S.badge, desc: ALT.stage, body });
}

// 4. En-tête de la fenêtre projets/
async function projetsHead(theme) {
  const c = new Ctx(theme), th = c.th;
  const W = 1000, ww = 990;
  const cats = {};
  data.projets.forEach((p) => { cats[p.categorie] = (cats[p.categorie] || 0) + 1; });
  const chips = [["Tous", data.projets.length], ...Object.entries(cats)];
  let inner = "", x = 30;
  const y = TITLE_H + 22;
  chips.forEach(([lab, n], i) => {
    const s = 14, w1 = c.w(lab, { f: "mono", w: 700, s }), w2 = c.w(` ${n}`, { f: "mono", s });
    const w = w1 + w2 + 28, on = i === 0;
    inner += `<rect x="${x + 1}" y="${y + 1}" width="${r1(w - 2)}" height="34" fill="${on ? th.accent : th.surface}" stroke="${th.border}" stroke-width="2"/>`;
    inner += c.t(lab, { x: x + 14, y: y + 23, f: "mono", w: 700, s, fill: on ? th.onAccent : th.text });
    inner += c.t(String(n), { x: x + 14 + w1 + c.w(" ", { f: "mono", s }), y: y + 23, f: "mono", s, fill: on ? th.onAccent : th.dim });
    x += w + 10;
  });
  inner += c.t("Projets phares", { x: 30, y: y + 80, f: "mono", w: 700, s: 13, ls: 1.2, up: true, fill: th.dim });
  const hint = "cliquer une carte ouvre le dépôt";
  inner += c.t(hint, { x: ww - 30, y: y + 80, f: "mono", s: 13, anchor: "end", fill: th.faint });
  const wh = y + 100;
  const body = `<g class="pop">` + windowFrame(c, { x: 0, y: 0, w: ww, h: wh, title: "~/projets/", body: inner }) + `</g>`;
  ALT.projets = `Fenêtre ~/projets/ : ${data.projets.length} projets phares (` + chips.slice(1).map(([l, n]) => `${l} ${n}`).join(", ") + `).`;
  return svgDoc(c, { W, H: wh + 10, title: "~/projets/", desc: ALT.projets, body });
}

// 5. Cartes projet (hauteur commune calculée sur l'ensemble)
function cardLayout(c, p) {
  const W = 500, padX = 26;
  const head = { x: 168 };
  let titleSize = 26;
  while (c.w(p.titre, { w: 700, s: titleSize }) > W - head.x - 20 && titleSize > 18) titleSize -= 1;
  const resume = c.wrap(p.resume, W - padX * 2 - 4, { s: 16.5 });
  let y = 22 + 104 + 30; // vignette + marge
  const resumeY = y;
  y += (resume.length - 1) * 24 + 22;
  // puces stack
  const chips = [];
  let cx = padX;
  let cy = y;
  for (const s of p.stack) {
    const w = c.w(s, { f: "mono", w: 700, s: 12.5 }) + 20;
    if (cx + w > W - padX) { cx = padX; cy += 34; }
    chips.push({ s, x: cx, y: cy, w });
    cx += w + 8;
  }
  y = cy + 28 + 26;
  const metaY = y;
  const meta = c.wrap(p.meta.join(" · "), W - padX * 2, { f: "mono", s: 12.5 });
  return { titleSize, resume, resumeY, chips, metaY, meta, minH: metaY + (meta.length - 1) * 19 + 26 + 56 };
}

async function carte(theme, p, idx, H) {
  const c = new Ctx(theme), th = c.th;
  const W = 500, padX = 26;
  const Lo = cardLayout(c, p);
  const col = th.statut[p.statut];
  let b = "";
  b += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="${th.surface}" stroke="${th.border}" stroke-width="2"/>`;
  b += `<rect x="2" y="2" width="6" height="${H - 4}" fill="${p.couleur}"/>`;
  // vignette
  b += `<rect x="${padX + 0.5}" y="22.5" width="124" height="103" fill="${th.bg}" stroke="${th.border}"/>`;
  b += icon(p.icone, padX + 62 - 24, 74 - 24, 48, p.couleur, 1.8);
  // tête
  b += c.t(String(idx + 1).padStart(2, "0"), { x: 168, y: 44, f: "mono", w: 700, s: 14, fill: th.dim });
  b += c.t(p.titre, { x: 168, y: 78, w: 700, s: Lo.titleSize, ls: -0.2, fill: th.text });
  const st = STATUTS[p.statut];
  const sw = c.w(st, { f: "mono", w: 700, s: 11.5, ls: 0.5, up: true }) + 18;
  b += `<rect x="168.5" y="94.5" width="${r1(sw)}" height="23" fill="none" stroke="${col}"/>`;
  b += c.t(st, { x: 177.5, y: 110.5, f: "mono", w: 700, s: 11.5, ls: 0.5, up: true, fill: col });
  // résumé
  Lo.resume.forEach((l, i) => { b += c.t(l, { x: padX, y: Lo.resumeY + i * 24, s: 16.5, fill: th.text }); });
  // stack
  for (const ch of Lo.chips) {
    b += `<rect x="${r1(ch.x) + 0.5}" y="${ch.y + 0.5}" width="${r1(ch.w)}" height="26" fill="${th.bg}" stroke="${th.line}"/>`;
    b += c.t(ch.s, { x: ch.x + 10, y: ch.y + 18, f: "mono", w: 700, s: 12.5, fill: th.text });
  }
  // méta
  Lo.meta.forEach((l, i) => { b += c.t(l, { x: padX, y: Lo.metaY + i * 19, f: "mono", s: 12.5, fill: th.dim }); });
  // pied : dépôt
  const fy = H - 46;
  b += `<path d="M10 ${fy}H${W - 2}" stroke="${th.line}" stroke-width="2"/>`;
  const label = p.depot ?? p.url.replace(/^https:\/\//, "");
  b += icon(p.depot ? "github" : "globe", padX, fy + 13, 18, th.accentText);
  b += c.t(label, { x: padX + 28, y: fy + 28, f: "mono", w: 700, s: 14, fill: th.accentText });
  b += icon("externe", W - padX - 18, fy + 13, 18, th.accentText);

  const alt = `${p.titre} (${st.toLowerCase()}) : ${p.resume} Stack : ${p.stack.join(", ")}. ${p.meta.join(", ")}. `
    + (p.depot ? `Dépôt GitHub ${p.depot}.` : `Étude de cas sur ${label} (dépôt privé).`);
  ALT[`card-${p.id}`] = alt;
  return svgDoc(c, { W, H, title: p.titre, desc: alt, body: `<g class="pop">${b}</g>` });
}

// 6. Terminal stack.sh
async function stack(theme) {
  const c = new Ctx(theme), th = c.th, S = data.stack;
  const W = 1000, ww = 990, px = 34, maxX = ww - 34;
  let inner = "", y = TITLE_H + 40;
  const fs1 = 15;
  const prompt = (yy) => {
    const u = "julyan@julyanOS", w1 = c.w(u, { f: "mono", w: 700, s: fs1 });
    return { svg: c.t(u, { x: px, y: yy, f: "mono", w: 700, s: fs1, fill: th.prompt }) + c.t(":~$", { x: px + w1, y: yy, f: "mono", w: 700, s: fs1, fill: th.text }), w: w1 + c.w(":~$ ", { f: "mono", w: 700, s: fs1 }) };
  };
  const p1 = prompt(y);
  inner += p1.svg + c.t("./stack.sh", { x: px + p1.w, y, f: "mono", s: fs1, fill: th.text });
  y += 32;
  for (const l of c.wrap(`# ${S.intro}`, maxX - px, { f: "mono", s: 14 })) { inner += c.t(l, { x: px, y, f: "mono", s: 14, fill: th.dim }); y += 22; }
  for (const pal of S.paliers) {
    y += 26;
    const head = `[ ${pal.titre.toLocaleUpperCase("fr")} ]`;
    inner += c.t(head, { x: px, y, f: "mono", w: 700, s: 16, fill: th.accentText });
    const hw = c.w(head, { f: "mono", w: 700, s: 16 });
    inner += c.t(String(pal.items.length), { x: px + hw + 12, y, f: "mono", w: 700, s: 16, fill: th.dim });
    y += 24;
    for (const l of c.wrap(`# ${pal.description}`, maxX - px, { f: "mono", s: 13.5 })) { inner += c.t(l, { x: px, y, f: "mono", s: 13.5, fill: th.dim }); y += 21; }
    y += 6;
    let cx = px;
    for (const it of pal.items) {
      const w = c.w(it, { f: "mono", w: 700, s: 14 }) + 22;
      if (cx + w > maxX) { cx = px; y += 40; }
      inner += `<rect x="${r1(cx) + 1}" y="${y + 1}" width="${r1(w - 2)}" height="30" fill="${th.bg}" stroke="${th.border}" stroke-width="2"/>`;
      inner += c.t(it, { x: cx + 11, y: y + 20.5, f: "mono", w: 700, s: 14, fill: th.text });
      cx += w + 9;
    }
    y += 40;
  }
  y += 26;
  const p2 = prompt(y);
  inner += p2.svg + `<rect class="cur" x="${r1(px + p2.w)}" y="${y - 14}" width="9" height="18" fill="${th.accent}"/>`;
  const wh = y + 28;
  const body = `<g class="pop">` + windowFrame(c, { x: 0, y: 0, w: ww, h: wh, title: "stack.sh", focused: true, body: inner }) + `</g>`;
  ALT.stack = `Terminal stack.sh. ${S.intro} ` + S.paliers.map((p) => `${p.titre} (${p.items.length}) : ${p.items.join(", ")}.`).join(" ");
  return svgDoc(c, { W, H: wh + 10, title: "stack.sh", desc: ALT.stack, body });
}

// 7. Pied : fenêtre contact.sh + barre des tâches julyanOS
async function footer(theme) {
  const c = new Ctx(theme), th = c.th;
  const W = 1000;
  const wx = 40, wy = 30, ww = 920;
  let inner = "", y = wy + TITLE_H + 40;
  const u = "julyan@julyanOS", w1 = c.w(u, { f: "mono", w: 700, s: 15 });
  inner += c.t(u, { x: wx + 34, y, f: "mono", w: 700, s: 15, fill: th.prompt });
  inner += c.t(":~$", { x: wx + 34 + w1, y, f: "mono", w: 700, s: 15 });
  inner += c.t("./contact.sh", { x: wx + 34 + w1 + c.w(":~$ ", { f: "mono", w: 700, s: 15 }), y, f: "mono", s: 15 });
  y += 38;
  for (const l of data.contact) {
    inner += c.t(l.option, { x: wx + 34, y, f: "mono", w: 700, s: 15, fill: th.accentText });
    inner += c.t(l.valeur, { x: wx + 34 + 140, y, f: "mono", s: 15, fill: th.text });
    y += 30;
  }
  y += 4;
  inner += c.t("Stage, alternance ou projet : écrivez-moi.", { x: wx + 34, y: y + 6, s: 18, w: 600, fill: th.text });
  const wh = y + 30 - wy;
  const tbY = wy + wh + 8 + 34;
  const H = tbY + 60;
  let body = desktopBg(c, W, H);
  body += `<g class="pop">` + windowFrame(c, { x: wx, y: wy, w: ww, h: wh, title: "contact.sh", focused: true, body: inner }) + `</g>`;
  // barre des tâches
  let tb = `<rect x="0" y="${tbY}" width="${W}" height="${H - tbY}" fill="${th.bg}"/><path d="M0 ${tbY + 1}H${W}" stroke="${th.border}" stroke-width="2"/>`;
  let x = 14;
  const by = tbY + 11;
  const start = "julyanOS";
  const sw = c.w(start, { f: "mono", w: 700, s: 13, ls: 0.4, up: true }) + 30;
  tb += `<rect x="${x + 1}" y="${by + 1}" width="${r1(sw - 2)}" height="36" fill="${th.accent}" stroke="${th.border}" stroke-width="2"/>`;
  tb += c.t(start, { x: x + 15, y: by + 23, f: "mono", w: 700, s: 13, ls: 0.4, up: true, fill: th.onAccent });
  x += sw + 12;
  for (const [lab, on] of [["about.txt"], ["projets/"], ["stack.sh"], ["contact.sh", true]]) {
    const w = c.w(lab, { f: "mono", s: 13 }) + 24;
    tb += `<rect x="${x + 1}" y="${by + 3}" width="${r1(w - 2)}" height="32" fill="${on ? th.accent : "none"}" stroke="${on ? th.border : th.line}" stroke-width="2"/>`;
    tb += c.t(lab, { x: x + 12, y: by + 23, f: "mono", s: 13, fill: on ? th.onAccent : th.text });
    x += w + 8;
  }
  const mail = L.email;
  const mw = c.w(mail, { f: "mono", w: 700, s: 13 }) + 24 + 26;
  const mx = W - 14 - mw;
  tb += `<rect x="${mx + 1}" y="${by + 1}" width="${r1(mw - 2)}" height="36" fill="${th.surface}" stroke="${th.border}" stroke-width="2"/>`;
  tb += icon("mail", mx + 12, by + 10, 16, th.text);
  tb += c.t(mail, { x: mx + 38, y: by + 23, f: "mono", w: 700, s: 13 });
  tb += c.t(P.ville, { x: mx - 16, y: by + 23, f: "mono", s: 13, anchor: "end", fill: th.dim });
  body += `<g class="pop d1">${tb}</g>`;
  ALT.footer = `contact.sh : ` + data.contact.map((l) => `${l.option.replace(/^--/, "")} ${l.valeur}`).join(", ") + `. Stage, alternance ou projet : écrivez-moi à ${L.email}.`;
  return svgDoc(c, { W, H, title: "contact.sh", desc: ALT.footer, body });
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */
await fs.rm(ASSETS, { recursive: true, force: true });
await fs.mkdir(ASSETS, { recursive: true });
const sizes = [];
async function emit(name, fn) {
  for (const theme of ["light"]) {
    const svg = await fn(theme);
    const file = `${name}.svg`;
    await fs.writeFile(path.join(ASSETS, file), svg);
    sizes.push([file, Buffer.byteLength(svg)]);
  }
}

await emit("hero", hero);
for (const it of data.barreLiens) await emit(`lien-${it.id}`, (t) => lien(t, it));
await emit("stage", stage);
await emit("projets", projetsHead);
const probe = new Ctx("light");
const cardH = Math.max(...data.projets.map((p) => cardLayout(probe, p).minH));
for (const [i, p] of data.projets.entries()) await emit(`card-${p.id}`, (t) => carte(t, p, i, cardH));
await emit("stack", stack);
await emit("footer", footer);

/* README */
const pic = (name, alt, attrs = 'width="100%"') =>
  `<img src="assets/${name}.svg" ${attrs} alt="${esc(alt)}">`;

const readme = `<!-- Fichier généré par build/build.mjs à partir de data.json : modifier data.json puis lancer « npm run build ». -->

<a href="${L.portfolio}">
  ${pic("hero", ALT.hero)}
</a>

<p align="center">
${data.barreLiens.map((it) => `  <a href="${it.url}">${pic(`lien-${it.id}`, it.label, 'height="44"')}</a>`).join("\n")}
</p>

<a href="${data.stage.url}">
  ${pic("stage", ALT.stage)}
</a>

<br><br>

<a href="${L.portfolio}">
  ${pic("projets", ALT.projets)}
</a>

<p align="center">
${data.projets.map((p) => `  <a href="${p.url}">${pic(`card-${p.id}`, ALT[`card-${p.id}`], 'width="49%"')}</a>`).join("\n")}
</p>

<a href="${data.stack.url}">
  ${pic("stack", ALT.stack)}
</a>

<br><br>

<a href="mailto:${L.email}">
  ${pic("footer", ALT.footer)}
</a>
`;
await fs.writeFile(path.join(ROOT, "README.md"), readme);

let warn = false;
for (const [f, n] of sizes) {
  const ko = (n / 1024).toFixed(1);
  if (n > 100 * 1024) warn = true;
  console.log(`${n > 100 * 1024 ? "!" : " "} ${f.padEnd(34)} ${ko.padStart(6)} Ko`);
}
console.log(`${sizes.length} SVG générés${warn ? " (au moins un dépasse 100 Ko)" : ", tous sous 100 Ko"}.`);
