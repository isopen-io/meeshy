#!/usr/bin/env node
// Gate de BUDGET de bundle de apps/web-v3 [L-0.5] — conception § 8.3 et § 8.4.
//
//   cd apps/web-v3 && bun run build && node scripts/check-bundle-budget.mjs
//   node scripts/check-bundle-budget.mjs --json      # la même chose, pour une machine
//   node scripts/check-bundle-budget.mjs --ratchet   # ENREGISTRE les valeurs mesurées
//
// CE QU'IL COMPTE, ET CE QU'IL NE COMPTE PAS
//
// `app-build-manifest.json` ne contient pas que des pages. Un `next build`
// portant une seule page émet CINQ clés : `/(public)/stories/[id]/page`,
// `/_not-found/page`, `/not-found`, `/layout` et `/healthz/route`. Trois d'entre
// elles ne sont pas des routes qu'un navigateur demande :
//
//   `/route`      un gestionnaire de route — le runtime SERVEUR charge ses chunks,
//                 le navigateur n'en télécharge aucun. Le budgéter reviendrait à
//                 écrire que `/l/:token` pèse 250 Ko alors que son plafond est
//                 « 0 Ko — GATE » et qu'il le tient par construction.
//   `/layout`     l'entrée du layout : ses chunks SONT le socle. Le compter comme
//                 une page fausse l'intersection qui DÉFINIT socle et écran (§ 8.4).
//   `/not-found`  l'entrée du fichier `not-found.tsx`. La PAGE 404 est
//                 `/_not-found/page`, et elle porte les mêmes chunks : compter les
//                 deux compte le 404 deux fois.
//
// Le gate classe donc par NATURE, jamais par un suffixe unique — et une clé dont
// il ne sait rien sort en ANOMALIE, jamais en page silencieuse.
//
// POURQUOI LA CLÉ EST NORMALISÉE AVANT D'ÊTRE CLASSÉE
//
// Le § 3.1 impose les groupes `app/(public)/` et `app/(connected)/`. Next
// CONSERVE le segment de groupe dans la clé du manifeste (`/(public)/stories/[id]/page`)
// alors qu'il ne le sert JAMAIS dans l'URL (`/stories/abc`). Des motifs écrits
// contre l'URL — la seule forme qu'un humain reconnaît — ne réclameraient donc
// AUCUNE page réelle : chaque écran de la v3 sortirait en anomalie rc=2, et comme
// `bun run build` appelle ce gate, le premier écran casserait le build en
// accusant son auteur de ne pas avoir déclaré un budget qu'il a déclaré.
// `normaliseRoute` retire les segments `(…)` AVANT tout classement ; la route
// AFFICHÉE reste la clé réelle, pour qu'on la retrouve dans le manifeste.
//
// POURQUOI TROIS LIGNES PAR GROUPE — ET CE QUE LA TROISIÈME VAUT À UNE SEULE PAGE
//
// § 8.4 : « un dépassement doit DÉSIGNER UN COUPABLE ». Un chiffre unique par
// route ne le fait pas — un socle qui grossit de 20 Ko et un écran qui maigrit de
// 20 Ko rendent la même somme. Le socle est donc ce que TOUTES les pages du
// groupe chargent, l'écran est le reste.
//
// Mais un socle se mesure en COMPARANT des pages entre elles : avec UNE SEULE
// page, l'intersection est trivialement l'ensemble de ses propres chunks, donc
// 100 % du poids tombe dans « socle » et l'écran rend 0 Ko. Or `socle_ko` est
// justement le plafond « À ÉTABLIR » (non comparé) et `ecran_ko` le plafond
// CIBLE de 95 Ko : un écran de 300 Ko se serait rendu « socle: 300 Ko (non
// comparé) | écran: 0 Ko (sous 95 Ko) », verdict VERT. C'est le cas que produit
// la PREMIÈRE page réelle de la v3. Un groupe de moins de deux pages rend donc
// `socle_ko: null` (indéterminé, écrit tel quel) et impute le poids ENTIER à
// l'écran, où le plafond mord.
//
// POURQUOI UNE PAGE SANS MOTIF EST UNE ANOMALIE, PAS UN DÉFAUT SILENCIEUX
//
// Un groupe attrape-tout ferait entrer chaque écran neuf dans un budget que
// personne n'a écrit pour lui : le gate serait vert le jour où il devrait rougir.
// Une page qu'aucun motif ne réclame — ou que deux réclament avec la même
// précision — sort donc en rc=2, et l'auteur de l'écran doit déclarer son budget.
//
// POURQUOI UN RATCHET, ET CE QU'IL INTERDIT EXACTEMENT
//
// § 8.3 attache au statut CIBLE un ratchet : « jusque-là le gate enregistre la
// valeur mesurée et interdit toute régression ». Sans lui, aucune commande ne
// peut rougir sur un poids tant que `budgets.json` ne porte aucun plafond GATE —
// un écran pourrait doubler sans qu'un seul témoin tombe.
//
// Le ratchet livré n'interdit pas la CROISSANCE (un écran neuf pèse plus que pas
// d'écran : un ratchet strictement décroissant bloquerait tout L1) : il interdit
// la croissance SILENCIEUSE. Toute valeur au-dessus de celle enregistrée dans
// `budgets-mesures.json` rend rc=1 ; la faire monter exige `--ratchet` et un
// diff commité, donc relu.

