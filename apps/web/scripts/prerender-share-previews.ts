#!/usr/bin/env bun
/**
 * LES APERÇUS DES ADRESSES DE L'APPLICATION (#10192, D-199) — une copie de la
 * coquille construite (`dist/index.html`) par famille d'adresse et par langue,
 * habillée de ses balises Open Graph et Twitter (`src/share-preview/`).
 *
 * nginx sert la copie de la famille à la place de `index.html` sur les adresses
 * de l'application (`location @app`) ; le service worker, lui, n'en précache
 * aucune (`globIgnores`) : un visiteur qui revient reçoit la coquille précachée.
 *
 * Lancé APRÈS `vite build`, avec le prérendu de la landing (greffon
 * `meeshy-prerender-landing`), pour la seule variante web : la coque n'a pas de
 * nginx devant elle.
 *
 * LE GATE : chaque copie est relue sur le fichier ÉCRIT — son titre, son image,
 * la coquille intacte autour (mêmes scripts que `index.html`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANDING_LANGUAGES } from '../src/landing/landing-languages';
import { SHARE_PREVIEW_FAMILIES, sharePreviewFile, sharePreviewShell } from '../src/share-preview/share-preview';
import { SHARE_PREVIEW_COPY } from '../src/share-preview/share-preview-copy';
import { resolveDistDir } from './lib/resolve-dist-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolveDistDir(HERE, process.argv);
const ORIGIN = process.env.MEESHY_PUBLIC_ORIGIN ?? 'https://meeshy.me';

const shell = readFileSync(join(DIST, 'index.html'), 'utf8');
const scripts = (html: string): readonly string[] => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const failures: string[] = [];
let written = 0;

for (const family of SHARE_PREVIEW_FAMILIES) {
  for (const language of LANDING_LANGUAGES) {
    const file = sharePreviewFile(family, language);
    const html = sharePreviewShell(shell, { family, language, origin: ORIGIN });
    const title = SHARE_PREVIEW_COPY[language][family].title.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    if (!html.includes(`<meta property="og:title" content="${title}">`)) failures.push(`${file} : og:title absent`);
    if (!html.includes('<meta name="twitter:card" content="summary_large_image">')) failures.push(`${file} : twitter:card absent`);
    if (JSON.stringify(scripts(html)) !== JSON.stringify(scripts(shell))) failures.push(`${file} : les scripts diffèrent de index.html`);
    const target = join(DIST, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
    written += 1;
  }
}

if (failures.length > 0) {
  console.error(`\n  aperçus des adresses — ${failures.length} invariant(s) rompu(s) :`);
  for (const failure of failures) console.error(`    · ${failure}`);
  process.exit(1);
}
console.log(`  aperçus des adresses : ${written} copies de la coquille (${SHARE_PREVIEW_FAMILIES.length} familles × ${LANDING_LANGUAGES.length} langues)`);
