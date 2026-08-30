#!/usr/bin/env node
// Gate des JETONS de apps/web-v3 [infra-1] — conception § 3.2 corollaire 2 et § 2
// (« Thème dark/light/system sans FOUC »).
//
//   node scripts/check-jetons.mjs
//   node scripts/check-jetons.mjs --json
//
// UNE loi, en moitiés qui ne se tiennent qu'ensemble :
//
//   1. Les couleurs, LES RAYONS ET LES POLICES de la v3 viennent d'UNE table —
//      `packages/design-tokens`. Une valeur écrite à la main dans `apps/web-v3`
//      est une SECONDE table : c'est exactement ce qui a produit les trois têtes
//      de `apps/web` (`:root` shadcn + `--gp-*` + `components/v2/theme.ts`) et
//      ses 254 hex en dur dans 41 `.tsx`. Le corollaire 2 nomme les TROIS —
//      « aucun composant ne redéclare une couleur, un rayon ou une police » —
//      et la première écriture de ce gate n'en gardait qu'un tiers pendant que
//      le README affirmait les trois. Une restriction DÉCLARÉE que rien ne fait
//      respecter est pire que son absence : le lot suivant lit le README et
//      croit la surface gardée (cycle 124).
//   2. Cette table ne bascule JAMAIS toute seule. Un `@media (prefers-color-scheme)`
//      dans un fichier de jetons rend le thème à l'OS pendant que les utilitaires
//      `dark:` de Tailwind restent gouvernés par la classe : préférence CLAIRE
//      explicite sur OS SOMBRE ⇒ jetons sombres sous utilitaires clairs. Le seul
//      site qui lit `matchMedia` est `app/theme-script.tsx`. Et `@media` n'est
//      pas la seule écriture : `color-scheme: light dark` arme l'OS — sur les
//      contrôles natifs ET sur `light-dark()` — sans jamais écrire le mot
//      `@media` [revue #4413].
//   3. Cette table est COMPLÈTE dans les deux schémas : un jeton de schéma sans
//      sa jumelle ne se voit qu'au moment où l'autre thème est servi. Ce
//      contrôle vivait dans un test jest seul, alors que le README envoyait le
//      contributeur lancer CE script : il rendait vert sur un jeton orphelin.
//   4. Cette table est LISIBLE. « Elle corrige la planche au titre de la
//      dimension 5 » reste une affirmation tant que rien ne calcule un rapport
//      de contraste — et le schéma SOMBRE, le seul mesuré, portait quatre
//      paires sous AA. Le contrôle rejoue la même loi sur les DEUX schémas.
//   5. Les plans de surface sont ORDONNÉS. Une parité de CLÉS ne dit rien d'une
//      palette : `--color-surface-raised` a été peint plus SOMBRE que
//      `--color-surface`, et à 1,00:1 de `--color-bg-sunken`, sans qu'aucun
//      témoin ne tombe.
//   6. Le thème n'a qu'UN moteur [#4413]. La moitié 2 n'inspectait que les
//      fichiers de la TABLE : le même `@media (prefers-color-scheme)` écrit dans
//      `apps/web-v3/app/globals.css` produisait exactement le défaut nommé et
//      passait vert, à un répertoire près. Et le doc-comment ci-dessus affirmait
//      « le seul site qui lit `matchMedia` est app/theme-script.tsx » sans que
//      rien ne le fasse respecter — une restriction DÉCLARÉE que personne
//      n'applique est pire que son absence. SIX formes interrogent le thème
//      hors du moteur, et elles sont refusées toutes les six — la sixième est
//      une ABSENCE (`darkMode` non posé à `class` dans un `tailwind.config.*`,
//      ce qui vaut `'media'`, donc l'OS), et les six sont cherchées dans les
//      SEPT extensions que Next rend, pas dans trois [revue #4413].
//   7. La table ne bascule pas TELLE QU'ELLE EST SERVIE [#4413]. La moitié 2 est
//      un `grep` : elle dit qu'aucune requête de média n'est écrite, jamais ce
//      que le navigateur SERT. Le critère de fin, lui, est une phrase composée
//      — « préférence claire explicite sur OS sombre ⇒ jetons CLAIRS » — et
//      seule la CASCADE la rend observable. `lib/cascade.mjs` résout la table
//      sous une classe et sous un schéma d'OS ; le gate refuse toute propriété
//      dont la valeur SERVIE change avec l'OS à classe égale.
//
// Les écrire dans des gates séparés les ferait diverger : les moitiés 2 à 7 n'ont
// de sens que parce que la première a rendu la table unique.
//
// CE QUI EST SCANNÉ, ET CE QUI NE L'EST PAS
//
// Le scan porte sur ce que Next REND — l'ensemble des extensions que l'App
// Router accepte, pas l'ensemble de celles qu'on a l'habitude d'écrire :
// `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css`. Les trois premières
// seules laissaient passer un SECOND MOTEUR DE THÈME complet écrit en `.jsx`
// sous `app/` — et ne faisaient jamais OUVRIR `tailwind.config.js|mjs` ni
// `postcss.config.mjs`. C'est la faute que la moitié 6 dénonce, déplacée d'un
// répertoire à une EXTENSION : une restriction déclarée que rien ne fait
// respecter [revue #4413].
//
// Il ignore `__tests__/`, `e2e/` et `scripts/` — une fixture EST une valeur
// écrite à la main, et le gate lui-même DOIT écrire `prefers-color-scheme`,
// `classList.add('dark')` et `dark:bg-slate-900` : ce sont sa matière. Aucun
// de ces trois répertoires n'atteint le navigateur ; un moteur de thème y
// serait sans effet sur le pixel. Il ignore aussi ce qui est construit
// (`.next/`) et ce qui est installé (`node_modules/`). Les fichiers de la TABLE
// ne sont pas scannés pour leurs valeurs : ce sont les valeurs.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { feuillesDepuis, tableServie } from './lib/cascade.mjs';
import { arrondi, contraste, luminance, resout } from './lib/couleur.mjs';
import { COULEURS_NOMMEES } from './lib/couleurs-nommees.mjs';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'];
const IGNORES = new Set(['node_modules', '.next', 'coverage', '__tests__', 'e2e', 'scripts']);

