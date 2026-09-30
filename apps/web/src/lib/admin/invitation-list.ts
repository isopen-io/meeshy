import { defineListSpec, type ListState } from './list-state';

/**
 * **LA LISTE DES DEMANDES DE CONTACT** (#8876, #6729) — ce que l'écran sait filtrer,
 * donc ce que l'adresse peut porter.
 *
 * - `status` : les trois statuts que `PATCH` admet (`pending`, `accepted`,
 *   `rejected`).
 * - `senderId` : « toutes les demandes envoyées par CE membre » — un filtre par
 *   IDENTIFIANT, qui n'entre que s'il a la forme d'un ObjectId (on y arrive depuis
 *   une fiche).
 * - **Jamais `communityId`** : la route le lit, mais la colonne n'existe pas sur
 *   une demande d'ami — le filtre ne filtrerait rien.
 * - **Ni recherche ni tri** : la route n'en sert pas. La clé de tri est unique
 *   (`createdAt`, plus récentes d'abord) et aucune colonne n'est triable.
 */
export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected'] as const;

export const INVITATION_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: { status: INVITATION_STATUSES },
  idFilters: ['senderId'],
  pageSizes: [20, 50, 100],
});

export type InvitationSortKey = (typeof INVITATION_LIST_SPEC.sortKeys)[number];
export type InvitationFilterKey = keyof typeof INVITATION_LIST_SPEC.filters;
export type InvitationIdFilterKey = 'senderId';
export type InvitationListState = ListState<InvitationSortKey, InvitationFilterKey, InvitationIdFilterKey>;

/** La requête envoyée à la passerelle : la page, le statut, l'expéditeur — rien d'autre n'est lu par la route. */
export function invitationListQuery(state: InvitationListState): URLSearchParams {
  const query = new URLSearchParams({ offset: String(state.offset), limit: String(state.limit) });
  const status = state.filters.status;
  if (status !== undefined) query.set('status', status);
  const sender = state.ids.senderId;
  if (sender !== undefined) query.set('senderId', sender);
  return query;
}
