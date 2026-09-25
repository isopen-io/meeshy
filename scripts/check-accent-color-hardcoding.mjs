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
// appelle `Color(hex:)` en interne) : cette classification reste, pour la
// forme VARIABLE inconnue, une revue au cas par cas, hors de portée d'un
// cliquet mécanique. Il rend seulement le VOLUME visible en continu, sur le
// modèle des cliquets de dette déjà en place (`check-swift-catalog-dead-entries.mjs`) :
// il échoue si un compte grossit sans qu'on l'ait décidé, et il échoue aussi
// si un compte baisse sans que sa référence ne suive dans le MÊME commit —
// sinon une régression future repasserait sous une référence périmée sans
// qu'aucun garde ne la voie.
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
// 2. Pour chaque appel `Color(hex: …)` trouvé (après retrait des commentaires,
//    §5883), lit l'ARGUMENT jusqu'à sa virgule ou parenthèse fermante de
//    niveau zéro (`parseColorHexArgument` — un mini-analyseur, pas une regex,
//    pour rester correct sur les appels imbriqués comme
//    `Color(hex: LanguageDisplay.colorHex(for: code))`) et le classe en trois
//    FORMES (#6511) :
//      - `literal`   : `Color(hex: "#RRGGBB")` — le codage en dur que le garde
//        annonce. C'est la SEULE forme qui compte pour le cliquet historique.
//      - `admitted-variable` : l'argument est (ou se termine par) exactement
//        `accentColor` ou `colorPalette.primary` / `.secondary` / `.accent` —
//        les deux points d'accès que CLAUDE.md § Accent Color documente. Ces
//        appels sont l'APPLICATION de la règle, jamais son contournement ; ils
//        ne pèsent sur AUCUN cliquet, à dessein — en ajouter ne doit jamais
//        faire rougir un garde qui prétend défendre cette règle.
//      - `unknown-variable` : toute autre variable/expression (`color`,
//        `contactColor`, `tag.color`, `resolvedAccent`, `MeeshyColors.foo`…).
//        Ni prouvée conforme ni prouvée en dur : elle reste sous un second
//        cliquet, séparé, pour rester visible sans prétendre la classer.
// 3. Deux cliquets à DEUX SENS indépendants, même patron que
//    `check-swift-catalog-dead-entries.mjs` : chacun échoue si son compte
//    DÉPASSE sa référence (régression) et échoue aussi si son compte BAISSE
//    sans que sa référence ne soit abaissée dans le même commit (amélioration
//    non enregistrée).
//
// --self-test : vérifie le comptage (fonctions pures, sur un monde en
// mémoire), la classification à trois formes et les deux cliquets à deux
// sens, même patron que `check-swift-catalog-dead-entries.mjs` (qui ne rejoue
// pas non plus son propre parcours de fichiers réel en self-test — seule sa
// logique de décision l'est). Un cliquet qui n'a jamais été vu échouer sur les
// deux formes de dérive n'est pas un garde (leçon de #5366/#4764).
//
// #5883 — le comptage était TEXTUEL : `Color(hex:` matchait aussi bien un
// APPEL qu'un doc-comment qui le CITE pour expliquer un correctif voisin. Le
// commit 27ab5d1b (#5874) a fait rougir le garde en ajoutant une phrase qui
// justifiait sa propre correction, sans ajouter un seul usage réel — « un
// garde qui punit la phrase qui le justifie apprend aux gens à ne plus
// écrire la phrase ». Les commentaires sont désormais retirés AVANT comptage
// (`stripComments`, même machine à états que `AppSourceGuard.stripComments`
// côté Swift — quatre modes : code, littéral de chaîne, commentaire de
// ligne, commentaire de bloc).
//
// 2026-09-10 (#6016) — 945 → 943. Deux usages sont partis avec le composer
// inline du fil : les vignettes `feedAttachmentTile` et `feedPlaceTile`
// peignaient chacune leur pastille en `Color(hex:)`.
// 2026-09-14 (#6481, lot « Réglages en verre ») — 943 → 946 (référence
// textuelle, avant #6511). Trois usages neufs, tous de la forme
// `Color(hex: accentColor)` dans `VoiceProfileManageView` (5 → 7) et
// `VoiceProfileWizardView` (9 → 10) : la flèche de retour en verre prend la
// teinte de la conversation — l'application de la règle, pas son
// contournement.
//
// 2026-09-14 (#6511) — LE CLIQUET COMPTAIT L'APPEL, PAS LE CODAGE EN DUR. Sur
// les 946 occurrences textuelles, l'estimation manuelle de l'issue (grep sur
// `Color(hex: "`, sans retrait des commentaires) situait le littéral à ~163 ;
// les 836 autres passaient une variable, la plupart de la forme
// `Color(hex: accentColor)` ci-dessus — exactement ce que la règle exige. Un
// vrai littéral neuf ne déplaçait donc le compte que de 1 sur 946, aussi
// discrètement qu'un usage légitime : le cliquet ne discriminait plus.
// Corrigé en classant chaque appel (littéral / variable admise / variable
// inconnue, §MÉTHODOLOGIE), par un ANALYSEUR conscient des commentaires
// (§5883) et des appels imbriqués — pas une regex sur le texte brut. Le
// relevé PRÉCIS diffère donc de l'estimation manuelle : 118 littéraux réels
// (les autres occurrences de `Color(hex: "` que le grep de l'issue voyait
// n'étaient que des mentions en commentaire, déjà hors compte depuis #5883),
// 383 variables admises (hors cliquet, §MÉTHODOLOGIE) et 445 variables
// inconnues. Le cliquet historique ne porte donc plus que sur les littéraux,
// réancré à leur compte réel ; les variables inconnues restent sous un second
// cliquet, séparé, sans prétendre les classer une à une — cette
// classification reste une revue humaine, hors de portée d'un script.
//
// 2026-09-14 (#6482) — variables inconnues 445 → 444. La section Bêta de
// Réglages part avec son interrupteur : `Color(hex: MeeshyColors.successHex)`
// quitte `SettingsView`. Aucun littéral ne bouge (118).
//
// 2026-09-16 (#6793, relevé par #6802) — variables inconnues 444 → 445. UN
// seul appel neuf : la pastille de réactions d'une pièce jointe arrive sur la
// rangée focale, et `FocalAttachmentBlock` la teinte par son `accentHex`.
// L'argument EST l'accent de la conversation : la vue le reçoit de ses
// appelants (`BubbleStandardLayout+Media.swift` lui passe le `contactColor`
// de la bulle) et le relaie elle-même sous le label `accentColor:` à ses
// sous-vues. C'est l'application de la règle, pas son contournement.
//
// Pourquoi RELEVER plutôt que renommer, puisque le §ADMITTED refuse la
// ressemblance : `accentHex` n'est pas un à-peu-près d'`accentColor`, c'est
// une convention ÉTABLIE de l'app — la CHAÎNE hexadécimale, par opposition à
// la COULEUR. `CallDetailSheet` tient les deux côte à côte, `accentHex:
// String` puis `accentColor: Color` dérivée de la première. Renommer aurait
// cassé ce vocabulaire ; interposer une propriété calculée aurait DÉPLACÉ
// l'appel sans le supprimer (solde nul), c'est-à-dire contourné le garde au
// lieu de lui répondre. Le §ADMITTED reste donc volontairement étroit, et
// c'est bien ici — dans le registre daté qu'il exige — que l'appel se
// justifie. Aucun littéral ne bouge (118).
//
// 2026-09-25 (#7977, Refs #7881) — variables inconnues 433 → 434. UN seul
// appel neuf : `FocalQuoteRail`, le filet de citation désormais PARTAGÉ par
// toutes les citations de Script et de Focal (porteur, 2026-09-25), carte de
// story comprise. Sa couleur EST la règle : l'accent de la conversation
// (`accentHex`) quand la citation est de moi, sinon la couleur d'auteur que
// le SDK a déjà résolue (`ReplyReference.authorColor`). La propriété s'appelle
// `colorHex` parce qu'elle porte l'un OU l'autre ; la nommer `accentColor`
// mentirait sur la moitié des cas. Même raisonnement que #6793 ci-dessus :
// relever plutôt que déplacer l'appel. Aucun littéral ne bouge (118).
const REFERENCE_LITERAL_COLOR_COUNT = 118;
const REFERENCE_UNKNOWN_VARIABLE_COLOR_COUNT = 434;

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEARCH_ROOTS = [
  'packages/MeeshySDK/Sources',
  'apps/ios/Meeshy',
  'apps/ios/MeeshyNotificationExtension',
  'apps/ios/MeeshyShareExtension',
  'apps/ios/MeeshyWidgets',
];

