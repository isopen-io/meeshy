/**
 * Le MONDE des témoins de la position du Sang (#13937) : les liens, comptes et
 * blocages de `messagingWorld`, plus trois tables EN MÉMOIRE que la production
 * lit et écrit — les réglages par personne (`relationFeatureSetting`, avec leur
 * clé composée), l'historique de position et le journal des consultations. Les
 * clauses reçues sont ÉVALUÉES (`matchesMongoWhere`), jamais admises.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { matchesMongoWhere, type MongoDocument } from './mongo-where';
import { ADULT_BIRTH, messagingWorld, type CircleLink, type Row } from './messaging-circle-world';
import type { BloodLocationDeps } from '../../services/bloodLocation/bloodLocationService';

export const T0 = Date.parse('2026-11-09T12:00:00.000Z');
export const MINUTE = 60_000;
export const HEURE = 3_600_000;
export const JOUR = 24 * HEURE;

export const MOI = '6400000000000000000000a1';
export const SANG = '6400000000000000000000b1';
export const AUTRE_SANG = '6400000000000000000000b2';
export const PROCHE = '6400000000000000000000c1';
export const AMI = '6400000000000000000000d1';
export const BLOQUE = '6400000000000000000000e1';
export const MODERATEUR = '6400000000000000000000f1';
export const AUTRE_MODERATEUR = '6400000000000000000000f2';

export const PARIS = { latitude: 48.8566, longitude: 2.3522, accuracy: 6 } as const;
export const A_300_M = { latitude: 48.8593, longitude: 2.3522, accuracy: 8 } as const;
export const A_5_KM = { latitude: 48.9, longitude: 2.3522, accuracy: 8 } as const;

export type Consentements = Partial<Record<'locationShared' | 'locationHistoryShared' | 'proximityShared', boolean>>;

export const LIENS: readonly CircleLink[] = [
  [MOI, SANG, 'BLOOD'],
  [MOI, AUTRE_SANG, 'BLOOD'],
  [MOI, PROCHE, 'CLOSE'],
  [MOI, AMI, 'FRIEND'],
  [MOI, BLOQUE, 'BLOOD'],
];

export const TOUT_PARTAGE: Consentements = { locationShared: true, locationHistoryShared: true, proximityShared: true };

export type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

type Setting = Row & { ownerId: string; otherId: string };

function inMemoryTable(rows: Row[], keyOf?: (where: Row) => Row | null) {
  const matching = (where?: Row): Row[] => rows.filter((row) => matchesMongoWhere(row, where));
  const pick = (row: Row, select?: Row): Row => (select ? Object.fromEntries(Object.keys(select).filter((k) => k in row).map((k) => [k, row[k]])) : { ...row });
  const order = (found: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] => {
    if (!orderBy) return found;
    const [[field, direction]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
    return [...found].sort((a, b) => (Number(a[field]) - Number(b[field])) * (direction === 'desc' ? -1 : 1));
  };
  const asNumber = (row: Row): Row => row;
  return {
    rows,
    create: async (args: { data: Row }) => {
      const row = { id: `row${String(rows.length).padStart(21, '0')}`, ...args.data };
      rows.push(row);
      return row;
    },
    createMany: async (args: { data: Row[] }) => {
      args.data.forEach((data) => rows.push({ id: `row${String(rows.length).padStart(21, '0')}`, ...data }));
      return { count: args.data.length };
    },
    findMany: async (args: { where?: Row; select?: Row; orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {}) =>
      order(matching(args.where).map(asNumber), args.orderBy).slice(0, args.take ?? rows.length).map((row) => pick(row, args.select)),
    findFirst: async (args: { where?: Row; select?: Row; orderBy?: Record<string, 'asc' | 'desc'> } = {}) => {
      const [found] = order(matching(args.where), args.orderBy);
      return found ? pick(found, args.select) : null;
    },
    findUnique: async (args: { where: Row; select?: Row }) => {
      const where = keyOf?.(args.where) ?? args.where;
      const [found] = matching(where ?? undefined);
      return found ? pick(found, args.select) : null;
    },
    count: async (args: { where?: Row } = {}) => matching(args.where).length,
    deleteMany: async (args: { where?: Row } = {}) => {
      const gone = matching(args.where);
      gone.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { count: gone.length };
    },
    updateMany: async (args: { where?: Row; data: Row }) => {
      const hit = matching(args.where);
      hit.forEach((row) => Object.assign(row, args.data));
      return { count: hit.length };
    },
    upsertBy: (where: Row, create: Row, update: Row): Row => {
      const [found] = matching(where);
      if (found) return Object.assign(found, update);
      const row = { id: `row${String(rows.length).padStart(21, '0')}`, ...create };
      rows.push(row);
      return row;
    },
  };
}

export type BloodLocationWorldSeed = {
  readonly links?: readonly CircleLink[];
  readonly users?: readonly Row[];
  /** `[propriétaire, bénéficiaire, partages]` : ce que `propriétaire` partage à `bénéficiaire`. */
  readonly consents?: ReadonlyArray<readonly [string, string, Consentements & Row]>;
  readonly cooldownDown?: boolean;
};

