#!/usr/bin/env node
// Gate de la TABLE de jetons (`tokens.css`, `dark.css`, `light.css`) — moitié
// TABLE de l'ancien `apps/web-old-version3/scripts/check-jetons.mjs` (801 lignes),
// porté ici après le retrait de l'app annulée (#5994) qui l'emportait alors que
// la table elle-même reste importée par `apps/web-v2` (issue #6000).
//
//   node scripts/check-jetons.mjs
//   node scripts/check-jetons.mjs --json
//
// CE QUI EST PORTÉ, ET CE QUI NE L'EST PAS
//
// L'original faisait deux choses : auditer la TABLE (ce fichier) et scanner les
// SOURCES d'une application pour des couleurs écrites en dur et un second
// moteur de thème (`moteursParalleles`). La seconde moitié dépendait de la
// géographie de l'ancienne app (`app/theme-script.tsx` comme moteur unique) —
// `apps/web-v2` a une architecture différente (bootstrap scindé en
// `src/lib/scheme.ts` + `src/lib/inline-scheme-bootstrap.js`, à dessein, pour
// éviter le FOUC) et la modéliser correctement demande sa propre
// investigation pour ne pas produire de faux positifs sur ce split délibéré.
// Elle n'est donc pas portée ici — voir l'issue de suivi ouverte à la clôture
// de #6000.
//
// LA LOI PORTÉE
//
//   1. Cette table est COMPLÈTE dans les deux schémas : un jeton de schéma
//      sans sa jumelle ne se voit qu'au moment où l'autre thème est servi.
//   2. Cette table est LISIBLE : un rapport de contraste WCAG 1.4.3 (texte,
//      4,5:1) et 1.4.11 (contour/signal, 3:1) est calculé sur la valeur
//      SERVIE (les alias `var()` et les `color-mix()` sont résolus), jamais
//      sur la valeur déclarée.
//   3. Les plans de surface sont ORDONNÉS : la luminance croît strictement du
//      plus enfoncé au plus surélevé.
//   4. L'anneau de focus et son contre-anneau se DOIVENT mutuellement 3:1, et
//      pour CHAQUE fond sur lequel un élément focusable se pose, au moins un
//      des deux tient 3:1 (disjonction, pas conjonction — voir le doc-comment
//      de `focusInvisiblesDans`).
//   5. La table ne bascule pas TELLE QU'ELLE EST SERVIE : la valeur résolue
//      par la cascade, sous les deux schémas d'OS, à classe HTML égale, ne
//      change jamais (`suivisDeLOS`) — c'est la classe qui gouverne, jamais
//      `prefers-color-scheme` ni un `color-scheme` à deux schémas qui arme
//      `light-dark()` en silence.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { feuillesDepuis, tableServie } from './lib/cascade.mjs';
import { arrondi, contraste, luminance, resout } from './lib/couleur.mjs';

// --- la table, telle qu'écrite dans les feuilles (hors schéma résolu) ------

const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g;

export const blocsCss = (source) => {
  const net = source.replace(COMMENTAIRE_BLOC, '');
  const blocs = [];
  for (const m of net.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selecteurs = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const jetons = Object.fromEntries(
      [...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1], d[2].trim()]),
    );
    blocs.push({ selecteurs, jetons });
  }
  return blocs;
};

// Ce que l'agent utilisateur voit dans un schéma : les jetons hors schéma de
// `tokens.css`, écrasés par ceux du schéma. C'est cette table RÉSOLUE — pas
// les valeurs déclarées, dont la moitié sont des `var()` — qui atteint le
// pixel.
const SCHEMAS = [
  { nom: 'sombre', fichier: 'dark.css', selecteur: ':root' },
  { nom: 'clair', fichier: 'light.css', selecteur: ':root.light' },
];

const jetonsDeBloc = (source, selecteur) =>
  Object.assign(
    {},
    ...blocsCss(source)
      .filter((bloc) => bloc.selecteurs.includes(selecteur))
      .map((bloc) => bloc.jetons),
  );

const tableDe = (racineJetons, schema) => ({
  ...jetonsDeBloc(readFileSync(join(racineJetons, 'tokens.css'), 'utf8'), ':root'),
  ...jetonsDeBloc(readFileSync(join(racineJetons, schema.fichier), 'utf8'), schema.selecteur),
});

