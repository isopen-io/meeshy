/**
 * LES VISUELS DE L'ÉVÉNEMENT IN-APP « SAISON 1 » (#10241) — la carte (16:9) et
 * la page de détail (9:16) que l'App Store montre pour `store.app_events.saison-1`
 * (`apps/ios/andp.yml`).
 *
 * Reproductible, sans outil de dessin : ce script ÉCRIT les deux SVG sources
 * (`saison-1/*.svg`, versionnés), les rend en PNG avec Chrome sans tête, puis
 * aplatit chaque PNG en sRGB opaque (Python + Pillow : profil sRGB embarqué,
 * aucune couche alpha). Le même PNG sert les sept langues de la fiche : il ne
 * porte AUCUN texte (le nom et les descriptions viennent de la fiche) — les
 * autres langues sont des liens symboliques vers `fr-FR`.
 *
 *   bun apps/ios/scripts/app-event-visuals/render.ts
 *
 * La direction artistique vient de Meeshy, rien n'est inventé :
 *   · le ciel : la rampe indigo de la marque (`MeeshyColors`, `indigo500…950`,
 *     `violet950`) ;
 *   · la coupe de saison : la géométrie de `Trophy` (`apps/web/src/components/game/trophy.tsx`),
 *     en platine (`--game-platinum-*`, `styles/game.css`), la Signature (les
 *     trois traits de la marque, `BRAND_DASHES`) frappée dans la coupe ;
 *   · les 40 étapes de la saison (`SEASON_STEPS`, `packages/shared/utils/game/season.ts`)
 *     en couronne autour de la coupe, un fragment d'étoile aux étapes 5, 15, 25
 *     et 35 (conception du Jeu, § saisons) ;
 *   · la constellation : la figure fixe de `game-constellation.tsx` / `GameConstellationSky` ;
 *   · Mee et Meo, dessinés par `lib/mee/art.ts` via `lib/game/birds.ts` (aucune
 *     ligne de plumage refaite ici), en sticker découpé comme sur les trophées.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { SIGNATURE_DASHES } from '../../../web/src/lib/game/signature.ts';
import { birdCutFilter, gameBirdMarkup, GAME_BIRD_BOX, type GameBirdKey } from '../../../web/src/lib/game/birds.ts';
import { SEASON_STEPS } from '../../../../packages/shared/utils/game/season.ts';

const HERE = dirname(new URL(import.meta.url).pathname);
const IOS = resolve(HERE, '../..');
const EVENT = 'saison-1';
const SOURCE_DIR = join(HERE, EVENT);
const METADATA = join(IOS, 'fastlane/metadata/app_events', EVENT);
const PRIMARY_LOCALE = 'fr-FR';
/** Les langues de `store.app_events.saison-1.localizations` (andp.yml). */
const LOCALES = ['fr-FR', 'en-US', 'es-ES', 'de-DE', 'it', 'pt-BR', 'ar-SA'] as const;
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---------------------------------------------------------------------------
// La palette — des jetons de Meeshy, copiés avec leur source.
// ---------------------------------------------------------------------------

const C = {
  // MeeshyColors.swift (rampe indigo de la marque) et `violet950`.
  indigo200: '#C7D2FE',
  indigo300: '#A5B4FC',
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  indigo900: '#312E81',
  indigo950: '#1E1B4B',
  violet950: '#2E1065',
  purple500: '#A855F7',
  // styles/game.css — la matière de la coupe de saison (platine) et les jetons transverses.
  platinum0: '#e0f2fe',
  platinum1: '#5b7c99',
  platinumInk: '#2c4459',
  shade: '#2b3342',
  glint: '#ffffff',
  // lib/mee/art.ts — l'or des étoiles des stickers (`starPath`).
  starGold: '#fbbf24',
  starGoldEdge: '#f59e0b',
  // styles/game.css — `--game-gold-0`, le reflet de l'or.
  gold0: '#fde68a',
} as const;

// ---------------------------------------------------------------------------
// Petits outils.
// ---------------------------------------------------------------------------

