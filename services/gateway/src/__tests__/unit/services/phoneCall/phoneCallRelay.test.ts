/**
 * « EN APPEL » (#18753) — le téléphone suivi rapporte qu'il est en appel ; chaque Sang autorisé
 * reçoit dans `user:<id>` l'état (début arrondi, expiration), l'annonce seulement quand il est en
 * conversation avec l'émetteur ; la fin efface. Aucun push, aucun interlocuteur, rien vers un
 * lecteur que la loi refuse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  phoneCallSnapshotFor,
  refreshPhoneCallAudience,
  refreshPhoneCallBetween,
  reconcilePhoneCallOfAccount,
  reportPhoneCall,
  type PhoneCallRelayDeps,
} from '../../../../services/phoneCall/phoneCallRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const PERSONNE = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const BLOQUEUR = '6400000000000000000000d1';
const ANALYSTE = '6400000000000000000000a1';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-19T14:02:13.000Z');
const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [PERSONNE, SANG, 'BLOOD'],
  [PERSONNE, SANG_REFUSE, 'BLOOD'],
  [PERSONNE, PROCHE, 'CLOSE'],
  [PERSONNE, BLOQUEUR, 'BLOOD'],
];
const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN' };

function monde(options: { readonly role?: string; readonly coupee?: boolean; readonly enConversation?: readonly string[] } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [PERSONNE, SANG, SANG_REFUSE, PROCHE, BLOQUEUR, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === PERSONNE ? (options.role ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [PERSONNE] } : {}),
      ...(id === PERSONNE && options.coupee ? { callSharingDisabledAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
    })),
  });
  const settings = table([{ ownerId: PERSONNE, otherId: SANG_REFUSE, callShared: false }, { ownerId: PERSONNE, otherId: PROCHE, callShared: true }]);
  const emissions: Emission[] = [];
  const conversing = new Set(options.enConversation ?? []);
  let now = T0;
  const deps: PhoneCallRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as PhoneCallRelayDeps['io'],
    now: () => now,
    context: async ({ readerIds }) => new Map(readerIds.map((id) => [id, { roomOpen: conversing.has(id), lastExchangeAt: null, awaitingReply: false }])),
    isTrackedDevice: async ({ sessionId }) => sessionId === 's1',
  };
  const rapporter = (active: boolean, sessionId = 's1') => reportPhoneCall(deps, { userId: PERSONNE, sessionId, active });
  return {
    deps,
    emissions,
    settings,
    rapporter,
    avancer: (ms: number) => {
      now += ms;
    },
    poser: (otherId: string, callShared: boolean) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.callShared = callShared;
      else settings.rows.push({ ownerId: PERSONNE, otherId, callShared });
    },
    couper: () => {
      const row = world.users.rows.find((r) => r.id === PERSONNE);
      if (row) row.callSharingDisabledAt = new Date(now);
    },
    desactiver: (userId: string) => {
      const row = world.users.rows.find((r) => r.id === userId);
      if (row) row.deactivatedAt = new Date(now);
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
  };
}

describe('le téléphone en appel', () => {
  it('le Sang reçoit l\'état : début et expiration arrondis à 5 min, rien d\'autre ; sans annonce hors conversation', async () => {
    const m = monde();
    expect(await m.rapporter(true)).toBe(true);
    expect(m.vers(SANG)).toEqual([{
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.PHONE_CALL_STARTED,
      data: { userId: PERSONNE, state: { userId: PERSONNE, since: '2026-11-19T14:00:00.000Z', expiresAt: '2026-11-19T17:05:00.000Z' } },
    }]);
  });

  it('en conversation avec l\'émetteur : l\'annonce part (SyncPill)', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.rapporter(true);
    expect(m.vers(SANG)[0]?.data.announcement).toEqual({ kind: 'started', at: '2026-11-19T14:00:00.000Z' });
  });

  it('Sang sans réglage oui ; Proche (même consenti), Sang retiré, bloqué, équipe face à un utilisateur : rien', async () => {
    const m = monde();
    await m.rapporter(true);
    expect(m.vers(SANG)).toHaveLength(1);
    for (const id of [PROCHE, SANG_REFUSE, BLOQUEUR, ADMIN, ANALYSTE]) expect(m.vers(id)).toEqual([]);
  });

  it('entre comptes de l\'équipe sans lien, le niveau rendu est Sang (#16623)', async () => {
    const m = monde({ role: 'ANALYST' });
    await m.rapporter(true);
    expect(m.vers(ADMIN)).toHaveLength(1);
    expect(m.vers(ANALYSTE)).toHaveLength(1);
  });

  it('un autre appareil que le téléphone suivi ne dit rien', async () => {
    const m = monde();
    expect(await m.rapporter(true, 'ordinateur')).toBe(false);
    expect(m.emissions).toEqual([]);
  });

  it('coupé pour tous : rien n\'est rangé ni servi', async () => {
    const m = monde({ coupee: true });
    expect(await m.rapporter(true)).toBe(true);
    expect(m.emissions).toEqual([]);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toEqual([]);
  });

  it('un rappel pendant l\'appel garde le début et repousse l\'expiration, sans annonce', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.rapporter(true);
    m.avancer(20 * MIN);
    await m.rapporter(true);
    const last = m.vers(SANG).at(-1);
    expect(last?.data.announcement).toBeUndefined();
    expect(last?.data.state).toEqual({ userId: PERSONNE, since: '2026-11-19T14:00:00.000Z', expiresAt: '2026-11-19T17:25:00.000Z' });
  });

  it('la fin efface l\'état chez le Sang ; en conversation, elle s\'annonce', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.rapporter(true);
    m.avancer(12 * MIN);
    await m.rapporter(false);
    expect(m.vers(SANG).at(-1)).toEqual({
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.PHONE_CALL_ENDED,
      data: { userId: PERSONNE, announcement: { kind: 'ended', at: '2026-11-19T14:10:00.000Z' } },
    });
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toEqual([]);
  });
});

describe('le rattrapage et la perte d\'accès', () => {
  it('le Sang autorisé retrouve l\'appel en cours ; les autres rien', async () => {
    const m = monde();
    await m.rapporter(true);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items.map((i) => i.userId)).toEqual([PERSONNE]);
    expect((await phoneCallSnapshotFor(m.deps, PROCHE)).items).toEqual([]);
    expect((await phoneCallSnapshotFor(m.deps, ADMIN)).items).toEqual([]);
  });

  it('un état resté sans rappel au-delà de 3 h (arrondies aux 5 min supérieures) n\'est plus servi', async () => {
    const m = monde();
    await m.rapporter(true);
    m.avancer(178 * MIN);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toHaveLength(1);
    m.avancer(5 * MIN);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toEqual([]);
  });

  it('un retrait par personne efface l\'état chez ce Sang', async () => {
    const m = monde();
    await m.rapporter(true);
    m.poser(SANG, false);
    await refreshPhoneCallBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.vers(SANG).at(-1)).toEqual({ room: ROOMS.user(SANG), event: SERVER_EVENTS.PHONE_CALL_ENDED, data: { userId: PERSONNE } });
  });

  it('un accès gagné pendant l\'appel sert l\'état en cours', async () => {
    const m = monde();
    m.poser(SANG, false);
    await m.rapporter(true);
    expect(m.vers(SANG)).toEqual([]);
    m.poser(SANG, true);
    await refreshPhoneCallBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_CALL_STARTED);
  });

  it('la coupure globale efface l\'état chez tous et l\'oublie', async () => {
    const m = monde();
    await m.rapporter(true);
    m.couper();
    await refreshPhoneCallAudience(m.deps, PERSONNE);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_CALL_ENDED);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toEqual([]);
  });

  it('un Sang désactivé perd l\'état', async () => {
    const m = monde();
    await m.rapporter(true);
    m.desactiver(SANG);
    await reconcilePhoneCallOfAccount(m.deps, SANG);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_CALL_ENDED);
  });
});
