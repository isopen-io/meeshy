/**
 * #17023 — RECEVOIR des invitations « ensemble » est une préférence de RÉCEPTION de
 * l'invité, active par défaut : coupée pour une personne (`togetherBlockedAt` sur SA ligne
 * de réglages), ou pour tous (`notification.togetherEnabled`), l'invitation ne part pas, et
 * l'hôte lit le même refus qu'envers un inconnu. Et une paire ne s'invite pas en rafale :
 * cinq invitations par dix minutes, d'un hôte vers un même invité, puis le même refus.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) : la loi est jugée sur les
 * lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { TOGETHER_ERROR_CODES, TOGETHER_INVITES_PER_PAIR, TOGETHER_INVITES_WINDOW_SECONDS } from '@meeshy/shared/types/together';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { inviteTogether, type TogetherRelayDeps } from '../../../../services/together/togetherRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const HOTE = '6300000000000000000000a1';
const PROCHE = '6300000000000000000000c1';
const SANG = '6300000000000000000000b1';
const CONV = '6300000000000000000000aa';
const VIDEO = '63000000000000000000a001';
const T0 = Date.parse('2026-11-13T12:00:00.000Z');

const LIENS: readonly CircleLink[] = [
  [HOTE, PROCHE, 'CLOSE'],
  [HOTE, SANG, 'BLOOD'],
];

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

function cacheEnMemoire(clock: () => number) {
  const entries = new Map<string, { value: string; until: number }>();
  return {
    entries,
    get: async (key: string) => {
      const entry = entries.get(key);
      return entry && entry.until > clock() ? entry.value : null;
    },
    set: async (key: string, value: string, ttl?: number) => {
      entries.set(key, { value, until: clock() + (ttl ?? 3600) * 1000 });
    },
    del: async (key: string) => {
      entries.delete(key);
    },
  };
}

function monde(seed: { readonly reglages?: readonly Row[]; readonly preferences?: readonly Row[] } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [HOTE, PROCHE, SANG].map((id) => ({ id, role: 'USER', birthDate: ADULT_BIRTH })),
    participants: [HOTE, PROCHE, SANG].map((userId) => ({
      id: `p-${userId}`,
      userId,
      conversationId: CONV,
      isActive: true,
      leftAt: null,
      bannedAt: null,
    })),
    conversations: [{ id: CONV, isActive: true, closedAt: null, deletedAt: null }],
  });
  const messageAttachment = table([
    { id: VIDEO, mimeType: 'video/mp4', isViewOnce: false, message: { conversationId: CONV, deletedAt: null, expiresAt: null, isViewOnce: false } },
  ]);
  const relationFeatureSetting = table([...(seed.reglages ?? [])]);
  const userPreferences = table([...(seed.preferences ?? [])]);
  const emissions: Emission[] = [];
  let now = T0;
  let ids = 0;
  const cache = cacheEnMemoire(() => now);
  const deps: TogetherRelayDeps = {
    prisma: { ...world.prisma, messageAttachment, relationFeatureSetting, userPreferences } as unknown as PrismaClient,
    cache,
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as TogetherRelayDeps['io'],
    now: () => now,
    newSessionId: () => String(++ids).padStart(32, '0'),
  };
  return {
    deps,
    cache,
    avancer: (ms: number) => {
      now += ms;
    },
    invitations: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId) && e.event === SERVER_EVENTS.TOGETHER_INVITED),
  };
}

const inviter = (m: ReturnType<typeof monde>, toUserId = PROCHE) => inviteTogether(m.deps, HOTE, { toUserId, conversationId: CONV, attachmentId: VIDEO });

const REFUS = { success: false, error: expect.any(String), code: TOGETHER_ERROR_CODES.NOT_ALLOWED };
const coupe = (ownerId: string, otherId: string): Row => ({ id: `s-${ownerId}-${otherId}`, ownerId, otherId, togetherBlockedAt: new Date(T0 - 60_000) });

afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('la réception des invitations « ensemble » — active par défaut', () => {
  it('sans aucun réglage, l\'invitation part', async () => {
    const m = monde();
    expect(await inviter(m)).toMatchObject({ success: true });
    expect(m.invitations(PROCHE)).toHaveLength(1);
  });

  it('un invité qui a coupé les invitations de CET hôte ne reçoit rien, et l\'hôte lit le refus d\'un inconnu', async () => {
    const m = monde({ reglages: [coupe(PROCHE, HOTE)] });
    expect(await inviter(m)).toEqual(REFUS);
    expect(m.invitations(PROCHE)).toEqual([]);
  });

  it('la coupure est orientée : celle que l\'HÔTE a posée pour l\'invité ne l\'empêche pas d\'inviter', async () => {
    const m = monde({ reglages: [coupe(HOTE, PROCHE)] });
    expect(await inviter(m)).toMatchObject({ success: true });
  });

  it('une coupure posée pour une autre personne ne touche pas cet hôte', async () => {
    const m = monde({ reglages: [coupe(PROCHE, SANG)] });
    expect(await inviter(m)).toMatchObject({ success: true });
  });

  it('une coupure levée (date nulle) laisse de nouveau partir', async () => {
    const m = monde({ reglages: [{ ...coupe(PROCHE, HOTE), togetherBlockedAt: null }] });
    expect(await inviter(m)).toMatchObject({ success: true });
  });

  it('l\'interrupteur global coupé refuse les invitations de tous, sous le même code', async () => {
    const m = monde({ preferences: [{ id: 'pref-proche', userId: PROCHE, notification: { togetherEnabled: false } }] });
    expect(await inviter(m)).toEqual(REFUS);
    expect(m.invitations(PROCHE)).toEqual([]);
  });

  it('des préférences sans la clé valent « reçu »', async () => {
    const m = monde({ preferences: [{ id: 'pref-proche', userId: PROCHE, notification: { talkieEnabled: false } }] });
    expect(await inviter(m)).toMatchObject({ success: true });
  });
});

describe('une paire ne s\'invite pas en rafale', () => {
  it(`${TOGETHER_INVITES_PER_PAIR} invitations par fenêtre partent, la suivante est refusée sans rien émettre`, async () => {
    const m = monde();
    for (let i = 0; i < TOGETHER_INVITES_PER_PAIR; i += 1) {
      expect(await inviter(m)).toMatchObject({ success: true });
      m.avancer(1000);
    }
    expect(await inviter(m)).toEqual(REFUS);
    expect(m.invitations(PROCHE)).toHaveLength(TOGETHER_INVITES_PER_PAIR);
  });

  it('la borne est par paire : l\'hôte invite encore un autre Proche', async () => {
    const m = monde();
    for (let i = 0; i < TOGETHER_INVITES_PER_PAIR; i += 1) await inviter(m);
    expect(await inviter(m, SANG)).toMatchObject({ success: true });
  });

  it('la fenêtre glisse : passé son terme, une invitation repart', async () => {
    const m = monde();
    for (let i = 0; i < TOGETHER_INVITES_PER_PAIR; i += 1) await inviter(m);
    m.avancer(TOGETHER_INVITES_WINDOW_SECONDS * 1000 + 1);
    expect(await inviter(m)).toMatchObject({ success: true });
    expect(m.invitations(PROCHE)).toHaveLength(TOGETHER_INVITES_PER_PAIR + 1);
  });

  it('une invitation refusée par la porte ne consomme pas la fenêtre', async () => {
    const m = monde({ reglages: [coupe(PROCHE, HOTE)] });
    for (let i = 0; i < TOGETHER_INVITES_PER_PAIR + 2; i += 1) await inviter(m);
    const ligne = [...m.cache.entries.keys()].filter((key) => key.startsWith('together:invites:'));
    expect(ligne).toEqual([]);
  });

  it('le compteur ne nomme ni l\'hôte ni l\'invité', async () => {
    const m = monde();
    await inviter(m);
    const cles = [...m.cache.entries.keys()].filter((key) => key.startsWith('together:invites:'));
    expect(cles).toHaveLength(1);
    expect(cles[0]).not.toContain(HOTE);
    expect(cles[0]).not.toContain(PROCHE);
    expect(m.cache.entries.get(cles[0])?.value).not.toContain(HOTE);
  });
});
