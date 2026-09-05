import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { ZONE_DU_TEMPS_REEL } from '../scripts/lib/perimetre-de-zone.mjs';

import { lisLActif, memo } from './actifs';

/**
 * LES ACTIFS DU TEMPS RÉEL, et le SEUL site qui compose leur adresse
 * (conception § 12.4).
 *
 * `participate.<hash>.js` (le fil), `liste.<hash>.js` (`/chats`),
 * `feed.<hash>.js` (`/feed`, #5031), `notifs.<hash>.js` (`/notifications`,
 * #4898), `contacts.<hash>.js` (`/contacts`, #4921) et `recherche.<hash>.js`
 * (`/search`, #4897), `liens.<hash>.js` (`/links`, #5090),
 * `commentaires.<hash>.js` (`/post/:id`, #5091), `plein.<hash>.js`
 * (`/chats/:cle/medias`, #4525), `navigateur.<hash>.js` (la navigation de
 * zone, § 12.11) et `composer.<hash>.js` (`/composer`, #4966 — le seul qui ne
 * parle à personne : il tient un BROUILLON dans `sessionStorage`) sont les
 * ONZE modules de participation
 * compilés par `scripts/build-participate.mjs` (bun build, AVANT `next
 * build`) — onze fichiers parce qu'un écran ne doit télécharger que ce qu'il
 * exécute (la liste n'a ni composeur, ni réserve, ni plein écran ; le fil
 * social n'a ni l'un ni l'autre, et pas de socket non plus — aimer et
 * reposter sont des allers simples, § `lib/realtime/feed.ts` ; la galerie n'a
 * qu'UN appel, `prendsLePleinEcran()` — c'est tout ce qu'elle doit au
 * clavier) ;
 * `socket.io.<hash>.js` est `socket.io-client@4.8.3` servi tel quel depuis son
 * paquet, et `feed.<hash>.js` ne le référence PAS : c'est le seul des quatre
 * modules qui n'en a pas besoin (`notifs` écoute la room personnelle, donc en dépend). Le hash est dans le NOM, calculé sur le CONTENU, par ce module — et
 * c'est ce même module que le document du fil appelle pour écrire l'URL et que
 * `app/rt/[nom]/route.ts` appelle pour servir : une seule lecture, aucune
 * jumelle, et un cache immuable qui ne peut pas mentir puisque l'adresse change
 * avec l'octet.
 *
 * La lecture est faite UNE fois par processus (`memo`) : ce sont des actifs de
 * build. Un actif ABSENT (le module pas encore compilé, en test) rend un corps
 * vide et une adresse quand même composée : le document reste servable, le
 * chargeur différé recevra un 404 après le premier pixel — amélioration
 * progressive, jamais une condition (§ 12.4).
 *
 * `next.config.ts` nomme ces deux fichiers dans `outputFileTracingIncludes` :
 * `standalone` ne trace que ce qu'un `import` désigne, et une lecture par
 * chemin n'en est pas un.
 */

/** `/__v3/rt` — la zone du temps réel, portée par la réécriture que `next.config.ts` pose. */
export const PREFIXE_RT = ZONE_DU_TEMPS_REEL;

export const DOSSIER_DU_MODULE = '.rt';

export type ActifTempsReel = {
  readonly nom: string;
  readonly url: string;
  readonly corps: string;
};

export type ActifsTempsReel = {
  readonly participate: ActifTempsReel;
  readonly liste: ActifTempsReel;
  readonly feed: ActifTempsReel;
  readonly notifs: ActifTempsReel;
  readonly contacts: ActifTempsReel;
  readonly recherche: ActifTempsReel;
  readonly liens: ActifTempsReel;
  readonly commentaires: ActifTempsReel;
  readonly plein: ActifTempsReel;
  readonly navigateur: ActifTempsReel;
  readonly composer: ActifTempsReel;
  readonly socket: ActifTempsReel;
};

const lisLeModule = (base: string): string => {
  try {
    return lisFichier(join(process.cwd(), DOSSIER_DU_MODULE, `${base}.js`));
  } catch {
    return '';
  }
};

const lisFichier = (chemin: string): string =>
  // `lisLActif` ne connaît que `node_modules/@meeshy/<paquet>` ; le module
  // compilé vit à la racine du paquet, et socket.io-client hors de `@meeshy`.
  // La convention de LECTURE reste la même : un fichier absent rend ''.
  (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lecture synchrone d'un actif de build, comme lib/actifs.ts
      return (require('node:fs') as typeof import('node:fs')).readFileSync(chemin, 'utf8');
    } catch {
      return '';
    }
  })();

const empreinte = (corps: string): string =>
  createHash('sha256').update(corps).digest('hex').slice(0, 16);

const actif = (base: string, corps: string): ActifTempsReel => {
  const nom = `${base}.${empreinte(corps)}.js`;
  return { nom, url: `${PREFIXE_RT}/${nom}`, corps };
};

export const actifsTempsReel = memo(
  (): ActifsTempsReel => ({
    participate: actif('participate', lisLeModule('participate')),
    liste: actif('liste', lisLeModule('liste')),
    feed: actif('feed', lisLeModule('feed')),
    notifs: actif('notifs', lisLeModule('notifs')),
    contacts: actif('contacts', lisLeModule('contacts')),
    recherche: actif('recherche', lisLeModule('recherche')),
    liens: actif('liens', lisLeModule('liens')),
    commentaires: actif('commentaires', lisLeModule('commentaires')),
    plein: actif('plein', lisLeModule('plein')),
    navigateur: actif('navigateur', lisLeModule('navigateur')),
    composer: actif('composer', lisLeModule('composer')),
    socket: actif(
      'socket.io',
      lisFichier(join(process.cwd(), 'node_modules', 'socket.io-client', 'dist', 'socket.io.esm.min.js')),
    ),
  }),
);

/** L'actif que le nom désigne — `null` pour tout autre nom, y compris un hash périmé. */
export const actifParNom = (nom: string): ActifTempsReel | null => {
  // `Object.values`, jamais une énumération à la main : la liste manuscrite a
  // retenu le 9ᵉ module en 404 pendant que le document composait son URL avec
  // le même memo (#5106) — une énumération qui affirme « tous » se périme à
  // chaque actif nouveau, et le témoin « chaque actif du memo est servable »
  // (actifs-rt.test.ts) rougit désormais à sa place.
  return (
    Object.values(actifsTempsReel()).find(
      (candidat) => candidat.nom === nom && candidat.corps !== '',
    ) ?? null
  );
};

/** Gardé pour la parité de lecture avec `lib/actifs.ts` — le sprite et la table passent par lui. */
export const lisLActifPartage = lisLActif;
