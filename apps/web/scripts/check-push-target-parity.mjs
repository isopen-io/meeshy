#!/usr/bin/env node
/**
 * LA TABLE DE DESTINATIONS DU SERVICE WORKER SUIT CELLE DE L'APPLICATION
 * (#7305).
 *
 * ## POURQUOI UN JUMEAU, ET POURQUOI UN GATE
 *
 * `public/sw-push.js` est un script CLASSIQUE, chargé par `importScripts` en
 * tête du worker généré : il ne peut importer NI `resolveTarget`
 * (`src/lib/notifications/target.ts`), NI `href` (`src/lib/router.tsx`), NI
 * les constantes de `src/lib/discover/view.ts`. Sa table vit donc en double.
 * Le dépôt avait déjà tranché ce cas exact (`src/lib/sw-caches.ts` §
 * `LEGACY_CACHE_NAMESPACE` : « ce littéral est son JUMEAU côté page — un
 * script classique chargé par importScripts ne peut pas importer ce module »).
 *
 * **La preuve que la discipline ne suffit pas est dans le dépôt.**
 * `public/firebase-messaging-sw.js`, supprimé par ce même lot, portait
 * exactement la bonne règle en commentaire — « toute évolution doit toucher
 * les DEUX SW + le helper » — et composait quand même `/conversations/<id>`,
 * `/mood` et `/reel` : TROIS routes sur trois, dont aucune n'existe dans
 * `route-table.tsx` (une conversation est `/c/$conversation`). Une règle en
 * prose ne couvre que ce que son outil exprime. Ce fichier est l'outil.
 *
 * ## CE QU'IL MESURE — trois comparaisons, pas une
 *
 *  1. **Le jumeau contre la TABLE DE ROUTES.** Chaque motif de
 *     `PUSH_ROUTE_PATTERNS` doit être, au caractère, celui que
 *     `route-table.tsx` déclare pour la même clé. Une route renommée ou
 *     déplacée dans l'application rougit ici.
 *  2. **Le jumeau contre le RÉSOLVEUR.** Les sept tables de types de
 *     `target.ts` (et les deux paramètres de recherche de `discover/view.ts`)
 *     doivent être identiques dans le worker. Un type ajouté d'un seul côté
 *     rougit ici.
 *  3. **Le jumeau contre les ADRESSES que le critère de fin nomme.** La table
 *     est EXÉCUTÉE, pas seulement lue : une lecture ne dit pas dans quel ORDRE
 *     les règles décident. Même arbitrage que `check-sw-api-cache.mjs`, qui
 *     fait DÉCIDER le matcher extrait de `dist/sw.js` plutôt que de le lire.
 *
 * Et une quatrième, quand `dist/` existe : le worker livré charge-t-il bien
 * `sw-push.js` ? Workbox n'INLINE pas les scripts importés — il émet
 * `importScripts("sw-push.js")` en tête de `dist/sw.js` et Vite recopie le
 * fichier à côté. Chercher `notificationclick` dans `dist/sw.js` seul rendrait
 * donc un faux ROUGE ; c'est le couple (l'import en tête, le fichier servi)
 * qui prouve que le handler est chargé.
 *
 * VU ROUGIR : `scripts/check-push-target-parity.test.ts` rejoue les trois
 * dérives possibles (la table de routes bouge, le résolveur bouge, le jumeau
 * bouge) et exige un message qui NOMME la route ou le type fautif.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');

/** Les sept tables de types du résolveur, plus la liste des routes qu'un indice serveur peut nommer. */
const TABLES = [
  'EPHEMERAL_ENTITIES',
  'EPHEMERAL_ONLY_TYPES',
  'REQUEST_TYPES',
  'PROFILE_TYPES',
  'PROGRESSION_TYPES',
  'SECURITY_TYPES',
  'HINTED_ROUTES',
];

/** Les paramètres de recherche que la destination « demandes » porte. */
const PARAMS = ['DISCOVER_TAB_PARAM', 'REQUEST_FILTER_PARAM'];

const litteraux = (bloc) => [...bloc.matchAll(/'([^']*)'/g)].map((m) => m[1]);

