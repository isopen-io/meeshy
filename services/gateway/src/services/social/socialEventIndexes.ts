/**
 * Les INDEX de la télémétrie v2 (#10510) — posés par une fonction
 * IDEMPOTENTE et NOMMÉE, jamais par `prisma db push` : le connecteur MongoDB
 * de Prisma ne sait déclarer ni un index TTL, ni un index unique PARTIEL, et
 * une déclaration `@@index` ne devient réelle qu'au `db push`, que le
 * déploiement n'exécute pas.
 *
 * Appelée à CHAQUE démarrage (`InitService.ensureSocialEventIndexes`) et par
 * la migration `scripts/migrations/2026-10-13-social-events-v2-retention.ts`.
 * Rejouée, elle ne touche rien : un index présent sous son nom avec la même
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

const NAMESPACE_NOT_FOUND = 26;

const isNamespaceNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null &&
  ((error as { code?: unknown }).code === NAMESPACE_NOT_FOUND || /ns does not exist|NamespaceNotFound/i.test(String((error as Error).message)));

/** Le magasin d'index par `$runCommandRaw` — celui du démarrage. */
export function rawCommandIndexStore(prisma: RawCommandRunner): IndexStore {
  return {
    async list(collection) {
      try {
        const result = await prisma.$runCommandRaw({ listIndexes: collection }) as { cursor?: { firstBatch?: ExistingIndex[] } };
        return result.cursor?.firstBatch ?? [];
      } catch (error) {
        if (isNamespaceNotFound(error)) return [];
        throw error;
      }
    },
    async create(spec) {
      await prisma.$runCommandRaw({
        createIndexes: spec.collection,
        indexes: [Object.fromEntries(Object.entries({
          key: spec.key,
          name: spec.name,
          unique: spec.unique,
          expireAfterSeconds: spec.expireAfterSeconds,
          partialFilterExpression: spec.partialFilterExpression,
        }).filter(([, value]) => value !== undefined))],
      });
    },
    async drop(collection, name) {
      await prisma.$runCommandRaw({ dropIndexes: collection, index: name });
    },
  };
}
