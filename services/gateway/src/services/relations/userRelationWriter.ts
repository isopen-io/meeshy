/**
 * L'ÉCRIVAIN UNIQUE du lien entre deux personnes (#13926).
 *
 * Trois sites écrivent « ces deux-là sont amis » — l'acceptation d'une demande
 * (`friend-requests-core`), l'affiliation (`AffiliateTrackingService`) et le
 * rattrapage (`userRelationBackfill`) — et un quatrième l'efface (la rupture :
 * suppression d'une demande ACCEPTÉE). Ils passent TOUS par ce module : trois
 * écrivains jumeaux de la même ligne diverge­raient en silence.
 *
 * ## Les règles
 *
 * - Une ligne par paire NON orientée (`relationPairKey`), deux accords : celui
 *   de `low` envers `high`, celui de `high` envers `low`. Le niveau effectif est
 *   le minimum des deux, et ce module ne le sert pas (la loi d'accès le lit).
 * - `recordFriendship` RELÈVE chaque accord à FRIEND au moins, ne BAISSE jamais
 *   : une paire déjà à Proche ou Sang le reste (aucune rétrogradation
 *   rétroactive). Rejouée, elle ne change rien.
 * - `resetFriendship` ramène les deux accords à PUBLIC. SILENCIEUX : il n'émet
 *   rien, ni événement ni notification (RG-07). La baisse est gravée dans
 *   l'historique, que `visibleRelationTransitions` ne sert jamais.
 * - `backfillFriendship` (le rattrapage) relève à FRIEND comme l'acceptation —
 *   une demande acceptée se lit FRIEND même quand une ligne est née plus bas
 *   avant le rattrapage (Connaissance automatique) — mais ne défait JAMAIS une
 *   baisse gravée APRÈS l'acceptation : elle a été réglée par l'une des deux
 *   personnes, et rejouer le rattrapage ne la contredit pas. Une baisse
 *   ANTÉRIEURE à l'acceptation (amitié rompue puis renouée dont l'écriture du
 *   lien a échoué) ne retient rien : l'acceptation est plus récente. Sans date
 *   d'acceptation, la baisse l'emporte (fail-closed).
 * - Course : la paire est unique en base (`P2002`). Un écrivain qui perd la
 *   course relit la ligne gagnante et reprend ; une mise à jour porte les
 *   accords LUS dans son `where` (garde optimiste) et relit si la ligne a bougé.
 *
 * L'échec d'écriture est l'affaire de l'APPELANT : la demande acceptée reste la
 * vérité de repli tant que la loi d'accès lit `FriendRequest` à défaut de ligne.
 */
import {
  compareRelationLevel,
  isRelationDrop,
  maxRelationLevel,
  minRelationLevel,
  parseRelationLevel,
  relationPairKey,
  relationSideOf,
  type RelationLevel,
  type RelationPairKey,
  type RelationTransition,
} from '@meeshy/shared/types/relation';

export type RelationOrigin = 'request' | 'backfill-friend' | 'auto-acquaintance';

export type UserRelationRow = {
  readonly id: string;
  readonly userLowId: string;
  readonly userHighId: string;
  readonly grantedByLow?: string | null;
  readonly grantedByHigh?: string | null;
  readonly levelSince?: Date | null;
  readonly cooldownLowUntil?: Date | null;
  readonly cooldownHighUntil?: Date | null;
  readonly transitions?: ReadonlyArray<{ readonly actorId?: string; readonly from: string; readonly to: string; readonly at?: Date | null }> | null;
};

type NewUserRelation = RelationPairKey & {
  readonly grantedByLow: RelationLevel;
  readonly grantedByHigh: RelationLevel;
  readonly levelSince: Date;
  readonly origin: RelationOrigin;
  readonly transitions: RelationTransition[];
  readonly cooldownLowUntil?: Date;
  readonly cooldownHighUntil?: Date;
};

