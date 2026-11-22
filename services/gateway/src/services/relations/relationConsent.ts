/**
 * LE SITE UNIQUE du consentement de cercle (#14401, audit #14535 constat 2).
 *
 * Dit si `ownerId` partage `feature` à `otherId` — la catégorie de son écoute dès Proche
 * (#16686), le reste depuis le rituel du Sang —, en lisant
 * `RelationFeatureSetting` À CHAQUE appel : jamais un cache, ni en mémoire ni dans
 * Redis. Tout relais (écoute #13934, position #13937) le consulte avant chaque
 * émission, si bien qu'un retrait (`PUT /relations/:userId/settings`) coupe
 * l'émission suivante. Une valeur illisible vaut `refused`.
 *
 * La garde `relationConsent.test.ts` interdit toute autre lecture des colonnes de
 * consentement dans la passerelle.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationRitualShare } from '@meeshy/shared/types/relation-person-settings';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveEmitterConsent } from '@meeshy/shared/utils/relation-emitter-consent';
import { isCurrentBloodBundle } from '@meeshy/shared/utils/blood-bundle';
import type { PairAccessSubject } from './pairAccess';

export const RITUAL_CONSENT_FEATURES = ['listening.title', 'location.live', 'location.history', 'location.proximity'] as const;
export type RitualConsentFeature = (typeof RITUAL_CONSENT_FEATURES)[number];

/**
 * Tous les partages consentis par l'ÉMETTEUR, personne par personne : la catégorie
 * d'écoute (accordée dès Proche, #13934) et ceux du rituel.
 */
export const SHARE_CONSENT_FEATURES = ['listening.category', ...RITUAL_CONSENT_FEATURES] as const;
export type ShareConsentFeature = (typeof SHARE_CONSENT_FEATURES)[number];

const COLUMN = {
  'listening.category': 'listeningCategoryShared',
  'listening.title': 'listeningTitleShared',
  'location.live': 'locationShared',
  'location.history': 'locationHistoryShared',
  'location.proximity': 'proximityShared',
} as const satisfies Record<ShareConsentFeature, string>;

/** Le partage (colonne) que chaque feature du rituel consulte : l'inverse de la table ci-dessus, pour l'accord hors rituel (#16642). */
export const RITUAL_SHARE_FEATURE = Object.fromEntries(
  RITUAL_CONSENT_FEATURES.map((feature) => [COLUMN[feature], feature]),
) as Readonly<Record<RelationRitualShare, RitualConsentFeature>>;

export type RelationConsent = 'granted' | 'refused';

export async function relationConsentOf(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherId: string; readonly feature: ShareConsentFeature },
): Promise<RelationConsent> {
  const column = COLUMN[params.feature];
  const row = await prisma.relationFeatureSetting.findUnique({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    select: { [column]: true } as Record<typeof column, true>,
  });
  return (row as Record<string, unknown> | null)?.[column] === true ? 'granted' : 'refused';
}

/**
 * Les personnes parmi `otherIds` à qui `ownerId` partage `feature`, en UNE lecture :
 * un éventail (écoute, position) ne relit pas la table lecteur par lecteur. Absent
 * de l'ensemble = `refused`, comme une valeur illisible.
 */
export async function relationConsentGrantedAmong(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherIds: readonly string[]; readonly feature: ShareConsentFeature },
): Promise<ReadonlySet<string>> {
  if (params.otherIds.length === 0) return new Set();
  const column = COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: params.ownerId, otherId: { in: [...params.otherIds] } },
    select: { otherId: true, [column]: true } as Record<'otherId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  return new Set(rows.filter((row) => row[column] === true).map((row) => String(row.otherId)));
}

/** Les propriétaires parmi `ownerIds` qui partagent `feature` à `otherId` — le sens du lecteur (rattrapage). */
export async function relationConsentGrantedBy(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerIds: readonly string[]; readonly otherId: string; readonly feature: ShareConsentFeature },
): Promise<ReadonlySet<string>> {
  if (params.ownerIds.length === 0) return new Set();
  const column = COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...params.ownerIds] }, otherId: params.otherId },
    select: { ownerId: true, [column]: true } as Record<'ownerId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  return new Set(rows.filter((row) => row[column] === true).map((row) => String(row.ownerId)));
}

/**
 * Les personnes avec qui `subjectId` est lié par un partage d'au moins une des `features` :
 * celles à qui il les partage (`subjectIs: 'target'`, il est l'émetteur) ou celles qui les
 * lui partagent (`'viewer'`). Ce sont des CANDIDATS d'un éventail hors lien (#16642), que
 * la loi juge ensuite un par un — jamais un accès.
 */
