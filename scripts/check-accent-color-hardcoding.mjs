#!/usr/bin/env node
// Cliquet de dette des couleurs en dur hors Theme, côté iOS (#3678, seconde
// moitié de son critère de fin).
//
// LE DÉFAUT QU'IL FERME
//
// La règle produit (CLAUDE.md § « Conversation Accent Color ») est que TOUT
// composant lié au contexte d'une conversation utilise `accentColor` /
// `colorPalette`, jamais une couleur en dur — les couleurs sémantiques
// (erreur, succès) restant statiques via `MeeshyColors`. #3678 mesurait
// 583 appels `Color(hex:)` hors `Theme/` au 2026-08-26 : un contournement
// massif de la règle, sans aucun garde pour l'empêcher de grossir.
//
// CE QU'IL NE FAIT PAS
//
// Il ne distingue pas un contournement de la règle d'accent (illégitime) d'un
// usage de couleur sémantique statique (légitime — `MeeshyColors` elle-même
// appelle `Color(hex:)` en interne) : cette classification est une revue au
// cas par cas, hors de portée d'un cliquet mécanique. Il rend seulement le
// VOLUME visible en continu, sur le modèle des cliquets de dette déjà en
// place (`check-swift-catalog-dead-entries.mjs`) : il échoue si le compte
// grossit sans qu'on l'ait décidé, et il échoue aussi si le compte baisse
// sans que la référence ne suive dans le MÊME commit — sinon une régression
// future repasserait sous une référence périmée sans qu'aucun garde ne la
// voie.
//
// MÉTHODOLOGIE
//
// 1. Recherche tous les fichiers `.swift` sous les racines client (SDK + app
//    iOS + ses extensions), à l'exclusion des répertoires de TESTS (`Tests`,
//    `MeeshyTests`, `MeeshyUIDeviceTests` — un usage qui n'existe que dans un
//    test ne pèse pas sur l'app livrée) et des répertoires `Theme` eux-mêmes
//    (`packages/MeeshySDK/Sources/{MeeshySDK,MeeshyUI}/Theme` — c'est là que
//    `Color(hex:)` DOIT vivre, en tant qu'implémentation de la palette ; le
//    compter là ferait rougir le garde chaque fois qu'on l'agrandit
//    correctement).
// 2. Compte les OCCURRENCES littérales de `Color(hex:` (pas les fichiers) :
//    un fichier qui accumule cinq appels au lieu d'un est une régression cinq
//    fois plus grosse qu'un fichier qui en gagne un seul, et un compte par
//    fichier l'aurait masquée.
// 3. Cliquet à DEUX SENS, même patron que les cliquets de catalogue : il
//    échoue si le compte DÉPASSE la référence enregistrée (régression — une
//    couleur en dur de plus qu'on a cessé de remarquer), et il échoue aussi
//    si le compte BAISSE sans que la référence ne soit abaissée dans le même
//    commit (amélioration non enregistrée).
//
// --self-test : vérifie le comptage (fonction pure, sur un monde en mémoire)
// et le cliquet à deux sens, même patron que `check-swift-catalog-dead-entries.mjs`
// (qui ne rejoue pas non plus son propre parcours de fichiers réel en
// self-test — seule sa logique de décision l'est). Un cliquet qui n'a jamais
// été vu échouer sur les deux formes de dérive n'est pas un garde (leçon de
// #5366/#4764).
//
// Référence initiale : 957 occurrences, mesurées par CE script au
// 2026-09-08 (méthodologie propre à ce script — #3678 en mesurait 583 avec
// une méthode non tracée ailleurs ; la référence ci-dessous est ancrée sur ce
// script, pas sur la mesure manuelle de l'issue).
// Réancrée à 945 le 2026-09-09 : la référence de 956 comptait ONZE mentions
// qui n'étaient que des COMMENTAIRES. Ce n'est pas une amélioration du code —
// c'est la même dette, mesurée juste. Le cliquet compte désormais des USAGES.
const BASELINE_HARDCODED_COLOR_COUNT = 945;

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEARCH_ROOTS = [
  'packages/MeeshySDK/Sources',
  'apps/ios/Meeshy',
  'apps/ios/MeeshyNotificationExtension',
  'apps/ios/MeeshyContextMenu',
  'apps/ios/MeeshyShareExtension',
  'apps/ios/MeeshyWidgets',
];