export interface UserRelationDb {
  readonly userRelation: {
    findUnique(args: {
      where: { userLowId_userHighId: RelationPairKey };
    }): PromiseLike<UserRelationRow | null>;
    create(args: { data: NewUserRelation }): PromiseLike<unknown>;
    updateMany(args: {
      where: { id: string; grantedByLow?: string | null; grantedByHigh?: string | null };
      data: {
        grantedByLow?: RelationLevel;
        grantedByHigh?: RelationLevel;
        levelSince?: Date;
        cooldownLowUntil?: Date;
        cooldownHighUntil?: Date;
        transitions?: { push: RelationTransition[] };
      };
    }): PromiseLike<{ count: number }>;
  };
}

export type RelationWriteOutcome = 'created' | 'raised' | 'unchanged' | 'ignored';
export type RelationResetOutcome = 'reset' | 'unchanged' | 'ignored';

type Grants = { readonly low: RelationLevel; readonly high: RelationLevel };

const MAX_ATTEMPTS = 4;

const grantsOf = (row: UserRelationRow): Grants => ({
  low: parseRelationLevel(row.grantedByLow),
  high: parseRelationLevel(row.grantedByHigh),
});

const effectiveLevel = (grants: Grants): RelationLevel => minRelationLevel(grants.low, grants.high);

/** Le niveau EFFECTIF d'une ligne : le minimum des deux accords, tout illisible lu PUBLIC. */
export const effectiveLevelOfRow = (row: UserRelationRow): RelationLevel => effectiveLevel(grantsOf(row));

/** Ce que `userId` accorde dans cette ligne. */
export const grantedByUser = (row: UserRelationRow, userId: string): RelationLevel => {
  const grants = grantsOf(row);
  return row.userLowId === userId ? grants.low : grants.high;
};

const passagesBetween = (pair: RelationPairKey, from: Grants, to: Grants, at: Date): RelationTransition[] =>
  ([
    { side: 'low', actorId: pair.userLowId },
    { side: 'high', actorId: pair.userHighId },
  ] as const)
    .filter(({ side }) => from[side] !== to[side])
    .map(({ side, actorId }) => ({ actorId, from: from[side], to: to[side], at }));

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

const pairOf = (userA: string, userB: string): RelationPairKey | null =>
  !userA || !userB || userA === userB ? null : relationPairKey(userA, userB);

/** Le cool-down de 30 jours (RG-08) : `userId` ne peut plus demander de montée avant `until`. */
type CooldownWrite = { readonly userId: string; readonly until: Date };

const cooldownColumn = (
  pair: RelationPairKey,
  cooldown: CooldownWrite,
): { cooldownLowUntil: Date } | { cooldownHighUntil: Date } =>
  relationSideOf(pair, cooldown.userId) === 'low' ? { cooldownLowUntil: cooldown.until } : { cooldownHighUntil: cooldown.until };

/** Jusqu'à quand `userId` est retenu de demander une montée à cette paire ; `null` = libre. */
export const cooldownUntilOf = (row: UserRelationRow | null, userId: string): Date | null => {
  if (!row) return null;
  const until = row.userLowId === userId ? row.cooldownLowUntil : row.userHighId === userId ? row.cooldownHighUntil : null;
  return until instanceof Date ? until : null;
};

export const cooldownEnd = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000);

type Creation = 'created' | 'exists';

async function createRow(
  db: UserRelationDb,
  pair: RelationPairKey,
  params: { origin: RelationOrigin; at: Date; level: RelationLevel },
): Promise<Creation> {
  const granted: Grants = { low: params.level, high: params.level };
  try {
    await db.userRelation.create({
      data: {
        ...pair,
        grantedByLow: granted.low,
        grantedByHigh: granted.high,
        levelSince: params.at,
        origin: params.origin,
        transitions: passagesBetween(pair, { low: 'PUBLIC', high: 'PUBLIC' }, granted, params.at),
      },
    });
    return 'created';
  } catch (error) {
    if (isUniqueViolation(error)) return 'exists';
    throw error;
  }
}

