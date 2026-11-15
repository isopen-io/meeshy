#!/usr/bin/env bun
/**
 * PRÉRENDU DE LA LANDING DE meeshy.me (#10002), une page par langue.
 *
 * Même discipline que `prerender-institutional.tsx` : HTML + feuille INLINÉE +
 * zéro script externe, métadonnées dans le document servi (un robot ne suit
 * pas un `<title>` posé par JavaScript). La racine `/` (français, `x-default`)
 * s'écrit `landing.html` — `index.html` reste la coquille de l'application,
 * que nginx sert en repli à toutes ses adresses — et chaque autre langue
 * `/<code>` s'écrit sous ses deux formes (`en.html`, `en/index.html`), pour la
 * raison écrite dans le préchauffage institutionnel.
 *
 * Lancé APRÈS `vite build` (greffon `meeshy-prerender-landing`), pour la seule
 * variante web : la coque n'a pas de landing, `/` y ouvre la liste.
 *
 * LE GATE : chaque document est relu sur le fichier ÉCRIT — balises SEO par
 * langue, sous-ressources présentes dans le dist, aucun script externe — et son
 * poids gzip est confronté à `budgets.json › landing_page.kb`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';

import budgets from '../budgets.json';
import { LANDING_COPY } from '../src/landing/landing-copy';
import { landingBootConfig, landingBootScript, landingDocument, landingOgImagePath } from '../src/landing/landing-document';
import { LANDING_APP_PATH, LANDING_LANGUAGES, landingFiles, landingPath } from '../src/landing/landing-languages';
import { WORLD_GUEST_THREAD_TEMPLATE } from '../src/landing/world-entry';
import { resolveApiConfig } from '../src/lib/api/config';
import { SESSION_STORAGE_KEY } from '../src/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '../src/lib/inline-interface-language-bootstrap.js';
import { INLINE_SCHEME_BOOTSTRAP } from '../src/lib/inline-scheme-bootstrap.js';
import { minifyInlineScript } from './lib/minify-inline-script';
import { resolveDistDir } from './lib/resolve-dist-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolveDistDir(HERE, process.argv);
const ORIGIN = process.env.MEESHY_PUBLIC_ORIGIN ?? 'https://meeshy.me';

/**
 * LA PASSERELLE que la page interroge (`GET /world`) — la MÊME résolution que
 * l'application (`resolveApiConfig`), lue sur l'environnement de construction :
 * staging vise sa passerelle, production la sienne, jamais une origine écrite ici.
 */
const API_BASE = resolveApiConfig(
  { DEV: false, ...(process.env.VITE_API_BASE === undefined ? {} : { VITE_API_BASE: process.env.VITE_API_BASE }) },
  { shell: false },
).base;

/** `null` tant que la livraison n'a pas posé la valeur mesurée (arrondi au Ko supérieur + 1). */
const BUDGET_KB: number | null = budgets.landing_page.kb.value;

/**
 * Les deux `theme-color` LUS sur les jetons générés depuis iOS (`--ios-surface`
 * de `:root.dark`, puis de `:root.light`) — la surface de la page, jamais une
 * valeur recopiée.
 */
