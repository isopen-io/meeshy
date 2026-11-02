#!/usr/bin/env node
// La COUVERTURE d'une suite Jest jouée en tranches : fusionnée, puis jugée UNE fois (#12556).
//
// « Tests · gateway » prenait 16 à 17,5 min après `quality` et fixait la durée de tout le run.
// En tranches (`jest --shard=i/n`), chaque tranche ne voit qu'une part des tests : son seuil
// global tomberait à tort. Les tranches tournent donc SANS seuil et déposent leur
// `coverage-final.json` ; ce script les additionne, recalcule les quatre totaux comme
// istanbul-lib-coverage (une ligne vaut le plus grand compte de ses instructions, pourcentage
// tronqué au centième) et les compare au `coverageThreshold.global` du `jest.config.json` —
// la source unique, que la CI ne recopie pas.
//
// L'addition se fait par EMPLACEMENT dans la source, pas par indice : c'est ce que fait
// `FileCoverage.merge` d'istanbul, et c'est ce qui tient si deux tranches instrumentent un
// même fichier avec des cartes d'ordre différent.
//
// Fail-closed : moins de tranches que `--attendu`, ou aucun fichier couvert, et le verdict
// est rouge — une tranche perdue ne doit pas faire monter la couverture en silence.
//
// Usage :
//   node scripts/ci/merge-jest-coverage.mjs --config services/gateway/jest.config.json \
//     --attendu 3 --sortie coverage/coverage-final.json tranche-1.json tranche-2.json …
//   node scripts/ci/merge-jest-coverage.mjs --self-test

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const cle = (loc) => `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;

const fusionneCarte = (cible, source, carte, compteurs, cleDe, additionne) => {
  const index = new Map(Object.entries(cible[carte]).map(([k, v]) => [cleDe(v), k]));
  const carteFusionnee = { ...cible[carte] };
  const comptes = { ...cible[compteurs] };
  for (const [k, v] of Object.entries(source[carte])) {
    const existant = index.get(cleDe(v));
    if (existant === undefined) {
      const neuf = String(Object.keys(carteFusionnee).length);
      carteFusionnee[neuf] = v;
      comptes[neuf] = source[compteurs][k];
      index.set(cleDe(v), neuf);
      continue;
    }
    comptes[existant] = additionne(comptes[existant], source[compteurs][k]);
  }
  return { [carte]: carteFusionnee, [compteurs]: comptes };
};

const fusionneFichier = (a, b) => ({
  ...a,
  ...fusionneCarte(a, b, 'statementMap', 's', cle, (x, y) => x + y),
  ...fusionneCarte(a, b, 'fnMap', 'f', (fn) => cle(fn.loc), (x, y) => x + y),
  ...fusionneCarte(a, b, 'branchMap', 'b', (br) => `${cle(br.loc)}#${br.locations.length}`, (x, y) => x.map((n, i) => n + (y[i] ?? 0))),
});

export const fusionne = (tranches) =>
  tranches.reduce((acc, tranche) => {
    const suite = { ...acc };
    for (const [chemin, fichier] of Object.entries(tranche)) {
      suite[chemin] = suite[chemin] === undefined ? fichier : fusionneFichier(suite[chemin], fichier);
    }
    return suite;
  }, {});

export const pourcent = (couverts, total) => (total > 0 ? Math.floor((1000 * 100 * couverts) / total / 10) / 100 : 100);

export const totaux = (couverture) => {
  const somme = { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] };
  for (const fichier of Object.values(couverture)) {
    const lignes = new Map();
    for (const [k, n] of Object.entries(fichier.s)) {
      const ligne = fichier.statementMap[k]?.start.line;
      if (ligne === undefined) continue;
      lignes.set(ligne, Math.max(lignes.get(ligne) ?? 0, n));
    }
    const compte = (valeurs) => [valeurs.filter((n) => n > 0).length, valeurs.length];
    const parts = {
      lines: compte([...lignes.values()]),
      statements: compte(Object.values(fichier.s)),
      functions: compte(Object.values(fichier.f)),
      branches: compte(Object.values(fichier.b).flat()),
    };
    for (const [axe, [c, t]] of Object.entries(parts)) {
      somme[axe] = [somme[axe][0] + c, somme[axe][1] + t];
    }
  }
  return Object.fromEntries(Object.entries(somme).map(([axe, [c, t]]) => [axe, { couverts: c, total: t, pct: pourcent(c, t) }]));
};