/** Déplace les deux accords vers `target` ; `false` si la ligne a bougé depuis la lecture. */
async function moveTo(
  db: UserRelationDb,
  row: UserRelationRow,
  pair: RelationPairKey,
  target: Grants,
  at: Date,
  cooldown: CooldownWrite | null = null,
): Promise<boolean> {
  const current = grantsOf(row);
  const passages = passagesBetween(pair, current, target, at);
  const { count } = await db.userRelation.updateMany({
    where: { id: row.id, grantedByLow: row.grantedByLow, grantedByHigh: row.grantedByHigh },
    data: {
      grantedByLow: target.low,
      grantedByHigh: target.high,
      ...(effectiveLevel(current) === effectiveLevel(target) ? {} : { levelSince: at }),
      ...(cooldown ? cooldownColumn(pair, cooldown) : {}),
      transitions: { push: passages },
    },
  });
  return count > 0;
}

const readPair = (db: UserRelationDb, pair: RelationPairKey) =>
  db.userRelation.findUnique({ where: { userLowId_userHighId: pair } });

const dropOutlivesAcceptance = (row: UserRelationRow, acceptedAt: Date | null): boolean =>
  (row.transitions ?? []).some(
    (t) =>
      isRelationDrop({ from: parseRelationLevel(t.from), to: parseRelationLevel(t.to) }) &&
      (acceptedAt === null || !(t.at instanceof Date) || t.at.getTime() >= acceptedAt.getTime()),
  );

const atLeast = (grants: Grants, level: RelationLevel): Grants => ({
  low: maxRelationLevel(grants.low, level),
  high: maxRelationLevel(grants.high, level),
});

const atLeastFriend = (grants: Grants): Grants => atLeast(grants, 'FRIEND');

const hasRecordedDrop = (row: UserRelationRow): boolean =>
  (row.transitions ?? []).some((t) => isRelationDrop({ from: parseRelationLevel(t.from), to: parseRelationLevel(t.to) }));

export type FriendshipBackfillPlan = 'create' | 'raise' | 'keep';

/** Ce que le rattrapage ferait d'une paire, sans rien écrire (le `dryRun` le compte). */
export function friendshipBackfillPlan(row: UserRelationRow | null, acceptedAt: Date | null): FriendshipBackfillPlan {
  if (!row) return 'create';
  if (dropOutlivesAcceptance(row, acceptedAt)) return 'keep';
  const current = grantsOf(row);
  const target = atLeastFriend(current);
  return target.low === current.low && target.high === current.high ? 'keep' : 'raise';
}

/**
 * Ce que `recordAcquaintance` ferait d'une paire, sans rien écrire (#13932) : le
 * rattrapage saute une paire `keep` plutôt que de l'évaluer pour rendre
 * « inchangé ». `keep` = déjà au moins Connaissance des deux côtés, ou une baisse
 * gravée que la Connaissance automatique respecte sans condition.
 */
export function acquaintancePlan(row: UserRelationRow | null): FriendshipBackfillPlan {
  if (!row) return 'create';
  if (hasRecordedDrop(row)) return 'keep';
  const current = grantsOf(row);
  const target = atLeast(current, 'ACQUAINTANCE');
  return target.low === current.low && target.high === current.high ? 'keep' : 'raise';
}

