import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

import { frontiereDeZone } from './eslint/frontiere-de-zone.mjs';
import { litLePerimetreSiPresent } from './scripts/lib/perimetre-de-zone.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: ICI });

// Le périmètre de NAVIGATION servi par la v3, lu au seul endroit qui le décide : la règle Traefik
// du routeur `frontend-v3`. Il grandit à chaque étape du § 4.9 — la config n'en tient aucune
// copie. « Navigation » n'est pas un synonyme de « réclamé » : `/__v3/_next` est la zone d'ACTIFS
// (`assetPrefix`), pas une route qu'un humain visite, et la confondre avec une route faisait
// conseiller `<Link>` sur une URL de bundle. Aujourd'hui, ce périmètre est donc VIDE — c'est
// exactement ce que dit l'étape 1 : « zéro trafic humain, seuls ses bundles sont joignables ».
// `null` quand le compose est hors du contexte — le cas de l'image Docker, dont l'étage builder
// ne copie que `apps/web-v3/`. `next build` charge cette config : sans ce repli, sa passe de lint
// rendait « ⨯ ESLint: ENOENT … docker-compose.prod.yml » et ne lintait RIEN, tout en sortant en
// RC=0 (mesuré). Le contrat de `__tests__/workspace-contract.test.ts` — « le build ne masque
// aucune erreur ESLint » — était alors tenu sur le papier et VIDE dans l'image.
const PERIMETRE_V3 = litLePerimetreSiPresent(join(ICI, '..', '..'));

// `@next/next/no-html-link-for-pages` est écrit pour une application Next UNIQUE : tout chemin
// qu'un routeur Next sert lui paraît joignable côté client, donc tout `<a>` vers ce chemin lui
// paraît fautif. Dans une ZONE, c'est faux dans les deux sens — et coûteux dans un seul. La règle
// pousse vers `<Link>` précisément là où `<Link>` est cassé : `/` est servi par le legacy jusqu'à
// l'étape 7 du § 4.9, et la navigation client de la v3 ne l'atteindra jamais. Le lot L-0.5 avait
// contourné en retirant le lien de `not-found.tsx` — un 404 sans issue. Elle est remplacée par
// les deux règles de `eslint/frontiere-de-zone.mjs`, qui posent la MÊME question en tenant compte
// de la frontière : ce que la v3 sert, et ce qu'elle ne sert pas.
const REGLE_ECRITE_POUR_UNE_ZONE_UNIQUE = '@next/next/no-html-link-for-pages';

const SPRITE_ONLY = "La v3 n'utilise que le sprite Phosphor de packages/icons.";
const ONE_THEME_ENGINE = 'Le thème de la v3 a un seul moteur : app/theme-script.tsx.';

// `@phosphor-icons/core` n'est PAS bloqué par l'absence : c'est une devDependency
// de la RACINE, remontée par la chaîne de résolution des node_modules, donc
// `import '@phosphor-icons/core/assets/regular/play.svg'` résout DEPUIS ICI
// (vérifié : `require.resolve` rend le chemin, là où `lucide-react` rend
// MODULE_NOT_FOUND). L'isolation de bun ne protège que ce qui n'est déclaré
// nulle part — et ce paquet vient d'être déclaré. Sans cette ligne, un fichier
// de la v3 court-circuite le sprite, expédie une requête PAR icône, et tous les
// gates restent verts. `@phosphor-icons/react`, que la conception rejette
// nommément (« bundle les 6 poids par icône »), est barré d'avance pour que son
// installation ne rouvre pas la porte en silence.
//
// Le GÉNÉRATEUR, lui, lit bien `@phosphor-icons/core` — il vit dans
// `packages/icons`, hors de la zone lintée.
const forbiddenModules = [
  { root: 'lucide-react', message: SPRITE_ONLY },
  { root: '@phosphor-icons/web', message: SPRITE_ONLY },
  { root: '@phosphor-icons/core', message: SPRITE_ONLY },
  { root: '@phosphor-icons/react', message: SPRITE_ONLY },
  { root: 'next-themes', message: ONE_THEME_ENGINE },
];

const restrictedImportPatterns = forbiddenModules.map(({ root, message }) => ({
  group: [root, `${root}/**`],
  message,
}));