const EXCLUDED_DIR_NAMES = new Set(['Tests', 'MeeshyTests', 'MeeshyUIDeviceTests', 'Theme']);

const HARDCODED_COLOR_RE = /Color\(hex:/g;

// Les deux points d'accès que CLAUDE.md § Conversation Accent Color documente
// ( `conversation.accentColor`, `conversation.colorPalette` avec
// `.primary`/`.secondary`/`.accent` ) : un argument qui EST, ou se TERMINE
// par, l'un de ces chemins est l'application de la règle, jamais son
// contournement. Volontairement étroit — élargir cette liste par ressemblance
// (`accentHex`, `resolvedAccent`…) redeviendrait la revue au cas par cas que
// ce garde ne peut pas faire.
const ADMITTED_ACCENT_ARGUMENTS = [
  'accentColor',
  'colorPalette.primary',
  'colorPalette.secondary',
  'colorPalette.accent',
];

export const isAdmittedAccentArgument = (argumentText) => {
  const normalized = argumentText.trim();
  return ADMITTED_ACCENT_ARGUMENTS.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
};

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

// Lit l'ARGUMENT d'un appel `Color(hex: …)` à partir de `start` (juste après
// `Color(hex:`), sur du source DÉJÀ débarrassé de ses commentaires. Un
// littéral de chaîne est reconnu par sa guillemet ouvrante et lu jusqu'à sa
// fermeture (échappements gérés) ; toute autre forme est lue jusqu'à la
// première virgule ou parenthèse fermante de PROFONDEUR ZÉRO — en comptant la
// profondeur des parenthèses/crochets/accolades imbriqués (et en sautant les
// chaînes imbriquées comme des blocs opaques) pour rester correct sur un appel
// tel que `Color(hex: LanguageDisplay.colorHex(for: code))`, où la première
// parenthèse fermante NE clôt PAS l'appel `Color(hex:`.
export const parseColorHexArgument = (source, start) => {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i++;

  if (source[i] === '"') {
    let j = i + 1;
    while (j < source.length) {
      if (source[j] === '\\') { j += 2; continue; }
      if (source[j] === '"') { j++; break; }
      j++;
    }
    return { kind: 'literal', text: source.slice(i, j) };
  }

  let depth = 0;
  let j = i;
  while (j < source.length) {
    const c = source[j];
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth--; j++; continue;
    }
    if (c === '"') {
      j++;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '"') { j++; break; }
        j++;
      }
      continue;
    }
    if (c === ',' && depth === 0) break;
    j++;
  }
  return { kind: 'variable', text: source.slice(i, j).trim() };
};