/** Un hasard REPRODUCTIBLE : mulberry32, graine fixe — le même ciel à chaque rendu. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number): string => (Math.round(n * 10) / 10).toString();

/** La figure fixe de la constellation (`game-constellation.tsx`, `GameConstellationSky`) : douze points, boîte 314 × 76. */
const CONSTELLATION: readonly (readonly [number, number])[] = [
  [14, 52], [40, 24], [66, 44], [92, 16], [118, 38], [144, 60],
  [170, 30], [196, 50], [222, 20], [248, 42], [274, 62], [300, 34],
];

/** Une étoile à quatre branches — le scintillement (`sparkle`), cosmétique de la constellation. */
function sparkle(x: number, y: number, r: number, fill: string, opacity = 1): string {
  const k = r * 0.22;
  return `<path d="M${f(x)} ${f(y - r)} Q${f(x + k)} ${f(y - k)} ${f(x + r)} ${f(y)} Q${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + r)} Q${f(x - k)} ${f(y + k)} ${f(x - r)} ${f(y)} Q${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - r)} Z" fill="${fill}" opacity="${opacity}"/>`;
}

/**
 * UN FRAGMENT D'ÉTOILE — le « ◆ » du parcours de saison (`game-season.tsx`), taillé
 * comme un éclat : un losange allongé à quatre facettes, dans l'or des étoiles.
 */
function fragment(x: number, y: number, size: number, rotate: number, opacity = 1, glow = true): string {
  const h = size;
  const w = size * 0.56;
  const facets = [
    `<path d="M0 ${f(-h)} L${f(w)} 0 L0 0 Z" fill="${C.gold0}"/>`,
    `<path d="M${f(w)} 0 L0 ${f(h)} L0 0 Z" fill="${C.starGoldEdge}"/>`,
    `<path d="M0 ${f(h)} L${f(-w)} 0 L0 0 Z" fill="${C.starGold}"/>`,
    `<path d="M${f(-w)} 0 L0 ${f(-h)} L0 0 Z" fill="#fff7d6"/>`,
    `<path d="M0 ${f(-h)} L${f(w)} 0 L0 ${f(h)} L${f(-w)} 0 Z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="${f(size * 0.06)}" stroke-linejoin="round"/>`,
  ].join('');
  const halo = glow ? `<circle r="${f(size * 1.5)}" fill="url(#fragGlow)"/>` : '';
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rotate})" opacity="${opacity}">${halo}${facets}</g>`;
}

/** La coupe de saison — la géométrie de `Trophy` (boîte 120 × 124), en platine, la Signature frappée. */
function seasonCup(cx: number, cy: number, scale: number): string {
  const sig = 42;
  const sx = 60 - sig / 2;
  const sy = 38 - sig / 2;
  const s = sig / 1024;
  const dashes = (dx: number, dy: number, color: string, opacity: number | null) =>
    `<g transform="translate(${f(sx + dx)} ${f(sy + dy)}) scale(${s})">${SIGNATURE_DASHES.map(
      (d) =>
        `<line x1="${d.x1}" y1="${d.y}" x2="${d.x2}" y2="${d.y}" stroke="${color}" stroke-opacity="${opacity ?? d.opacity}" stroke-width="100" stroke-linecap="round"/>`,
    ).join('')}</g>`;
  // `signatureLayers({ mode: 'struck' })` : ombre en bas à droite, éclat en haut à gauche, puis l'encre.
  const struck = [dashes(sig * 0.018, sig * 0.022, C.shade, 0.5), dashes(-sig * 0.012, -sig * 0.014, C.glint, 0.85), dashes(0, 0, C.platinumInk, null)].join('');
  return `<g transform="translate(${f(cx - 60 * scale)} ${f(cy - 62 * scale)}) scale(${scale})">
  <path d="M30 22 c-17 0 -19 24 3 28 M90 22 c17 0 19 24 -3 28" fill="none" stroke="url(#platinum)" stroke-width="5"/>
  <path d="M30 12 h60 v22 c0 22 -14 36 -30 38 c-16 -2 -30 -16 -30 -38 z" fill="url(#platinum)" stroke="${C.indigo950}" stroke-opacity="0.3"/>
  <path d="M36 15 h8 v19 c0 14 6 24 14 30 c-12 -3 -22 -14 -22 -30 z" fill="#fff" opacity=".35"/>
  <rect x="54" y="72" width="12" height="16" fill="url(#platinum)"/>
  <rect x="36" y="88" width="48" height="9" rx="2" fill="url(#platinum)"/>
  <rect x="30" y="97" width="60" height="17" rx="3" fill="${C.indigo950}" fill-opacity="0.88"/>
  <rect x="30" y="97" width="60" height="17" rx="3" fill="none" stroke="${C.platinum0}" stroke-opacity=".35" stroke-width=".8"/>
  ${struck}
</g>`;
}

