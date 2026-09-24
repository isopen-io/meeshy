import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';
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
 * **L'IDENTIFIANT DE LA DEMANDE EST SERVI, LUI AUSSI** (#7122). `relationAvec`
 * lisait `{ status, senderId }` et jetait `id` : accepter, refuser et annuler
 * n'avaient rien à envoyer, et l'écran chargeait le panier correspondant pour
 * retrouver la ligne — trois gestes désarmés le temps du vol, pour une colonne
 * que la passerelle avait déjà en main. Elle sert désormais
 * `relationRequestId` sur le MÊME fil (`person.ts`), `pendingRequestFrom` en
 * bâtit la ligne, et il ne reste plus un seul panier derrière cette fiche.
 *
 * L'ordre de résolution est celui d'`UserRelationshipResolver.resolve` puis de
 * `FriendshipCache.status`, repris de `relationshipOf` : soi, bloqué, contact,
 * envoyée, reçue.
 */

/**
 * Le SURENSEMBLE de `Relationship` (`lib/discover/view.ts:27-33`) : même
 * vocabulaire de `kind`, à ceci près qu'une demande en attente peut ne PAS
 * porter sa ligne. Le cas nominal la porte depuis #7122 ; ce qui reste est une
 * passerelle qui ne sert pas encore `relationRequestId`. Exiger la ligne dans
 * le type forcerait alors à mentir — rendre « Ajouter » à quelqu'un dont la
 * demande est bien en attente. `actionsFor` répond autrement : sans la ligne,
 * les gestes qui l'exigent ne sont pas OFFERTS.
 */
export type ProfileRelation =
  | { readonly kind: 'self' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'friend' }
  | { readonly kind: 'pendingSent'; readonly request: FriendRequestRecord | null }
  | { readonly kind: 'pendingReceived'; readonly request: FriendRequestRecord | null }
  | { readonly kind: 'none' };

/* `report` est entré au 2026-09-21 (#7187) — le port `POST /api/v1/reports`
   existait côté passerelle et n'avait AUCUN appelant. Il se range ici plutôt
   qu'à côté : la fiche a UNE loi qui décide de ses actions, et un bouton posé
   hors d'elle serait le doublon qu'elle existe pour empêcher. */
export const PROFILE_ACTION_KINDS = ['add', 'accept', 'reject', 'cancel', 'write', 'block', 'unblock', 'report'] as const;
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

/**
 * **LA LIGNE DE LA DEMANDE, BÂTIE DEPUIS LE FIL** (#7122) — `null` hors
 * attente, et `null` sans identifiant.
 *
 * Les gestes relationnels parlent en `FriendRequestRecord` parce qu'ils
 * écrivent aussi les PANIERS que « Découvrir » lit (`friend-actions.ts`) ;
 * la fiche, elle, ne reçoit que l'identifiant et le SUJET. Le sens de la
 * demande se lit sur `served` : reçue ⇒ l'autre est l'expéditeur, envoyée ⇒
 * c'est le lecteur.
 *
 * **`createdAt` n'est pas sur le fil, et c'est assumé.** Il ne sert qu'à
 * l'insertion OPTIMISTE dans le panier des acceptées, que la réponse de la
 * passerelle remplace aussitôt (`performRespondToRequest`) — le même arbitrage
 * que la ligne provisoire de `performSendRequest`, qui l'horodate déjà ainsi.
 */
export function pendingRequestFrom(params: {
  readonly served: ServedRelation;
  readonly requestId: string | null;
  readonly person: PersonSummary;
  readonly viewerId: string | null;
}): FriendRequestRecord | null {
  const { served, requestId, person, viewerId } = params;
  if (requestId === null) return null;
  if (served !== 'pending_received' && served !== 'pending_sent') return null;
  const recue = served === 'pending_received';
  const moi = viewerId ?? '';
  return {
    id: requestId,
    senderId: recue ? person.id : moi,
    receiverId: recue ? moi : person.id,
    status: 'pending',
    message: null,
    createdAt: new Date().toISOString(),
    sender: recue ? person : null,
    receiver: recue ? null : person,
  };
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
  /* SANS SA LIGNE, UN GESTE N'EST PAS OFFERT (#7122) — il l'était, DÉSACTIVÉ,
     le temps qu'un panier arrive ; le panier a disparu, et ce qui reste est
     une passerelle qui ne sert pas encore `relationRequestId`. Un bouton qui
     ne pourrait QUE échouer ment (loi 4) ; la bannière de contexte, elle, dit
     toujours de quoi il s'agit. */
  const sansLigne =
    (relation.kind === 'pendingReceived' || relation.kind === 'pendingSent') && relation.request === null;
  if (sansLigne) return ['write', 'block', 'report'];
  switch (relation.kind) {
    /* SIGNALER EST OFFERT PARTOUT SAUF SUR SOI (#7187) — y compris sur un
       compte qu'on a BLOQUÉ : bloquer met fin au contact, signaler prévient la
       modération, et l'un n'a jamais valu l'autre. */
    case 'self':
      return [];
    case 'blocked':
      return ['unblock', 'report'];
    case 'friend':
      return ['write', 'block', 'report'];
    case 'pendingSent':
      return ['cancel', 'write', 'block', 'report'];
    case 'pendingReceived':
      return ['accept', 'reject', 'write', 'block', 'report'];
    case 'none':
      return ['add', 'write', 'block', 'report'];
  }
}