import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  groupeDe,
  lireEntrees,
  natureDeRoute,
  plafondDeRoute,
} from './lib/routes-emises.mjs';

const KO = 1024;

const dixieme = (nombre) => Math.round(nombre * 10) / 10;

const ko = (octets) => dixieme(octets / KO);

// La lecture du manifeste et la reconnaissance de groupe vivent dans `lib/routes-emises.mjs` :
// le gate axe du § 8.5 pose les mêmes questions, et un exécutable — celui-ci, avec son `main` —
// ne se laisse pas charger par un harnais qui transpile ses entrées en CommonJS.
export {
  natureDeRoute,
  estGestionnaireDeRoute,
  normaliseRoute,
  lireEntrees,
  groupeDe,
  plafondDeRoute,
} from './lib/routes-emises.mjs';

const p95 = (valeurs) => {
  if (valeurs.length === 0) return 0;
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.ceil(0.95 * tri.length) - 1)];
};

const ligneDeGroupe = (groupe, pages, tailleGzip) => {
  const octets = (chunks) => [...new Set(chunks)].reduce((somme, c) => somme + tailleGzip(c), 0);
  const totaux = pages.map((p) => ({ route: p.route, ko: ko(octets(p.chunks)) }));

  if (pages.length < 2) {
    const [seule] = totaux;
    return {
      groupe: groupe.id,
      ecrans: pages.length,
      socle_ko: null,
      socle_indetermine:
        'un socle se mesure en comparant des pages entre elles : le groupe n\'en porte qu\'une, son poids ENTIER est imputé à l\'écran',
      ecran_le_plus_lourd: seule,
      cumul_p95_ko: seule.ko,
      plafonds: groupe.plafonds,
    };
  }

  const communs = pages
    .map((p) => new Set(p.chunks))
    .reduce((a, b) => new Set([...a].filter((c) => b.has(c))));
  const socle = octets([...communs]);
  const ecrans = pages.map((p) => ({
    route: p.route,
    ko: ko(octets(p.chunks.filter((c) => !communs.has(c)))),
  }));
  const plusLourd = ecrans.reduce((a, b) => (b.ko > a.ko ? b : a));

  return {
    groupe: groupe.id,
    ecrans: pages.length,
    socle_ko: ko(socle),
    socle_indetermine: null,
    ecran_le_plus_lourd: plusLourd,
    cumul_p95_ko: p95(ecrans.map((e) => dixieme(ko(socle) + e.ko))),
    plafonds: groupe.plafonds,
  };
};

const franchissements = (ligne) =>
  [
    ['socle', ligne.socle_ko, ligne.plafonds.socle_ko],
    ['écran le plus lourd', ligne.ecran_le_plus_lourd.ko, ligne.plafonds.ecran_ko],
    ['cumul p95', ligne.cumul_p95_ko, ligne.plafonds.cumul_p95_ko],
  ]
    .filter(([, mesure, plafond]) => mesure !== null && plafond.valeur !== null && mesure > plafond.valeur)
    .map(([quoi, mesure, plafond]) => ({
      statut: plafond.statut,
      texte: `${ligne.groupe} ${quoi} : ${mesure} Ko > ${plafond.valeur} Ko (${plafond.statut})`,
    }));

const franchissementsDeRoute = (page, routes) => {
  const regle = plafondDeRoute(page.route, routes);
  const plafond = regle?.plafonds?.js_ko;
  if (!plafond || plafond.valeur === null || page.ko <= plafond.valeur) return [];
  return [
    {
      statut: plafond.statut,
      texte: `${page.route} : ${page.ko} Ko de JS > ${plafond.valeur} Ko (${plafond.statut} — ${regle.motifs.join(', ')})`,
    },
  ];
};