/** Mee ou Meo en sticker découpé (le contour blanc des trophées), regard vers le centre. */
function placedBird(key: GameBirdKey, x: number, y: number, scale: number, flip: boolean): string {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${flip ? -scale : scale} ${scale})"><g filter="url(#cut)">${gameBirdMarkup(key, key)}</g></g>`;
}

/** La couronne des 40 étapes : un point par étape, un fragment d'étoile aux étapes 5, 15, 25 et 35. */
function stepsRing(cx: number, cy: number, r: number, dot: number, frag: number): string {
  const parts: string[] = [`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${C.indigo300}" stroke-opacity=".22" stroke-width="${f(dot * 0.45)}"/>`];
  for (let step = 1; step <= SEASON_STEPS; step++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * step) / SEASON_STEPS;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (step % 10 === 5) {
      parts.push(fragment(x, y, frag, (angle * 180) / Math.PI + 90));
    } else if (step === SEASON_STEPS) {
      parts.push(sparkle(x, y, dot * 3.2, C.glint, 0.95));
    } else {
      const big = step % 10 === 0;
      parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(big ? dot * 1.35 : dot)}" fill="${big ? C.indigo200 : C.indigo300}" fill-opacity="${big ? 0.9 : 0.6}"/>`);
    }
  }
  return parts.join('');
}

/** Le ciel étoilé : des points fins, quelques scintillements, au hasard reproductible. */
function starfield(w: number, h: number, count: number, seed: number, avoid: { cx: number; cy: number; r: number }): string {
  const rnd = prng(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const near = Math.hypot(x - avoid.cx, y - avoid.cy) < avoid.r;
    const size = 0.8 + rnd() * 2.2;
    const opacity = (near ? 0.25 : 0.35) + rnd() * 0.55;
    if (rnd() < 0.06 && !near) parts.push(sparkle(x, y, size * 4.5, C.indigo200, opacity * 0.8));
    else parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}" fill="${rnd() < 0.7 ? C.glint : C.indigo200}" opacity="${opacity.toFixed(2)}"/>`);
  }
  return parts.join('');
}

/** La constellation, posée dans une boîte (x, y, largeur) ; ses étoiles allumées, reliées. */
function constellation(x0: number, y0: number, width: number, opacity: number): string {
  const s = width / 314;
  const pts = CONSTELLATION.map(([x, y]) => [x0 + x * s, y0 + y * s] as const);
  const line = `<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="none" stroke="${C.indigo300}" stroke-opacity=".5" stroke-width="${f(Math.max(2, s * 0.9))}" stroke-linejoin="round"/>`;
  const stars = pts.map(([x, y], i) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 5)}" fill="url(#starGlow)"/>${sparkle(x, y, s * (i % 3 === 0 ? 4.6 : 3.4), C.glint)}`).join('');
  return `<g opacity="${opacity}">${line}${stars}</g>`;
}

