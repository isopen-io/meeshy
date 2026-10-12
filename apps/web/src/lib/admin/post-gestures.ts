import { adminGesturesFor, type AdminPostGestureName, type AdminPostState, type AdminSettableVisibility } from '@meeshy/shared/types/admin-publication-states';

import type { AdminPostView } from '@/lib/api/admin-post-gestures';

/**
 * **CE QU'UN GESTE FAIT À UNE PUBLICATION, VU AVANT LA RÉPONSE** (#10392) — le reflet
 * optimiste de la loi de la passerelle (`services/admin/publication-moderation.ts`) :
 *
 * - « Mettre hors ligne » : audience réduite à l'auteur, retrait daté, audience retenue ;
 * - « Remettre en ligne » : retrait levé, audience de l'auteur rendue ;
 * - « Audience » : l'audience choisie, retrait levé ; vers `PRIVATE`, l'audience d'avant
 *   est retenue pour que « Remettre en ligne » la rende.
 *
 * Une publication supprimée n'est jamais touchée. La vue servie (`withPostView`) fait foi.
 */
export type PostGestureIntent =
  | { readonly gesture: 'take-offline' }
  | { readonly gesture: 'restore' }
  | { readonly gesture: 'set-visibility'; readonly visibility: AdminSettableVisibility };

export type PostModerationFacts = {
  readonly visibility: string | null;
  readonly moderationHiddenAt: string | null;
  readonly moderationPriorVisibility: string | null;
  readonly deletedAt: string | null;
  readonly expiresAt: string | null;
};

const PRIVATE = 'PRIVATE';

export function gestureEffect<Row extends PostModerationFacts>(row: Row, intent: PostGestureIntent, now: Date): Row {
  if (row.deletedAt !== null) return row;
  switch (intent.gesture) {
    case 'take-offline': {
      if (row.moderationHiddenAt !== null) return row;
      const prior = row.visibility !== PRIVATE ? row.visibility : row.moderationPriorVisibility;
      return { ...row, visibility: PRIVATE, moderationHiddenAt: now.toISOString(), moderationPriorVisibility: prior };
    }
    case 'restore': {
      if (row.moderationHiddenAt === null && row.moderationPriorVisibility === null) return row;
      const visibility = row.visibility === PRIVATE && row.moderationPriorVisibility !== null ? row.moderationPriorVisibility : row.visibility;
      return { ...row, visibility, moderationHiddenAt: null, moderationPriorVisibility: null };
    }
    case 'set-visibility': {
      const prior = intent.visibility === PRIVATE ? (row.visibility !== PRIVATE ? row.visibility : row.moderationPriorVisibility) : null;
      return { ...row, visibility: intent.visibility, moderationHiddenAt: null, moderationPriorVisibility: prior };
    }
  }
}

/** Les gestes qu'un état laisse faire — la définition partagée avec la passerelle. */
export function gesturesOffered(state: AdminPostState): readonly AdminPostGestureName[] {
  return adminGesturesFor(state);
}

type Page<Row> = { readonly rows: readonly Row[]; readonly total: number; readonly hasMore: boolean };

/** Une page en cache, une ligne changée par le geste : l'effet immédiat sur la liste. */
export function applyGestureToRows<Row extends PostModerationFacts & { readonly id: string }>(page: Page<Row>, id: string, intent: PostGestureIntent, now: Date): Page<Row> {
  return { ...page, rows: page.rows.map((row) => (row.id === id ? gestureEffect(row, intent, now) : row)) };
}

/** La vue SERVIE après le geste remplace ce que l'optimiste avait posé. */
export function withPostView<Row extends PostModerationFacts & { readonly id: string }>(page: Page<Row>, view: AdminPostView): Page<Row> {
  return {
    ...page,
    rows: page.rows.map((row) =>
      row.id === view.id ? { ...row, visibility: view.visibility, moderationHiddenAt: view.moderationHiddenAt, moderationPriorVisibility: view.moderationPriorVisibility } : row,
    ),
  };
}
