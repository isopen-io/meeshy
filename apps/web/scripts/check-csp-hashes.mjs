#!/usr/bin/env node
/**
 * LES CONDENSATS DE LA POLITIQUE DE SÉCURITÉ DU CONTENU SONT CEUX DES
 * DOCUMENTS CONSTRUITS (#18986).
 *
 * `nginx.conf` n'autorise que les scripts en ligne dont il porte le condensat
 * (`$meeshy_csp_script_hashes`, `scripts/lib/csp.mjs`). Un condensat ne se
 * devine pas : il se calcule sur `dist/`, après `vite build`. Deux écarts,
 * deux défauts :
 *
 *  - un script en ligne SANS condensat déclaré : nginx le refuserait, et le
 *    document servi casse (une amorce qui ne peint plus le schéma, une landing
 *    qui ne démarre plus) — exactement ce qu'aucun témoin sans navigateur ne
 *    verrait ;
 *  - un condensat déclaré que plus aucun document ne porte : il autorise un
 *    script que personne ne sert, et ÉLARGIT la politique sans raison.
 *
 *   node scripts/check-csp-hashes.mjs           # vérifie, après `bun run build`
 *   node scripts/check-csp-hashes.mjs --write   # réécrit la région de nginx.conf
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { distScriptHashes, nginxScriptHashes, withNginxScriptHashes } from './lib/csp.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const NGINX = join(APP, 'nginx.conf');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`Rien à mesurer : ${DIST} n'existe pas. Lancer d'abord \`bun run build\`.`);
  process.exit(1);
}

const nginx = readFileSync(NGINX, 'utf8');
const built = distScriptHashes(DIST);

if (process.argv.includes('--write')) {
  writeFileSync(NGINX, withNginxScriptHashes(nginx, built));
  console.log(`  nginx.conf : ${built.length} condensat(s) de scripts en ligne écrits depuis dist/.`);
  process.exit(0);
}

const declared = new Set(nginxScriptHashes(nginx));
const refused = built.filter((hash) => !declared.has(hash));
const unused = [...declared].filter((hash) => !built.includes(hash));

if (refused.length > 0 || unused.length > 0) {
  for (const hash of refused) console.error(`  ✗ un document construit exécute un script en ligne que la politique REFUSERAIT : ${hash}`);
  for (const hash of unused) console.error(`  ✗ la politique autorise un script en ligne qu'aucun document ne porte plus : ${hash}`);
  console.error('\n  Un script en ligne a changé sans son condensat. Relancer `bun run build` puis');
  console.error('  `node scripts/check-csp-hashes.mjs --write`, et relire le diff de nginx.conf :');
  console.error('  chaque condensat ajouté est un script que l’origine accepte d’exécuter.');
  process.exit(1);
}

console.log(`  nginx.conf : les ${built.length} scripts en ligne des documents construits sont exactement ceux que la politique autorise (#18986).`);
