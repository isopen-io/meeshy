#!/usr/bin/env node
/**
 * Gate de BUDGET DE BUNDLE de la zone v3 (§ 8.2 mesure n° 1, § 8.3, § 8.4).
 *
 *   cd apps/web-v3 && bun run build
 *   node scripts/check-bundle-budget.mjs [--racine <zone>] [--budgets <f>] [--json <f>]
 *                                        [--ratchet <f>] [--enregistrer]
 *
 * LE RATCHET (§ 8.3). Un plafond CIBLE ne casse pas la CI ; c'est assume. Mais
 * la phrase du § 8.3 a une SECONDE moitie : « jusque-la le gate ENREGISTRE la
 * valeur mesuree et interdit toute REGRESSION ». `mesures/derniere.json` est
 * cet enregistrement, COMMITE, et toute remontee d'une valeur enregistree est
 * un echec — meme sous le plafond CIBLE. Sans lui, une seule ligne de
 * `budgets.json` pouvait faire rougir ce gate (`/l/:token`, ecran a 0 o GATE,
 * c'est-a-dire la route sans bundle, absente du manifeste) : le gate ne pouvait
 * litteralement pas echouer.
 *
 * `--enregistrer` ecrit le nouvel etat (le MINIMUM par cle). La CI ne
 * l'utilise pas : un gate qui reecrit sa propre reference ne garde rien.
 *
 * Codes de sortie :
 *   0  mesure faite, tout tient dans son plafond (le squelette vide en fait partie) ;
 *   1  mesure faite, un plafond GATE est depasse ou une valeur a REGRESSE ;
 *   2  mesure IMPOSSIBLE : pas de build, manifeste illisible, morceau absent ;
 *   3  mesure faite, mais une route n'est gouvernee par AUCUN plafond.
 *
 * Le rapport rend TROIS lignes par groupe de routes — socle, ecran le plus
 * lourd, cumul p95 — parce qu'un seul chiffre par groupe ne designe aucun
 * coupable : un socle qui gonfle et un ecran qui gonfle ne se corrigent pas au
 * meme endroit.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerBudgets, evaluer, ko, MesureImpossible, mesurerManifeste } from './lib/budget-bundle.mjs';
import { ecrireRatchet, fusionnerRatchet, lireRatchet } from './lib/ratchet.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut;
};

const racine = resolve(arg('--racine', join(ICI, '..')));
const manifeste = resolve(arg('--manifeste', join(racine, '.next', 'app-build-manifest.json')));
const fichierBudgets = resolve(arg('--budgets', join(racine, 'budgets.json')));
const json = arg('--json', null);
const fichierRatchet = resolve(arg('--ratchet', join(racine, 'mesures', 'derniere.json')));
const enregistrer = args.includes('--enregistrer');

const ecrire = (rapport) => {
  if (json) writeFileSync(resolve(json), `${JSON.stringify(rapport, null, 2)}\n`);
};

try {
  const budgets = chargerBudgets(fichierBudgets);
  const ratchet = lireRatchet(fichierRatchet);
  const mesures = mesurerManifeste({ racineNext: join(racine, '.next'), manifeste });
  const rapport = {
    genere_le: new Date().toISOString(),
    manifeste,
    budgets: fichierBudgets,
    ratchet_fichier: fichierRatchet,
    ...evaluer({ mesures, budgets, ratchet }),
  };

  ecrire(rapport);

  if (rapport.verdict === 'squelette-vide') {
    process.stdout.write(
      '[budget] aucune route dans le manifeste — squelette vide, 0 Ko mesure. Rien a depasser.\n',
    );
    process.exit(0);
  }

  for (const g of rapport.groupes) {
    process.stdout.write(
      `[budget] ${g.groupe.padEnd(12)} socle: ${ko(g.socle_octets).padEnd(10)} |  ` +
        `ecran le plus lourd: ${ko(g.ecran_le_plus_lourd_octets).padEnd(10)} |  ` +
        `cumul p95: ${ko(g.cumul_p95_octets)}\n`,
    );
  }
  for (const r of rapport.routes) {
    process.stdout.write(
      `[budget]   ${r.route.padEnd(26)} ecran ${ko(r.octets_ecran).padStart(10)} / ` +
        `plafond ${r.plafond_ecran === null ? 'aucun' : ko(r.plafond_ecran)} ` +
        `(${r.statut_du_plafond}, par ${r.source_du_plafond}) ${r.statut === 'vert' ? '' : 'DEPASSEMENT'}\n`,
    );
  }

  for (const e of rapport.ecarts_de_cible) {
    process.stdout.write(`[budget] HORS CIBLE (ne casse pas la CI, § 8.3) — ${e}\n`);
  }
  for (const s of rapport.sans_plafond) {
    process.stdout.write(`[budget] SANS PLAFOND — ${s}\n`);
  }

  if (enregistrer) {
    ecrireRatchet({
      fichier: fichierRatchet,
      valeurs: fusionnerRatchet({
        enregistre: ratchet.valeurs ?? {},
        courant: rapport.ratchet.valeurs_courantes,
      }),
      source: 'node apps/web-v3/scripts/check-bundle-budget.mjs --enregistrer',
    });
    process.stdout.write(`[budget] ratchet enregistre : ${fichierRatchet}\n`);
  }

  if (rapport.regressions.length) {
    process.stderr.write('[budget] ECHEC — le ratchet du § 8.3 est strictement decroissant :\n');
    for (const r of rapport.regressions) process.stderr.write(`  - ${r}\n`);
  }
  if (rapport.depassements.length) {
    process.stderr.write('[budget] ECHEC — plafonds GATE depasses :\n');
    for (const d of rapport.depassements) process.stderr.write(`  - ${d}\n`);
  }
  if (rapport.verdict === 'depassement') process.exit(1);

  if (rapport.verdict === 'sans-plafond') {
    process.stderr.write(
      "[budget] INDETERMINE — une route au moins n'est gouvernee par aucun plafond ; une route hors de toute table n'est pas une route verte.\n",
    );
    process.exit(3);
  }

  process.stdout.write(`[budget] OK — ${rapport.routes.length} route(s) dans leur budget.\n`);
  process.exit(0);
} catch (erreur) {
  if (erreur instanceof MesureImpossible) {
    ecrire({
      genere_le: new Date().toISOString(),
      manifeste,
      verdict: 'non-mesurable',
      raison: erreur.message,
      routes: [],
      groupes: [],
      depassements: [],
    });
    process.stderr.write(`[budget] MESURE IMPOSSIBLE — ${erreur.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`[budget] ERREUR — ${erreur.stack ?? erreur.message}\n`);
  process.exit(2);
}
