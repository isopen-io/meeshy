/**
 * Le monde des témoins du relais de position partagée (#16980, #16987) : la loi évaluée
 * sur les lectures vraies, le magasin strict en mémoire, les lectures que l'on suspend.
 */
import { relationPairKey } from '@meeshy/shared/types/relation';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { startSharedLocation, type SharedLocationRelayDeps } from '../../services/sharedLocation/sharedLocationRelay';
import { sharedLocationKvEnMemoire } from './shared-location-kv';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from './messaging-circle-world';

export const EMETTEUR = '6300000000000000000000e1';
export const AMI = '6300000000000000000000f1';
export const PROCHE = '6300000000000000000000c1';
export const SANG = '6300000000000000000000b1';
export const CONNAISSANCE = '6300000000000000000000a1';
export const NON_CHOISI = '6300000000000000000000f2';
export const BLOQUEUR = '6300000000000000000000d1';

export const T0 = Date.parse('2026-11-08T12:00:00.000Z');
export const HEURE = 3_600_000;
export const PARIS = { latitude: 48.8566, longitude: 2.3522, accuracy: 4 } as const;
export const PLUS_LOIN = { latitude: 48.8738, longitude: 2.295, accuracy: 12 } as const;

export type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

export const LIENS: readonly CircleLink[] = [
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
  [EMETTEUR, NON_CHOISI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'CLOSE'],
];

export function monde(extra: { readonly links?: readonly CircleLink[]; readonly users?: readonly { readonly id: string; readonly role?: string }[] } = {}) {
  const world = messagingWorld({
    links: [...LIENS, ...(extra.links ?? [])],
    users: [
      ...[EMETTEUR, AMI, PROCHE, SANG, CONNAISSANCE, NON_CHOISI, BLOQUEUR].map((id) => ({
        id,
        birthDate: ADULT_BIRTH,
        ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
      })),
      ...(extra.users ?? []).map((user) => ({ birthDate: ADULT_BIRTH, ...user })),
    ],
  });
  const emissions: Emission[] = [];
  let now = T0;
  const cache = sharedLocationKvEnMemoire({ horloge: () => now });
  const lectures = { cache: 0, comptes: 0 };
  let pauseLecture: Promise<void> | null = null;
  let lectureEnPanne = false;
  let lecturesAPasser = 0;
  let relacherLecture = (): void => undefined;
  const users = world.prisma.user as unknown as { findMany: (args: unknown) => Promise<unknown> };
  const prisma = new Proxy(world.prisma, {
    get: (target, prop) =>
      prop === 'user'
        ? new Proxy(target.user, {
            get: (userTarget, userProp) =>
              userProp === 'findMany'
                ? async (args: unknown) => {
                    lectures.comptes += 1;
                    if (lecturesAPasser > 0) {
                      lecturesAPasser -= 1;
                      return users.findMany(args);
                    }
                    if (lectureEnPanne) {
                      lectureEnPanne = false;
                      throw new Error('base injoignable');
                    }
                    const attente = pauseLecture;
                    pauseLecture = null;
                    const rows = await users.findMany(args);
                    if (attente) await attente;
                    return rows;
                  }
                : Reflect.get(userTarget, userProp),
          })
        : Reflect.get(target, prop),
  });
  const deps: SharedLocationRelayDeps = {
    prisma: prisma as unknown as PrismaClient,
    cache: new Proxy(cache, {
      get: (target, prop) => (prop === 'get' ? (...args: [string]) => { lectures.cache += 1; return target.get(...args); } : Reflect.get(target, prop)),
    }) as SharedLocationRelayDeps['cache'],
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as SharedLocationRelayDeps['io'],
    now: () => now,
  };
  return {
    deps,
    cache,
    lectures,
    emissions,
    /**
     * La prochaine lecture des comptes (l'accès d'un lecteur) attend `relacherLecture()`.
     * `passer` laisse filer autant de lectures d'abord : un démarrage relit son émetteur
     * avant de ranger quoi que ce soit, son éventail lit ensuite.
     */
    suspendreProchaineLecture: (passer = 0) => {
      lecturesAPasser = passer;
      pauseLecture = new Promise<void>((resolve) => {
        relacherLecture = resolve;
      });
    },
    relacherLecture: () => relacherLecture(),
    /** La prochaine lecture des comptes lève (base injoignable), après `passer` lectures. */
    echouerProchaineLecture: (passer = 0) => {
      lecturesAPasser = passer;
      lectureEnPanne = true;
    },
    avancer: (ms: number) => {
      now += ms;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    /** Écrit une colonne du compte, comme la désactivation, la suppression ou un changement de rôle. */
    ecrireCompte: async (userId: string, data: Record<string, unknown>) => {
      await world.prisma.user.updateMany({ where: { id: userId }, data });
    },
    lier: async (a: string, b: string, level: string) => {
      await world.prisma.userRelation.updateMany({ where: relationPairKey(a, b), data: { grantedByLow: level, grantedByHigh: level } });
    },
  };
}

export const TOUS = [
  { userId: AMI, precision: 'exact' },
  { userId: PROCHE, precision: 'neighborhood' },
  { userId: SANG },
  { userId: CONNAISSANCE, precision: 'exact' },
  { userId: BLOQUEUR, precision: 'exact' },
] as const;

export const demarrer = (m: ReturnType<typeof monde>, recipients: readonly object[] = TOUS, durationMinutes = 60) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients, durationMinutes, position: PARIS });