export const jetonsOrphelins = (racineJetons) => {
  const [sombre, clair] = SCHEMAS.map((schema) =>
    jetonsDeBloc(readFileSync(join(racineJetons, schema.fichier), 'utf8'), schema.selecteur),
  );
  return [
    ...Object.keys(sombre)
      .filter((nom) => clair[nom] === undefined)
      .map((nom) => ({ fichier: 'dark.css', jeton: nom, manque: 'light.css' })),
    ...Object.keys(clair)
      .filter((nom) => sombre[nom] === undefined)
      .map((nom) => ({ fichier: 'light.css', jeton: nom, manque: 'dark.css' })),
  ].sort((a, b) => a.jeton.localeCompare(b.jeton));
};

// --- la loi de LISIBILITÉ ---------------------------------------------------

// Les quatre plans sur lesquels du contenu se pose, du plus enfoncé au plus
// surélevé. L'ordre de ce tableau EST la loi d'élévation contrôlée plus bas.
const PLANS = ['--color-bg-sunken', '--color-bg', '--color-surface', '--color-surface-raised'];

// 4,5:1 — WCAG 1.4.3, texte normal. Tout ce qui se LIT.
const ENCRES_SUR_PLAN = [
  '--color-text',
  '--color-text-muted',
  '--color-text-subtle',
  '--color-primary',
  '--color-success',
  '--color-warning',
  '--color-danger',
];

// 3:1 — WCAG 1.4.11. Ce qui porte SEUL son information sans être du texte.
const SIGNAUX_SUR_PLAN = [
  '--color-border-interactive',
  '--color-presence-online',
  '--color-presence-away',
  '--color-presence-idle',
  '--color-presence-offline',
];

// Une encre POSÉE sur une couleur de la table, pas sur un plan — repos ET
// survol, une paire se déclarant par SITUATION DE LECTURE plutôt que par
// jeton.
const ENCRES_SUR_FOND = [
  ['--color-on-primary', '--color-primary'],
  ['--color-on-primary', '--color-primary-strong'],
  ['--color-on-status', '--color-success'],
  ['--color-on-status', '--color-warning'],
  ['--color-on-status', '--color-danger'],
  ['--color-on-avatar', '--color-avatar-1'],
  ['--color-on-avatar', '--color-avatar-2'],
  ['--color-on-avatar', '--color-avatar-3'],
  ['--color-on-avatar', '--color-avatar-4'],
];

// Les quatre voiles — des plans à part entière dès qu'un bandeau ou une tuile
// s'y pose, mais pas des plans de l'échelle d'élévation.
const VOILES = ['--color-tint-primary', '--color-tint-success', '--color-tint-warning', '--color-tint-danger'];

// Ce qui se LIT sur un voile : le texte du bandeau, jamais la couleur d'état.
const ENCRES_SUR_VOILE = ['--color-text', '--color-text-muted', '--color-text-subtle'];

// La couleur d'état porte SEULE son information sur son propre voile : 3:1.
const SIGNAUX_SUR_LEUR_VOILE = [
  ['--color-primary', '--color-tint-primary'],
  ['--color-success', '--color-tint-success'],
  ['--color-warning', '--color-tint-warning'],
  ['--color-danger', '--color-tint-danger'],
];

const TEXTE = 4.5;
const SIGNAL = 3;

const paires = () => [
  ...ENCRES_SUR_PLAN.flatMap((encre) => PLANS.map((plan) => [encre, plan, TEXTE])),
  ...SIGNAUX_SUR_PLAN.flatMap((signal) => PLANS.map((plan) => [signal, plan, SIGNAL])),
  ...ENCRES_SUR_FOND.map(([encre, fond]) => [encre, fond, TEXTE]),
  ...ENCRES_SUR_VOILE.flatMap((encre) => VOILES.map((voile) => [encre, voile, TEXTE])),
  ...SIGNAUX_SUR_LEUR_VOILE.map(([signal, voile]) => [signal, voile, SIGNAL]),
  // L'anneau de focus et son contre-anneau se détourent l'un l'autre : sans
  // 3:1 entre les deux, le double anneau n'en fait qu'un.
  ['--color-focus', '--color-focus-contra', SIGNAL],
];

// --- l'anneau de focus, une DISJONCTION et non une paire ---------------------
//
// Aucune couleur unique ne tient 3:1 (WCAG 1.4.11) contre TOUS les fonds sur
// lesquels un élément focusable se pose. Le contrat n'est donc pas « chacun
// des deux tient 3:1 partout » — aucun couple ne le tiendrait — mais « pour
// CHAQUE fond, AU MOINS UN des deux ». `paires()` conjugue ; elle ne sait pas
// disjoindre — d'où cette fonction séparée.
const FONDS_DU_FOCUS = [...PLANS, '--color-primary', ...VOILES];