const DEFS = `
  <style>:root{--game-glint:${C.glint};--game-edge:${C.indigo950}}</style>
  <linearGradient id="platinum" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.platinum0}"/><stop offset="1" stop-color="${C.platinum1}"/></linearGradient>
  <radialGradient id="fragGlow"><stop offset="0" stop-color="${C.gold0}" stop-opacity=".55"/><stop offset="1" stop-color="${C.gold0}" stop-opacity="0"/></radialGradient>
  <radialGradient id="starGlow"><stop offset="0" stop-color="${C.indigo200}" stop-opacity=".6"/><stop offset="1" stop-color="${C.indigo200}" stop-opacity="0"/></radialGradient>
  <radialGradient id="cupHalo"><stop offset="0" stop-color="${C.indigo300}" stop-opacity=".55"/><stop offset=".45" stop-color="${C.indigo500}" stop-opacity=".28"/><stop offset="1" stop-color="${C.indigo500}" stop-opacity="0"/></radialGradient>
  ${birdCutFilter('cut')}`;

/** Le fond : la nuit indigo, éclairée depuis la coupe, une brume violette dans les coins. */
function sky(w: number, h: number, cx: number, cy: number): string {
  const r = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  return `
  <radialGradient id="night" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"><stop offset="0" stop-color="${C.indigo700}"/><stop offset=".32" stop-color="${C.indigo900}"/><stop offset=".72" stop-color="${C.indigo950}"/><stop offset="1" stop-color="#13112f"/></radialGradient>
  <radialGradient id="hazeA" gradientUnits="userSpaceOnUse" cx="0" cy="${f(h)}" r="${f(Math.max(w, h) * 0.7)}"><stop offset="0" stop-color="${C.violet950}" stop-opacity=".9"/><stop offset="1" stop-color="${C.violet950}" stop-opacity="0"/></radialGradient>
  <radialGradient id="hazeB" gradientUnits="userSpaceOnUse" cx="${f(w)}" cy="0" r="${f(Math.max(w, h) * 0.6)}"><stop offset="0" stop-color="${C.purple500}" stop-opacity=".22"/><stop offset="1" stop-color="${C.purple500}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#night)"/>
  <rect width="${w}" height="${h}" fill="url(#hazeA)"/>
  <rect width="${w}" height="${h}" fill="url(#hazeB)"/>`;
}

type Layout = {
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
  readonly ring: number;
  readonly cupScale: number;
  readonly birdScale: number;
  readonly birds: { readonly left: readonly [number, number]; readonly right: readonly [number, number] };
  readonly constellation: { readonly x: number; readonly y: number; readonly width: number; readonly opacity: number };
  readonly drift: readonly (readonly [number, number, number, number])[];
  readonly stars: number;
};

function scene(l: Layout): string {
  const dot = l.ring * 0.018;
  const frag = l.ring * 0.075;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.w}" height="${l.h}" viewBox="0 0 ${l.w} ${l.h}">
<defs>${DEFS}${sky(l.w, l.h, l.cx, l.cy)}
  ${starfield(l.w, l.h, l.stars, 20261221, { cx: l.cx, cy: l.cy, r: l.ring * 1.1 })}
  <mask id="clear"><rect width="${l.w}" height="${l.h}" fill="#fff"/><circle cx="${f(l.cx)}" cy="${f(l.cy)}" r="${f(l.ring * 1.12)}" fill="#000"/></mask>
  <g mask="url(#clear)">${constellation(l.constellation.x, l.constellation.y, l.constellation.width, l.constellation.opacity)}</g>
  ${l.drift.map(([x, y, size, rot]) => fragment(x, y, size, rot, 0.85)).join('')}
  <circle cx="${f(l.cx)}" cy="${f(l.cy)}" r="${f(l.ring * 0.95)}" fill="url(#cupHalo)"/>
  ${stepsRing(l.cx, l.cy, l.ring, dot, frag)}
  ${seasonCup(l.cx, l.cy, l.cupScale)}
  ${placedBird('meeJoy', l.birds.left[0], l.birds.left[1], l.birdScale, false)}
  ${placedBird('meoStar', l.birds.right[0], l.birds.right[1], l.birdScale, true)}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Les deux cadrages. Le sujet (coupe, couronne, Mee et Meo) tient dans la zone
