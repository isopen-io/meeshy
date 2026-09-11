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
//
// #5883 — le comptage était TEXTUEL : `Color(hex:` matchait aussi bien un
// APPEL qu'un doc-comment qui le CITE pour expliquer un correctif voisin. Le
// commit 27ab5d1b (#5874) a fait rougir le garde en ajoutant une phrase qui
// justifiait sa propre correction, sans ajouter un seul usage réel — « un
// garde qui punit la phrase qui le justifie apprend aux gens à ne plus
// écrire la phrase ». Les commentaires sont désormais retirés AVANT comptage
// (`stripComments`, même machine à états que `AppSourceGuard.stripComments`
// côté Swift — quatre modes : code, littéral de chaîne, commentaire de
// ligne, commentaire de bloc). Effet de bord révélateur : la référence de
// 956 comptait ONZE mentions qui n'étaient que des commentaires ; elle est
// réancrée à 945, qui est le nombre d'usages RÉELS.
//
// 2026-09-10 (#6016) — 945 → 943. Deux usages sont partis avec le composer
// inline du fil : les vignettes `feedAttachmentTile` et `feedPlaceTile`
// peignaient chacune leur pastille en `Color(hex:)`. Le cliquet à DEUX SENS a
// exigé l'enregistrement, et c'est sa moitié la moins évidente qui a raison :
// une amélioration non consignée se laisse reperdre en silence au lot suivant.
const BASELINE_HARDCODED_COLOR_COUNT = 943;

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

// Port fidèle de `AppSourceGuard.stripComments` (apps/ios/MeeshyTests/Helpers/
// AppSourceGuard.swift), lui-même un port de `ComposerSourceGuard.stripComments`
// (SDK) — même machine à états, quatre modes : code, littéral de chaîne (avec
// échappements), commentaire de ligne `//…`, commentaire de bloc `/* … */`.
// Couper au premier `//` sans conscience des littéraux tronquerait une ligne
// contenant une URL `"https://…"` ; un stripper naïf laisserait un commentaire
// de bloc multi-ligne se refermer trop tôt. Fonction PURE, testée par
// --self-test.
export const stripComments = (source) => {
  const MODE = Object.freeze({ CODE: 'code', STRING: 'string', LINE_COMMENT: 'line', BLOCK_COMMENT: 'block' });
  let mode = MODE.CODE;
  let result = '';
  let escaped = false;
  let pendingSlash = false;
  let pendingStar = false;

  for (const character of source) {
    if (mode === MODE.CODE) {
      if (pendingSlash) {
        pendingSlash = false;
        if (character === '/') { mode = MODE.LINE_COMMENT; continue; }
        if (character === '*') { mode = MODE.BLOCK_COMMENT; continue; }
        result += '/';
      }
      if (character === '/') { pendingSlash = true; continue; }
      if (character === '"') { mode = MODE.STRING; }
      result += character;
      continue;
    }
    if (mode === MODE.STRING) {
      result += character;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') { mode = MODE.CODE; }
      continue;
    }
    if (mode === MODE.LINE_COMMENT) {
      if (character === '\n') { mode = MODE.CODE; result += character; }
      continue;
    }
    // MODE.BLOCK_COMMENT
    if (pendingStar && character === '/') {
      pendingStar = false;
      mode = MODE.CODE;
      continue;
    }
    pendingStar = character === '*';
    if (character === '\n') { result += character; }
  }
  if (pendingSlash && mode === MODE.CODE) { result += '/'; }
  return result;
};

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