/**
 * La loi, sur une table SERVIE — pure, donc gageable sur une table fabriquée.
 * Un couple dont les deux membres s'évanouissent sur un même fond y apparaît ;
 * un couple dont l'un porte ce que l'autre perd n'y apparaît pas.
 */
export const focusInvisiblesDans = (table) => {
  const [anneau, contre] = ['--color-focus', '--color-focus-contra'].map((jeton) => resout(table, jeton));
  return FONDS_DU_FOCUS.flatMap((fond) => {
    const valeur = resout(table, fond);
    if (anneau === null || contre === null || valeur === null) {
      return [{ fond, meilleur: null }];
    }
    const meilleur = arrondi(Math.max(contraste(anneau, valeur), contraste(contre, valeur)));
    return meilleur >= SIGNAL ? [] : [{ fond, meilleur }];
  });
};

export const focusInvisibles = (racineJetons) =>
  SCHEMAS.flatMap((schema) =>
    focusInvisiblesDans(tableDe(racineJetons, schema)).map((entree) => ({ schema: schema.nom, ...entree })),
  );

export const contrastesInsuffisants = (racineJetons) =>
  SCHEMAS.flatMap((schema) => {
    const table = tableDe(racineJetons, schema);
    return paires().flatMap(([encre, fond, seuil]) => {
      const [a, b] = [resout(table, encre), resout(table, fond)];
      if (a === null || b === null) {
        return [{ schema: schema.nom, encre, fond, seuil, rapport: null }];
      }
      const rapport = arrondi(contraste(a, b));
      return rapport >= seuil ? [] : [{ schema: schema.nom, encre, fond, seuil, rapport }];
    });
  });

export const plansDesordonnes = (racineJetons) =>
  SCHEMAS.flatMap((schema) => {
    const table = tableDe(racineJetons, schema);
    return PLANS.slice(1).flatMap((plan, index) => {
      const dessous = PLANS[index];
      const [bas, haut] = [resout(table, dessous), resout(table, plan)];
      if (bas === null || haut === null) {
        return [{ schema: schema.nom, dessous, plan, ecart: null }];
      }
      const ecart = luminance(haut) - luminance(bas);
      return ecart > 0 ? [] : [{ schema: schema.nom, dessous, plan, ecart: arrondi(ecart) }];
    });
  });

// --- la table telle qu'elle est SERVIE, sous les deux schémas d'OS ---------

// Les trois états dans lesquels `<html>` se présente : la classe posée par le
// serveur puis corrigée par le moteur, et — le rôle PREMIER — aucune classe
// du tout, chez un lecteur sans JavaScript.
const ETATS_DE_CLASSE = [[], ['dark'], ['light']];

const JETON_DECLARE = /(--[\w-]+)\s*:/g;

/**
 * Le garde-fou du contrôle lui-même. `suivisDeLOS` a pour valeur nominale de
 * succès « zéro entrée » ; un résolveur qui inspecte une table VIDE rend
 * exactement la même phrase qu'un résolveur qui a tout vérifié. Un contrôle
 * dont le succès est un ensemble vide doit donc prouver qu'il a regardé
 * quelque chose : tout jeton DÉCLARÉ dans les feuilles doit être SERVI dans
 * chacun des trois états de classe.
 */
const verifieQueLaTableAEteVue = (feuilles, classes, servies) => {
  const declares = new Set(
    feuilles.flatMap((feuille) => [...feuille.source.matchAll(JETON_DECLARE)].map((m) => m[1])),
  );
  const manquants = [...declares].filter((jeton) => !servies.has(jeton));
  if (declares.size === 0 || manquants.length > 0) {
    throw new Error(
      `check-jetons: la table servie sous la classe « ${classes.join(' ') || '(aucune)'} » ne ` +
        `sert ${manquants.length} des ${declares.size} jeton(s) déclaré(s) ` +
        `(${manquants.slice(0, 3).join(', ') || 'aucun jeton déclaré'}) — ` +
        'la cascade a été mal résolue, pas la table mal écrite.',
    );
  }
};

