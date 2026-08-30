/**
 * Formes de schéma de réponse PARTAGÉES par les quatre collections `/sync`.
 * Extrait de `routes/sync.ts` (issue #4171, critère 5g).
 */

/** Une disparition : trois scalaires, et `deletedAt` en est le seul contenu —
 *  un client qui le perd sait qu'une bulle est partie sans savoir quand. */
export const syncTombstoneSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    deletedAt: { type: 'string', format: 'date-time' },
  },
} as const;

/**
 * L'enveloppe `added`/`modified`/`deleted`/`truncated`/`nextCursor` commune
 * aux quatre collections — SEULE la forme de l'ÉLÉMENT change. Une fabrique
 * plutôt que quatre copies : `messages`, `conversations`, `reactions` et
 * `participants` déclarent chacune LEUR schéma d'élément et obtiennent la
 * même enveloppe, mécaniquement identique à celle que `syncCollectionSchema`
 * déclarait à la main avant ce lot.
 */
export function makeSyncCollectionSchema(itemSchema: object) {
  return {
    type: 'object',
    properties: {
      added: { type: 'array', items: itemSchema },
      modified: { type: 'array', items: itemSchema },
      deleted: { type: 'array', items: syncTombstoneSchema },
      truncated: { type: 'boolean' },
      nextCursor: { type: 'string', nullable: true },
    },
  } as const;
}

/** Ce qu'une fonction de collection `/sync` rend TOUJOURS — la même forme pour
 *  les quatre, quel que soit ce que porte un élément. */
export type SyncCollectionResult<TItem> = {
  readonly added: TItem[];
  readonly modified: TItem[];
  readonly deleted: ReadonlyArray<{ id: string; conversationId: string; deletedAt: Date }>;
  readonly truncated: boolean;
  readonly nextCursor: string | null;
};

/** La forme vide, rendue par toute collection quand l'appelant n'a aucune
 *  conversation (RLS fail-closed) — jamais construite à la main deux fois. */
export const EMPTY_SYNC_COLLECTION: SyncCollectionResult<never> = {
  added: [],
  modified: [],
  deleted: [],
  truncated: false,
  nextCursor: null,
};
