#!/usr/bin/env node
/**
 * VÉRIFIE QUE `dist/index.html` PORTE LE VRAI SCRIPT D'AMORÇAGE DU SCHÉMA, ET
 * PAS SON MARQUEUR.
 *
 * POURQUOI CE TÉMOIN EXISTE (#5588)
 *
 * `index.html` ne porte plus le texte du script bloquant clair/sombre, mais un
 * marqueur (`/*@INLINE_SCHEME_BOOTSTRAP@*​/`) que le greffon
 * `meeshy-inline-scheme-bootstrap` (vite.config.ts) remplace par
 * `INLINE_SCHEME_BOOTSTRAP` (src/lib/inline-scheme-bootstrap.js) — la MÊME
 * constante qu'importent `src/lib/scheme.ts` et
 * `scripts/prerender-institutional.tsx`. Le greffon jette si le marqueur est
 * absent de la SOURCE ; il ne prouve pas que la SORTIE le porte encore — un
 * greffon désactivé, mal ordonné, ou dont Vite ignore silencieusement
 * `transformIndexHtml` laisserait passer le marqueur littéral jusqu'au
 * document servi, et le premier rendu à froid basculerait de couleur sans
 * qu'aucun gate ne rougisse.
 *
 * Mesuré sur le fichier ÉCRIT par `vite build`, jamais sur la constante
 * importée — même principe que `scripts/prerender-institutional.tsx`
 * (fonction `check`), qui porte la même preuve pour les pages
 * institutionnelles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INLINE_SCHEME_BOOTSTRAP } from '../src/lib/inline-scheme-bootstrap.js';

const APP = fileURLToPath(new URL('..', import.meta.url));
const INDEX_HTML = join(APP, 'dist', 'index.html');
const MARKER = '/*@INLINE_SCHEME_BOOTSTRAP@*/';

const html = readFileSync(INDEX_HTML, 'utf8');
const failures = [];

if (html.includes(MARKER)) {
  failures.push(`le marqueur ${MARKER} est encore présent : le greffon ne l'a pas remplacé`);
}
if (!html.includes(`<script>${INLINE_SCHEME_BOOTSTRAP}</script>`)) {
  failures.push("le script d'amorçage du schéma est absent, tronqué ou altéré dans dist/index.html");
}

if (failures.length > 0) {
  console.error(`\ndist/index.html — ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

console.log('✓ dist/index.html porte le script d\'amorçage du schéma, dérivé de la source unique.');