/** `key: { pattern: '/x/$y'` — la forme UNIQUE de `route-table.tsx`. */
export function patternsDeLaTable(source) {
  const table = {};
  for (const [, cle, motif] of source.matchAll(/(\w+):\s*\{\s*pattern:\s*'([^']+)'/g)) table[cle] = motif;
  return table;
}

/** Les tables de `target.ts`, plus les deux paramètres qu'il importe de `discover/view`. */
export function litterauxDuResolveur(
  source,
  vue = readFileSync(join(APP, 'src/lib/discover/view.ts'), 'utf8'),
  tap = readFileSync(join(APP, 'src/lib/notifications/tap-navigation.ts'), 'utf8'),
) {
  const lu = {};
  for (const nom of TABLES) {
    const bloc = source.match(new RegExp(`const ${nom}\\b[^=]*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`));
    if (bloc === null) throw new Error(`table introuvable dans target.ts : ${nom}`);
    lu[nom] = litteraux(bloc[1]);
  }
  for (const nom of PARAMS) {
    const ligne = vue.match(new RegExp(`const ${nom}\\s*=\\s*'([^']*)'`));
    if (ligne === null) throw new Error(`paramètre introuvable dans discover/view.ts : ${nom}`);
    lu[nom] = ligne[1];
  }
  /* Les clés de route que le résolveur peut RENDRE — un `route: 'x'` littéral.
     Une clé ajoutée là et absente du jumeau ouvrirait une destination que le
     worker ne sait pas composer. */
  lu.routes = [...new Set([...source.matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]))];
  /* Le nom du message que le worker remet à un client déjà ouvert : sans
     l'écouteur qui le reconnaît, le tap focalise l'onglet et l'y laisse. */
  const message = tap.match(/NOTIFICATION_CLICKED_MESSAGE\s*=\s*'([^']*)'/);
  if (message === null) throw new Error('NOTIFICATION_CLICKED_MESSAGE introuvable dans tap-navigation.ts');
  lu.NOTIFICATION_CLICKED_MESSAGE = message[1];
  return lu;
}

/**
 * MONTE le jumeau dans un `self` nu et rend sa surface exposée. Un jumeau
 * qu'on ne peut pas exécuter ne se garde qu'à la lecture, et une lecture ne
 * dit pas dans quel ORDRE les règles décident.
 */
export function jumeauDuWorker(source) {
  const self = { addEventListener: () => undefined };
  new Function('self', source)(self);
  const expose = self.meeshyPushTarget;
  if (expose === undefined) throw new Error('sw-push.js n’expose pas `self.meeshyPushTarget` — le gate ne peut rien faire décider');
  return expose;
}

const memeListe = (a, b) => a.length === b.length && a.every((valeur, index) => valeur === b[index]);

/** Les adresses que le critère de fin de #7305 nomme, une par famille de destination. */
const ADRESSES = [
  [{ notificationId: 'x', conversationId: 'abc' }, '/c/abc'],
  [{ postId: 'p1', postType: 'STORY' }, '/story/p1'],
  [{ postId: 'p1', postType: 'REEL' }, '/post/p1'],
  [{ type: 'friend_request', friendRequestId: 'fr1' }, '/discover?onglet=requests&demandes=received'],
  [{ type: 'contact_joined', senderUsername: 'awa' }, '/u/awa'],
  [{ type: 'login_new_device' }, '/settings'],
  [{ type: 'badge_earned' }, '/me/progression'],
  [{ type: 'un_type_sans_ecran' }, '/notifications'],
];

