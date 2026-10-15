import type { AdminPublication, AdminPublicationGesture, AdminPublicationPage } from '@/lib/api/admin-user-publications';

/**
 * **CE QU'UN GESTE FAIT À UNE PUBLICATION, VU AVANT LA RÉPONSE** (#10315) — le reflet
 * optimiste de la loi de la passerelle (`services/admin/publication-moderation.ts`) :
 * la ligne change d'état au geste, la relecture qui suit la confirme ou la corrige.
 *
 * - « Mettre en privé » : audience réduite à l'auteur, l'audience d'avant retenue ;
 * - « Mettre hors ligne » : même effet, daté ; l'audience d'avant retenue ;
 * - « Remettre en ligne » : le retrait levé, l'audience de l'auteur rendue.
 *
 * Une publication supprimée n'est jamais touchée : aucun geste ne la ressuscite.
 */
const PRIVATE = 'PRIVATE';

const retained = (publication: AdminPublication): string | null =>
  publication.visibility !== PRIVATE ? publication.visibility : publication.priorVisibility;

const isExpired = (publication: AdminPublication, now: Date): boolean =>
  publication.expiresAt !== null && new Date(publication.expiresAt).getTime() <= now.getTime();

export function applyPublicationGesture(publication: AdminPublication, gesture: AdminPublicationGesture, now: Date): AdminPublication {
  if (publication.state === 'deleted') return publication;
  switch (gesture) {
    case 'make-private':
      if (publication.visibility === PRIVATE) return publication;
      return { ...publication, visibility: PRIVATE, priorVisibility: publication.visibility, state: publication.state === 'offline' ? 'offline' : 'private' };
    case 'take-offline':
      if (publication.moderationHiddenAt !== null) return publication;
      return { ...publication, visibility: PRIVATE, priorVisibility: retained(publication), moderationHiddenAt: now.toISOString(), state: 'offline' };
    case 'restore': {
      if (publication.moderationHiddenAt === null && publication.priorVisibility === null) return publication;
      const visibility = publication.visibility === PRIVATE && publication.priorVisibility !== null ? publication.priorVisibility : publication.visibility;
      const state = visibility === PRIVATE ? 'private' : isExpired(publication, now) ? 'expired' : 'online';
      return { ...publication, visibility, priorVisibility: null, moderationHiddenAt: null, state };
    }
  }
}

export function applyGestureToPage(
  page: AdminPublicationPage,
  ids: ReadonlySet<string>,
  gesture: AdminPublicationGesture,
  now: Date,
): AdminPublicationPage {
  return {
    ...page,
    publications: page.publications.map((publication) => (ids.has(publication.id) ? applyPublicationGesture(publication, gesture, now) : publication)),
  };
}