export const regressions = (lignes, mesuresEnregistrees) =>
  lignes.flatMap((ligne) => {
    const reference = mesuresEnregistrees?.groupes?.[ligne.groupe];
    if (!reference) return [];
    return [
      ['socle', ligne.socle_ko, reference.socle_ko],
      ['écran le plus lourd', ligne.ecran_le_plus_lourd.ko, reference.ecran_ko],
      ['cumul p95', ligne.cumul_p95_ko, reference.cumul_p95_ko],
    ]
      .filter(
        ([, mesure, enregistre]) =>
          typeof mesure === 'number' && typeof enregistre === 'number' && mesure > enregistre,
      )
      .map(
        ([quoi, mesure, enregistre]) =>
          `${ligne.groupe} ${quoi} : ${mesure} Ko > ${enregistre} Ko enregistré — RÉGRESSION (§ 8.3 ; relancer avec --ratchet pour l'assumer dans un diff)`,
      );
  });

export const mesuresDepuisLignes = (lignes) =>
  Object.fromEntries(
    lignes.map((l) => [
      l.groupe,
      { socle_ko: l.socle_ko, ecran_ko: l.ecran_le_plus_lourd.ko, cumul_p95_ko: l.cumul_p95_ko },
    ]),
  );

// LES MODULES QU'AUCUN CHUNK EXPÉDIÉ N'A LE DROIT DE PORTER — critère de fin de
// l'écran `home` : « CallManager absent du layout connecté (assertion sur
// app-build-manifest.json) ».
//
// Un composant P2 ne gouverne pas un gate P1. `CallManager` est une pile WebRTC
// (1350 lignes dans `apps/web`) : montée dans le layout connecté, elle serait
// payée par CHAQUE écran de la zone, tableau de bord compris — un écran qui
// n'appelle personne. Elle se monte à la réception d'un `call:incoming`, en
// import dynamique, ou pas du tout.
//
// La question se pose au MANIFESTE et non à un `grep` d'imports : un module
// entre aussi par un barrel, une réexportation ou une dépendance transitive,
// sans qu'aucun fichier de `app/` ne le nomme. Ce qui n'est dans aucun chunk
// expédié n'est monté nulle part.
//
// La comparaison porte sur un SEGMENT ENTIER du chemin de chunk, jamais sur une
// sous-chaîne : `calls_CallManagerHooks_tsx.js` est un AUTRE module, et un gate
// qui rougirait dessus se ferait désarmer au premier faux positif.
export const MODULES_INTERDITS = ['CallManager'];

const segmentsDuChunk = (chunk) => chunk.split(/[^A-Za-z0-9]+/).filter((segment) => segment !== '');

export const modulesExpedies = (entrees, interdits) =>
  entrees.flatMap((entree) =>
    [...new Set(entree.chunks)].flatMap((chunk) => {
      const segments = new Set(segmentsDuChunk(chunk));
      return interdits
        .filter((module) => segments.has(module))
        .map((module) => `${entree.route} expédie ${module} : ${chunk}`);
    }),
  );

export const composeRapport = ({
  entrees,
  groupes,
  routes,
  tailleGzip,
  mesuresEnregistrees,
  interdits = MODULES_INTERDITS,
}) => {
  const natures = entrees.map((e) => ({ ...e, nature: natureDeRoute(e.route) }));
  const pages = natures.filter((e) => e.nature === 'page');
  const classees = pages.map((p) => ({ ...p, ...groupeDe(p.route, groupes) }));

  const octetsDe = (chunks) => [...new Set(chunks)].reduce((s, c) => s + tailleGzip(c), 0);
  const poids = pages.map((p) => ({ route: p.route, ko: ko(octetsDe(p.chunks)) }));

  const anomalies = [
    ...classees
      .filter((p) => p.groupe === null)
      .map((p) =>
        p.ambigu.length
          ? `budget ambigu pour ${p.route} : réclamée par ${p.ambigu.join(' et ')} avec la même précision`
          : `${p.route} n'est réclamée par aucun motif de budgets.json`,
      ),
    ...natures
      .filter((e) => e.nature === 'inconnue')
      .map((e) => `${e.route} : entrée de manifeste de nature inconnue — ni page, ni gestionnaire, ni annexe`),
    ...modulesExpedies(entrees, interdits).map(
      (fait) => `${fait} — module interdit d'expédition (critère de fin de l'écran « home »)`,
    ),
  ];

  const lignes = groupes
    .map((g) => ({ g, pages: classees.filter((p) => p.groupe === g.id) }))
    .filter(({ pages: p }) => p.length > 0)
    .map(({ g, pages: p }) => ligneDeGroupe(g, p, tailleGzip));

  const tous = [
    ...lignes.flatMap(franchissements),
    ...poids.flatMap((p) => franchissementsDeRoute(p, routes)),
  ];

  return {
    routes: entrees.length,
    pages: pages.length,
    gestionnaires: natures.filter((e) => e.nature === 'gestionnaire').length,
    annexes: natures.filter((e) => e.nature === 'annexe').length,
    groupes: lignes,
    depassements: tous.filter((f) => f.statut === 'GATE').map((f) => f.texte),
    avertissements: tous.filter((f) => f.statut === 'CIBLE').map((f) => f.texte),
    regressions: regressions(lignes, mesuresEnregistrees),
    anomalies,
  };
};

