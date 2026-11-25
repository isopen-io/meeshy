#!/usr/bin/env node
/**
 * TOUTE ADRESSE QU'UNE SURFACE ÉMET VERS MEESHY.ME, LE WEB LA SERT POUR DE BON
 * (#7312).
 *
 * POURQUOI CE GATE EXISTE
 *
 * Trois adresses mortes trouvées le 2026-09-21, de la même famille : `/help` et
 * `/faq` (l'app iOS publiée, #7287), `/download` (le SMS envoyé à quelqu'un qui
 * ne connaît pas encore Meeshy, #7297), `/reel/<id>` (composée par la
 * passerelle à chaque partage de réel, #7298). Aucune n'a été trouvée par un
 * gate : toutes rendaient 200, la coquille de l'application répondant à toute
 * adresse inconnue. Et le seul gate des adresses ne partait que de ce qui est
 * SERVI — il ne pouvait pas voir ce qu'on émet sans le servir.
 *
 * CE QU'IL FAIT
 *
 *   1. il INVENTORIE les adresses émises, dans l'app iOS et ses métadonnées
 *      App Store, le SDK, la passerelle, `@meeshy/shared` et le web lui-même :
 *      littéraux `https://meeshy.me/…` et origines composées (`webOrigin`,
 *      `frontendUrl`, `resolveFrontendBaseUrl()`), plus la table partagée des
 *      chemins de contenu ;
 *   2. il JUGE chacune comme nginx la sert : redirection suivie jusqu'à sa
 *      cible, alias de lien d'e-mail, document prérendu, fichier public, ou
 *      écran de `route-table.tsx` dont nginx laisse passer le premier segment ;
 *   3. pour chaque DOCUMENT atteint, il exige que le fichier construit ne soit
 *      pas la coquille : un titre et un poids qui diffèrent d'`index.html`. Un
 *      200 ne prouve rien — nginx retombe sur `index.html` quand le document
 *      manque.
 *
 * Son message nomme l'adresse ET la source qui l'émet. Il tourne sur le `dist`
 * construit (`bun run build`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SAMPLE, deadAddresses, documentVerdict, resolveServing } from './lib/emitted-addresses.mjs';
import { WEB, emittedInventory, servingTable } from './lib/emitted-inventory.mjs';

const DIST = join(WEB, 'dist');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('  dist/index.html absent — construire d’abord (`bun run build`) : sans lui, aucun document ne se juge.');
  process.exit(1);
}

const emitted = emittedInventory();
const table = servingTable({ dist: DIST });

const failures = deadAddresses(emitted, table).map((d) => d.message);

/* L'inventaire, adresse par adresse — c'est lui que le commentaire de clôture recopie. */
const byPath = new Map();
for (const e of emitted) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);

const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
const shellHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
const shell = { title: titleOf(shellHtml), bytes: Buffer.byteLength(shellHtml) };
const documentFile = (path) => join(DIST, path === '/' ? 'landing.html' : `${path.slice(1)}.html`);

const finalOf = (path, open) => {
  const verdict = resolveServing(path, table);
  if (verdict.kind !== 'dead' || !open) return verdict;
  return resolveServing(`${path}${SAMPLE}`, table);
};
const terminal = (verdict) => {
  let v = verdict;
  for (let i = 0; (v.kind === 'redirect' || v.kind === 'alias') && i < 5; i += 1) v = resolveServing(v.target, table);
  return v;
};

console.log('\n  adresse émise                         servie comme   sources');
const judged = new Set();
for (const [path, sources] of [...byPath].sort(([a], [b]) => a.localeCompare(b))) {
  const verdict = finalOf(path, sources[0].open);
  const end = terminal(verdict);
  if (end.kind === 'document' && !judged.has(end.target)) {
    judged.add(end.target);
    const f = documentFile(end.target);
    const html = existsSync(f) ? readFileSync(f, 'utf8') : null;
    const problem = documentVerdict(html === null ? null : { title: titleOf(html), bytes: Buffer.byteLength(html) }, shell);
    if (problem !== null) {
      failures.push(`${sources[0].file}:${sources[0].line} émet ${path}, ${problem}`);
    }
  }
  const label = verdict.kind === 'redirect' || verdict.kind === 'alias' ? `${verdict.kind} → ${verdict.target}` : verdict.kind;
  console.log(`  ${path.padEnd(37)} ${label.padEnd(14)} ${sources.length}`);
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} adresse(s) émise(s) que le web ne sert pas :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log(
  `\n  ${byPath.size} adresses émises par ${new Set(emitted.map((e) => e.file)).size} sources : toutes servies,` +
    ` et les ${judged.size} documents atteints ne sont pas la coquille.\n`,
);