export function auditParite({ table, resolveur, jumeau }) {
  const violations = [];

  for (const [cle, motif] of Object.entries(jumeau.PUSH_ROUTE_PATTERNS)) {
    const attendu = table[cle];
    if (attendu === undefined) {
      violations.push(`sw-push.js route vers « ${cle} », que route-table.tsx ne déclare pas — une adresse que personne ne sert.`);
      continue;
    }
    if (attendu !== motif) {
      violations.push(`sw-push.js compose « ${motif} » pour « ${cle} », route-table.tsx déclare « ${attendu} ».`);
    }
  }

  for (const cle of resolveur.routes) {
    if (jumeau.PUSH_ROUTE_PATTERNS[cle] === undefined) {
      violations.push(`target.ts peut rendre la route « ${cle} », que sw-push.js ne sait pas composer.`);
    }
  }

  for (const nom of TABLES) {
    const attendu = resolveur[nom];
    const lu = jumeau[nom];
    if (lu === undefined) {
      violations.push(`sw-push.js n’expose pas la table ${nom}.`);
      continue;
    }
    if (!memeListe(attendu, lu)) {
      const manquants = attendu.filter((valeur) => !lu.includes(valeur));
      const surnumeraires = lu.filter((valeur) => !attendu.includes(valeur));
      const detail = [
        manquants.length > 0 ? `absents du worker : ${manquants.join(', ')}` : '',
        surnumeraires.length > 0 ? `inconnus de target.ts : ${surnumeraires.join(', ')}` : '',
        manquants.length === 0 && surnumeraires.length === 0 ? 'même contenu, ordre différent' : '',
      ]
        .filter((part) => part !== '')
        .join(' ; ');
      violations.push(`${nom} a divergé entre target.ts et sw-push.js — ${detail}.`);
    }
  }

  for (const nom of [...PARAMS, 'NOTIFICATION_CLICKED_MESSAGE']) {
    if (resolveur[nom] !== jumeau[nom]) {
      violations.push(`${nom} vaut « ${jumeau[nom]} » dans sw-push.js et « ${resolveur[nom]} » côté page.`);
    }
  }

  for (const [charge, attendue] of ADRESSES) {
    let rendue;
    try {
      rendue = jumeau.pushTargetUrl(charge);
    } catch (erreur) {
      violations.push(`la charge ${JSON.stringify(charge)} fait lever le jumeau : ${erreur.message}`);
      continue;
    }
    if (rendue !== attendue) {
      violations.push(`la charge ${JSON.stringify(charge)} mène à « ${rendue} », le critère de fin dit « ${attendue} ».`);
    }
  }

  return violations;
}

/**
 * LE WORKER LIVRÉ CHARGE-T-IL LE HANDLER ? Workbox n'inline pas les scripts
 * importés : il émet `importScripts("sw-push.js")` en tête, et Vite recopie le
 * fichier de `public/` à côté. Les DEUX sont nécessaires — un import qui pointe
 * sur un fichier absent fait échouer l'installation du worker entier.
 */
export function auditArtefact(dist) {
  if (!existsSync(join(dist, 'sw.js'))) return null;
  const violations = [];
  const worker = readFileSync(join(dist, 'sw.js'), 'utf8');
  if (!/importScripts\([^)]*sw-push\.js/.test(worker)) {
    violations.push('dist/sw.js n’importe pas sw-push.js — le handler `push` n’est chargé par personne.');
  }
  if (!existsSync(join(dist, 'sw-push.js'))) {
    violations.push('dist/sw-push.js absent — l’import échouerait, et avec lui l’installation du worker entier.');
    return violations;
  }
  const livre = readFileSync(join(dist, 'sw-push.js'), 'utf8');
  for (const evenement of ['push', 'notificationclick']) {
    if (!livre.includes(`addEventListener('${evenement}'`)) {
      violations.push(`dist/sw-push.js n’écoute pas « ${evenement} ».`);
    }
  }
  return violations;
}

function main() {
  const resolveur = litterauxDuResolveur(readFileSync(join(APP, 'src/lib/notifications/target.ts'), 'utf8'));
  const jumeau = jumeauDuWorker(readFileSync(join(APP, 'public/sw-push.js'), 'utf8'));
  const table = patternsDeLaTable(readFileSync(join(APP, 'src/routes/route-table.tsx'), 'utf8'));
  const violations = auditParite({ table, resolveur, jumeau });

  const artefact = auditArtefact(join(APP, 'dist'));
  if (artefact !== null) violations.push(...artefact);

  if (violations.length > 0) {
    console.error(`\n  ${violations.length} dérive(s) entre le service worker et la table de routes :\n`);
    for (const violation of violations) console.error(`    · ${violation}`);
    console.error('\n  `public/sw-push.js` est le JUMEAU de `src/lib/notifications/target.ts` : toute évolution touche les DEUX.\n');
    return 1;
  }
  console.log(
    `  sw-push.js ≡ target.ts ≡ route-table.tsx — ${Object.keys(jumeau.PUSH_ROUTE_PATTERNS).length} destinations, ` +
      `${ADRESSES.length} adresses rejouées` +
      (artefact === null ? ' (dist/ absent : l’artefact n’a pas été mesuré).' : ', artefact compris.'),
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