/** La ligne telle que le rattrapage la laisserait : le `dryRun` enchaîne les demandes d'une même paire dessus. */
export function friendshipBackfillProjection(
  row: UserRelationRow | null,
  pair: RelationPairKey,
  acceptedAt: Date | null,
): UserRelationRow | null {
  const plan = friendshipBackfillPlan(row, acceptedAt);
  if (plan === 'keep') return row;
  if (plan === 'create' || !row) return { id: 'dry-run', ...pair, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', transitions: [] };
  const target = atLeastFriend(grantsOf(row));
  return { ...row, grantedByLow: target.low, grantedByHigh: target.high };
}

async function raiseTo(
  db: UserRelationDb,
  pair: RelationPairKey,
  params: {
    origin: RelationOrigin;
    at: Date;
    level: RelationLevel;
    respectDropsSince?: { acceptedAt: Date | null };
    refuseAfterAnyDrop?: boolean;
  },
): Promise<RelationWriteOutcome> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readPair(db, pair);
    if (!row) {
      if ((await createRow(db, pair, params)) === 'created') return 'created';
      continue;
    }
    if (params.refuseAfterAnyDrop && hasRecordedDrop(row)) return 'unchanged';
    if (params.respectDropsSince && dropOutlivesAcceptance(row, params.respectDropsSince.acceptedAt)) return 'unchanged';
    const current = grantsOf(row);
    const target = atLeast(current, params.level);
    if (target.low === current.low && target.high === current.high) return 'unchanged';
    if (await moveTo(db, row, pair, target, params.at)) return 'raised';
  }
  throw new Error('userRelationWriter: la paire change sans cesse, abandon après plusieurs reprises');
}

/**
 * Une demande est ACCEPTÉE : les deux accords valent FRIEND au moins.
 */
export async function recordFriendship(
  db: UserRelationDb,
  params: { userA: string; userB: string; origin: RelationOrigin; at: Date },
): Promise<RelationWriteOutcome> {
  return recordLevel(db, { ...params, level: 'FRIEND' });
}

/**
 * Une demande de cran est ACCEPTÉE (#13933) : les deux accords valent `level` au
 * moins. Monte, ne baisse jamais — accepter une vieille demande sur un lien déjà
 * plus haut ne change rien.
 */
export async function recordLevel(
  db: UserRelationDb,
  params: { userA: string; userB: string; level: RelationLevel; origin: RelationOrigin; at: Date },
): Promise<RelationWriteOutcome> {
  const pair = pairOf(params.userA, params.userB);
  if (!pair) return 'ignored';
  return raiseTo(db, pair, { origin: params.origin, at: params.at, level: params.level });
}

/**
 * La Connaissance AUTOMATIQUE (#13932) : les deux accords valent ACQUAINTANCE au
 * moins. Monte, ne baisse jamais : une paire déjà Ami, Proche ou Sang n'est pas
 * touchée. Une baisse gravée dans l'historique (sortie volontaire, RG-07) est
 * RESPECTÉE sans condition de date — un lien que l'une des personnes a défait ne
 * renaît pas parce que les échanges continuent.
 */
export async function recordAcquaintance(
  db: UserRelationDb,
  params: { userA: string; userB: string; at: Date },
): Promise<RelationWriteOutcome> {
  const pair = pairOf(params.userA, params.userB);
  if (!pair) return 'ignored';
  return raiseTo(db, pair, { origin: 'auto-acquaintance', at: params.at, level: 'ACQUAINTANCE', refuseAfterAnyDrop: true });
}

/**
 * Les DEUX accords redescendent à `level` au plus (#13933) — la rupture d'une
 * demande acceptée : Proche retombe à Ami, Ami quitte le cercle. SILENCIEUX, et
 * ne relève jamais un accord déjà plus bas. `cooldownFor` pose sur l'AUTRE le
 * cool-down de 30 jours (RG-08), dans la même écriture.
 */
export async function lowerPair(
  db: UserRelationDb,
  params: { userA: string; userB: string; level: RelationLevel; at: Date; cooldownFor?: CooldownWrite },
): Promise<RelationResetOutcome> {
  const pair = pairOf(params.userA, params.userB);
  if (!pair) return 'ignored';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readPair(db, pair);
    if (!row) return 'unchanged';
    const current = grantsOf(row);
    const target: Grants = { low: minRelationLevel(current.low, params.level), high: minRelationLevel(current.high, params.level) };
    if (target.low === current.low && target.high === current.high) return 'unchanged';
    if (await moveTo(db, row, pair, target, params.at, params.cooldownFor ?? null)) return 'reset';
  }
  throw new Error('lowerPair: la paire change sans cesse, abandon après plusieurs reprises');
}