export function bloodLocationWorld(seed: BloodLocationWorldSeed = {}) {
  const userRows: Row[] = (seed.users ?? [MOI, SANG, AUTRE_SANG, PROCHE, AMI, BLOQUE].map((id) => ({ id, birthDate: ADULT_BIRTH, ...(id === BLOQUE ? { blockedUserIds: [MOI] } : {}) }))) as Row[];
  const base = messagingWorld({ links: seed.links ?? LIENS, users: userRows });
  const points = inMemoryTable([]);
  const consultations = inMemoryTable([]);
  const settingRows: Setting[] = (seed.consents ?? []).map(([ownerId, otherId, shares]) => ({
    id: `set${ownerId.slice(-3)}${otherId.slice(-3)}`,
    ownerId,
    otherId,
    locationShared: false,
    locationHistoryShared: false,
    proximityShared: false,
    ...shares,
  }));
  const settings = inMemoryTable(settingRows, (where) => {
    const compound = where.ownerId_otherId as { ownerId: string; otherId: string } | undefined;
    return compound ? { ownerId: compound.ownerId, otherId: compound.otherId } : null;
  });
  const users = Object.assign(base.users, {
    update: async (args: { where: { id: string }; data: Row }) => {
      const [found] = userRows.filter((row) => row.id === args.where.id);
      return found ? Object.assign(found, args.data) : null;
    },
  });
  const prisma = {
    ...base.prisma,
    user: users,
    relationFeatureSetting: {
      ...settings,
      upsert: async (args: { where: { ownerId_otherId: { ownerId: string; otherId: string } }; create: Row; update: Row }) =>
        settings.upsertBy(args.where.ownerId_otherId, args.create, args.update),
    },
    bloodLocationPoint: points,
    bloodLocationConsultation: consultations,
  };
  const emissions: Emission[] = [];
  const cooldowns = new Map<string, number>();
  let now = T0;
  const deps: BloodLocationDeps = {
    prisma: prisma as unknown as PrismaClient,
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as BloodLocationDeps['io'],
    now: () => now,
    claimProximityCooldown: async (key, ttlSeconds) => {
      if (seed.cooldownDown) throw new Error('redis injoignable');
      const until = cooldowns.get(key);
      if (until !== undefined && until > now) return false;
      cooldowns.set(key, now + ttlSeconds * 1000);
      return true;
    },
  };
  return {
    deps,
    prisma,
    emissions,
    points,
    consultations,
    settings,
    userRows,
    /** Ce qu'une room a reçu, événement par événement. */
    vers: (userId: string, event?: string): Emission[] => emissions.filter((e) => e.room === `user:${userId}` && (event === undefined || e.event === event)),
    avancer: (ms: number): void => {
      now += ms;
    },
    horloge: (): number => now,
    /** Retire ou accorde un partage : le prochain geste relit la base. */
    consentir: (ownerId: string, otherId: string, shares: Consentements & Row): void => {
      settings.upsertBy({ ownerId, otherId }, { ownerId, otherId, locationShared: false, locationHistoryShared: false, proximityShared: false, ...shares }, shares);
    },
  };
}

export type BloodLocationWorld = ReturnType<typeof bloodLocationWorld>;

export const bloodWorldAvecConsentements = (seed: BloodLocationWorldSeed = {}) =>
  bloodLocationWorld({
    consents: [
      [SANG, MOI, TOUT_PARTAGE],
      [AUTRE_SANG, MOI, TOUT_PARTAGE],
      [MOI, SANG, TOUT_PARTAGE],
      [MOI, AUTRE_SANG, TOUT_PARTAGE],
    ],
    ...seed,
  });

export type { MongoDocument };
