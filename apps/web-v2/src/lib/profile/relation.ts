import type { FriendRequestBucket, FriendRequestRecord } from '@/lib/api/friend-requests';
import type { ServedRelation } from '@/lib/api/public-profile';

/**
 * **L'ÉTAT RELATIONNEL DU PROFIL — UNE source, celle que le geste PATCHE.**
 *
 * L'état AFFICHÉ vient de `relation`, servi AVEC le profil (`expand=relation`,
 * `services/gateway/src/routes/directory/person.ts:72-93`). Les gestes
 * optimistes l'écrivent EN PLACE dans l'entrée de cache du profil et l'y
 * défont sur échec (`lib/api/friend-actions.ts`) : il n'existe donc pas deux
 * vérités à réconcilier.
 *
 * **POURQUOI PAS L'INDEX DES PANIERS** (`lib/discover/view.ts#relationshipIndexOf`)
 * — il est la source de « Découvrir », et c'est la bonne là-bas. Ici il
 * mentirait : le panier `accepted` porte CENT lignes au plus
 * (`FRIEND_REQUESTS_PAGE_SIZE`, `api/friend-requests.ts:34`), donc un contact
 * au-delà de la centième y est ABSENT — et « absent du panier » se lirait
 * « Ajouter » sur la fiche d'un ami.
 *
 * **LE BLOCAGE EST SERVI, ET IL EST SERVI À CÔTÉ** (#7125). `relationAvec`
 * n'a toujours pas de valeur `blocked`, et c'est JUSTE : bloquer quelqu'un
 * n'efface pas la ligne d'amitié, le serveur continue de servir `friend` ou
 * `pending_sent`, et c'est ce qui permet à « Débloquer » de rendre la relation
 * qu'on avait. La passerelle répond donc sur un CHAMP à part —
 * `blockedByViewer`, résolu par `hasBlocked` pour ce sujet précis
 * (`services/gateway/src/utils/blocking.ts`, `routes/directory/person.ts`) —
 * et `blocked` ci-dessous en est la projection directe. Il se DÉDUISAIT du
 * panier `BLOCKED_USERS_QUERY_KEY`, plafonné à cent lignes : la même raison
 * qui interdit le panier `accepted` deux paragraphes plus haut le condamnait,
 * et il n'a tenu que faute d'alternative servie.
 *
 * **CE QUE LA PASSERELLE NE DIT TOUJOURS PAS, ET CE QU'ON N'INVENTE PAS.**
 *
 *  - *L'identifiant de la demande en cours* : `relationAvec` lit
 *    `{ status, senderId }` et jette `id` (`person.ts:81-92`). Accepter,
 *    refuser, annuler en ont besoin. Tant que l'issue gateway compagnon
 *    (`relationRequestId` sur `expand=relation`) n'est pas livrée, l'écran
 *    charge le SEUL panier utile — et seulement quand la relation est en
 *    attente (`bucketNeededFor`). Coût nominal (`none` / `friend` / `self`) :
 *    ZÉRO requête de plus. Tant que l'identifiant manque, le geste est
 *    ANNONCÉ en attente : jamais un bouton mort (loi 4).
 *
 * L'ordre de résolution est celui d'`UserRelationshipResolver.resolve` puis de
 * `FriendshipCache.status`, repris de `relationshipOf` : soi, bloqué, contact,
 * envoyée, reçue.
 */

/**
 * Le SURENSEMBLE de `Relationship` (`lib/discover/view.ts:27-33`) : même
 * vocabulaire de `kind`, à ceci près qu'une demande en attente peut ne PAS
 * encore porter sa ligne. « Découvrir » bâtit l'état DEPUIS les paniers et a
 * donc toujours la ligne ; le profil bâtit l'état depuis le FIL, qui ne la
 * porte pas. Un type qui l'exigerait forcerait à mentir — rendre « Ajouter »
 * à quelqu'un dont la demande est bien en attente.
 */
export type ProfileRelation =
  | { readonly kind: 'self' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'friend' }
  | { readonly kind: 'pendingSent'; readonly request: FriendRequestRecord | null }
  | { readonly kind: 'pendingReceived'; readonly request: FriendRequestRecord | null }
  | { readonly kind: 'none' };

export const PROFILE_ACTION_KINDS = ['add', 'accept', 'reject', 'cancel', 'write', 'block', 'unblock'] as const;
export type ProfileActionKind = (typeof PROFILE_ACTION_KINDS)[number];

export function relationFromServed(params: {
  readonly served: ServedRelation;
  readonly blocked: boolean;
  readonly request: FriendRequestRecord | null;
}): ProfileRelation {
  if (params.served === 'self') return { kind: 'self' };
  if (params.blocked) return { kind: 'blocked' };
  if (params.served === 'friend') return { kind: 'friend' };
  if (params.served === 'pending_sent') return { kind: 'pendingSent', request: params.request };
  if (params.served === 'pending_received') return { kind: 'pendingReceived', request: params.request };
  return { kind: 'none' };
}

/** Le panier à charger pour retrouver la LIGNE de la demande — `null` dans le
 * cas nominal, qui ne paie donc aucune requête de plus. */
export function bucketNeededFor(served: ServedRelation): FriendRequestBucket | null {
  if (served === 'pending_received') return 'received';
  if (served === 'pending_sent') return 'sent';
  return null;
}

/**
 * Les gestes offerts par état, miroir d'`actionButtons`
 * (`UserProfileSheet+DetailsTab.swift:139-216`), à trois écarts ASSUMÉS :
 *
 *  - **« Écrire » EN PLUS** : l'énoncé de #7083 le nomme, et c'est la réponse
 *    à l'audience de l'écran — quelqu'un qui vient de lire une mention et
 *    cherche comment joindre la personne. iOS l'offre ailleurs dans son
 *    arborescence.
 *  - **« Renvoyer la demande » NON REPRIS** (`resendRequest`,
 *    `UserProfileSheet.swift:405-410`) : il supprime puis recrée, ce qui repart
 *    le débit de la cible et perd la trace de la demande initiale. « Annuler »
 *    puis « Ajouter » donne le même résultat en deux gestes explicites.
 *  - **« Signaler » HORS PÉRIMÈTRE** : il mérite sa feuille de confirmation et
 *    ses huit motifs, pas un bouton de plus. Issue compagnon.
 */
export function actionsFor(relation: ProfileRelation): readonly ProfileActionKind[] {
  switch (relation.kind) {
    case 'self':
      return [];
    case 'blocked':
      return ['unblock'];
    case 'friend':
      return ['write', 'block'];
    case 'pendingSent':
      return ['cancel', 'write', 'block'];
    case 'pendingReceived':
      return ['accept', 'reject', 'write', 'block'];
    case 'none':
      return ['add', 'write', 'block'];
  }
}