/**
 * L'amitié est défaite : les deux accords reviennent à PUBLIC, sans bruit.
 */
export async function resetFriendship(
  db: UserRelationDb,
  params: { userA: string; userB: string; at: Date },
): Promise<RelationResetOutcome> {
  return lowerPair(db, { ...params, level: 'PUBLIC' });
}

export type RelationLowerOutcome = 'lowered' | 'unchanged' | 'not-a-drop' | 'ignored';

/**
 * UNE personne baisse SON accord (#13933) : sortie (`PUBLIC`) ou baisse. Silencieux
 * (RG-07), gravé dans l'historique que rien ne sert, et le cool-down de 30 jours
 * tombe sur l'AUTRE (RG-08 : « l'autre ne peut pas redemander de montée »).
 * Monter par cette porte est refusé (`not-a-drop`) : une montée est une demande.
 */
export async function lowerGrant(
  db: UserRelationDb,
  params: { actorId: string; otherId: string; level: RelationLevel; at: Date; cooldownUntil: Date },
): Promise<RelationLowerOutcome> {
  const pair = pairOf(params.actorId, params.otherId);
  if (!pair) return 'ignored';
  const side = relationSideOf(pair, params.actorId);
  if (!side) return 'ignored';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readPair(db, pair);
    const current: Grants = row ? grantsOf(row) : { low: 'PUBLIC', high: 'PUBLIC' };
    const order = compareRelationLevel(params.level, current[side]);
    if (order > 0) return 'not-a-drop';
    if (order === 0 || !row) return 'unchanged';
    const target: Grants = { ...current, [side]: params.level };
    if (await moveTo(db, row, pair, target, params.at, { userId: params.otherId, until: params.cooldownUntil })) return 'lowered';
  }
  throw new Error('lowerGrant: la paire change sans cesse, abandon après plusieurs reprises');
}

/**
 * Le refus (ou l'ignorance) d'une demande retient son ÉMETTEUR de redemander
 * pendant `until` (RG-08). Écrit sur la ligne de la paire, créée à PUBLIC/PUBLIC si
 * la paire n'en a pas encore ; n'écrit jamais d'historique de niveau.
 */
export async function startCooldown(
  db: UserRelationDb,
  params: { userId: string; otherId: string; until: Date; at: Date },
): Promise<void> {
  const pair = pairOf(params.userId, params.otherId);
  if (!pair) return;
  const cooldown = { userId: params.userId, until: params.until };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readPair(db, pair);
    if (row) {
      const { count } = await db.userRelation.updateMany({ where: { id: row.id }, data: cooldownColumn(pair, cooldown) });
      if (count > 0) return;
      continue;
    }
    try {
      await db.userRelation.create({
        data: {
          ...pair, grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC', levelSince: params.at, origin: 'request',
          transitions: [], ...cooldownColumn(pair, cooldown),
        },
      });
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error('startCooldown: la paire change sans cesse, abandon après plusieurs reprises');
}

/**
 * Le rattrapage : la demande acceptée se lit FRIEND (création ou relève), sauf
 * baisse gravée dans l'historique de la paire à la date de l'acceptation ou
 * après. Le nouveau niveau est daté de l'acceptation, à défaut de `now`.
 */
export async function backfillFriendship(
  db: UserRelationDb,
  params: { userA: string; userB: string; acceptedAt: Date | null; now: Date },
): Promise<RelationWriteOutcome> {
  const pair = pairOf(params.userA, params.userB);
  if (!pair) return 'ignored';
  return raiseTo(db, pair, {
    origin: 'backfill-friend',
    at: params.acceptedAt ?? params.now,
    level: 'FRIEND',
    respectDropsSince: { acceptedAt: params.acceptedAt },
  });
}
