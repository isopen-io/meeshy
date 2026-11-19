/**
 * Le monde de la chute (#18748) : une personne, ses Sangs, un Proche, un bloqueur et deux comptes de
 * l'équipe, un cache en mémoire, et les crochets qui font arriver un geste PENDANT un push ou une lecture.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { FALL_CONSENT_VERSION } from '@meeshy/shared/types/fall-detection';
import { reportFall, respondFall, withdrawFallConsent, type FallPush, type FallRelayDeps } from '../../../../services/fallDetection/fallRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

export const PERSONNE = '6400000000000000000000e1';
export const SANG = '6400000000000000000000b1';
export const SANG_REFUSE = '6400000000000000000000b2';
export const PROCHE = '6400000000000000000000c1';
export const BLOQUEUR = '6400000000000000000000d1';
export const ANALYSTE = '6400000000000000000000a1';
export const ADMIN = '6400000000000000000000a2';

export const T0 = Date.parse('2026-11-19T16:43:00.000Z');
export const CHUTE = '2026-11-19T16:42:13.000Z';
export const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [PERSONNE, SANG, 'BLOOD'],
  [PERSONNE, SANG_REFUSE, 'BLOOD'],
  [PERSONNE, PROCHE, 'CLOSE'],
  [PERSONNE, BLOQUEUR, 'BLOOD'],
];
const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN' };
export const ACCORD = new Date('2026-11-19T09:00:00.000Z');

export function monde(options: { readonly role?: string; readonly consenti?: boolean; readonly version?: string } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [PERSONNE, SANG, SANG_REFUSE, PROCHE, BLOQUEUR, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === PERSONNE ? (options.role ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [PERSONNE] } : {}),
      ...(id === PERSONNE && options.consenti !== false ? { fallAlertConsentedAt: ACCORD, fallAlertConsentVersion: options.version ?? FALL_CONSENT_VERSION } : {}),
    })),
  });
  const settings = table([{ ownerId: PERSONNE, otherId: SANG_REFUSE, fallShared: false }, { ownerId: PERSONNE, otherId: PROCHE, fallShared: true }]);
  const emissions: Emission[] = [];
  const pushes: FallPush[] = [];
  const cache = batteryCacheInMemory();
  let now = T0;
  let pendantLePush: (() => Promise<unknown>) | null = null;
  let pendantLaPosition: (() => Promise<unknown>) | null = null;
  let positionServie = true;
  let verrouPris = false;
  const deps: FallRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: { ...cache, setnx: (key: string, value: string, ttl?: number) => (verrouPris ? Promise.resolve(false) : cache.setnx(key, value, ttl)) },
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as FallRelayDeps['io'],
    now: () => now,
    push: async (push) => {
      pushes.push(push);
      const during = pendantLePush;
      pendantLePush = null;
      await during?.();
      return true;
    },
    lastPositionFor: async (_emitterId, readerId) => {
      const during = pendantLaPosition;
      pendantLaPosition = null;
      await during?.();
      return readerId === SANG && positionServie ? { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() } : null;
    },
    lastBatteryFor: async (_emitterId, readerId) => (readerId === SANG ? { level: 41, measuredAt: new Date(T0 - 2 * MIN).toISOString() } : null),
  };
  const ligne = (userId: string) => world.users.rows.find((r) => r.id === userId)!;
  const personne = () => ligne(PERSONNE);
  const retirerAccord = () => {
    personne().fallAlertConsentedAt = null;
    personne().fallAlertConsentVersion = null;
  };
  return {
    deps,
    cache,
    emissions,
    pushes,
    settings,
    rapporter: (detectedAt = CHUTE) => reportFall(deps, { userId: PERSONNE, detectedAt }),
    repondre: () => respondFall(deps, PERSONNE),
    avancer: (ms: number) => {
      now += ms;
    },
    pendantLePush: (run: () => Promise<unknown>) => {
      pendantLePush = run;
    },
    pendantLaPosition: (run: () => Promise<unknown>) => {
      pendantLaPosition = run;
    },
    sansPosition: () => {
      positionServie = false;
    },
    verrouPris: () => {
      verrouPris = true;
    },
    retirerAccord,
    retirerEtPurger: () => withdrawFallConsent(deps, PERSONNE, async () => retirerAccord()),
    consentir: (version: string = FALL_CONSENT_VERSION) => {
      personne().fallAlertConsentedAt = new Date(now);
      personne().fallAlertConsentVersion = version;
    },
    naissance: (birthDate: Date) => {
      personne().birthDate = birthDate;
    },
    bloquer: (blockerId: string) => {
      ligne(blockerId).blockedUserIds = [PERSONNE];
    },
    changerRole: (userId: string, role: string) => {
      ligne(userId).role = role;
    },
    retirerA: (otherId: string) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.fallShared = false;
      else settings.rows.push({ ownerId: PERSONNE, otherId, fallShared: false });
    },
    rendreA: (otherId: string) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.fallShared = true;
      else settings.rows.push({ ownerId: PERSONNE, otherId, fallShared: true });
    },
    desactiver: (userId: string) => {
      const row = world.users.rows.find((r) => r.id === userId);
      if (row) row.deactivatedAt = new Date(now);
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    poussesA: (userId: string) => pushes.filter((p) => p.readerId === userId).map((p) => p.kind),
  };
}

export const ETAT_SANG = {
  userId: PERSONNE,
  detectedAt: '2026-11-19T16:42:00.000Z',
  expiresAt: '2026-11-19T22:42:00.000Z',
  lastPosition: { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() },
  lastBattery: { level: 41, measuredAt: new Date(T0 - 2 * MIN).toISOString() },
};