// Les sept événements du cycle de vie (§ 6.2) n'ont qu'UN point d'écoute :
// `lib/realtime/lifecycle.ts`. Un écran qui les attache lui-même se
// réécrit une machine à états — et c'est ainsi qu'un `visibilitychange`
// finit par déclencher une mutation, ce que le gate du § 8.5 interdit. La
// zone couvre TOUT le code de l'application (`app/`, `components/`, et le
// reste de `lib/`) ; le site unique s'en exempte nommément, plus bas.
const CYCLE_DE_VIE = "Le cycle de vie de la v3 a un seul point d'écoute : lib/realtime/lifecycle.ts.";
const SITE_UNIQUE_DU_CYCLE = 'lib/realtime/lifecycle.ts';

// TROIS listes, parce que la règle n'est pas la même pour les trois.
//
// 1. `evenementsDuCycle` — à CENTRALISER : le site unique les attache, personne
//    d'autre. C'est une question d'adresse, pas d'interdit.
// 2. `evenementsDeFausseVisibilite` — `focus`/`blur` sur `window`/`document`
//    sont la réécriture classique de `visibilitychange`, et une machine à états
//    parallèle est exactement ce que la zone existe pour empêcher. Restreints
//    aux receveurs GLOBAUX : `input.addEventListener('focus', …)` est un usage
//    légitime et n'a rien à voir avec le cycle de vie.
// 3. `evenementsDAdieu` — INTERDITS PARTOUT, site unique COMPRIS. Le § 6.2 leur
//    consacre une ligne barrée, et la raison n'est pas stylistique : un seul
//    `beforeunload` posé n'importe où rend TOUT le document inéligible au
//    bfcache, donc `pageshow{persisted:true}` cesse de se produire, donc
//    `reprise{cause:'bfcache'}` devient une branche morte et l'onglet « revient
//    muet ». La régression serait SILENCIEUSE : tous les gates resteraient
//    verts, `cycle-de-vie.test.ts` continuant de déclencher la branche à la
//    main. C'est pourquoi l'exemption du site unique ne les rouvre pas.
const CYCLE_DE_VIE_FAUSSE_VISIBILITE = `focus/blur sur window ou document réécrivent visibilitychange. ${CYCLE_DE_VIE}`;
const ADIEUX_INTERDITS =
  "beforeunload et unload sont INTERDITS partout dans la v3 (§ 6.2) : ils bloquent le bfcache — donc pageshow{persisted} et la reprise qui en dépend —, ne se déclenchent pas sur mobile et sont ignorés par WebKit. Le départ se dit par pagehide, dans lib/realtime/lifecycle.ts.";

// Le jeton invité (§ 6.3 état E) n'a qu'UN détenteur, et sa clé est
// `meeshy.guest.<lien>` — une entrée PAR LIEN. `apps/web` range la sienne sous
// une clé GLOBALE (§ 6.1 point 7, mesuré) : rejoindre un second lien y écrase
// le jeton du premier. Le défaut ne se voit dans aucun test de comportement
// d'écran — les deux boucles « marchent » — et il ne se répare pas non plus par
// un simple renommage : il suffit qu'un second site compose la clé lui-même
// pour que la portée se remette à diverger. La règle porte donc sur les DEUX
// moitiés du défaut : la CLÉ écrite ailleurs, et l'ACCÈS direct au stockage.
const JETON_INVITE =
  "Le jeton invité a un seul détenteur : lib/api/guest-session.ts (une entrée meeshy.guest.<lien> PAR LIEN, § 6.3). Une clé composée ailleurs, ou un accès direct au stockage, rouvre le défaut mesuré au § 6.1 point 7 — un second lien écrase le premier.";
const DETENTEUR_DU_JETON = 'lib/api/guest-session.ts';

const restrictedStorageSyntax = [
  'Literal[value=/meeshy\\.guest/]',
  'TemplateElement[value.raw=/meeshy\\.guest/]',
  // `localStorage.x` et `window.localStorage.x` — l'identité seule
  // (`evenement.storageArea !== window.localStorage`) n'est PAS un accès et
  // reste écrivable : ce qui est barré, c'est la LECTURE et l'ÉCRITURE.
  "MemberExpression[object.name=/^(localStorage|sessionStorage)$/]",
  "MemberExpression[object.property.name=/^(localStorage|sessionStorage)$/]",
].map((selector) => ({ selector, message: JETON_INVITE }));

const evenementsDuCycle = ['visibilitychange', 'pageshow', 'pagehide', 'online', 'offline', 'storage'];
const evenementsDeFausseVisibilite = ['focus', 'blur'];
const evenementsDAdieu = ['beforeunload', 'unload'];

