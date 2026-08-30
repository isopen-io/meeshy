#!/usr/bin/env node
/**
 * Gate de l'ORDRE des ecrans de la v3.
 *
 *   node docs/product/MeeshyWebV3Design/ordre-des-ecrans.js [matrice.json]
 *
 * L'ordre d'implementation n'est pas ECRIT, il est CALCULE : la colonne
 * `depend_de` de la matrice est l'unique source, et ce script en produit le
 * tri topologique. Il ECHOUE — et casse la CI — si :
 *   rc=1  le graphe porte un cycle (l'interblocage que la revue a trouve) ;
 *   rc=2  une dependance nomme une vue qui n'existe pas ;
 *   rc=3  une vue de vues.json manque a la matrice, ou l'inverse ;
 *   rc=4  un ecran P0 depend d'un ecran de priorite inferieure.
 *
 * La regle de fond, qui a produit le cycle d'origine : un ecran de
 * CONFIRMATION ne depend que de ce qui PRODUIT l'etat qu'il confirme, jamais
 * de ce qui le consomme ensuite.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const MATRICE = process.argv[2] || path.join(HERE, 'matrice.json');
const VUES = path.join(HERE, 'vues.json');

const m = JSON.parse(fs.readFileSync(MATRICE, 'utf8'));
const vues = JSON.parse(fs.readFileSync(VUES, 'utf8'));

const echec = (rc, msg, details) => {
  process.stderr.write(`[ordre] ECHEC (${rc}) — ${msg}\n`);
  (details || []).forEach(d => process.stderr.write(`  - ${d}\n`));
  process.exit(rc);
};

const ids = new Set(m.ecrans.map(e => e.vue_id));
if (ids.size !== m.ecrans.length) {
  const vus = new Set(), dup = [];
  for (const e of m.ecrans) { if (vus.has(e.vue_id)) dup.push(e.vue_id); vus.add(e.vue_id); }
  echec(3, 'la matrice porte des vue_id en double', dup);
}

// rc=3 — couverture exacte de la planche.
const attendues = new Set(vues.vues.map(v => v.id));
const manquantes = [...attendues].filter(i => !ids.has(i));
const inconnues = [...ids].filter(i => !attendues.has(i));
if (manquantes.length || inconnues.length) {
  echec(3, `couverture incorrecte (${ids.size} lignes contre ${attendues.size} vues)`,
    [...manquantes.map(i => `absente de la matrice : ${i}`), ...inconnues.map(i => `absente de vues.json : ${i}`)]);
}

// rc=2 — toute dependance nomme une vue connue.
const pendantes = [];
for (const e of m.ecrans) {
  for (const d of e.depend_de || []) {
    if (!ids.has(d)) pendantes.push(`${e.vue_id} depend de « ${d} », qui n'existe pas`);
    if (d === e.vue_id) pendantes.push(`${e.vue_id} depend de lui-meme`);
  }
}
if (pendantes.length) echec(2, 'dependances pendantes', pendantes);

// rc=1 — tri topologique de Kahn. Ce qui reste apres la boucle est le cycle.
const restant = new Map(m.ecrans.map(e => [e.vue_id, new Set(e.depend_de || [])]));
const ordre = [];
while (restant.size) {
  const prets = [...restant.entries()].filter(([, d]) => d.size === 0).map(([k]) => k).sort();
  if (!prets.length) {
    const bloques = [...restant.entries()].map(([k, d]) => `${k} <- ${[...d].join(', ')}`);
    echec(1, `cycle dans le graphe des dependances (${restant.size} ecrans bloques)`, bloques);
  }
  for (const k of prets) { ordre.push(k); restant.delete(k); }
  for (const d of restant.values()) for (const k of prets) d.delete(k);
}

// rc=4 — un P0 ne peut pas attendre un P1 : le role premier doit pouvoir partir seul.
const rang = { 'P0-role-premier': 0, 'P1-role-secondaire': 1, 'P2-confort': 2 };
const par = new Map(m.ecrans.map(e => [e.vue_id, e]));
const inversions = [];
for (const e of m.ecrans) {
  for (const d of e.depend_de || []) {
    if (rang[par.get(d).priorite] > rang[e.priorite]) {
      inversions.push(`${e.vue_id} (${e.priorite}) depend de ${d} (${par.get(d).priorite})`);
    }
  }
}
if (inversions.length) echec(4, 'un ecran depend d\'un ecran de priorite inferieure', inversions);

// L'ordre PUBLIE stabilise le tri (arbitraire entre independants) par priorite puis par nom.
const publie = [...ordre].sort((a, b) => {
  const ea = par.get(a), eb = par.get(b);
  const pa = rang[ea.priorite] - rang[eb.priorite];
  if (pa) return pa;
  return ordre.indexOf(a) - ordre.indexOf(b);
});

const md = [
  '# Meeshy web v3 — l\'ordre d\'implementation des ecrans',
  '',
  '> **Ce fichier est CALCULE, jamais ecrit a la main.** Il est le tri topologique de la colonne',
  '> `depend_de` de `matrice.json`, produit par `ordre-des-ecrans.js`, qui est aussi le gate CI.',
  '> L\'ETAT de chaque ecran vit dans son issue GitHub, jamais ici.',
  '',
  `${m.ecrans.length} ecrans, ${m.lots.length} lots, graphe acyclique.`,
  '',
  '| # | Vue | Priorite | Lot | Route | Audience | Depend de |',
  '|---:|---|---|---|---|---|---|',
  ...publie.map((id, i) => {
    const e = par.get(id);
    return `| ${i + 1} | \`${e.vue_id}\` | ${e.priorite} | ${e.lot} | \`${e.route}\` | ${e.audience} | ${(e.depend_de || []).map(d => `\`${d}\``).join(', ') || '—'} |`;
  }),
  '',
].join('\n');
fs.writeFileSync(path.join(HERE, 'ordre.md'), md);

process.stdout.write(`[ordre] OK — ${m.ecrans.length} ecrans, ${m.lots.length} lots, graphe acyclique, couverture exacte des ${attendues.size} vues.\n`);
process.stdout.write(`[ordre] premiers a implementer : ${publie.slice(0, 8).join(' > ')}\n`);