// Longueurs d'abord, la plus longue en tête : sans cela `#0d0e16ff` serait lu
// comme `#0d0e16` suivi de `ff`. La négation finale exclut l'ancre `#faq` et le
// sélecteur `#principal`, qui ne sont pas des couleurs.
//
// Reste `#4413` — une référence d'ISSUE, que la forme à quatre chiffres (#RGBA)
// ne distingue d'aucune couleur. Le départage ne se fait pas sur la forme mais
// sur le LIEU : une référence d'issue vit dans un COMMENTAIRE, une couleur dans
// du code. D'où `sansCommentaires` ci-dessous, plutôt qu'un contexte deviné
// autour du `#` — lequel laisserait fuir `border:1px solid #fff`, où la couleur
// est précédée d'une simple espace.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;

// Une couleur fonctionnelle DÉRIVÉE d'un jeton (`rgb(from var(--color-bg) …)`)
// ne redéclare rien : la valeur reste dans la table. C'est la forme relative,
// et c'est la seule façon autorisée d'écrire une opacité sur un jeton.
//
// `color-mix` AVANT `color` : le moteur essaie les alternatives dans l'ordre et
// la plus longue doit gagner. `lch`/`lab` après `oklch`/`oklab` pour la même
// raison — même si `\b` suffirait, l'ordre rend la lecture sûre.
const FONCTION =
  /\b(?:rgba?|hsla?|oklch|oklab|color-mix|lch|lab|hwb|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

// Un mot-clé de couleur CSS en position de VALEUR. Deux gardes :
//   `(?![\w-])` — `tan` ne matche pas dans `tangente` ni dans `--color-tan-500` ;
//   `(?!\s*\()` — `tan(30deg)` est une fonction mathématique, pas une couleur.
const NOMMEE = new RegExp(
  `(?<![\\w-])(?:${COULEURS_NOMMEES.join('|')})(?![\\w-])(?!\\s*\\()`,
  'gi',
);

// La VALEUR d'une déclaration : tout ce qui suit le `:` jusqu'au prochain
// terminateur. Elle TRAVERSE les virgules — `box-shadow: 0 0 0 1px black,
// 0 0 0 2px white` porte DEUX couleurs et le second `white` doit tomber aussi —
// SAUF quand la virgule est suivie d'une autre propriété, ce qui est la forme
// d'un objet TSX (`{ fontSize: 17, lineHeight: 1.3 }`). Sans cette exception la
// première déclaration avalait la seconde, qui n'était alors jamais NOMMÉE.
const FIN_DE_VALEUR = String.raw`(?=\s*(?:[;{}]|$|,\s*[A-Za-z_$][\w$-]*\s*:))`;

const DECLARATION = new RegExp(String.raw`:\s*([^;{}]*?)${FIN_DE_VALEUR}`, 'g');

// Une chaîne qui contient une ESPACE est de la prose ou une pile de polices
// (`"Segoe UI"`, `'Orange Juice'`), jamais un mot-clé de couleur : `white` s'y
// écrit `'white'`, sans espace. Les blanchir avant le scan des mots-clés est ce
// qui sépare `font-family: "SF Mono"` d'un vrai `color: 'white'`.
const CHAINE_PROSE = /(['"])[^'"\n]*\s[^'"\n]*\1/g;

// La deuxième et la troisième moitiés du corollaire 2 : un RAYON, une POLICE.
// `font` (le raccourci) ne matche pas `font-family` grâce à `(?![\w-])`, et pas
// `fontFamily` grâce au `[A-Za-z]` que la négation couvre aussi.
const DIMENSIONS = [
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
];

const DIMENSION = new RegExp(
  String.raw`(?<![\w-])(${DIMENSIONS.join('|')})(?![\w-])\s*:\s*([^;{}]*?)${FIN_DE_VALEUR}`,
  'g',
);

// Ce qui ne DÉCLARE aucune valeur de design : les mots-clés larges de CSS et le
// zéro. Tout le reste vient de la table, donc contient `var(`.
const SANS_VALEUR = /^(?:inherit|initial|unset|revert|revert-layer|0)$/;

const BASCULE = /@media[^{;]*prefers-color-scheme[^{;]*/g;

// La SECONDE façon d'armer l'OS dans une feuille de jetons, et elle ne contient
// pas le mot `@media` [revue #4413] : `color-scheme: light dark` déclare que
// l'élément accepte les DEUX schémas, donc que l'agent utilisateur choisit —
// il peint ses ascenseurs et ses contrôles natifs selon l'OS pendant que la
// classe dit l'inverse, et il arme `light-dark()`, la seule fonction CSS dont
// le métier entier est de servir deux couleurs selon le schéma. Un jeton écrit
// `light-dark(A, B)` bascule alors sur l'OS sans qu'aucune requête de média ne
// soit écrite : la jumelle que #4413 interdit, sans son mot-clé.
//
// L'autre moitié du contrôle est dans la CASCADE (`suivisDeLOS`), qui résout
// `light-dark()` selon le schéma servi : ce gate refuse ce qui l'ARME, la
// cascade refuse ce qui en DÉPEND. Un `color-scheme` qui ne déclare qu'un seul
// schéma reste légitime — c'est ainsi que dark.css et light.css suivent la
// classe sans JavaScript.
const SCHEMA_DOUBLE = /color-scheme\s*:\s*[^;{}]*\b(?:light\s+dark|dark\s+light)\b[^;{}]*/g;

// --- les cinq formes d'un SECOND moteur de thème [#4413] ---------------------
//
// Le moteur est UN module, et c'est celui-ci. Le nommer en constante plutôt que
// de le laisser implicite est le point : le jour où un `lib/theme.ts` voudra
// écrire la préférence, l'exception devra être AJOUTÉE ici — un geste délibéré,
// relu, daté — au lieu d'apparaître par le fait qu'un fichier de plus lit
// `matchMedia` sans que rien ne rougisse.
const MOTEUR = 'app/theme-script.tsx';

// La classe de thème n'a qu'UN lecteur : la table. Un `.dark`/`.light` dans une
// feuille de la v3 est une seconde table, quand bien même ses valeurs seraient
// des `var()` — c'est la DÉCISION « quelle couleur selon le thème » qui se
// dédouble, pas seulement la valeur.
const SELECTEUR_DE_THEME = /(?:^|[\s,>+~(])(?:html|:root)?\.(?:dark|light)\b/g;

// Le vocabulaire du schéma de l'OS appartient au moteur. Chercher le nom NU
// plutôt que `matchMedia(...)` : la requête peut vivre dans une constante, dans
// un `window.matchMedia`, dans un `addEventListener('change')` — le nom, lui,
// est toujours écrit.
const SCHEMA_EN_CODE = /prefers-color-scheme/g;

// Poser ou lire la classe de thème est l'acte du moteur. La forme compte les
// deux écritures qu'on trouve vraiment : `classList.add('dark')` et
// `classList.add(condition ? 'dark' : 'light')`.
const CLASSE_DE_THEME =
  /classList\s*\.\s*(?:add|remove|toggle|contains|replace)\s*\([^)]{0,60}['"](?:dark|light)['"]/g;

// Les familles d'utilitaires Tailwind qui portent une COULEUR. Une variante
// `dark:` est légitime — la conception § 2 pose `darkMode: ["class"]` et attend
// que ces utilitaires suivent la classe ; ce qui ne l'est pas, c'est qu'elle
// nomme une couleur PRISE AILLEURS que dans la table. `dark:bg-[var(--color-…)]`
// passe ; `dark:bg-slate-900` est la palette Tailwind, donc une seconde table.
const FAMILLES_COLOREES =
  'bg|text|border|ring|outline|divide|from|via|to|shadow|fill|stroke|decoration|accent|caret|placeholder';

// La négation ne porte PAS sur le guillemet : `className="dark:bg-slate-900"` —
// la variante en TÊTE d'attribut, la forme la plus courante de toutes — était
// exclue par lui, alors que `className="bg-white dark:bg-slate-900"` tombait.
// Trouvé en armant la sonde `.jsx` de la revue #4413.
const VARIANTE_COLOREE = new RegExp(
  String.raw`(?<![\w$-])(?:dark|light):(?:${FAMILLES_COLOREES})-[^\s"'\`]+`,
  'g',
);

// La SIXIÈME forme, et c'est une ABSENCE [revue #4413]. `VARIANTE_COLOREE` juge
// la COULEUR que nomme un utilitaire `dark:` ; elle ne dit rien du SIGNAL que
// `dark:` suit. Or `darkMode: 'media'` — la valeur par DÉFAUT de Tailwind,
// celle qu'on obtient en n'écrivant rien — fait suivre l'OS à TOUS les
// utilitaires `dark:` pendant que les jetons suivent la classe : la jumelle de
// #4413 dans sa forme la plus littérale, et `dark:bg-[var(--color-surface)]`,
// que ce gate ACCEPTE, la produit à elle seule.
//
// La garde est posée AVANT Tailwind, comme la constante `MOTEUR` : le jour où
// le paquet est installé, la règle est déjà armée plutôt que d'attendre qu'un
// contributeur relise la conception § 2. Elle ne s'applique qu'aux fichiers
// `tailwind.config.*` — s'il n'y en a pas, il n'y a pas d'utilitaire `dark:`
// à gouverner.
const CONFIG_TAILWIND = /(?:^|\/)tailwind\.config\.[^/]+$/;

// La VALEUR, pas la fin de ligne : un `tailwind.config` tient parfois sur une
// seule ligne, et capturer jusqu'au `\n` faisait rougir le réglage JUSTE.
const DARK_MODE = /darkMode\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|[\w-]+)/g;

const CLASSE_SEULE = /^(?:class|\[class\])$/;

const normalise = (valeur) => valeur.replace(/['"\s]/g, '');

const lignes = (source, index) => source.slice(0, index).split('\n').length;

// Les commentaires sortent, mais leur PLACE reste : blanchis caractère par
// caractère, jamais supprimés, sinon le numéro de ligne rendu à l'appelant
// désignerait une autre ligne que celle qu'il doit corriger.
const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g;

const blanchit = (texte) => texte.replace(/[^\n]/g, ' ');

const sansCommentaires = (source) =>
  source
    .replace(COMMENTAIRE_BLOC, blanchit)
    .replace(/(^|[^:/\\])\/\/[^\n]*/g, (bloc, avant) => avant + blanchit(bloc.slice(avant.length)));

const sansProse = (source) => source.replace(CHAINE_PROSE, blanchit);

const trouve = (source, motif, texteDe) => {
  const out = [];
  for (const m of source.matchAll(motif)) {
    const texte = texteDe(m);
    if (texte !== null) out.push({ ligne: lignes(source, m.index), texte });
  }
  return out;
};

const reglageDeVariante = (code) =>
  [...code.matchAll(DARK_MODE)].length === 0
    ? [{ ligne: 1, texte: "darkMode absent — Tailwind retombe sur 'media', donc sur l'OS" }]
    : trouve(code, DARK_MODE, (m) =>
        CLASSE_SEULE.test(normalise(m[1])) ? null : `darkMode: ${m[1].trim()}`,
      );

const nommeesEnValeur = (code) =>
  [...code.matchAll(DECLARATION)].flatMap((declaration) =>
    [...declaration[1].matchAll(NOMMEE)].map((mot) => ({
      ligne: lignes(code, declaration.index + declaration[0].indexOf(declaration[1]) + mot.index),
      texte: mot[0],
    })),
  );

export const couleursLitterales = (source) => {
  const code = sansCommentaires(source);
  return [
    ...trouve(code, HEX, (m) => m[0]),
    ...trouve(code, FONCTION, (m) => (m[1].includes('var(') ? null : `${m[0].split('(')[0]}(`)),
    ...nommeesEnValeur(sansProse(code)),
  ].sort((a, b) => a.ligne - b.ligne);
};

export const dimensionsLitterales = (source) =>
  trouve(sansCommentaires(source), DIMENSION, (m) => {
    const valeur = m[2].trim();
    if (valeur === '' || valeur.includes('var(') || SANS_VALEUR.test(valeur)) return null;
    return `${m[1]}: ${valeur}`;
  });

export const basculesAutomatiques = (source) =>
  [
    ...trouve(source, BASCULE, (m) => m[0].trim()),
    ...trouve(source, SCHEMA_DOUBLE, (m) => m[0].trim()),
  ].sort((a, b) => a.ligne - b.ligne);

/**
 * Les sites de `apps/web-v3`, autres que le moteur, qui INTERROGENT le thème.
 *
 * `fichier` est le chemin relatif à la racine de la v3 : c'est lui qui dit à la
 * fois quelle forme s'applique (une feuille de style ne porte pas d'utilitaire
 * Tailwind) et si le site est le moteur lui-même.
 */
export const moteursParalleles = (source, fichier) => {
  const code = sansCommentaires(source);
  const estFeuille = fichier.endsWith('.css');
  const estLeMoteur = fichier === MOTEUR;
  const interrogations = estFeuille
    ? [BASCULE, SELECTEUR_DE_THEME, SCHEMA_DOUBLE]
    : estLeMoteur
      ? []
      : [SCHEMA_EN_CODE, CLASSE_DE_THEME];
  return [
    ...interrogations.flatMap((forme) => trouve(code, forme, (m) => m[0].trim())),
    // Le SIGNAL que suivent les utilitaires `dark:`, jugé là où il se déclare.
    ...(CONFIG_TAILWIND.test(fichier) ? reglageDeVariante(code) : []),
    // La variante Tailwind est jugée sur sa VALEUR, pas sur son existence : la
    // classe a le droit de gouverner un utilitaire, pas de nommer une couleur
    // hors table. Elle vaut aussi pour le moteur — il n'a pas plus le droit
    // qu'un autre d'écrire `dark:bg-slate-900`.
    ...(estFeuille
      ? []
      : trouve(code, VARIANTE_COLOREE, (m) => (m[0].includes('var(--') ? null : m[0]))),
  ].sort((a, b) => a.ligne - b.ligne);
};

// Un analyseur de blocs, pas un analyseur CSS : il rend les déclarations de
// custom properties par sélecteur, ce qu'il faut pour dire « ce jeton n'a pas
// de jumelle dans l'autre schéma ». Les commentaires sortent d'abord, sinon
// un `/* --x: 1 */` compterait comme une déclaration.
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

export const fichiersDeLaV3 = (racine) => {
  const parcours = (dossier) =>
    readdirSync(dossier).flatMap((nom) => {
      if (IGNORES.has(nom) || nom.startsWith('.')) return [];
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return parcours(chemin);
      return EXTENSIONS.some((ext) => nom.endsWith(ext)) ? [chemin] : [];
    });
  return parcours(racine);
};

const fichiersDeJetons = (racine) =>
  readdirSync(racine)
    .filter((nom) => nom.endsWith('.css'))
    .map((nom) => join(racine, nom));

// --- la table, telle que le navigateur la SERT ------------------------------

// Ce que l'agent utilisateur voit dans un schéma : les jetons hors schéma de
// `tokens.css`, écrasés par ceux du schéma. C'est cette table RÉSOLUE — pas les
// valeurs déclarées, dont la moitié sont des `var()` — qui atteint le pixel.
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
const PLANS = [
  '--color-bg-sunken',
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
];

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

// 3:1 — WCAG 1.4.11. Ce qui porte SEUL son information sans être du texte : le
// contour visible d'un contrôle, une pastille de présence (aucun libellé sur un
// avatar).
const SIGNAUX_SUR_PLAN = [
  '--color-border-interactive',
  '--color-presence-online',
  '--color-presence-away',
  '--color-presence-idle',
  '--color-presence-offline',
];

// Une encre POSÉE sur une couleur de la table, pas sur un plan.
const ENCRES_SUR_FOND = [
  ['--color-on-primary', '--color-primary'],
  ['--color-on-status', '--color-success'],
  ['--color-on-status', '--color-warning'],
  ['--color-on-status', '--color-danger'],
  ['--color-on-avatar', '--color-avatar-1'],
  ['--color-on-avatar', '--color-avatar-2'],
  ['--color-on-avatar', '--color-avatar-3'],
  ['--color-on-avatar', '--color-avatar-4'],
];

const TEXTE = 4.5;
const SIGNAL = 3;

const paires = () => [
  ...ENCRES_SUR_PLAN.flatMap((encre) => PLANS.map((plan) => [encre, plan, TEXTE])),
  ...SIGNAUX_SUR_PLAN.flatMap((signal) => PLANS.map((plan) => [signal, plan, SIGNAL])),
  ...ENCRES_SUR_FOND.map(([encre, fond]) => [encre, fond, TEXTE]),
];

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

// --- la table telle qu'elle est SERVIE, sous les deux schémas d'OS ----------

// Les trois états dans lesquels `<html>` se présente : la classe posée par le
// serveur puis corrigée par le moteur, et — le cas du rôle PREMIER — aucune
// classe du tout, chez un lecteur sans JavaScript.
const ETATS_DE_CLASSE = [[], ['dark'], ['light']];

const JETON_DECLARE = /(--[\w-]+)\s*:/g;

/**
 * Le garde-fou du contrôle lui-même [revue #4413].
 *
 * `suivisDeLOS` a pour valeur nominale de SUCCÈS « zéro entrée ». Un résolveur
 * qui inspecte une table VIDE rend donc exactement la même phrase qu'un
 * résolveur qui a tout vérifié — et c'est arrivé : un `@import` qualifié faisait
 * disparaître `dark.css` de la cascade, la table servie tombait à ZÉRO
 * propriété, et le seul contrôle bâti pour #4413 rendait VERT après n'avoir
 * regardé rien du tout.
 *
 * Un contrôle dont le succès est un ensemble vide doit donc prouver qu'il a
 * regardé quelque chose : tout jeton DÉCLARÉ dans les feuilles doit être SERVI
 * dans chacun des trois états de classe. La cascade lève déjà sur ce qu'elle ne
 * modélise pas ; ceci attrape ce qu'elle modélise mal.
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
 * Les propriétés dont la valeur SERVIE change avec le schéma de l'OS, à classe
 * égale. Zéro entrée EST la phrase du critère de fin de #4413 : le choix
 * explicite atteint le jeton, et rien ne le court-circuite en chemin.
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

// --- le rapport -------------------------------------------------------------

const relatif = (racine, chemin) => relative(racine, chemin).split(sep).join('/');

const situe = (racine, chemin, entrees) =>
  entrees.map((entree) => ({ fichier: relatif(racine, chemin), ...entree }));

export const audit = ({ racineV3, racineJetons }) => {
  const sources = fichiersDeLaV3(racineV3);
  const lus = sources.map((chemin) => [chemin, readFileSync(chemin, 'utf8')]);
  return {
    infractions: lus.flatMap(([chemin, source]) =>
      situe(racineV3, chemin, couleursLitterales(source)),
    ),
    dimensions: lus.flatMap(([chemin, source]) =>
      situe(racineV3, chemin, dimensionsLitterales(source)),
    ),
    bascules: fichiersDeJetons(racineJetons).flatMap((chemin) =>
      situe(racineJetons, chemin, basculesAutomatiques(readFileSync(chemin, 'utf8'))),
    ),
    moteurs: lus.flatMap(([chemin, source]) =>
      situe(racineV3, chemin, moteursParalleles(source, relatif(racineV3, chemin))),
    ),
    orphelins: jetonsOrphelins(racineJetons),
    contrastes: contrastesInsuffisants(racineJetons),
    ordres: plansDesordonnes(racineJetons),
    suivis: suivisDeLOS(feuillesDepuis(racineJetons, 'tokens.css')),
  };
};

const bloc = (titre, remede, entrees, ligneDe) =>
  entrees.length === 0 ? [] : [titre, ...entrees.map(ligneDe), `  → ${remede}`, ''];

const situee = (e) => `  ${e.fichier}:${e.ligne}  ${e.texte}`;

export const formateAudit = (rapport) => {
  const total =
    rapport.infractions.length +
    rapport.dimensions.length +
    rapport.bascules.length +
    rapport.moteurs.length +
    rapport.orphelins.length +
    rapport.contrastes.length +
    rapport.ordres.length +
    rapport.suivis.length;
  return [
    ...bloc(
      'Couleurs écrites à la main dans apps/web-v3 :',
      'la seule table de couleurs de la v3 est packages/design-tokens — utiliser var(--color-…).',
      rapport.infractions,
      situee,
    ),
    ...bloc(
      'Rayons, polices et tailles écrits à la main dans apps/web-v3 :',
      'la seule échelle de la v3 est packages/design-tokens — utiliser var(--radius-…), var(--text-…), var(--font-…).',
      rapport.dimensions,
      situee,
    ),
    ...bloc(
      'Jetons qui basculent tout seuls :',
      'seul app/theme-script.tsx lit matchMedia ; un jeton suit la CLASSE, jamais le média ' +
        "ni un color-scheme qui déclare DEUX schémas (il arme l'OS et light-dark()).",
      rapport.bascules,
      situee,
    ),
    ...bloc(
      'Sites qui interrogent le thème hors du moteur :',
      `le thème de la v3 a UN moteur — ${MOTEUR} ; la couleur, elle, vient de packages/design-tokens ` +
        '(var(--color-…)) ; et un tailwind.config.* pose darkMode: ["class"], jamais rien d\'autre.',
      rapport.moteurs,
      situee,
    ),
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
      (e) =>
        `  ${e.schema}  ${e.encre} sur ${e.fond} = ${e.rapport ?? 'non résolu'} (< ${e.seuil})`,
      ),
    ...bloc(
      "Plans de surface mal ordonnés :",
      'du plus enfoncé au plus surélevé, la luminance croît STRICTEMENT — « surélevé » ne se peint pas en creux.',
      rapport.ordres,
      (e) => `  ${e.schema}  ${e.plan} n'est pas plus clair que ${e.dessous}`,
    ),
    ...bloc(
      "Propriétés servies qui changent avec le schéma de l'OS :",
      'prefers-color-scheme ne gouverne QUE la valeur par défaut de la CLASSE, jamais une valeur servie.',
      rapport.suivis,
      (e) =>
        `  classe ${e.classe}  ${e.propriete} = ${e.sombre ?? 'absent'} sous OS sombre, ` +
        `${e.clair ?? 'absent'} sous OS clair`,
    ),
    total === 0
      ? 'jetons: UNE table, aucune valeur écrite à la main, aucune bascule automatique, ' +
        'aucun orphelin, un seul moteur de thème, contrastes et élévations tenus.'
      : `jetons: ${total} défaut(s).`,
  ].join('\n');
};

export const verdict = (rapport) =>
  rapport.infractions.length +
  rapport.dimensions.length +
  rapport.bascules.length +
  rapport.moteurs.length +
  rapport.orphelins.length +
  rapport.contrastes.length +
  rapport.ordres.length +
  rapport.suivis.length ===
  0
    ? 0
    : 1;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rapport = audit({
    racineV3: RACINE,
    racineJetons: join(RACINE, '..', '..', 'packages', 'design-tokens'),
  });
  process.stdout.write(
    process.argv.includes('--json')
      ? `${JSON.stringify(rapport, null, 1)}\n`
      : `${formateAudit(rapport)}\n`,
  );
  process.exit(verdict(rapport));
}