const RECEVEURS_GLOBAUX = '^(window|document|globalThis|self)$';

const parEvenement = (evenements, message) => {
  const motif = evenements.join('|');
  return [
    `CallExpression[callee.property.name='addEventListener'][arguments.0.value=/^(${motif})$/]`,
    `CallExpression[callee.name='addEventListener'][arguments.0.value=/^(${motif})$/]`,
    `MemberExpression[property.name=/^on(${motif})$/]`,
  ].map((selector) => ({ selector, message }));
};

const surReceveurGlobal = (evenements, message) => {
  const motif = evenements.join('|');
  return [
    `CallExpression[callee.object.name=/${RECEVEURS_GLOBAUX}/][callee.property.name='addEventListener'][arguments.0.value=/^(${motif})$/]`,
    `MemberExpression[object.name=/${RECEVEURS_GLOBAUX}/][property.name=/^on(${motif})$/]`,
  ].map((selector) => ({ selector, message }));
};

const syntaxeDesAdieux = parEvenement(evenementsDAdieu, ADIEUX_INTERDITS);

const restrictedLifecycleSyntax = [
  ...parEvenement(evenementsDuCycle, CYCLE_DE_VIE),
  { selector: "NewExpression[callee.name='BroadcastChannel']", message: CYCLE_DE_VIE },
  ...surReceveurGlobal(evenementsDeFausseVisibilite, CYCLE_DE_VIE_FAUSSE_VISIBILITE),
  ...syntaxeDesAdieux,
];

const zoneDuCycleDeVie = ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'];

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // `no-restricted-syntax` porte UN nom : le dernier bloc qui s'applique à un
  // fichier remplace les précédents, il ne s'y ajoute pas. Les adieux sont donc
  // répétés dans les trois blocs — c'est ce qui les rend inévitables, y compris
  // là où le reste de la règle est levé.
  {
    plugins: { zone: frontiereDeZone },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': ['error', { patterns: restrictedImportPatterns }],
      'no-restricted-syntax': ['error', ...syntaxeDesAdieux],
      [REGLE_ECRITE_POUR_UNE_ZONE_UNIQUE]: 'off',
      // Les deux règles de zone ne s'arment QUE si le périmètre a pu être lu. Sans lui, elles
      // n'ont aucun verdict à rendre : un périmètre VIDE est une affirmation (« la v3 ne sert
      // aucune route humaine ») qui, appliquée par défaut, rendrait fautif tout `<Link>` de
      // l'application à l'étape 7 du § 4.9 — celle où `<Link>` devient universel. Se taire est
      // ici la seule lecture juste, et elle ne coûte rien : le lieu d'APPLICATION de ces règles
      // est la CI, qui a le dépôt entier (`ci.yml`, « Lint (apps/web-v3 — blocking) »), jamais
      // le build de l'image. Tout le RESTE du lint continue de s'appliquer là-bas — c'est ce que
      // le contrat « le build ne masque aucune erreur ESLint » veut vraiment dire.
      ...(PERIMETRE_V3 === null
        ? {}
        : {
            'zone/lien-sortant-en-navigation-client': ['error', { perimetre: PERIMETRE_V3 }],
            'zone/lien-interne-en-rechargement': ['warn', { perimetre: PERIMETRE_V3 }],
          }),
    },
  },
  {
    files: zoneDuCycleDeVie,
    rules: { 'no-restricted-syntax': ['error', ...restrictedLifecycleSyntax, ...restrictedStorageSyntax] },
  },
  // Les deux exemptions sont DISJOINTES, et chacune ne lève que sa propre
  // moitié : le détenteur du jeton reste soumis au cycle de vie, et le site du
  // cycle de vie reste soumis à la clé du jeton — il en reçoit le préfixe en
  // paramètre, il n'a jamais à l'écrire. Un bloc qui les réunirait rendrait
  // chacun aveugle au défaut de l'autre.
  {
    files: [DETENTEUR_DU_JETON],
    rules: { 'no-restricted-syntax': ['error', ...restrictedLifecycleSyntax] },
  },
  {
    files: [SITE_UNIQUE_DU_CYCLE],
    rules: { 'no-restricted-syntax': ['error', ...syntaxeDesAdieux, ...restrictedStorageSyntax] },
  },
];

export default config;