export const juge = ({ couverture, seuil, tranches, attendu }) => {
  const fautes = [];
  if (tranches < attendu) fautes.push(`${tranches} tranche(s) de couverture sur ${attendu} attendues — une tranche perdue ne juge rien`);
  if (Object.keys(couverture).length === 0) fautes.push('aucun fichier couvert — la fusion ne mesure rien');
  const t = totaux(couverture);
  for (const [axe, min] of Object.entries(seuil)) {
    if (t[axe] === undefined) {
      fautes.push(`axe de seuil inconnu : ${axe}`);
      continue;
    }
    if (t[axe].pct < min) fautes.push(`${axe} : ${t[axe].pct} % < seuil ${min} %`);
  }
  return { totaux: t, fautes };
};

const loc = (l1, c1, l2, c2) => ({ start: { line: l1, column: c1 }, end: { line: l2, column: c2 } });

const autoTest = () => {
  const base = (s, f, b, ordre = false) => ({
    path: '/x.ts',
    statementMap: ordre ? { 0: loc(2, 0, 2, 5), 1: loc(1, 0, 1, 5) } : { 0: loc(1, 0, 1, 5), 1: loc(2, 0, 2, 5) },
    s: ordre ? { 0: s[1], 1: s[0] } : { 0: s[0], 1: s[1] },
    fnMap: { 0: { name: 'g', loc: loc(1, 0, 2, 5) } },
    f: { 0: f },
    branchMap: { 0: { loc: loc(2, 0, 2, 5), type: 'if', locations: [loc(2, 0, 2, 2), loc(2, 3, 2, 5)] } },
    b: { 0: b },
  });
  const a = { '/x.ts': base([1, 0], 1, [1, 0]) };
  const b = { '/x.ts': base([0, 2], 0, [0, 3], true) };
  const m = fusionne([a, b]);
  assert.deepEqual(Object.values(m['/x.ts'].s).sort(), [1, 2]);
  assert.deepEqual(m['/x.ts'].b[0], [1, 3]);
  const t = totaux(m);
  assert.equal(t.statements.pct, 100);
  assert.equal(t.lines.pct, 100);
  assert.equal(t.branches.pct, 100);
  assert.equal(totaux(a).statements.pct, 50);
  assert.equal(pourcent(2, 3), 66.66);
  assert.equal(pourcent(0, 0), 100);
  assert.deepEqual(juge({ couverture: m, seuil: { lines: 90 }, tranches: 2, attendu: 2 }).fautes, []);
  assert.match(juge({ couverture: a, seuil: { statements: 80 }, tranches: 1, attendu: 1 }).fautes[0], /statements : 50 %/);
  assert.match(juge({ couverture: m, seuil: {}, tranches: 1, attendu: 2 }).fautes[0], /1 tranche\(s\)/);
  assert.match(juge({ couverture: {}, seuil: {}, tranches: 2, attendu: 2 }).fautes[0], /aucun fichier/);
  assert.match(juge({ couverture: m, seuil: { lignes: 1 }, tranches: 2, attendu: 2 }).fautes[0], /inconnu/);
  console.log('merge-jest-coverage --self-test : 13 cas tenus');
};

const option = (nom) => {
  const i = process.argv.indexOf(nom);
  return i === -1 ? undefined : process.argv[i + 1];
};

const main = () => {
  if (process.argv.includes('--self-test')) return autoTest();
  const config = option('--config');
  const sortie = option('--sortie');
  const attendu = Number(option('--attendu') ?? 1);
  const valeurs = new Set([config, sortie, option('--attendu')]);
  const fichiers = process.argv.slice(2).filter((a) => !a.startsWith('--') && !valeurs.has(a));
  if (!config) {
    console.error('::error title=Couverture::--config <jest.config.json> requis');
    process.exit(2);
  }
  const seuil = JSON.parse(readFileSync(config, 'utf8')).coverageThreshold?.global ?? {};
  const couverture = fusionne(fichiers.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
  if (sortie) {
    mkdirSync(dirname(sortie), { recursive: true });
    writeFileSync(sortie, JSON.stringify(couverture));
  }
  const { totaux: t, fautes } = juge({ couverture, seuil, tranches: fichiers.length, attendu });
  for (const [axe, { couverts, total, pct }] of Object.entries(t)) {
    console.log(`${axe.padEnd(10)} ${String(pct).padStart(6)} % (${couverts}/${total})${seuil[axe] === undefined ? '' : ` — seuil ${seuil[axe]} %`}`);
  }
  if (fautes.length === 0) {
    console.log(`Couverture fusionnée de ${fichiers.length} tranche(s) : seuil tenu.`);
    return;
  }
  for (const f of fautes) console.error(`::error title=Couverture::${f}`);
  process.exit(1);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
