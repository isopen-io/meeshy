/**
 * Les INDEX de la télémétrie v2 (#10510) — posés par une fonction
 * IDEMPOTENTE et NOMMÉE, jamais par `prisma db push` : le connecteur MongoDB
 * de Prisma ne sait déclarer ni un index TTL, ni un index unique PARTIEL, et
 * une déclaration `@@index` ne devient réelle qu'au `db push`, que le
 * déploiement n'exécute pas.
 *
 * Au DÉMARRAGE, `ensureSocialEventIndexesByCommand` (sans lecture d'index,
 * conflit signalé, jamais retiré — #10851) ; par la migration
 * `scripts/migrations/2026-10-13-social-events-v2-retention.ts`,
 * `ensureSocialEventIndexes` sur le pilote `mongodb`. Rejouée, elle ne touche rien : un index présent sous son nom avec la même
 * définition est laissé tel quel ; sous son nom avec une AUTRE définition
 * (posé par un `db push` égaré, sans TTL ni filtre), il est remplacé.
 */

export type IndexSpec = {
  readonly collection: string;
  readonly name: string;
  readonly key: Readonly<Record<string, 1 | -1>>;
  readonly unique?: boolean;
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
};

/** Un index tel que `listIndexes` le rend. */
export type ExistingIndex = {
  readonly name: string;
  readonly key: Readonly<Record<string, unknown>>;
  readonly unique?: boolean;
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
};

export type IndexStore = {
  list(collection: string): Promise<readonly ExistingIndex[]>;
  create(spec: IndexSpec): Promise<void>;
  drop(collection: string, name: string): Promise<void>;
};

export type IndexOutcome = 'created' | 'present' | 'replaced';

/** Seules les lignes qui PORTENT une clé d'événement sont uniques : les anciennes n'en ont pas. */
const KEYED = { eventKey: { $type: 'string' } } as const;
/** `$exists` et non `$type` : une égalité sur la clé implique `$exists`, le planificateur prend l’index. Seules les lignes réduites écrites entre #10771 et #10785 portent l'empreinte du lecteur (relues jusqu'à leur expiration, 8 j). */
const FINGERPRINTED = { readerKey: { $exists: true } } as const;

export const CONTENT_EVENT_EVENT_KEY_INDEX = 'ContentEvent_eventKey_unique';
export const CONTENT_EVENT_TTL_INDEX = 'ContentEvent_expiresAt_ttl';
export const POST_IMPRESSION_EVENT_KEY_INDEX = 'PostImpression_eventKey_unique';
export const POST_IMPRESSION_TTL_INDEX = 'PostImpression_expiresAt_ttl';
export const POST_ENGAGEMENT_TTL_INDEX = 'PostEngagement_expiresAt_ttl';