const EXCLUDED_DIR_NAMES = new Set(['Tests', 'MeeshyTests', 'MeeshyUIDeviceTests', 'Theme']);

const HARDCODED_COLOR_RE = /Color\(hex:/g;

export const listSwiftFiles = (absRoot, relRoot) => {
  const out = [];
  const walk = (absDir, relDir) => {
    let names;
    try {
      names = readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (EXCLUDED_DIR_NAMES.has(name)) continue;
      const absPath = join(absDir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;
      const st = statSync(absPath);
      if (st.isDirectory()) {
        walk(absPath, relPath);
      } else if (name.endsWith('.swift')) {
        out.push(relPath);
      }
    }
  };
  walk(absRoot, relRoot);
  return out;
};

// **Un COMMENTAIRE qui nomme `Color(hex:)` n'en est pas un usage.**
//
// Le 2026-09-09, ce cliquet a rougi sur `dev` — 957 contre 956 — pour un
// doc-comment. Le commit #5874 corrigeait un vrai défaut (`Color(hex:)` n'est
// pas faillible, son `?? repli` était donc MORT) et EXPLIQUAIT la correction
// juste au-dessus, en citant la fonction. Le compteur textuel a lu cette
// explication comme une couleur en dur de plus.
//
// Un garde qui punit la phrase qui le justifie apprend aux gens à ne plus
// écrire la phrase. Les commentaires sont donc retirés avant comptage — même
// geste que `AppSourceGuard.stripComments`, déjà employé par les gardes de
// source côté iOS.
export const stripSwiftComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Fonction pure : compte les occurrences dans un monde DÉJÀ LU (path →
// source), indépendamment du parcours de fichiers réel — c'est elle que
// --self-test exerce.
export const countHardcodedColors = (files) => {
  const perFile = [];
  let total = 0;
  for (const { path, source } of files) {
    const matches = stripSwiftComments(source).match(HARDCODED_COLOR_RE);
    if (matches && matches.length > 0) {
      perFile.push({ path, count: matches.length });
      total += matches.length;
    }
  }
  return { total, perFile };
};

export const readWorld = (root, roots) =>
  roots.flatMap((searchRoot) =>
    listSwiftFiles(join(root, searchRoot), searchRoot).map((relPath) => ({
      path: relPath,
      source: readFileSync(join(root, relPath), 'utf8'),
    })),
  );

const RESULT = Object.freeze({ OK: 'ok', REGRESSION: 'regression', UNRECORDED_IMPROVEMENT: 'unrecorded-improvement' });

export const evaluateRatchet = (count, baseline) => {
  if (count > baseline) return RESULT.REGRESSION;
  if (count < baseline) return RESULT.UNRECORDED_IMPROVEMENT;
  return RESULT.OK;
};

const selfTest = () => {
  const world = [
    { path: 'Sdk/Theme/Palette.swift', source: 'let a = Color(hex: "#FFFFFF")\nlet b = Color(hex: "#000000")' },
    { path: 'Sdk/Views/Card.swift', source: 'let c = Color(hex: "#123456")' },
    { path: 'App/Screen.swift', source: 'let e = Color(hex: "#ABCDEF")\nlet f = Color(hex: "#FEDCBA")' },
    { path: 'App/Empty.swift', source: 'struct Empty {}' },
    // Un doc-comment qui NOMME `Color(hex:)` — souvent pour expliquer
    // pourquoi on ne s'en sert PAS — ne compte pas ; la ligne de code qui
    // suit, si (#5883).
    {
      path: 'App/Documente.swift',
      source:
        '/// `Color(hex:)` n\'est PAS faillible : sur une chaîne illisible il rend du noir.\n' +
        '// second commentaire avec Color(hex: "#000000") dedans\n' +
        '/* bloc\n   Color(hex: "#111111")\n*/\n' +
        'let g = Color(hex: "#654321")',
    },
  ];
  // Le monde ne contient déjà que des fichiers RETENUS par listSwiftFiles
  // (l'exclusion Theme/Tests est un filtre de CHEMIN, testé par lecture du
  // code — `EXCLUDED_DIR_NAMES.has(name)` est une comparaison d'ensemble
  // triviale). Ce que ce garde doit prouver, c'est que son COMPTAGE est
  // juste sur ce qu'on lui donne à compter : 2 + 1 + 2 = 5, `Empty.swift`
  // absent du détail par fichier.
  const { total, perFile } = countHardcodedColors(world);
  if (total !== 6) {
    console.error(`AVEUGLE : total attendu 6, obtenu ${total}.`);
    return 1;
  }
  const documente = perFile.find((f) => f.path === 'App/Documente.swift');
  if (!documente || documente.count !== 1) {
    console.error(
      `AVEUGLE : un fichier dont TROIS mentions sur quatre sont en commentaire doit compter 1, obtenu ${JSON.stringify(documente)}.`,
    );
    return 1;
  }
  if (stripSwiftComments('// Color(hex: "#fff")\nlet a = 1').includes('Color(hex:')) {
    console.error('AVEUGLE : stripSwiftComments doit retirer un commentaire de ligne.');
    return 1;
  }
  if (perFile.length !== 4 || perFile.some((f) => f.path === 'App/Empty.swift')) {
    console.error(`AVEUGLE : un fichier sans occurrence ne doit pas figurer dans le détail, obtenu ${JSON.stringify(perFile)}.`);
    return 1;
  }
  const screen = perFile.find((f) => f.path === 'App/Screen.swift');
  if (!screen || screen.count !== 2) {
    console.error(`AVEUGLE : App/Screen.swift doit compter 2 occurrences, obtenu ${JSON.stringify(screen)}.`);
    return 1;
  }

  if (evaluateRatchet(957, 957) !== RESULT.OK) {
    console.error('AVEUGLE : un compte égal à la référence doit être OK.');
    return 1;
  }
  if (evaluateRatchet(958, 957) !== RESULT.REGRESSION) {
    console.error('AVEUGLE : une régression (+1 couleur en dur) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(956, 957) !== RESULT.UNRECORDED_IMPROVEMENT) {
    console.error('AVEUGLE : une amélioration non enregistrée (-1) doit être détectée.');
    return 1;
  }

  console.log('self-test : 8/8 vérifications passées (comptage par fichier, total, commentaires ignorés, cliquet à deux sens).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const { total, perFile } = countHardcodedColors(readWorld(REPO_ROOT, SEARCH_ROOTS));
  const verdict = evaluateRatchet(total, BASELINE_HARDCODED_COLOR_COUNT);

  if (verdict === RESULT.OK) {
    console.log(
      `Couleurs en dur hors Theme (iOS) : ${total} occurrence(s) de Color(hex:), conforme à la référence (${BASELINE_HARDCODED_COLOR_COUNT}).`,
    );
    return 0;
  }

  if (verdict === RESULT.REGRESSION) {
    const added = total - BASELINE_HARDCODED_COLOR_COUNT;
    console.error(
      `RÉGRESSION : ${total} occurrences de Color(hex:) hors Theme, ${added} de plus que la référence (${BASELINE_HARDCODED_COLOR_COUNT}).`,
    );
    console.error(
      "Un composant lié au contexte d'une conversation doit utiliser accentColor/colorPalette, jamais une couleur en dur " +
        '(CLAUDE.md § Conversation Accent Color) : remplacez le nouvel appel, ou documentez ici pourquoi il est légitime ' +
        '(couleur sémantique statique) et relevez BASELINE_HARDCODED_COLOR_COUNT dans ce script.',
    );
    console.error(
      `Fichiers les plus chargés : ${perFile
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((f) => `${f.path} (${f.count})`)
        .join(', ')}`,
    );
    return 1;
  }

  console.error(
    `AMÉLIORATION NON ENREGISTRÉE : ${total} occurrences de Color(hex:) hors Theme, en dessous de la référence (${BASELINE_HARDCODED_COLOR_COUNT}). ` +
      `Abaissez BASELINE_HARDCODED_COLOR_COUNT à ${total} dans ce script.`,
  );
  return 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
