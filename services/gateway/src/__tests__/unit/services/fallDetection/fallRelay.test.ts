/**
 * « CHUTE DÉTECTÉE » (#18748, SAN-01) — l'iPhone rapporte une chute ; sans l'ACCORD EXPLICITE de la
 * personne rien n'est gardé ni servi. Avec lui, chaque Sang autorisé reçoit tout de suite le push
 * générique et `fall:detected` (instant à la minute, position et batterie seulement s'il les reçoit
 * déjà) ; « Je vais bien » clôt l'épisode, le retrait de l'accord l'efface. Rien vers un lecteur que
 * la loi refuse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  fallSnapshotFor,
  reconcileFallOfAccount,
  refreshFallAudience,
  refreshFallBetween,
  refreshFallServedOf,
  reportFall,
  respondFall,
  type FallPush,
  type FallRelayDeps,
} from '../../../../services/fallDetection/fallRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const PERSONNE = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const BLOQUEUR = '6400000000000000000000d1';
const ANALYSTE = '6400000000000000000000a1';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-19T16:43:00.000Z');
const CHUTE = '2026-11-19T16:42:13.000Z';
const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [PERSONNE, SANG, 'BLOOD'],
  [PERSONNE, SANG_REFUSE, 'BLOOD'],
  [PERSONNE, PROCHE, 'CLOSE'],
  [PERSONNE, BLOQUEUR, 'BLOOD'],
];
const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN' };
const ACCORD = new Date('2026-11-19T09:00:00.000Z');

function monde(options: { readonly role?: string; readonly consenti?: boolean } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [PERSONNE, SANG, SANG_REFUSE, PROCHE, BLOQUEUR, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === PERSONNE ? (options.role ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [PERSONNE] } : {}),
      ...(id === PERSONNE && options.consenti !== false ? { fallAlertConsentedAt: ACCORD, fallAlertConsentVersion: '2026-11-19' } : {}),
    })),
  });
  const settings = table([{ ownerId: PERSONNE, otherId: SANG_REFUSE, fallShared: false }, { ownerId: PERSONNE, otherId: PROCHE, fallShared: true }]);
  const emissions: Emission[] = [];
  const pushes: FallPush[] = [];
  let now = T0;
  let pendantLePush: (() => Promise<unknown>) | null = null;
  let positionServie = true;
  const deps: FallRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as FallRelayDeps['io'],
    now: () => now,
    push: async (push) => {
      pushes.push(push);
      const during = pendantLePush;
      pendantLePush = null;
      await during?.();
      return true;
    },
    lastPositionFor: async (_emitterId, readerId) => (readerId === SANG && positionServie ? { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() } : null),
    lastBatteryFor: async (_emitterId, readerId) => (readerId === SANG ? { level: 41, measuredAt: new Date(T0 - 2 * MIN).toISOString() } : null),
  };
  const personne = () => world.users.rows.find((r) => r.id === PERSONNE)!;
  return {
    deps,
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
    sansPosition: () => {
      positionServie = false;
    },
    retirerAccord: () => {
      personne().fallAlertConsentedAt = null;
      personne().fallAlertConsentVersion = null;
    },
    retirerA: (otherId: string) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.fallShared = false;
      else settings.rows.push({ ownerId: PERSONNE, otherId, fallShared: false });
    },
    desactiver: (userId: string) => {
      const row = world.users.rows.find((r) => r.id === userId);
      if (row) row.deactivatedAt = new Date(now);
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
  };
}

const ETAT_SANG = {
  userId: PERSONNE,
  detectedAt: '2026-11-19T16:42:00.000Z',
  expiresAt: '2026-11-19T22:42:00.000Z',
  lastPosition: { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() },
  lastBattery: { level: 41, measuredAt: new Date(T0 - 2 * MIN).toISOString() },
};

describe('sans accord explicite, rien', () => {
  it('une chute rapportée sans accord est refusée, rien n\'est rangé ni servi', async () => {
    const m = monde({ consenti: false });
    expect(await m.rapporter()).toEqual({ kind: 'consent-required' });
    expect(m.emissions).toEqual([]);
    expect(m.pushes).toEqual([]);
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });

  it('une chute trop vieille ou dans le futur est refusée avant toute lecture', async () => {
    const m = monde();
    expect(await m.rapporter(new Date(T0 - 31 * MIN).toISOString())).toEqual({ kind: 'too-old' });
    expect(await m.rapporter(new Date(T0 + 3 * MIN).toISOString())).toEqual({ kind: 'in-future' });
    expect(m.emissions).toEqual([]);
  });
});

describe('la chute prévient les Sangs tout de suite', () => {
  it('le Sang reçoit l\'état à la minute, sa position et sa batterie, l\'annonce, et le push', async () => {
    const m = monde();
    expect(await m.rapporter()).toEqual({ kind: 'recorded' });
    expect(m.vers(SANG)).toEqual([{
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.FALL_DETECTED,
      data: { userId: PERSONNE, state: ETAT_SANG, announcement: { kind: 'detected', at: '2026-11-19T16:42:00.000Z' } },
    }]);
    expect(m.pushes).toEqual([{ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: '2026-11-19T16:42:00.000Z' }]);
  });

  it('Proche (même consenti), Sang retiré, bloqué, équipe face à un utilisateur : rien, pas même le push', async () => {
    const m = monde();
    await m.rapporter();
    for (const id of [PROCHE, SANG_REFUSE, BLOQUEUR, ADMIN, ANALYSTE]) expect(m.vers(id)).toEqual([]);
    expect(m.pushes.map((p) => p.readerId)).toEqual([SANG]);
  });

  it('entre comptes de l\'équipe, un collègue reçoit la chute quand l\'émetteur a consenti (#16623)', async () => {
    const m = monde({ role: 'ANALYST' });
    await m.rapporter();
    expect(m.vers(ANALYSTE)).toHaveLength(1);
    expect(m.vers(ADMIN)).toHaveLength(1);
    expect(m.pushes.map((p) => p.readerId).sort()).toEqual([ADMIN, ANALYSTE, SANG].sort());
  });

  it('entre comptes de l\'équipe, sans accord de l\'émetteur, le collègue ne reçoit rien', async () => {
    const m = monde({ role: 'ANALYST', consenti: false });
    expect(await m.rapporter()).toEqual({ kind: 'consent-required' });
    expect(m.vers(ANALYSTE)).toEqual([]);
    expect(m.vers(ADMIN)).toEqual([]);
    expect(m.pushes).toEqual([]);
  });

  it('une seconde chute à moins de 10 min ne repousse ni l\'état ni le push ; au-delà, un épisode neuf repart', async () => {
    const m = monde();
    await m.rapporter();
    m.avancer(5 * MIN);
    expect(await m.rapporter(new Date(T0 + 4 * MIN).toISOString())).toEqual({ kind: 'deduplicated' });
    expect(m.pushes).toHaveLength(1);
    m.avancer(10 * MIN);
    expect(await m.rapporter(new Date(T0 + 14 * MIN).toISOString())).toEqual({ kind: 'recorded' });
    expect(m.pushes).toHaveLength(2);
  });

  it('le rattrapage sert l\'épisode en cours au Sang, rien au Proche ; passé l\'expiration, plus rien', async () => {
    const m = monde();
    await m.rapporter();
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [ETAT_SANG] });
    expect(await fallSnapshotFor(m.deps, PROCHE)).toEqual({ items: [] });
    m.avancer(6 * 60 * MIN);
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });
});

describe('« Je vais bien » et le retrait', () => {
  it('« Je vais bien » efface chez le Sang alerté (responded) et lui pousse la réponse ; rien n\'est plus servi', async () => {
    const m = monde();
    await m.rapporter();
    expect(await m.repondre()).toBe(true);
    expect(m.vers(SANG).at(-1)).toEqual({ room: ROOMS.user(SANG), event: SERVER_EVENTS.FALL_CLEARED, data: { userId: PERSONNE, reason: 'responded' } });
    expect(m.pushes.at(-1)).toEqual({ readerId: SANG, emitterId: PERSONNE, kind: 'responded', at: new Date(T0).toISOString() });
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
    expect(await m.repondre()).toBe(false);
  });

  it('« Je vais bien » arrivé PENDANT l\'éventail : le Sang atteint reçoit la réponse juste après, jamais une alerte orpheline', async () => {
    const m = monde();
    m.pendantLePush(() => m.repondre());
    await m.rapporter();
    const events = m.vers(SANG).map((e) => e.event);
    expect(events[0]).toBe(SERVER_EVENTS.FALL_DETECTED);
    expect(events.slice(1).length).toBeGreaterThan(0);
    expect(events.slice(1).every((event) => event === SERVER_EVENTS.FALL_CLEARED)).toBe(true);
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'responded' });
    expect(m.pushes.map((p) => p.kind)).toEqual(['detected', 'responded']);
  });

  it('le retrait de l\'accord purge l\'épisode et efface chez le Sang (withdrawn), sans push', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerAccord();
    await refreshFallAudience(m.deps, PERSONNE);
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(m.pushes).toHaveLength(1);
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });

  it('le retrait de l\'accord PENDANT l\'éventail : le Sang atteint reçoit l\'effacement withdrawn', async () => {
    const m = monde();
    m.pendantLePush(async () => {
      m.retirerAccord();
      await refreshFallAudience(m.deps, PERSONNE);
    });
    await m.rapporter();
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(m.pushes.map((p) => p.kind)).toEqual(['detected']);
  });

  it('un retrait par personne efface chez ce Sang seul (withdrawn)', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerA(SANG);
    await refreshFallBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });

  it('un lecteur dont le compte est désactivé reçoit l\'effacement', async () => {
    const m = monde();
    await m.rapporter();
    m.desactiver(SANG);
    await reconcileFallOfAccount(m.deps, SANG);
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
  });

  it('une position qu\'on ne partage plus disparaît de l\'état servi, sans nouvelle annonce', async () => {
    const m = monde();
    await m.rapporter();
    m.sansPosition();
    await refreshFallServedOf(m.deps, PERSONNE);
    const last = m.vers(SANG).at(-1);
    expect(last?.event).toBe(SERVER_EVENTS.FALL_DETECTED);
    expect(last?.data).toEqual({ userId: PERSONNE, state: { ...ETAT_SANG, lastPosition: undefined } });
    expect(m.pushes).toHaveLength(1);
  });
});