export async function relationConsentCounterpartsOf(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly subjectId: string; readonly subjectIs: PairAccessSubject; readonly features: readonly ShareConsentFeature[]; readonly limit: number },
): Promise<readonly string[]> {
  if (params.features.length === 0) return [];
  const [own, other] = params.subjectIs === 'target' ? (['ownerId', 'otherId'] as const) : (['otherId', 'ownerId'] as const);
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { [own]: params.subjectId, OR: params.features.map((feature) => ({ [COLUMN[feature]]: true })) },
    select: { [other]: true } as Record<typeof other, true>,
    take: params.limit,
  })) as ReadonlyArray<Record<string, unknown>>;
  return rows.map((row) => String(row[other]));
}

/**
 * Les consentements TRI-ÉTAT (#14147) : la colonne garde ce que l'émetteur a DIT — `true`,
 * `false` — ou rien (`null`), et c'est `resolveEmitterConsent` (partagé) qui en tire le
 * défaut du niveau effectif. La batterie et son relevé à la demande lisent la même colonne ;
 * l'injoignabilité du téléphone (#18737) et l'alerte d'inactivité (#18738) ont chacune la leur.
 */
export const STORED_CONSENT_FEATURES = ['device.battery', 'device.battery.pull', 'device.unreachable', 'safety.inactivity', 'device.call', 'health.fall'] as const;
export type StoredConsentFeature = (typeof STORED_CONSENT_FEATURES)[number];

const STORED_COLUMN = {
  'device.battery': 'batteryShared',
  'device.battery.pull': 'batteryShared',
  'device.unreachable': 'unreachableShared',
  'safety.inactivity': 'inactivityShared',
  'device.call': 'callShared',
  'health.fall': 'fallShared',
} as const satisfies Record<StoredConsentFeature, string>;

const storedValue = (value: unknown): boolean | null => (value === true || value === false ? value : null);

/** Ce que `ownerId` a stocké pour chacun des `otherIds` (absent ou illisible : `null`), en UNE lecture. */
export async function relationStoredConsentAmong(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherIds: readonly string[]; readonly feature: StoredConsentFeature },
): Promise<ReadonlyMap<string, boolean | null>> {
  if (params.otherIds.length === 0) return new Map();
  const column = STORED_COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: params.ownerId, otherId: { in: [...params.otherIds] } },
    select: { otherId: true, [column]: true } as Record<'otherId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  const found = new Map(rows.map((row) => [String(row.otherId), storedValue(row[column])]));
  return new Map(params.otherIds.map((id) => [id, found.get(id) ?? null]));
}

/** Ce que chacun des `ownerIds` a stocké pour `otherId` — le sens du lecteur (rattrapage). */
export async function relationStoredConsentBy(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerIds: readonly string[]; readonly otherId: string; readonly feature: StoredConsentFeature },
): Promise<ReadonlyMap<string, boolean | null>> {
  if (params.ownerIds.length === 0) return new Map();
  const column = STORED_COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...params.ownerIds] }, otherId: params.otherId },
    select: { ownerId: true, [column]: true } as Record<'ownerId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  const found = new Map(rows.map((row) => [String(row.ownerId), storedValue(row[column])]));
  return new Map(params.ownerIds.map((id) => [id, found.get(id) ?? null]));
}

/**
 * CE QUE LA PAIRE A STOCKÉ, et l'accord au palier Sang de son propriétaire (#20361, #20362) :
 * la valeur brute (`true`, `false`, ou `null` pour rien de dit) et `bloodBundleAccepted`.
 * C'est `resolveEmitterConsent` (partagé) qui en tire le défaut du palier et le verrou du Sang,
 * avec le niveau effectif que la loi vient de lire (`pairConsentResolver`). Une ligne absente
 * ou illisible vaut `{ stored: null, bloodBundleAccepted: false }`.
 */
export type PairStoredConsent = { readonly stored: boolean | null; readonly bloodBundleAccepted: boolean };

export type PairConsentFeature = ShareConsentFeature | StoredConsentFeature;

const PAIR_COLUMN: Readonly<Record<PairConsentFeature, string>> = { ...COLUMN, ...STORED_COLUMN };

const NOTHING_STORED: PairStoredConsent = { stored: null, bloodBundleAccepted: false };

/** L'accord au palier ne vaut qu'à la version COURANTE de la liste (C5) : une liste élargie se ré-accepte. */
export const bloodBundleAcceptedOf = (row: Readonly<Record<string, unknown>> | null | undefined): boolean =>
  row?.bloodBundleAcceptedAt instanceof Date && isCurrentBloodBundle(row.bloodBundleVersion);

