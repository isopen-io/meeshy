import { cookies } from 'next/headers';

import {
  cleAttestee,
  cleDuLien,
  estNommable,
  sessionDepuisLaValeur,
  type CleDeLien,
  type SessionInvitee,
} from './guest-session';

/**
 * OÙ VIT LA PLACE D'UN VISITEUR QUI N'EXÉCUTE PAS DE JAVASCRIPT.
 *
 * Le § 6 range le jeton invité dans `localStorage`, sous `meeshy.guest.<lien>`,
 * et c'est juste — pour un navigateur qui exécute du code. Le rôle PREMIER, lui,
 * exige que rejoindre marche « sans compte et sans JS lourd, sur un téléphone en
 * 3G » : la conception pose les deux exigences et ne fait jamais se rencontrer
 * la seconde avec la première. Elle se rencontrent ici, et voici la décision.
 *
 * **Le serveur écrit un COOKIE ; le navigateur, quand il en a un, tient sa
 * copie dans `localStorage`. Une seule CLÉ, une seule FORME — celles de
 * `guest-session.ts` — deux transports, parce qu'il y a deux exécutants.** Ce
 * n'est pas une seconde source de vérité : la source est le serveur
 * (`Participant.isActive`, § 6.1 point 1), et ces deux-là n'en sont que des
 * porteurs. Ce qui SERAIT une seconde source, et qui est donc interdit ici,
 * c'est une seconde façon de NOMMER l'entrée ou de la FORMATER : `cleDuLien` et
 * `sessionDepuisLaValeur` sont importés, jamais réécrits.
 *
 * **Ce cookie porte le JETON, jamais l'autorité.** Les quatre droits qu'il
 * transporte sont un CACHE — ce qu'on peint avant que la passerelle ait
 * répondu, et ce qu'on garde quand elle ne répond pas (§ 7 : « rien ne change à
 * l'écran : c'est une coupure, pas un refus »). L'autorité est
 * `POST /anonymous/refresh`, que l'écran des droits appelle à chaque rendu
 * (§ 6.3 B : « les droits sont RE-LUS de la réponse : l'hôte a pu les
 * changer »). Un cookie non signé qui ferait AUTORITÉ sur des droits laisserait
 * n'importe quel script de la page se les accorder ; celui-ci ne peut que
 * décider ce qui s'affiche AVANT la réponse, et la réponse le corrige.
 *
 * POURQUOI PAS `httpOnly`
 *
 * Parce que l'îlot de participation (lot L2, `thread`) doit ouvrir la connexion
 * temps réel avec ce jeton, et qu'un cookie `httpOnly` lui est invisible. La
 * surface d'exposition est celle que le § 6 accepte déjà pour `localStorage` ;
 * la refuser ici tout en l'acceptant là serait une rigueur de façade.
 *
 * POURQUOI UNE DATE, ALORS QUE LE JETON N'EN A PAS
 *
 * Le jeton n'a AUCUNE expiration temporelle (§ 6.1 point 1) : sa seule condition
 * de validité est `Participant.isActive`. Un cookie, lui, DOIT choisir — sans
 * `maxAge` il meurt à la fermeture du navigateur, et une place parfaitement
 * valide serait perdue côté client pendant qu'elle reste occupée côté serveur
 * (le contraire exact de ce que le § 6.2 organise). `MAXIMUM_NAVIGATEUR` est
 * donc le PLAFOND des navigateurs (400 jours, RFC 6265bis), pas une durée de
 * vie produit : c'est l'approximation la plus proche de « pas d'expiration » que
 * la plateforme autorise, et l'autorité reste le serveur.
 *
 * POURQUOI `path` VAUT `/chats`
 *
 * Une place ne concerne que les écrans de conversation. Un cookie de portée `/`
 * partirait avec chaque requête de la zone — y compris les actifs — pour un
 * jeton dont aucune autre route n'a besoin. Le NOM reste indexé par lien
 * (`meeshy.guest.<lien>`) : c'est lui, et non le chemin, qui empêche deux liens
 * de s'écraser (§ 6.1 point 7).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'ALIAS — UN POINTEUR, PAS UNE SECONDE ENTRÉE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'adresse par laquelle un visiteur ARRIVE n'est presque jamais la clé
 * canonique : `/l/:token` redirige vers `/chats/<token>`
 * (`app/(public)/l/[token]/destination.ts`), et la passerelle accepte trois
 * formes pour un même lien. Ranger la place sous le segment donnerait DEUX
 * entrées pour UNE place — ce que le § 6.1 point 2 bis interdit, et à raison.
 *
 * Ranger sous la clé canonique et ne rien laisser sous le segment a un coût
 * qu'il faut dire : retrouver sa propre place exige alors de RÉSOUDRE le
 * segment, donc d'appeler l'aperçu du lien — et l'aperçu refuse (410
 * `LINK_MAX_USES`) dès que `currentUses >= maxUses`, c'est-à-dire dès que la
 * place a été prise sur un lien à une place. La place existait, le serveur la
 * tenait pour valide, et l'écran répondait « ce lien a atteint sa limite ».
 *
 * L'alias tranche : un SECOND cookie, nommé d'après le segment, dont la valeur
 * est la clé canonique — et rien d'autre. Il ne porte ni jeton, ni identité, ni
 * droits ; il ne peut donc pas diverger de la place, puisqu'il n'en contient
 * aucune partie. Perdu, il ne coûte qu'un aperçu ; trafiqué, il ne désigne
 * qu'une entrée que ce serveur a lui-même écrite, ou rien.
 */