// Fonction pure : compte les occurrences dans un monde DÉJÀ LU (path →
// source), indépendamment du parcours de fichiers réel — c'est elle que
// --self-test exerce.
export const countHardcodedColors = (files) => {
  const perFile = [];
  let total = 0;
  for (const { path, source } of files) {
    const matches = stripComments(source).match(HARDCODED_COLOR_RE);
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
    // #5883 — une mention en commentaire, PAS un usage. Un doc-comment de
    // ligne citant la fonction (comme 27ab5d1b l'a fait pour expliquer son
    // correctif) et un commentaire de bloc multi-ligne : aucun des deux ne
    // doit peser dans le compte.
    {
      path: 'App/DocOnly.swift',
      source: [
        '/// `Color(hex:)` n\'est PAS faillible : le `?? MeeshyColors.indigo400` qui',
        '/// suit est mort — voir Color(hex: "#000000") cité ici en exemple.',
        'struct DocOnly {',
        '  /* ancien code, retiré :',
        '     let g = Color(hex: "#111111")',
        '  */',
        '  let h = accentHex.isEmpty ? MeeshyColors.indigo400 : Color(hex: accentHex)', // ← seul usage RÉEL de ce fichier
        '}',
      ].join('\n'),
    },
  ];
  // Le monde ne contient déjà que des fichiers RETENUS par listSwiftFiles
  // (l'exclusion Theme/Tests est un filtre de CHEMIN, testé par lecture du
  // code — `EXCLUDED_DIR_NAMES.has(name)` est une comparaison d'ensemble
  // triviale). Ce que ce garde doit prouver, c'est que son COMPTAGE est
  // juste sur ce qu'on lui donne à compter : 2 + 1 + 2 + 1 = 6, `Empty.swift`
  // absent du détail par fichier — et `DocOnly.swift` n'y compte QUE son
  // unique usage réel, pas les trois mentions portées par ses commentaires.
  const { total, perFile } = countHardcodedColors(world);
  if (total !== 6) {
    console.error(`AVEUGLE : total attendu 6, obtenu ${total}.`);
    return 1;
  }
  if (perFile.length !== 4 || perFile.some((f) => f.path === 'App/Empty.swift')) {
    console.error(`AVEUGLE : un fichier sans occurrence ne doit pas figurer dans le détail, obtenu ${JSON.stringify(perFile)}.`);
    return 1;
  }
  const docOnly = perFile.find((f) => f.path === 'App/DocOnly.swift');
  if (!docOnly || docOnly.count !== 1) {
    console.error(
      `AVEUGLE : DocOnly.swift ne doit compter que son unique usage réel (les mentions en commentaire ne comptent pas), obtenu ${JSON.stringify(docOnly)}.`,
    );
    return 1;
  }
  // Un cliquet qui ne compte QUE le texte — la régression exacte de #5883 —
  // doit être distingué explicitement : rejouer le comptage textuel brut sur
  // DocOnly.swift doit rendre PLUS que le comptage conscient des commentaires.
  const textualDocOnlyMatches = world.find((f) => f.path === 'App/DocOnly.swift').source.match(HARDCODED_COLOR_RE);
  if (!textualDocOnlyMatches || textualDocOnlyMatches.length <= docOnly.count) {
    console.error('AVEUGLE : le monde de test ne distingue pas un comptage conscient des commentaires d\'un comptage textuel.');
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

  // stripComments elle-même, isolée de countHardcodedColors : une chaîne
  // contenant un `//` (URL) ne doit PAS être tronquée — c'est le piège que le
  // doc-comment de `AppSourceGuard.stripComments` nomme explicitement.
  const withUrl = stripComments('let url = "https://meeshy.me/x" // vrai commentaire\nlet n = 1');
  if (!withUrl.includes('"https://meeshy.me/x"') || withUrl.includes('vrai commentaire')) {
    console.error(`AVEUGLE : stripComments a tronqué un littéral contenant //, obtenu ${JSON.stringify(withUrl)}.`);
    return 1;
  }
  const withBlock = stripComments('let a = 1\n/* bloc\n   multi-ligne */\nlet b = 2');
  if (withBlock.includes('bloc') || !withBlock.includes('let a = 1') || !withBlock.includes('let b = 2')) {
    console.error(`AVEUGLE : stripComments n'a pas fermé un bloc multi-ligne, obtenu ${JSON.stringify(withBlock)}.`);
    return 1;
  }

  console.log('self-test : 9/9 vérifications passées (stripComments, comptage par fichier, total, cliquet à deux sens).');
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