const socleLisible = (ligne) =>
  ligne.socle_ko === null ? 'indéterminé (1 page)' : `${ligne.socle_ko} Ko`;

export const formateRapport = (rapport) =>
  [
    `routes émises : ${rapport.routes} (${rapport.pages} page(s), ${rapport.gestionnaires} gestionnaire(s) de route — 0 Ko de JS client, ${rapport.annexes} entrée(s) annexe(s) non routable(s))`,
    ...(rapport.groupes.length === 0
      ? ['aucune page budgétée : le squelette expédie 0 Ko de JS client']
      : rapport.groupes.map(
          (l) =>
            `${l.groupe.padEnd(12)} socle: ${socleLisible(l)}  |  écran le plus lourd: ${l.ecran_le_plus_lourd.ko} Ko (${l.ecran_le_plus_lourd.route})  |  cumul p95: ${l.cumul_p95_ko} Ko`,
        )),
    ...rapport.avertissements.map((a) => `! CIBLE dépassée — ${a}`),
    ...rapport.depassements.map((d) => `✗ GATE dépassé — ${d}`),
    ...rapport.regressions.map((r) => `✗ ${r}`),
    ...rapport.anomalies.map((a) => `✗ ${a}`),
  ].join('\n');

export const verdict = (rapport) =>
  rapport.depassements.length > 0 || rapport.regressions.length > 0
    ? 1
    : rapport.anomalies.length > 0
      ? 2
      : 0;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const tailleGzipSurDisque = (racineStatique) => {
  const cache = new Map();
  return (chunk) => {
    if (cache.has(chunk)) return cache.get(chunk);
    const chemin = join(racineStatique, chunk);
    const taille = existsSync(chemin) ? gzipSync(readFileSync(chemin), { level: 9 }).length : 0;
    cache.set(chunk, taille);
    return taille;
  };
};

const CHEMIN_MESURES = join(RACINE, 'budgets-mesures.json');

const lisMesures = () =>
  existsSync(CHEMIN_MESURES) ? JSON.parse(readFileSync(CHEMIN_MESURES, 'utf8')) : null;

const main = () => {
  const manifeste = join(RACINE, '.next', 'app-build-manifest.json');
  if (!existsSync(manifeste)) {
    process.stderr.write(
      `✗ ${manifeste} absent : lancer \`bun run build\` dans apps/web-v3 avant de mesurer un budget.\n`,
    );
    return 1;
  }

  const entrees = lireEntrees(readFileSync(manifeste, 'utf8'));
  if (entrees.length === 0) {
    process.stderr.write(
      "✗ next build n'a émis AUCUNE route : il n'y a rien à budgéter. Voir scripts/check-app-router-built.mjs.\n",
    );
    return 1;
  }

  const budgets = JSON.parse(readFileSync(join(RACINE, 'budgets.json'), 'utf8'));
  const enregistrees = lisMesures();
  const ratchet = process.argv.includes('--ratchet');
  const rapport = composeRapport({
    entrees,
    groupes: budgets.groupes,
    routes: budgets.routes,
    tailleGzip: tailleGzipSurDisque(join(RACINE, '.next')),
    mesuresEnregistrees: ratchet ? null : enregistrees,
  });

  process.stdout.write(
    process.argv.includes('--json')
      ? `${JSON.stringify(rapport, null, 1)}\n`
      : `${formateRapport(rapport)}\n`,
  );

  if (ratchet) {
    const contenu = {
      ...(enregistrees ?? {}),
      role:
        'Les valeurs MESURÉES de la v3 — jamais des plafonds (ceux-là vivent dans budgets.json). Ce fichier a PLUSIEURS producteurs : chaque section porte la commande qui la rejoue ; les clés ci-dessous (groupes) sont celles de check-bundle-budget.mjs. § 8.3 : tant qu’un plafond est CIBLE, le gate interdit toute croissance SILENCIEUSE — la faire monter exige ce fichier, donc un diff relu.',
      produit_par: 'cd apps/web-v3 && bun run build && node scripts/check-bundle-budget.mjs --ratchet',
      date: new Date().toISOString().slice(0, 10),
      groupes: mesuresDepuisLignes(rapport.groupes),
    };
    writeFileSync(CHEMIN_MESURES, `${JSON.stringify(contenu, null, 1)}\n`);
    process.stderr.write(`→ valeurs enregistrées dans ${CHEMIN_MESURES}\n`);
  }

  return verdict(rapport);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