/**
 * Les propriétés dont la valeur SERVIE change avec le schéma de l'OS, à
 * classe égale. Zéro entrée dit que le choix explicite (la classe) atteint le
 * jeton, et que rien ne le court-circuite en chemin.
 */
export const suivisDeLOS = (feuilles) =>
  ETATS_DE_CLASSE.flatMap((classes) => {
    const sombre = tableServie({ feuilles, classes, osSombre: true });
    const clair = tableServie({ feuilles, classes, osSombre: false });
    const servies = new Set([...Object.keys(sombre), ...Object.keys(clair)]);
    verifieQueLaTableAEteVue(feuilles, classes, servies);
    return [...servies]
      .filter((propriete) => sombre[propriete] !== clair[propriete])
      .map((propriete) => ({
        classe: classes.join(' ') || '(aucune)',
        propriete,
        sombre: sombre[propriete] ?? null,
        clair: clair[propriete] ?? null,
      }));
  });

// --- le rapport --------------------------------------------------------------

export const audit = ({ racineJetons }) => ({
  orphelins: jetonsOrphelins(racineJetons),
  contrastes: contrastesInsuffisants(racineJetons),
  ordres: plansDesordonnes(racineJetons),
  focus: focusInvisibles(racineJetons),
  suivis: suivisDeLOS(feuillesDepuis(racineJetons, 'tokens.css')),
});

const bloc = (titre, remede, entrees, ligneDe) =>
  entrees.length === 0 ? [] : [titre, ...entrees.map(ligneDe), `  → ${remede}`, ''];

export const formateAudit = (rapport) => {
  const total =
    rapport.orphelins.length +
    rapport.contrastes.length +
    rapport.ordres.length +
    rapport.focus.length +
    rapport.suivis.length;
  return [
    ...bloc(
      'Jetons de schéma sans leur jumelle :',
      'un jeton de schéma se déclare dans dark.css ET light.css ; une valeur hors schéma va dans tokens.css.',
      rapport.orphelins,
      (e) => `  ${e.fichier}  ${e.jeton}  (absent de ${e.manque})`,
    ),
    ...bloc(
      'Paires sous le seuil de contraste :',
      'WCAG 1.4.3 (texte, 4,5:1) et 1.4.11 (contour de contrôle, pastille, 3:1) — corriger le jeton, pas la paire.',
      rapport.contrastes,
      (e) => `  ${e.schema}  ${e.encre} sur ${e.fond} = ${e.rapport ?? 'non résolu'} (< ${e.seuil})`,
    ),
    ...bloc(
      'Plans de surface mal ordonnés :',
      "du plus enfoncé au plus surélevé, la luminance croît STRICTEMENT — « surélevé » ne se peint pas en creux.",
      rapport.ordres,
      (e) => `  ${e.schema}  ${e.plan} n'est pas plus clair que ${e.dessous}`,
    ),
    ...bloc(
      'Fonds sur lesquels AUCUN des deux anneaux de focus ne se voit :',
      'un anneau ET son contre-anneau ; pour chaque fond, au moins un des deux doit tenir 3:1 (WCAG 1.4.11) — ' +
        'corriger le COUPLE, pas le fond.',
      rapport.focus,
      (e) => `  ${e.schema}  sur ${e.fond}, le meilleur des deux anneaux = ${e.meilleur ?? 'non résolu'} (< ${SIGNAL})`,
    ),
    ...bloc(
      "Propriétés servies qui changent avec le schéma de l'OS :",
      'prefers-color-scheme ne gouverne QUE la valeur par défaut de la CLASSE, jamais une valeur servie.',
      rapport.suivis,
      (e) =>
        `  classe ${e.classe}  ${e.propriete} = ${e.sombre ?? 'absent'} sous OS sombre, ${e.clair ?? 'absent'} sous OS clair`,
    ),
    total === 0
      ? 'jetons: parité des schémas, contrastes et élévations tenus, aucun jeton ne bascule tout seul.'
      : `jetons: ${total} défaut(s).`,
  ].join('\n');
};

export const verdict = (rapport) =>
  rapport.orphelins.length +
    rapport.contrastes.length +
    rapport.ordres.length +
    rapport.focus.length +
    rapport.suivis.length ===
  0
    ? 0
    : 1;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rapport = audit({ racineJetons: RACINE });
  process.stdout.write(
    process.argv.includes('--json') ? `${JSON.stringify(rapport, null, 1)}\n` : `${formateAudit(rapport)}\n`,
  );
  process.exit(verdict(rapport));
}