const MAXIMUM_NAVIGATEUR = 400 * 24 * 60 * 60;

const PORTEE = '/chats';

const RACINE_ALIAS = 'meeshy.chemin.';

/**
 * LE MARQUEUR D'ENTRÉE DANS LE FIL — pourquoi il vit ICI, avec la place.
 *
 * `/chats/:lien` est UNE route dans TROIS états : sans place, elle demande
 * d'entrer (`join`) ; avec une place fraîche, elle dit ce que cette place ouvre
 * (`rights`) ; une fois le fil ouvert, elle EST le fil (`thread`, § 6.3 B :
 * « rend d'abord le cache … la conversation, immédiatement »). En fabriquer une
 * seconde adresse casserait le retour arrière du navigateur, ce que le § 6.3 B
 * refuse ; distinguer par un paramètre de requête rendrait l'état de l'écran
 * réinscriptible par quiconque a l'adresse partagée, ce que `page.tsx` refuse
 * déjà pour le verdict d'un refus.
 *
 * Le marqueur est donc un cookie que seul ce serveur écrit, posé par le geste
 * du visiteur — « Entrer dans la conversation » — et il est RANGÉ AVEC LA PLACE
 * plutôt qu'ailleurs, pour une raison qui n'est pas de commodité : il doit
 * mourir avec elle. Un marqueur qui survivrait à `effaceLaPlaceServie` ferait
 * rendre le fil d'une place qui n'existe plus, c'est-à-dire un écran vide sans
 * explication à la place du formulaire d'entrée.
 *
 * Il ne porte AUCUNE autorité : ni jeton, ni droit, ni identité. Trafiqué, il
 * n'ouvre rien — il n'y a pas de place sans le cookie de place, et c'est celui-là
 * qui est arbitré par `POST /anonymous/refresh` à chaque rendu.
 */
const RACINE_DU_FIL = 'meeshy.fil.';

const nomDeLAlias = (segment: string): string | null =>
  estNommable(segment) ? `${RACINE_ALIAS}${segment}` : null;

const OPTIONS = {
  path: PORTEE,
  maxAge: MAXIMUM_NAVIGATEUR,
  sameSite: 'lax',
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
} as const;

