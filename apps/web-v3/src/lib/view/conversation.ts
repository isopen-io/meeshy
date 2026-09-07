import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import type { Conversation, Participant, UserPresenceStatus } from '@/lib/api/types';

/**
 * CE QUE LA VUE DÉRIVE DU DOMAINE — et rien d'autre.
 *
 * Le POC portait ces valeurs comme des CHAMPS : `isGrouped`, `unread`,
 * `initials`, `presence`, `participants`. Aucune n'existe dans le domaine ;
 * toutes se calculent. Les stocker obligeait la fixture à les tenir à jour à
 * la main, et — plus grave — laissait croire que la passerelle les servait.
 *
 * Le seul qui n'est PAS un calcul local est la présence : sa loi (fenêtres
 * 1 / 3 / 5 minutes, garde anti-stale) vit dans `@meeshy/shared`, avec ses
 * jumeaux iOS et Android. La réécrire ici en ferait une quatrième.
 */

/**
 * `direct` est le seul type à DEUX personnes. Un `public`, un `global` et un
 * `broadcast` sont des groupes du point de vue de la vue — ce qui gouverne
 * l'affichage est « montre-t-on un nom d'expéditeur et un compte de membres »,
 * pas la nature du salon.
 */
export const isGroup = (conversation: Conversation): boolean => conversation.type !== 'direct';

/** ABSENT ⇒ 0 : le serveur qui ne compte pas n'annonce pas « non lu ». */
export const unreadOf = (conversation: Conversation): number => conversation.unreadCount ?? 0;

/**
 * Une conversation directe n'a pas forcément de titre : elle porte le nom de
 * l'autre. `identifier` ferme la marche pour qu'une ligne ne soit jamais vide.
 */
export const titleOf = (conversation: Conversation, viewerId: string): string =>
  conversation.title ?? peerOf(conversation, viewerId)?.displayName ?? conversation.identifier ?? '';

/**
 * L'AUTRE, dans une conversation directe. `undefined` partout ailleurs — et
 * `participants` est tronqué à cinq par la passerelle, donc s'en servir pour
 * autre chose que ça serait faux.
 */
export const peerOf = (conversation: Conversation, viewerId: string): Participant | undefined =>
  conversation.type === 'direct'
    ? conversation.participants.find((p) => p.userId !== viewerId)
    : undefined;

/**
 * Deux lettres, jamais plus : « Amina Diallo » → « AD », « Équipe » → « ÉQ ».
 * Un seul mot rend ses deux premières lettres plutôt qu'une seule, parce
 * qu'une initiale seule dans un cercle de 44 px lit comme une erreur.
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
};

/**
 * La présence SERVIE. Une entrée absente rend `offline`, donc AUCUNE pastille
 * — c'est la règle produit du dépôt (« offline = pas de pastille »), et c'est
 * aussi ce qu'impose la visibilité de la présence : hors amitié acceptée, le
 * serveur ne sert ni `isOnline` ni `lastActiveAt`, et un client ne fabrique
 * jamais ce que le serveur retire.
 */
export const presenceOf = (participant: Participant | undefined): UserPresenceStatus =>
  getUserPresenceStatus(
    participant === undefined
      ? null
      : {
          isOnline: participant.isOnline,
          ...(participant.lastActiveAt === undefined ? {} : { lastActiveAt: participant.lastActiveAt }),
        },
  );
