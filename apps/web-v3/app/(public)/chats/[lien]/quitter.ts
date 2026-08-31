'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { quitteLaPlace } from '@/lib/api/adhesion';
import { identiteDuVisiteur } from '@/lib/api/passerelle';
import { effaceLaPlaceServie, lisLaPlaceServie } from '@/lib/api/session-invitee-cookie';

/**
 * LA SORTIE — le seul geste par lequel une place se ferme côté client.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EN FAUT UN, ALORS QUE LE § 6.3 H DIT « ZÉRO `leave` »
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ce que le § 6.3 H interdit, c'est un `leave` déclenché par un ÉVÉNEMENT du
 * navigateur — fermeture d'onglet, `pagehide`, `visibilitychange` — et la raison
 * est mesurée : ce signal se déclenche quand il ne faut pas (un second onglet
 * lit encore) et se tait quand il faudrait (crash, tunnel coupé, téléphone
 * éteint). Un compteur d'admission ne peut pas tenir là-dessus.
 *
 * Un BOUTON n'est pas un événement de cycle de vie : c'est une intention, et
 * elle est sans ambiguïté. Sans lui, `rights` masque `join` à la même adresse
 * tant que le cookie vit (400 jours) et n'offre AUCUNE sortie — un visiteur qui
 * veut un autre pseudo, ou dont la place est morte côté serveur, doit vider ses
 * cookies. C'était l'irréversibilité, pas une simplicité.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, ET CE QUI NE PEUT PAS LE FAIRE ÉCHOUER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * On prévient la passerelle, PUIS on efface. Jamais l'inverse : effacer d'abord
 * perdrait le jeton avec lequel prévenir, et laisserait la place occupée côté
 * serveur jusqu'à l'expiration du bail (§ 6.4).
 *
 * Le refus de la passerelle n'arrête RIEN. `POST /anonymous/leave` rend 404 sur
 * une session déjà close — c'est exactement le cas de l'état F, celui où le
 * bouton sert le plus —, et `endGuestSession` est idempotent (#4167). Faire
 * dépendre l'effacement du cookie de cette réponse rendrait un jeton mort
 * INEFFAÇABLE : le visiteur serait enfermé par le refus qui le libère.
 *
 * L'identité RÉSEAU voyage, comme sur toutes les portes de ce module : un appel
 * serveur-à-serveur qui ne la porte pas remplace l'adresse du lecteur par celle
 * du conteneur.
 */

const CHEMIN = (lien: string): string => `/chats/${encodeURIComponent(lien)}`;

/**
 * Le pseudo revient dans l'URL, et LUI SEUL — c'est une valeur de champ que le
 * visiteur a sous les yeux, pré-remplie pour qu'il n'ait pas à la retaper
 * (§ 6.3 F : « le bouton refait le join avec le pseudo précédent pré-rempli »).
 * Aucun verdict n'y voyage : `rejoindre.ts` porte le raisonnement.
 */
const retour = (segment: string, pseudo: string | null): string =>
  pseudo === null || pseudo.trim() === ''
    ? CHEMIN(segment)
    : `${CHEMIN(segment)}?${new URLSearchParams({ pseudo }).toString()}`;

/**
 * Aucun `FormData` en paramètre, et ce n'est pas un oubli : le formulaire de la
 * sortie n'a AUCUN champ. Le navigateur en postera un vide, React l'appellera
 * avec — et une fonction qui ne le déclare pas l'ignore, là où le déclarer
 * inviterait un jour à y lire quelque chose. Le seul état de ce geste est le
 * cookie, que le serveur a déjà sous la main.
 */
export const quitterLaPlace = async (segment: string, pseudo: string | null): Promise<void> => {
  const place = await lisLaPlaceServie(segment);

  if (place !== null) {
    await quitteLaPlace({
      jeton: place.session.jeton,
      identite: identiteDuVisiteur(await headers()),
    });
    await effaceLaPlaceServie(place.cle, segment);
  }

  redirect(retour(segment, pseudo));
};