/** Une place SERVIE — son nom canonique et ce qu'elle porte, jamais l'un sans l'autre. */
export type PlaceServie = {
  readonly cle: CleDeLien;
  readonly session: SessionInvitee;
};

export const poseLaPlaceServie = async (
  lien: CleDeLien,
  session: SessionInvitee,
  /** L'adresse par laquelle le visiteur est arrivé — ce que l'alias fait pointer. */
  segment?: string,
): Promise<void> => {
  const boite = await cookies();

  boite.set(cleDuLien(lien), JSON.stringify(session), OPTIONS);

  const alias = segment === undefined || segment === lien ? null : nomDeLAlias(segment);
  if (alias !== null) boite.set(alias, lien, OPTIONS);
};

/**
 * LA PLACE, RETROUVÉE SANS UN SEUL APPEL RÉSEAU.
 *
 * Deux chemins, dans cet ordre, et aucun ne DEVINE :
 *
 *   1. le candidat nomme directement une entrée — c'est le cas de la
 *      redirection du join, qui dépose le visiteur sur la clé canonique ;
 *   2. un alias écrit par ce serveur désigne l'entrée — c'est le cas du lien
 *      PARTAGÉ ré-ouvert, dont le segment n'est pas la clé.
 *
 * Une entrée illisible ne vaut pas une session, et ne détruit pas celle qui est
 * là : une version plus récente a pu l'écrire, et un serveur ancien n'a pas à
 * effacer ce qu'il ne sait pas lire (§ 6.1, `guest-session.ts` point 3).
 */
export const lisLaPlaceServie = async (candidat: string): Promise<PlaceServie | null> => {
  const boite = await cookies();
  const atteste = (nom: string): boolean => boite.get(nom) !== undefined;

  const alias = nomDeLAlias(candidat);
  const cle =
    cleAttestee(candidat, atteste) ??
    (alias === null ? null : cleAttestee(boite.get(alias)?.value ?? '', atteste));

  if (cle === null) return null;

  const session = sessionDepuisLaValeur(boite.get(cleDuLien(cle))?.value ?? null);
  return session === null ? null : { cle, session };
};

/**
 * L'acte NOMMÉ de l'état F — le seul chemin par lequel une place SERVIE se
 * perd, et il est déclenché par un BOUTON, jamais par une erreur réseau (§ 7).
 *
 * L'alias part avec l'entrée quand on le connaît ; celui qu'on ne connaît pas
 * ne survit pas à l'entrée pour autant — il ne désigne plus rien, et
 * `lisLaPlaceServie` rend alors `null`, exactement comme s'il avait été effacé.
 */
export const effaceLaPlaceServie = async (lien: CleDeLien, segment?: string): Promise<void> => {
  const boite = await cookies();

  boite.delete({ name: cleDuLien(lien), path: PORTEE });
  boite.delete({ name: `${RACINE_DU_FIL}${lien}`, path: PORTEE });

  const alias = segment === undefined || segment === lien ? null : nomDeLAlias(segment);
  if (alias !== null) boite.delete({ name: alias, path: PORTEE });
};

/** Le geste « Entrer dans la conversation » — le seul écrivain du marqueur. */
export const poseLEntreeDansLeFil = async (lien: CleDeLien): Promise<void> => {
  const boite = await cookies();
  boite.set(`${RACINE_DU_FIL}${lien}`, '1', OPTIONS);
};

/**
 * Le fil est-il ouvert pour CETTE place ?
 *
 * La question se pose sur la clé CANONIQUE, jamais sur le segment d'URL : une
 * arrivée par le lien partagé et une arrivée par la clé sont la même place
 * (§ 6.1 point 2 bis), donc le même fil.
 */
export const filEstOuvert = async (lien: CleDeLien): Promise<boolean> =>
  (await cookies()).get(`${RACINE_DU_FIL}${lien}`)?.value === '1';
