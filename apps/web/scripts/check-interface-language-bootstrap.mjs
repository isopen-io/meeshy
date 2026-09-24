#!/usr/bin/env node
/**
 * VÉRIFIE QUE `dist/index.html` PORTE LE VRAI SCRIPT D'AMORÇAGE DE LA LANGUE
 * D'INTERFACE, ET PAS SON MARQUEUR.
 *
 * MÊME PATRON QUE `check-scheme-bootstrap.mjs` (#5588), pour le même risque
 * (#6206) : le greffon `meeshy-inline-interface-language-bootstrap`
 * (vite.config.ts) jette si le marqueur est absent de la SOURCE, mais ne
 * prouve pas que la SORTIE le porte encore — un greffon désactivé, mal
 * ordonné, ou dont Vite ignore silencieusement `transformIndexHtml`
 * laisserait passer le marqueur littéral jusqu'au document servi, et
 * `<html lang>` resterait figé sur le repli statique du HTML pour tout le
 * monde, sans qu'aucun gate ne rougisse.
 *
 * Mesuré sur le fichier ÉCRIT par `vite build`, jamais sur la constante
 * importée.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INLINE_INTERFACE_LANGUAGE_BOOTSTRAP } from '../src/lib/inline-interface-language-bootstrap.js';

const APP = fileURLToPath(new URL('..', import.meta.url));
const INDEX_HTML = join(APP, 'dist', 'index.html');
const MARKER = '/*@INLINE_INTERFACE_LANGUAGE_BOOTSTRAP@*/';

const html = readFileSync(INDEX_HTML, 'utf8');
const failures = [];

if (html.includes(MARKER)) {
  failures.push(`le marqueur ${MARKER} est encore présent : le greffon ne l'a pas remplacé`);
}
if (!html.includes(`<script>${INLINE_INTERFACE_LANGUAGE_BOOTSTRAP}</script>`)) {
  failures.push("le script d'amorçage de la langue d'interface est absent, tronqué ou altéré dans dist/index.html");
}

if (failures.length > 0) {
  console.error(`\ndist/index.html — ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

console.log("✓ dist/index.html porte le script d'amorçage de la langue d'interface, dérivé de la source unique.");