// Classe chaque appel `Color(hex:` d'un monde DÉJÀ LU (path → source) en
// trois formes (littéral / variable admise / variable inconnue, §MÉTHODOLOGIE)
// — fonction pure, indépendante du parcours de fichiers réel, exercée par
// --self-test.
export const classifyColorHexOccurrences = (files) => {
  let literalTotal = 0;
  let admittedVariableTotal = 0;
  let unknownVariableTotal = 0;
  const perFileLiteral = [];
  const perFileUnknownVariable = [];

  for (const { path, source } of files) {
    const stripped = stripComments(source);
    let literalCount = 0;
    let unknownCount = 0;

    HARDCODED_COLOR_RE.lastIndex = 0;
    let match;
    while ((match = HARDCODED_COLOR_RE.exec(stripped)) !== null) {
      const argument = parseColorHexArgument(stripped, match.index + match[0].length);
      if (argument.kind === 'literal') {
        literalCount++;
        continue;
      }
      if (isAdmittedAccentArgument(argument.text)) {
        admittedVariableTotal++;
        continue;
      }
      unknownCount++;
    }

    if (literalCount > 0) { perFileLiteral.push({ path, count: literalCount }); literalTotal += literalCount; }
    if (unknownCount > 0) { perFileUnknownVariable.push({ path, count: unknownCount }); unknownVariableTotal += unknownCount; }
  }

  return { literalTotal, admittedVariableTotal, unknownVariableTotal, perFileLiteral, perFileUnknownVariable };
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

const reportRatchet = (label, count, baseline, perFile, constantName) => {
  const verdict = evaluateRatchet(count, baseline);
  if (verdict === RESULT.OK) {
    console.log(`${label} : ${count} occurrence(s), conforme à la référence (${baseline}).`);
    return true;
  }
  if (verdict === RESULT.REGRESSION) {
    const added = count - baseline;
    console.error(`RÉGRESSION — ${label} : ${count} occurrence(s), ${added} de plus que la référence (${baseline}).`);
    console.error(
      `Remplacez le nouvel appel par accentColor/colorPalette (CLAUDE.md § Conversation Accent Color), ` +
        `ou documentez ici pourquoi il est légitime et relevez ${constantName} dans ce script.`,
    );
    if (perFile.length > 0) {
      console.error(
        `Fichiers les plus chargés : ${perFile
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map((f) => `${f.path} (${f.count})`)
          .join(', ')}`,
      );
    }
    return false;
  }
  console.error(
    `AMÉLIORATION NON ENREGISTRÉE — ${label} : ${count} occurrence(s), en dessous de la référence (${baseline}). ` +
      `Abaissez ${constantName} à ${count} dans ce script.`,
  );
  return false;
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
        '  let h = accentHex.isEmpty ? MeeshyColors.indigo400 : Color(hex: accentHex)', // ← seul usage RÉEL de ce fichier (variable INCONNUE)
        '}',
      ].join('\n'),
    },
    // #6511 — les trois FORMES : littéral (déjà couvert ci-dessus), variable
    // ADMISE (l'application de la règle CLAUDE.md, ne doit peser sur AUCUN
    // cliquet) et variable INCONNUE (ni prouvée conforme ni prouvée en dur).
    {
      path: 'App/AccentUsage.swift',
      source: [
        'struct AccentUsage: View {',
        '  var body: some View {',
        '    VStack {',
        '      Rectangle().fill(Color(hex: accentColor))', // variable ADMISE (nom exact)
        '      Rectangle().fill(Color(hex: conversation.accentColor))', // variable ADMISE (chemin se terminant par accentColor)
        '      Rectangle().fill(Color(hex: conversation.colorPalette.primary))', // variable ADMISE (colorPalette.primary)
        '      Rectangle().fill(Color(hex: contactColor))', // variable INCONNUE
        '      Rectangle().fill(Color(hex: LanguageDisplay.colorHex(for: code)))', // variable INCONNUE, appel imbriqué
        '    }',
        '  }',
        '}',
      ].join('\n'),
    },
  ];
  // Le monde ne contient déjà que des fichiers RETENUS par listSwiftFiles
  // (l'exclusion Theme/Tests est un filtre de CHEMIN, testé par lecture du
  // code — `EXCLUDED_DIR_NAMES.has(name)` est une comparaison d'ensemble
  // triviale). Ce que ce garde doit prouver, c'est que son COMPTAGE et sa
  // CLASSIFICATION sont justes sur ce qu'on lui donne à compter.
  const {
    literalTotal,
    admittedVariableTotal,
    unknownVariableTotal,
    perFileLiteral,
    perFileUnknownVariable,
  } = classifyColorHexOccurrences(world);

  // Littéraux : 2 + 1 + 2 = 5 (Palette, Card, Screen) — DocOnly et
  // AccentUsage n'en portent aucun.
  if (literalTotal !== 5) {
    console.error(`AVEUGLE : total littéral attendu 5, obtenu ${literalTotal}.`);
    return 1;
  }
  if (perFileLiteral.length !== 3 || perFileLiteral.some((f) => f.path === 'App/Empty.swift')) {
    console.error(`AVEUGLE : un fichier sans littéral ne doit pas figurer dans le détail, obtenu ${JSON.stringify(perFileLiteral)}.`);
    return 1;
  }
  const docOnlyLiteral = perFileLiteral.find((f) => f.path === 'App/DocOnly.swift');
  if (docOnlyLiteral) {
    console.error(
      `AVEUGLE : DocOnly.swift n'a aucun littéral RÉEL (son unique usage réel est une variable) — les mentions en commentaire ne comptent pas, obtenu ${JSON.stringify(docOnlyLiteral)}.`,
    );
    return 1;
  }

  // Un cliquet qui ne compte QUE le texte — la régression exacte de #5883 —
  // doit être distingué explicitement : rejouer le comptage textuel brut sur
  // DocOnly.swift doit rendre PLUS que son unique usage réel.
  const textualDocOnlyMatches = world.find((f) => f.path === 'App/DocOnly.swift').source.match(HARDCODED_COLOR_RE);
  if (!textualDocOnlyMatches || textualDocOnlyMatches.length <= 1) {
    console.error('AVEUGLE : le monde de test ne distingue pas un comptage conscient des commentaires d\'un comptage textuel.');
    return 1;
  }

  // Variables ADMISES (#6511) : les trois formes de AccentUsage.swift —
  // aucune ne doit peser sur un cliquet.
  if (admittedVariableTotal !== 3) {
    console.error(`AVEUGLE : total de variables admises attendu 3, obtenu ${admittedVariableTotal}.`);
    return 1;
  }
  if (!isAdmittedAccentArgument('accentColor') || !isAdmittedAccentArgument('conversation.accentColor')) {
    console.error('AVEUGLE : accentColor (nu ou qualifié) doit être une variable admise.');
    return 1;
  }
  if (!isAdmittedAccentArgument('conversation.colorPalette.primary')) {
    console.error('AVEUGLE : colorPalette.primary (qualifié) doit être une variable admise.');
    return 1;
  }
  if (isAdmittedAccentArgument('accentHex') || isAdmittedAccentArgument('resolvedAccent')) {
    console.error('AVEUGLE : un nom qui ne fait QUE ressembler à accentColor (accentHex, resolvedAccent) ne doit pas être admis — la ressemblance n\'est pas l\'identité.');
    return 1;
  }

  // Variables INCONNUES (#6511) : DocOnly (1, `accentHex`) + AccentUsage (2,
  // `contactColor` et l'appel imbriqué) = 3.
  if (unknownVariableTotal !== 3) {
    console.error(`AVEUGLE : total de variables inconnues attendu 3, obtenu ${unknownVariableTotal}.`);
    return 1;
  }
  const docOnlyUnknown = perFileUnknownVariable.find((f) => f.path === 'App/DocOnly.swift');
  if (!docOnlyUnknown || docOnlyUnknown.count !== 1) {
    console.error(`AVEUGLE : DocOnly.swift doit compter 1 variable inconnue (accentHex), obtenu ${JSON.stringify(docOnlyUnknown)}.`);
    return 1;
  }
  const accentUsageUnknown = perFileUnknownVariable.find((f) => f.path === 'App/AccentUsage.swift');
  if (!accentUsageUnknown || accentUsageUnknown.count !== 2) {
    console.error(
      `AVEUGLE : AccentUsage.swift doit compter 2 variables inconnues (contactColor, l'appel imbriqué), obtenu ${JSON.stringify(accentUsageUnknown)}.`,
    );
    return 1;
  }

  // Analyseur d'argument : un appel imbriqué (`Color(hex: LanguageDisplay.colorHex(for: code))`)
  // ne doit pas se refermer sur la première parenthèse rencontrée.
  const nestedArgument = parseColorHexArgument('Color(hex: LanguageDisplay.colorHex(for: code))', 'Color(hex:'.length);
  if (nestedArgument.kind !== 'variable' || nestedArgument.text !== 'LanguageDisplay.colorHex(for: code)') {
    console.error(`AVEUGLE : l'analyseur d'argument a mal géré un appel imbriqué, obtenu ${JSON.stringify(nestedArgument)}.`);
    return 1;
  }

  // Les deux cliquets, chacun à DEUX SENS, indépendamment.
  if (evaluateRatchet(163, 163) !== RESULT.OK) {
    console.error('AVEUGLE : un compte littéral égal à la référence doit être OK.');
    return 1;
  }
  if (evaluateRatchet(164, 163) !== RESULT.REGRESSION) {
    console.error('AVEUGLE : une régression littérale (+1) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(162, 163) !== RESULT.UNRECORDED_IMPROVEMENT) {
    console.error('AVEUGLE : une amélioration littérale non enregistrée (-1) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(380, 380) !== RESULT.OK) {
    console.error('AVEUGLE : un compte de variables inconnues égal à la référence doit être OK.');
    return 1;
  }
  if (evaluateRatchet(381, 380) !== RESULT.REGRESSION) {
    console.error('AVEUGLE : une régression de variables inconnues (+1) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(379, 380) !== RESULT.UNRECORDED_IMPROVEMENT) {
    console.error('AVEUGLE : une amélioration de variables inconnues non enregistrée (-1) doit être détectée.');
    return 1;
  }

  // stripComments elle-même, isolée de classifyColorHexOccurrences : une
  // chaîne contenant un `//` (URL) ne doit PAS être tronquée — c'est le piège
  // que le doc-comment de `AppSourceGuard.stripComments` nomme explicitement.
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

  console.log('self-test : 15/15 vérifications passées (stripComments, classification à trois formes, analyseur d\'argument, deux cliquets à deux sens).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const {
    literalTotal,
    admittedVariableTotal,
    unknownVariableTotal,
    perFileLiteral,
    perFileUnknownVariable,
  } = classifyColorHexOccurrences(readWorld(REPO_ROOT, SEARCH_ROOTS));

  console.log(
    `Couleurs en dur hors Theme (iOS) : ${literalTotal} littéral(aux), ${admittedVariableTotal} variable(s) admise(s) ` +
      `(accentColor/colorPalette — hors cliquet), ${unknownVariableTotal} variable(s) inconnue(s).`,
  );

  const literalOk = reportRatchet(
    'Littéraux Color(hex: "…")',
    literalTotal,
    REFERENCE_LITERAL_COLOR_COUNT,
    perFileLiteral,
    'REFERENCE_LITERAL_COLOR_COUNT',
  );
  const unknownOk = reportRatchet(
    'Variables inconnues Color(hex: …)',
    unknownVariableTotal,
    REFERENCE_UNKNOWN_VARIABLE_COLOR_COUNT,
    perFileUnknownVariable,
    'REFERENCE_UNKNOWN_VARIABLE_COLOR_COUNT',
  );

  return literalOk && unknownOk ? 0 : 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