// sûre centrale : l'App Store recadre la carte et pose ses textes en bas.
// ---------------------------------------------------------------------------

const BIRD = GAME_BIRD_BOX;

/** Mee et Meo de part et d'autre du pied de la coupe, comme sur la coupe de Prestige (`Trophy`). */
const flanking = (cx: number, cy: number, cupScale: number, birdScale: number) => {
  const foot = 30 * cupScale + 12;
  const top = cy + 5 * cupScale;
  return { left: [cx - foot - BIRD * birdScale, top] as const, right: [cx + foot + BIRD * birdScale, top] as const };
};

const CARD: Layout = (() => {
  const w = 1920, h = 1080, cx = 960, cy = 500, ring = 345, cupScale = 3.5, birdScale = 1.3;
  return {
    w, h, cx, cy, ring, cupScale, birdScale,
    birds: flanking(cx, cy, cupScale, birdScale),
    constellation: { x: 150, y: 70, width: 1620, opacity: 0.55 },
    drift: [[300, 300, 22, 18], [1640, 360, 26, -14], [420, 800, 18, -24], [1530, 820, 20, 30], [180, 560, 14, 8], [1760, 600, 15, -6]],
    stars: 260,
  };
})();

const DETAILS: Layout = (() => {
  const w = 1080, h = 1920, cx = 540, cy = 800, ring = 370, cupScale = 3.6, birdScale = 1.3;
  return {
    w, h, cx, cy, ring, cupScale, birdScale,
    birds: flanking(cx, cy, cupScale, birdScale),
    constellation: { x: 110, y: 170, width: 860, opacity: 0.7 },
    drift: [[170, 470, 18, 20], [920, 520, 22, -16], [200, 1420, 16, -28], [880, 1460, 18, 24], [540, 1620, 14, 6]],
    stars: 300,
  };
})();

// ---------------------------------------------------------------------------
// Rendu : SVG → PNG (Chrome sans tête) → sRGB opaque (Pillow).
// ---------------------------------------------------------------------------

function run(cmd: string, args: readonly string[]): void {
  const out = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (out.status !== 0) throw new Error(`${cmd} a échoué (${out.status}) : ${out.stderr?.toString()}`);
}

const FLATTEN = `
import sys
from PIL import Image, ImageCms
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
if im.mode in ("RGBA", "LA", "P"):
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, (19, 17, 47, 255))
    im = Image.alpha_composite(bg, im)
im = im.convert("RGB")
srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
im.save(dst, "PNG", optimize=True, icc_profile=srgb)
`;

function render(name: string, placement: 'event_card' | 'event_details_page', layout: Layout): void {
  mkdirSync(SOURCE_DIR, { recursive: true });
  const svgPath = join(SOURCE_DIR, `${placement}.svg`);
  writeFileSync(svgPath, scene(layout));
  const raw = join(SOURCE_DIR, `.${placement}.raw.png`);
  run(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${layout.w},${layout.h}`, `--screenshot=${raw}`, `file://${svgPath}`,
  ]);
  const dir = join(METADATA, PRIMARY_LOCALE, placement);
  mkdirSync(dir, { recursive: true });
  const png = join(dir, name);
  run('python3', ['-I', '-c', FLATTEN, raw, png]);
  rmSync(raw);
  // Les autres langues : un lien vers le PNG de la langue principale (aucun texte dans l'image).
  for (const locale of LOCALES) {
    if (locale === PRIMARY_LOCALE) continue;
    const other = join(METADATA, locale, placement);
    mkdirSync(other, { recursive: true });
    const link = join(other, name);
    const target = relative(other, png);
    if (existsSync(link) || lstatExists(link)) {
      if (lstatSync(link).isSymbolicLink() && readlinkSync(link) === target) continue;
      rmSync(link);
    }
    symlinkSync(target, link);
  }
  console.log(`${relative(IOS, png)}  ${layout.w}×${layout.h}`);
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

render(`${EVENT}-card.png`, 'event_card', CARD);
render(`${EVENT}-details.png`, 'event_details_page', DETAILS);