const pairStoredOf = (row: Readonly<Record<string, unknown>>, column: string): PairStoredConsent => ({
  stored: storedValue(row[column]),
  bloodBundleAccepted: bloodBundleAcceptedOf(row),
});

/** Ce que `ownerId` a stocké pour chacun des `otherIds`, et son accord au palier, en UNE lecture. */
export async function relationPairConsentAmong(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherIds: readonly string[]; readonly feature: PairConsentFeature },
): Promise<ReadonlyMap<string, PairStoredConsent>> {
  if (params.otherIds.length === 0) return new Map();
  const column = PAIR_COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: params.ownerId, otherId: { in: [...params.otherIds] } },
    select: { otherId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true, [column]: true } as Record<string, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  const found = new Map(rows.map((row) => [String(row.otherId), pairStoredOf(row, column)]));
  return new Map(params.otherIds.map((id) => [id, found.get(id) ?? NOTHING_STORED]));
}

/** Ce que chacun des `ownerIds` a stocké pour `otherId`, et son accord au palier — le sens du lecteur. */
export async function relationPairConsentBy(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerIds: readonly string[]; readonly otherId: string; readonly feature: PairConsentFeature },
): Promise<ReadonlyMap<string, PairStoredConsent>> {
  if (params.ownerIds.length === 0) return new Map();
  const column = PAIR_COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...params.ownerIds] }, otherId: params.otherId },
    select: { ownerId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true, [column]: true } as Record<string, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  const found = new Map(rows.map((row) => [String(row.ownerId), pairStoredOf(row, column)]));
  return new Map(params.ownerIds.map((id) => [id, found.get(id) ?? NOTHING_STORED]));
}

/** Les deux sens d'une lecture de paire, selon que le sujet est l'émetteur (`target`) ou le lecteur (`viewer`). */
export const relationPairConsentFor = (
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly subjectId: string; readonly otherIds: readonly string[]; readonly subjectIs: PairAccessSubject; readonly feature: PairConsentFeature },
): Promise<ReadonlyMap<string, PairStoredConsent>> =>
  params.subjectIs === 'target'
    ? relationPairConsentAmong(prisma, { ownerId: params.subjectId, otherIds: params.otherIds, feature: params.feature })
    : relationPairConsentBy(prisma, { ownerIds: params.otherIds, otherId: params.subjectId, feature: params.feature });

/**
 * Le `consentOf` de `pairAccessAmong` pour une feature à consentement de l'émetteur : la valeur
 * stockée, le défaut du palier, la coupure globale et le verrou du Sang résolus par la loi partagée.
 */
export const pairConsentResolver =
  (feature: PairConsentFeature, stored: ReadonlyMap<string, PairStoredConsent>, globallyDisabled: (otherId: string) => boolean = () => false) =>
  (otherId: string, effectiveLevel: RelationLevel, ages?: { readonly targetMinor: boolean }): 'granted' | 'refused' => {
    const pair = stored.get(otherId) ?? NOTHING_STORED;
    return resolveEmitterConsent({
      feature,
      stored: pair.stored,
      effectiveLevel,
      globallyDisabled: globallyDisabled(otherId),
      bloodBundleAccepted: pair.bloodBundleAccepted,
      emitterMinor: ages?.targetMinor === true,
    });
  };

/** Les personnes parmi `otherIds` pour qui `ownerId` a donné l'accord au palier Sang. */
export async function bloodBundleAcceptedAmong(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherIds: readonly string[] },
): Promise<ReadonlySet<string>> {
  if (params.otherIds.length === 0) return new Set();
  const rows = await prisma.relationFeatureSetting.findMany({
    where: { ownerId: params.ownerId, otherId: { in: [...params.otherIds] }, bloodBundleAcceptedAt: { not: null } },
    select: { otherId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
  });
  return new Set(rows.filter(bloodBundleAcceptedOf).map((row) => row.otherId));
}

/** Les propriétaires parmi `ownerIds` qui ont donné l'accord au palier Sang pour `otherId`. */
export async function bloodBundleAcceptedBy(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerIds: readonly string[]; readonly otherId: string },
): Promise<ReadonlySet<string>> {
  if (params.ownerIds.length === 0) return new Set();
  const rows = await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...params.ownerIds] }, otherId: params.otherId, bloodBundleAcceptedAt: { not: null } },
    select: { ownerId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
  });
  return new Set(rows.filter(bloodBundleAcceptedOf).map((row) => row.ownerId));
}