export const SOCIAL_EVENT_INDEXES: readonly IndexSpec[] = [
  { collection: 'ContentEvent', name: CONTENT_EVENT_EVENT_KEY_INDEX, key: { eventKey: 1 }, unique: true, partialFilterExpression: KEYED },
  { collection: 'ContentEvent', name: CONTENT_EVENT_TTL_INDEX, key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'ContentEvent', name: 'ContentEvent_target_day', key: { targetKind: 1, targetId: 1, day: 1 } },
  { collection: 'ContentEvent', name: 'ContentEvent_user_day', key: { userId: 1, day: 1 }, partialFilterExpression: { userId: { $type: 'objectId' } } },
  { collection: 'ContentEvent', name: 'ContentEvent_type_action_day', key: { type: 1, action: 1, day: 1 } },
  { collection: 'PostImpression', name: POST_IMPRESSION_EVENT_KEY_INDEX, key: { eventKey: 1 }, unique: true, partialFilterExpression: KEYED },
  { collection: 'PostImpression', name: POST_IMPRESSION_TTL_INDEX, key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'PostEngagement', name: POST_ENGAGEMENT_TTL_INDEX, key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  // Déduplication (même lecteur, même post), export et effacement d'une ligne réduite antérieure à #10785.
  { collection: 'PostImpression', name: 'PostImpression_readerKey_post', key: { readerKey: 1, postId: 1 }, partialFilterExpression: FINGERPRINTED },
  { collection: 'PostEngagement', name: 'PostEngagement_readerKey_post', key: { readerKey: 1, postId: 1 }, partialFilterExpression: FINGERPRINTED },
];

const canonical = (value: unknown): string => JSON.stringify(value ?? null);

const sameDefinition = (existing: ExistingIndex, spec: IndexSpec): boolean =>
  canonical(existing.key) === canonical(spec.key) &&
  Boolean(existing.unique) === Boolean(spec.unique) &&
  existing.expireAfterSeconds === spec.expireAfterSeconds &&
  canonical(existing.partialFilterExpression) === canonical(spec.partialFilterExpression);

/**
 * Pose chaque index manquant ; `dryRun` dit ce qui serait fait sans rien
 * écrire. Un index d'un AUTRE nom sur la même clé, posé par un `db push`
 * (`PostImpression_expiresAt_idx` sans TTL, par exemple), est retiré : deux
 * index sur une même clé avec deux options ne peuvent coexister.
 */
export async function ensureSocialEventIndexes(
  store: IndexStore,
  options: { readonly dryRun?: boolean } = {},
): Promise<Readonly<Record<string, IndexOutcome>>> {
  const outcomes: Record<string, IndexOutcome> = {};
  for (const spec of SOCIAL_EVENT_INDEXES) {
    const existing = await store.list(spec.collection);
    const named = existing.find((index) => index.name === spec.name);
    if (named && sameDefinition(named, spec)) {
      outcomes[spec.name] = 'present';
      continue;
    }
    const sameKeyElsewhere = existing.filter((index) =>
      index.name !== spec.name && index.name !== '_id_' && canonical(index.key) === canonical(spec.key));
    if (!options.dryRun) {
      if (named) await store.drop(spec.collection, spec.name);
      for (const index of sameKeyElsewhere) await store.drop(spec.collection, index.name);
      await store.create(spec);
    }
    outcomes[spec.name] = named || sameKeyElsewhere.length > 0 ? 'replaced' : 'created';
  }
  return outcomes;
}

type RawCommandRunner = { $runCommandRaw(command: Record<string, unknown>): Promise<unknown> };

/** Le document d'index que `createIndexes` reçoit — sans clé indéfinie. */
export function createIndexSpec(spec: IndexSpec): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    key: spec.key,
    name: spec.name,
    unique: spec.unique,
    expireAfterSeconds: spec.expireAfterSeconds,
    partialFilterExpression: spec.partialFilterExpression,
  }).filter(([, value]) => value !== undefined));
}

export type BootIndexOutcome =
  | { readonly outcome: 'created' | 'present' }
  | { readonly outcome: 'conflict'; readonly reason: string };

/** 85 IndexOptionsConflict, 86 IndexKeySpecsConflict — tels que Prisma les rend dans P2010. */
const INDEX_CONFLICT = /Error code (85|86)\b[^:]*/;

const conflictReason = (error: unknown): string | null => {
  const meta = (error as { meta?: { message?: unknown } } | null)?.meta;
  const text = `${typeof meta?.message === 'string' ? meta.message : ''} ${error instanceof Error ? error.message : ''}`;
  return INDEX_CONFLICT.exec(text)?.[0] ?? null;
};

type CreateIndexesReply = { readonly numIndexesBefore?: unknown; readonly numIndexesAfter?: unknown };

/**
 * Le chemin du DÉMARRAGE (#10851). Il ne LIT jamais `listIndexes` par
 * `$runCommandRaw` : Prisma décode toute réponse dont un objet porte un
 * `$type` textuel comme une valeur étiquetée, et un filtre partiel
 * `{ eventKey: { $type: 'string' } }` lui fait lever « Unknown tagged value »
 * — dès le premier index posé, plus aucun ne l'était. `createIndexes` est
 * idempotent côté Mongo et ne renvoie aucune définition : il dit « créé »
 * (`numIndexesAfter > numIndexesBefore`), « présent » (même définition), ou
 * lève 85/86 si un index du même nom ou de la même clé diffère — SIGNALÉ,
 * jamais retiré : remplacer reste l'affaire de la migration nommée.
 */
export async function ensureSocialEventIndexesByCommand(
  prisma: RawCommandRunner,
): Promise<Readonly<Record<string, BootIndexOutcome>>> {
  const outcomes: Record<string, BootIndexOutcome> = {};
  for (const spec of SOCIAL_EVENT_INDEXES) {
    try {
      const reply = await prisma.$runCommandRaw({ createIndexes: spec.collection, indexes: [createIndexSpec(spec)] }) as CreateIndexesReply;
      outcomes[spec.name] = { outcome: Number(reply.numIndexesAfter) > Number(reply.numIndexesBefore) ? 'created' : 'present' };
    } catch (error) {
      const reason = conflictReason(error);
      if (reason === null) throw error;
      outcomes[spec.name] = { outcome: 'conflict', reason };
    }
  }
  return outcomes;
}