function themeColors(): { readonly dark: string; readonly light: string } {
  // `@meeshy/design-tokens` est une dépendance workspace résolue (package.json),
  // jamais un chemin relatif codé en dur : la disposition du monorepo local
  // (3 remontées depuis apps/web/scripts/) diffère de celle, aplatie, de
  // l'image Docker (apps/web/Dockerfile copie packages/design-tokens/ sous
  // /app/packages/design-tokens/) — un chemin relatif qui marche dans l'une
  // sort du système de fichiers dans l'autre (#10069).
  const iosCssPath = fileURLToPath(import.meta.resolve('@meeshy/design-tokens/ios.css'));
  const tokens = readFileSync(iosCssPath, 'utf8');
  const [dark, light] = [...tokens.matchAll(/--ios-surface:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => m[1]);
  if (dark === undefined || light === undefined) throw new Error('--ios-surface introuvable dans @meeshy/design-tokens/ios.css');
  return { dark, light };
}

function producedSheet(): string {
  const css = readdirSync(join(DIST, 'assets')).filter((file) => file.startsWith('landing-') && file.endsWith('.css'));
  if (css.length !== 1) {
    throw new Error(
      `Attendu UNE feuille \`landing-*.css\` dans dist/assets, trouvé ${css.length}. ` +
        'Lancer `vite build` d’abord, et vérifier l’entrée CSS `landing` de vite.config.ts.',
    );
  }
  return readFileSync(join(DIST, 'assets', css[0]!), 'utf8');
}

const SUBRESOURCES = [/<(?:img|script|source)\b[^>]*\ssrc="(\/[^"]*)"/g, /<link\b[^>]*\shref="(\/[^"]*)"/g, /url\((\/[^)"']*)\)/g] as const;

function check(language: (typeof LANDING_LANGUAGES)[number], html: string): readonly string[] {
  const failures: string[] = [];
  const url = `${ORIGIN}${landingPath(language)}`;
  const copy = LANDING_COPY[language];
  if (!html.includes(`<link rel="canonical" href="${url}">`)) failures.push('canonical absent ou faux');
  if (!html.includes('<link rel="alternate" hreflang="x-default"')) failures.push('x-default absent');
  for (const code of LANDING_LANGUAGES) {
    if (!html.includes(`hreflang="${code}" href="${ORIGIN}${landingPath(code)}"`)) failures.push(`hreflang ${code} absent`);
  }
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:locale']) {
    if (!html.includes(`property="${key}"`)) failures.push(`${key} absent`);
  }
  if (!html.includes('content="summary_large_image"')) failures.push('twitter:card absent');
  if (!html.includes('"Organization"') || !html.includes('"WebApplication"')) failures.push('JSON-LD incomplet');
  if ([...copy.metaDescription].length > 155) failures.push('description de plus de 155 caractères');
  if (!html.includes(`<script>${INLINE_SCHEME_BOOTSTRAP}</script>`)) failures.push("script d'amorçage du schéma absent ou altéré");
  if (/<script[^>]+src=/.test(html)) failures.push('un script EXTERNE est référencé');
  if (/<link[^>]+rel="stylesheet"/.test(html)) failures.push('une feuille EXTERNE est référencée');
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  if (!body.includes(copy.headline.replace(/'/g, '&#x27;')) && !body.includes(copy.headline)) failures.push('le titre du héros est absent du corps');
  const urls = new Set(SUBRESOURCES.flatMap((pattern) => [...html.matchAll(pattern)].map((m) => m[1] ?? '')));
  urls.add(landingOgImagePath(language));
  for (const path of urls) {
    if (path !== '' && path !== '/manifest.webmanifest' && !existsSync(join(DIST, path.replace(/^\//, '').replace(/[?#].*$/, '')))) {
      failures.push(`sous-ressource absente du dist : ${path}`);
    }
  }
  return failures;
}

const sheet = producedSheet();
const colors = themeColors();
const overBudget: string[] = [];
let broken = false;

const boot = {
  apiBase: API_BASE,
  worldPath: worldEndpoints.root,
  sessionKey: SESSION_STORAGE_KEY,
  languageKey: INTERFACE_LANGUAGE_KEY,
  threadTemplate: WORLD_GUEST_THREAD_TEMPLATE,
  appPath: LANDING_APP_PATH,
};

for (const language of LANDING_LANGUAGES) {
  const html = landingDocument({
    language,
    origin: ORIGIN,
    sheet,
    schemeScript: INLINE_SCHEME_BOOTSTRAP,
    themeColors: colors,
    boot,
    bootScript: await minifyInlineScript(landingBootScript(landingBootConfig(language, boot))),
  });
  const failures = check(language, html);
  if (failures.length > 0) {
    broken = true;
    console.error(`\n  ${landingPath(language)} — ${failures.length} invariant(s) rompu(s) :`);
    for (const failure of failures) console.error(`    · ${failure}`);
    continue;
  }
  for (const file of landingFiles(language)) {
    const target = join(DIST, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  }
  const kb = Math.round((gzipSync(Buffer.from(html), { level: 9 }).length / 1024) * 100) / 100;
  if (BUDGET_KB !== null && kb > BUDGET_KB) overBudget.push(`${landingPath(language)} : ${kb} Ko gzip, plafond ${BUDGET_KB} Ko`);
  console.log(`  ${landingPath(language).padEnd(4)} ${String(kb).padStart(6)} Ko gzip · 0 script externe · ${landingFiles(language).join(', ')}`);
}

if (BUDGET_KB === null) console.log('  landing_page.kb : plafond à poser sur la mesure de livraison (budgets.json)\n');

if (broken) process.exit(1);
if (overBudget.length > 0) {
  console.error(`  ${overBudget.length} landing(s) au-dessus du plafond :\n`);
  for (const line of overBudget) console.error(`    · ${line}`);
  console.error('\n  Alléger la page, ou faire arbitrer le plafond par le porteur (budgets.json).\n');
  process.exit(1);
}
