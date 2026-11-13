/**
 * #17012 — REGARDER OU ÉCOUTER ENSEMBLE : deux Proches lisent la même pièce jointe d'une
 * conversation commune, synchronisée par le serveur. Ouvert dès Proche, jamais à un Ami,
 * jamais entre bloqués ; le média est audio ou vidéo, ni supprimé, ni protégé ; la séance
 * est scellée au repos et coupée dès qu'un rejugement la ferme.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) : la loi est jugée sur les
 * lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { togetherConversationKey, togetherPairKey } from '../../../../services/together/togetherStore';
import { relationPairKey } from '@meeshy/shared/types/relation';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { TOGETHER_ERROR_CODES, TOGETHER_INVITE_TTL_SECONDS, TOGETHER_SESSION_TTL_SECONDS, togetherInvitePayloadSchema, togetherSessionPayloadSchema, togetherSyncPayloadSchema } from '@meeshy/shared/types/together';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sealSecret } from '../../../../utils/secret-at-rest';
import {
  inviteTogether,
  joinTogether,
  leaveTogether,
  endTogetherOf,
  rejudgeTogetherBetween,
  rejudgeTogetherWhere,
  syncTogether,
  type TogetherRelayDeps,
} from '../../../../services/together/togetherRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const HOTE = '6300000000000000000000a1';
const PROCHE = '6300000000000000000000c1';
const SANG = '6300000000000000000000b1';
const AMI = '6300000000000000000000f1';
const BLOQUEUR = '6300000000000000000000d1';
const ETRANGER = '6300000000000000000000e1';

const CONV = '6300000000000000000000aa';
const AUTRE_CONV = '6300000000000000000000ab';
const VIDEO = '63000000000000000000a001';
const AUDIO = '63000000000000000000a002';
const IMAGE = '63000000000000000000a003';
const VUE_UNIQUE = '63000000000000000000a004';
const SUPPRIME = '63000000000000000000a005';
const EPHEMERE = '63000000000000000000a006';
const AILLEURS = '63000000000000000000a007';

const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const SESSION_ID = '0123456789abcdef0123456789abcdef';

const LIENS: readonly CircleLink[] = [
  [HOTE, PROCHE, 'CLOSE'],
  [HOTE, SANG, 'BLOOD'],
  [HOTE, AMI, 'FRIEND'],
  [HOTE, BLOQUEUR, 'CLOSE'],
];

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

function cacheEnMemoire(clock: () => number) {
  const entries = new Map<string, { value: string; ttl?: number; until: number }>();
  const hooks: { onSessionWrite: (() => Promise<void>) | null; onSessionRead: (() => Promise<void>) | null } = { onSessionWrite: null, onSessionRead: null };
  return {
    entries,
    hooks,
    get: async (key: string) => {
      const entry = entries.get(key);
      const value = entry && entry.until > clock() ? entry.value : null;
      const read = key.startsWith('together:session:') ? hooks.onSessionRead : null;
      if (read) {
        hooks.onSessionRead = null;
        await read();
      }
      return value;
    },
    set: async (key: string, value: string, ttl?: number) => {
      entries.set(key, { value, ttl, until: clock() + (ttl ?? 3600) * 1000 });
      const hook = key.startsWith('together:session:') ? hooks.onSessionWrite : null;
      hooks.onSessionWrite = hook ? null : hooks.onSessionWrite;
      if (hook) await hook();
    },
    del: (key: string) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

const membre = (userId: string, conversationId = CONV, extra: Row = {}): Row => ({
  id: `p-${userId}-${conversationId}`,
  userId,
  conversationId,
  isActive: true,
  leftAt: null,
  bannedAt: null,
  ...extra,
});

const piece = (id: string, mimeType: string, message: Row = {}, extra: Row = {}): Row => ({
  id,
  mimeType,
  isViewOnce: false,
  ...extra,
  message: { conversationId: CONV, deletedAt: null, expiresAt: null, isViewOnce: false, ...message },
});

function monde(options: { readonly participants?: readonly Row[] } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [HOTE, PROCHE, SANG, AMI, BLOQUEUR, ETRANGER].map((id) => ({
      id,
      role: 'USER',
      birthDate: ADULT_BIRTH,
      ...(id === BLOQUEUR ? { blockedUserIds: [HOTE] } : {}),
    })),
    participants: options.participants ?? [HOTE, PROCHE, SANG, AMI, BLOQUEUR].map((id) => membre(id)),
    conversations: [CONV, AUTRE_CONV].map((id) => ({ id, isActive: true, closedAt: null, deletedAt: null })),
  });
  const messageAttachment = table([
    piece(VIDEO, 'video/mp4'),
    piece(AUDIO, 'audio/aac'),
    piece(IMAGE, 'image/jpeg'),
    piece(VUE_UNIQUE, 'video/mp4', {}, { isViewOnce: true }),
    piece(SUPPRIME, 'video/mp4', { deletedAt: new Date(T0 - 1000) }),
    piece(EPHEMERE, 'audio/aac', { expiresAt: new Date(T0 + 60_000) }),
    piece(AILLEURS, 'video/mp4', { conversationId: AUTRE_CONV }),
  ]);
  const emissions: Emission[] = [];
  let now = T0;
  const cache = cacheEnMemoire(() => now);
  let ids = 0;
  const deps: TogetherRelayDeps = {
    prisma: { ...world.prisma, messageAttachment, relationFeatureSetting: table([]), userPreferences: table([]) } as unknown as PrismaClient,
    cache,
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as TogetherRelayDeps['io'],
    now: () => now,
    newSessionId: () => (ids++ === 0 ? SESSION_ID : `${String(ids).padStart(32, 'f')}`),
  };
  return {
    deps,
    world,
    cache,
    emissions,
    avancer: (ms: number) => {
      now += ms;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    lier: async (a: string, b: string, level: string) => {
      await world.prisma.userRelation.updateMany({ where: relationPairKey(a, b), data: { grantedByLow: level, grantedByHigh: level } });
    },
  };
}

const inviter = (m: ReturnType<typeof monde>, toUserId = PROCHE, attachmentId = VIDEO, conversationId = CONV) =>
  inviteTogether(m.deps, HOTE, { toUserId, conversationId, attachmentId });

const REFUS = { success: false, error: expect.any(String), code: TOGETHER_ERROR_CODES.NOT_ALLOWED };
const INTROUVABLE = { success: false, error: expect.any(String), code: TOGETHER_ERROR_CODES.NOT_FOUND };
const sessionValues = (m: ReturnType<typeof monde>) =>
  [...m.cache.entries.entries()].filter(([key]) => !key.startsWith('together:ended:') && !key.startsWith('together:user:') && !key.startsWith('together:conversation:') && !key.startsWith('together:invites:')).map(([, entry]) => entry);
const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('inviter — dès Proche, sur un média audio ou vidéo d\'une conversation commune', () => {
  it('un Proche reçoit l\'invitation, et seulement lui', async () => {
    const m = monde();
    const ack = await inviter(m);
    const expiresAt = new Date(T0 + TOGETHER_INVITE_TTL_SECONDS * 1000).toISOString();

    expect(ack).toEqual({ success: true, data: { sessionId: SESSION_ID, expiresAt, media: 'video' } });
    expect(m.emissions).toEqual([
      {
        room: ROOMS.user(PROCHE),
        event: SERVER_EVENTS.TOGETHER_INVITED,
        data: { sessionId: SESSION_ID, fromUserId: HOTE, conversationId: CONV, attachmentId: VIDEO, media: 'video', expiresAt },
      },
    ]);
  });

  it('un audio s\'écoute ensemble, avec un Sang aussi', async () => {
    const m = monde();
    expect(await inviter(m, SANG, AUDIO)).toMatchObject({ success: true, data: { media: 'audio' } });
  });

  it.each([
    ['un Ami', AMI, VIDEO, CONV],
    ['qui m\'a bloqué', BLOQUEUR, VIDEO, CONV],
    ['un inconnu', ETRANGER, VIDEO, CONV],
    ['soi-même', HOTE, VIDEO, CONV],
    ['une image', PROCHE, IMAGE, CONV],
    ['un média à vue unique', PROCHE, VUE_UNIQUE, CONV],
    ['un message supprimé', PROCHE, SUPPRIME, CONV],
    ['un message éphémère', PROCHE, EPHEMERE, CONV],
    ['un média d\'une autre conversation', PROCHE, AILLEURS, CONV],
    ['un média absent', PROCHE, '63000000000000000000a0ff', CONV],
  ])('refuse %s sous le même code, sans rien émettre', async (_cas, to, attachment, conversation) => {
    const m = monde();
    expect(await inviter(m, to, attachment, conversation)).toEqual(REFUS);
    expect(m.emissions).toEqual([]);
  });

  it('refuse quand l\'invité a quitté la conversation', async () => {
    const m = monde({ participants: [membre(HOTE), membre(PROCHE, CONV, { isActive: false, leftAt: new Date(T0 - 1) })] });
    expect(await inviter(m)).toEqual(REFUS);
  });

  it('refuse quand l\'invité est banni de la conversation, même resté actif', async () => {
    const m = monde({ participants: [membre(HOTE), membre(PROCHE, CONV, { bannedAt: new Date(T0 - 1) })] });
    expect(await inviter(m)).toEqual(REFUS);
  });

  it('refuse un compte désactivé', async () => {
    const m = monde();
    await m.world.users.updateMany({ where: { id: PROCHE }, data: { deactivatedAt: new Date(T0 - 1) } });
    expect(await inviter(m)).toEqual(REFUS);
  });

  it('refuse un message à vue unique dont la pièce ne le déclare pas', async () => {
    const m = monde();
    const video = (m.deps.prisma as unknown as { messageAttachment: { rows: Row[] } }).messageAttachment.rows.find((r) => r.id === VIDEO)!;
    Object.assign(video, { message: { ...(video.message as Row), isViewOnce: true } });
    expect(await inviter(m)).toEqual(REFUS);
  });

  it('une charge illisible est refusée comme telle', async () => {
    const m = monde();
    expect(await inviteTogether(m.deps, HOTE, { toUserId: 'x', conversationId: CONV, attachmentId: VIDEO })).toMatchObject({
      success: false,
      code: TOGETHER_ERROR_CODES.INVALID,
    });
  });

  it('une nouvelle invitation de la paire remplace la précédente, chez les deux', async () => {
    const m = monde();
    await inviter(m);
    m.emissions.length = 0;
    const second = await inviter(m, PROCHE, AUDIO);

    expect(second).toMatchObject({ success: true });
    const fin = { sessionId: SESSION_ID, reason: 'replaced', endedAt: new Date(T0).toISOString() };
    expect(m.vers(HOTE)).toEqual([{ room: ROOMS.user(HOTE), event: SERVER_EVENTS.TOGETHER_ENDED, data: fin }]);
    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.TOGETHER_ENDED, SERVER_EVENTS.TOGETHER_INVITED]);
    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });
});

describe('rejoindre — la séance démarre chez les deux', () => {
  it('l\'invité rejoint : les deux reçoivent le même départ, à l\'arrêt au début', async () => {
    const m = monde();
    await inviter(m);
    m.avancer(5_000);
    m.emissions.length = 0;
    const ack = await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });

    const started = {
      sessionId: SESSION_ID,
      hostUserId: HOTE,
      guestUserId: PROCHE,
      conversationId: CONV,
      attachmentId: VIDEO,
      media: 'video',
      playback: { playing: false, positionMs: 0, at: T0 + 5_000, rev: 0, byUserId: HOTE },
    };
    expect(ack).toEqual({ success: true, data: started });
    expect(m.emissions).toEqual([
      { room: ROOMS.user(HOTE), event: SERVER_EVENTS.TOGETHER_STARTED, data: started },
      { room: ROOMS.user(PROCHE), event: SERVER_EVENTS.TOGETHER_STARTED, data: started },
    ]);
  });

  it('l\'hôte ne rejoint pas sa propre invitation, un tiers non plus', async () => {
    const m = monde();
    await inviter(m);
    expect(await joinTogether(m.deps, HOTE, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
    expect(await joinTogether(m.deps, SANG, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });

  it('une invitation expirée ne se rejoint plus', async () => {
    const m = monde();
    await inviter(m);
    m.avancer(TOGETHER_INVITE_TTL_SECONDS * 1000 + 1);
    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });

  it('un lien tombé sous Proche entre l\'invitation et l\'acceptation coupe la séance, dite comme un départ', async () => {
    const m = monde();
    await inviter(m);
    await m.lier(HOTE, PROCHE, 'FRIEND');
    m.emissions.length = 0;

    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toEqual(INTROUVABLE);
    expect(m.emissions.map((e) => [e.room, e.event, e.data.reason])).toEqual([
      [ROOMS.user(HOTE), SERVER_EVENTS.TOGETHER_ENDED, 'left'],
      [ROOMS.user(PROCHE), SERVER_EVENTS.TOGETHER_ENDED, 'left'],
    ]);
  });

  it('un blocage écrit entre le jugement et l\'écriture l\'emporte : rien ne démarre, rien ne reste', async () => {
    const m = monde();
    await inviter(m);
    m.emissions.length = 0;
    m.cache.hooks.onSessionWrite = async () => {
      await m.world.users.updateMany({ where: { id: PROCHE }, data: { blockedUserIds: [HOTE] } });
      await rejudgeTogetherBetween(m.deps, { userA: HOTE, userB: PROCHE });
    };

    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toEqual(INTROUVABLE);
    expect(m.emissions.map((e) => e.event)).toEqual([SERVER_EVENTS.TOGETHER_ENDED, SERVER_EVENTS.TOGETHER_ENDED]);
    expect(sessionValues(m)).toEqual([]);
  });
});

describe('synchroniser — lecture, pause et déplacement arrivent chez l\'autre, horodatés par le serveur', () => {
  const seance = async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    m.emissions.length = 0;
    return m;
  };

  it('l\'invité lance la lecture à 12 s : les deux reçoivent l\'état, rev 1', async () => {
    const m = await seance();
    m.avancer(2_000);
    const ack = await syncTogether(m.deps, PROCHE, { sessionId: SESSION_ID, playing: true, positionMs: 12_000 });

    const playback = { playing: true, positionMs: 12_000, at: T0 + 2_000, rev: 1, byUserId: PROCHE };
    expect(ack).toEqual({ success: true, data: { playback } });
    expect(m.emissions).toEqual([
      { room: ROOMS.user(HOTE), event: SERVER_EVENTS.TOGETHER_SYNCED, data: { sessionId: SESSION_ID, playback } },
      { room: ROOMS.user(PROCHE), event: SERVER_EVENTS.TOGETHER_SYNCED, data: { sessionId: SESSION_ID, playback } },
    ]);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: false, positionMs: 15_000 })).toMatchObject({
      data: { playback: { rev: 2, byUserId: HOTE, playing: false } },
    });
  });

  it('une invitation non acceptée ne se synchronise pas ; un tiers non plus', async () => {
    const m = monde();
    await inviter(m);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    expect(await syncTogether(m.deps, SANG, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });

  it('une position hors bornes est illisible', async () => {
    const m = await seance();
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: -1 })).toMatchObject({ code: TOGETHER_ERROR_CODES.INVALID });
  });

  it('chaque synchronisation est rejugée : un blocage posé entre-temps coupe chez les deux', async () => {
    const m = await seance();
    await m.world.users.updateMany({ where: { id: PROCHE }, data: { blockedUserIds: [HOTE] } });

    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toEqual(INTROUVABLE);
    expect(m.emissions.map((e) => e.data.reason)).toEqual(['left', 'left']);
    expect(m.emissions.some((e) => e.event === SERVER_EVENTS.TOGETHER_SYNCED)).toBe(false);
  });

  it('un membre parti de la conversation coupe la séance à la synchronisation suivante', async () => {
    const m = await seance();
    await m.world.participant.updateMany({ where: { userId: PROCHE }, data: { isActive: false } });
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toEqual(INTROUVABLE);
  });

  it('une synchronisation jugée avant une coupure et écrite après ne relaie rien', async () => {
    const m = await seance();
    m.cache.hooks.onSessionWrite = async () => {
      await m.lier(HOTE, PROCHE, 'FRIEND');
      await rejudgeTogetherBetween(m.deps, { userA: HOTE, userB: PROCHE });
    };
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toEqual(INTROUVABLE);
    expect(m.emissions.some((e) => e.event === SERVER_EVENTS.TOGETHER_SYNCED)).toBe(false);
    expect(sessionValues(m)).toEqual([]);
  });

  it('une synchronisation juste avant le plafond de 4 h passe encore', async () => {
    const m = await seance();
    m.avancer(TOGETHER_SESSION_TTL_SECONDS * 1000 - 1_000);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toMatchObject({ success: true });
  });
});

describe('quitter et couper', () => {
  it('l\'invité refuse avant de rejoindre : `declined` chez les deux', async () => {
    const m = monde();
    await inviter(m);
    m.emissions.length = 0;
    expect(await leaveTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toEqual({ success: true });
    expect(m.emissions.map((e) => [e.room, e.data.reason])).toEqual([
      [ROOMS.user(HOTE), 'declined'],
      [ROOMS.user(PROCHE), 'declined'],
    ]);
    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });

  it('l\'un quitte une séance en cours : `left` chez les deux, un tiers ne peut pas la fermer', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    expect(await leaveTogether(m.deps, SANG, { sessionId: SESSION_ID })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
    m.emissions.length = 0;
    await leaveTogether(m.deps, HOTE, { sessionId: SESSION_ID });
    expect(m.emissions.map((e) => e.data.reason)).toEqual(['left', 'left']);
  });

  it('rejuger une paire après une baisse coupe sa séance ; une paire toujours Proche la garde', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    m.emissions.length = 0;

    await rejudgeTogetherBetween(m.deps, { userA: PROCHE, userB: HOTE });
    expect(m.emissions).toEqual([]);

    await m.lier(HOTE, PROCHE, 'ACQUAINTANCE');
    await rejudgeTogetherBetween(m.deps, { userA: PROCHE, userB: HOTE });
    expect(m.emissions.map((e) => [e.room, e.data.reason])).toEqual([
      [ROOMS.user(HOTE), 'left'],
      [ROOMS.user(PROCHE), 'left'],
    ]);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_FOUND });
  });

  it('rejuger une paire sans séance ne dit rien', async () => {
    const m = monde();
    await rejudgeTogetherBetween(m.deps, { userA: HOTE, userB: PROCHE });
    expect(m.emissions).toEqual([]);
  });
});

describe('au repos — la séance est scellée, jamais en clair', () => {
  it('ni les identifiants ni la position ne se lisent dans le cache', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 4242 });

    const stored = [...m.cache.entries.entries()].map(([key, e]) => `${key}=${e.value}`).join('\n');
    [VIDEO, CONV, '4242', HOTE, PROCHE].forEach((clair) => expect(stored.toLowerCase()).not.toContain(clair.toLowerCase()));
  });

  it('une séance scellée pour une autre séance ne s\'ouvre pas, même quand son contenu la nomme', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await inviter(m);
    const autre = 'fedcba9876543210fedcba9876543210';
    const forgee = {
      sessionId: autre, hostId: HOTE, guestId: PROCHE, conversationId: CONV, attachmentId: VIDEO, media: 'video',
      joined: false, playback: { playing: false, positionMs: 0, at: T0, rev: 0, byUserId: HOTE }, createdAt: T0, expiresAt: T0 + 60_000,
    };
    m.cache.entries.set(`together:session:${autre}`, { value: sealSecret(JSON.stringify(forgee), `Together.session:${SESSION_ID}`), until: Infinity });
    expect(await joinTogether(m.deps, PROCHE, { sessionId: autre })).toEqual(INTROUVABLE);
  });

  it('une séance rangée en clair n\'est jamais lue quand la clé est posée', async () => {
    const m = monde();
    await inviter(m);
    process.env.SECRETS_AT_REST_KEY = KEY;
    expect(await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID })).toEqual(INTROUVABLE);
  });

  it('les durées de vie suivent l\'état : courte pour l\'invitation, longue pour la séance', async () => {
    const m = monde();
    await inviter(m);
    expect(sessionValues(m).map((e) => e.ttl)).toEqual([TOGETHER_INVITE_TTL_SECONDS, TOGETHER_INVITE_TTL_SECONDS]);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    expect(sessionValues(m).map((e) => e.ttl)).toEqual([TOGETHER_SESSION_TTL_SECONDS, TOGETHER_SESSION_TTL_SECONDS]);
  });
});

describe('une lecture en panne ferme', () => {
  it('rien ne s\'ouvre quand la base ne répond pas', async () => {
    const m = monde();
    const deps = { ...m.deps, prisma: { ...m.deps.prisma, messageAttachment: { findUnique: () => Promise.reject(new Error('down')) } } as unknown as PrismaClient };
    expect(await inviteTogether(deps, HOTE, { toUserId: PROCHE, conversationId: CONV, attachmentId: VIDEO })).toMatchObject({
      success: false,
      code: TOGETHER_ERROR_CODES.UNAVAILABLE,
    });
    expect(m.emissions).toEqual([]);
  });
});

describe('#17043 — une invitation rejugée après son écriture', () => {
  it('un blocage posé pendant l\'écriture : aucune invitation ne part vers le bloqueur, rien ne reste', async () => {
    const m = monde();
    m.cache.hooks.onSessionWrite = async () => {
      await m.world.users.updateMany({ where: { id: PROCHE }, data: { blockedUserIds: [HOTE] } });
    };

    expect(await inviter(m)).toEqual(REFUS);
    expect(m.emissions).toEqual([]);
    expect(sessionValues(m)).toEqual([]);
  });
});

describe('#17043 — une séance par paire, même sous invitations simultanées', () => {
  const ID_A = 'a'.repeat(32);
  const ID_B = 'b'.repeat(32);

  it('deux invitations de la même paire en course : une seule séance vit, l\'autre est coupée sans orphelin', async () => {
    const m = monde();
    const ids = [ID_A, ID_B];
    const attente = () => new Promise<void>((resolve) => setImmediate(resolve));
    const index = new Map<string, string>();
    const deps: TogetherRelayDeps = {
      ...m.deps,
      newSessionId: () => ids.shift() as string,
      claimPair: async (key, sessionId) => {
        const previous = index.get(key) ?? null;
        index.set(key, sessionId);
        m.cache.entries.set(key, { value: sessionId, until: Infinity });
        await attente();
        return previous;
      },
    };

    const [a, b] = await Promise.all([
      inviteTogether(deps, HOTE, { toUserId: PROCHE, conversationId: CONV, attachmentId: VIDEO }),
      inviteTogether(deps, PROCHE, { toUserId: HOTE, conversationId: CONV, attachmentId: AUDIO }).catch(() => null),
    ]);

    expect([a, b].filter((ack) => ack?.success === true)).toHaveLength(1);
    const vivantes = [...m.cache.entries.keys()].filter((key) => key.startsWith('together:session:'));
    expect(vivantes).toHaveLength(1);
    const survivante = vivantes[0].replace('together:session:', '');
    expect(index.get([...index.keys()][0])).toBe(survivante);
  });

  it('une prise qui échoue (Redis absent) n\'écrit rien : l\'invitation est indisponible', async () => {
    const m = monde();
    const deps: TogetherRelayDeps = { ...m.deps, claimPair: () => Promise.reject(new Error('redis down')) };
    expect(await inviteTogether(deps, HOTE, { toUserId: PROCHE, conversationId: CONV, attachmentId: VIDEO })).toMatchObject({
      success: false,
      code: TOGETHER_ERROR_CODES.UNAVAILABLE,
    });
    expect(m.emissions).toEqual([]);
    expect(sessionValues(m)).toEqual([]);
  });
});

describe('#17043 — la durée maximale se compte depuis la création', () => {
  it('une synchronisation prolonge la séance, jamais au-delà de 4 h depuis l\'invitation', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    const horsPlafond = TOGETHER_SESSION_TTL_SECONDS * 1000;

    m.avancer(horsPlafond - 60_000);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 1 })).toMatchObject({ success: true });
    expect(sessionValues(m).map((e) => e.ttl)).toEqual([60, 60]);

    m.avancer(61_000);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 2 })).toEqual(INTROUVABLE);
  });
});

describe('#17043 — la fin à la déconnexion', () => {
  it('la dernière socket d\'un compte fermée : sa séance finit chez les deux, comme un départ', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    m.emissions.length = 0;

    await endTogetherOf(m.deps, PROCHE);

    const fin = { sessionId: SESSION_ID, reason: 'left', endedAt: new Date(T0).toISOString() };
    expect(m.emissions).toEqual([
      { room: ROOMS.user(HOTE), event: SERVER_EVENTS.TOGETHER_ENDED, data: fin },
      { room: ROOMS.user(PROCHE), event: SERVER_EVENTS.TOGETHER_ENDED, data: fin },
    ]);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 1 })).toEqual(INTROUVABLE);
    expect(sessionValues(m)).toEqual([]);
  });

  it('une invitation en attente se refuse quand l\'invité disparaît ; un autre compte n\'est pas touché', async () => {
    const m = monde();
    await inviter(m);
    m.emissions.length = 0;

    await endTogetherOf(m.deps, SANG);
    expect(m.emissions).toEqual([]);

    await endTogetherOf(m.deps, PROCHE);
    expect(m.emissions.map((e) => (e.data as { reason: string }).reason)).toEqual(['declined', 'declined']);
  });
});

describe('#17043 — les charges inconnues sont refusées', () => {
  it.each([
    [togetherInvitePayloadSchema, { toUserId: HOTE, conversationId: CONV, attachmentId: VIDEO, extra: 1 }],
    [togetherSessionPayloadSchema, { sessionId: SESSION_ID, userId: HOTE }],
    [togetherSyncPayloadSchema, { sessionId: SESSION_ID, playing: true, positionMs: 1, rev: 3 }],
  ])('une clé en trop est refusée', (schema, charge) => {
    expect(schema.safeParse(charge).success).toBe(false);
  });
});

describe('#17043 (audit) — l\'index par compte vit autant que la séance', () => {
  it('après la durée de l\'invitation, la déconnexion coupe encore la séance', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    const index = [...m.cache.entries.entries()].filter(([key]) => key.startsWith('together:user:'));
    expect(index.map(([, e]) => e.ttl)).toEqual([TOGETHER_SESSION_TTL_SECONDS, TOGETHER_SESSION_TTL_SECONDS]);

    m.avancer((TOGETHER_INVITE_TTL_SECONDS + 80) * 1000);
    m.emissions.length = 0;
    await endTogetherOf(m.deps, PROCHE);

    expect(m.emissions.map((e) => e.event)).toEqual([SERVER_EVENTS.TOGETHER_ENDED, SERVER_EVENTS.TOGETHER_ENDED]);
  });
});

describe('#17043 (audit) — une écriture en vol ne reprend pas l\'index d\'une invitation plus récente', () => {
  it('une synchronisation lue avant la prise de B n\'efface pas l\'index de B : il désigne la séance survivante', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    let secondeId = '';
    m.cache.hooks.onSessionRead = async () => {
      const ack = await inviter(m, PROCHE, AUDIO);
      secondeId = ack.success ? ack.data.sessionId : '';
    };

    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 1 })).toEqual(INTROUVABLE);

    expect(secondeId).not.toBe('');
    expect(m.cache.entries.get(togetherPairKey(HOTE, PROCHE))?.value).toBe(secondeId);
    expect(await joinTogether(m.deps, PROCHE, { sessionId: secondeId })).toMatchObject({ success: true });
  });
});

describe('#17043 (contre-audit) — réserves levées', () => {
  it('R1 : une seconde séance du même compte ne raccourcit pas l\'index de la première', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    await inviter(m, SANG, AUDIO);
    const indexHote = m.cache.entries.get([...m.cache.entries.keys()].find((key) => key.startsWith('together:user:') && JSON.parse(m.cache.entries.get(key)!.value).length === 2)!);
    expect(indexHote?.ttl).toBe(TOGETHER_SESSION_TTL_SECONDS);

    m.avancer(200_000);
    m.emissions.length = 0;
    await endTogetherOf(m.deps, HOTE);

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.TOGETHER_ENDED]);
  });

  it('R2 : l\'index de paire expiré avant la prolongation est recréé, le rejugement retrouve la séance', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    m.cache.entries.delete(togetherPairKey(HOTE, PROCHE));

    await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 1 });
    expect(m.cache.entries.get(togetherPairKey(HOTE, PROCHE))?.value).toBe(SESSION_ID);

    await m.world.users.updateMany({ where: { id: PROCHE }, data: { blockedUserIds: [HOTE] } });
    m.emissions.length = 0;
    await rejudgeTogetherBetween(m.deps, { userA: HOTE, userB: PROCHE });
    expect(m.emissions.map((e) => e.event)).toEqual([SERVER_EVENTS.TOGETHER_ENDED, SERVER_EVENTS.TOGETHER_ENDED]);
  });

  it('R2 bis : la fin libère l\'index par la libération gardée, jamais par un get puis del', async () => {
    const m = monde();
    const released: Array<[string, string]> = [];
    const deps: TogetherRelayDeps = { ...m.deps, releasePair: async (key, id) => void released.push([key, id]) };
    await inviteTogether(deps, HOTE, { toUserId: PROCHE, conversationId: CONV, attachmentId: VIDEO });
    await leaveTogether(deps, HOTE, { sessionId: SESSION_ID });
    expect(released).toEqual([[togetherPairKey(HOTE, PROCHE), SESSION_ID]]);
  });
});

describe('#17022 — une séance s\'arrête aussi dans le geste qui ferme sa porte', () => {
  const SEANCE_SANG = 'f'.repeat(31) + '2';
  const deuxSeances = async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    await inviter(m, SANG, AUDIO);
    await joinTogether(m.deps, SANG, { sessionId: SEANCE_SANG });
    m.emissions.length = 0;
    return m;
  };
  const fins = (m: ReturnType<typeof monde>) =>
    m.emissions.filter((e) => e.event === SERVER_EVENTS.TOGETHER_ENDED).map((e) => [e.room, e.data.sessionId, e.data.reason]);

  it('un compte désactivé : ses séances finissent chez les deux, celles des autres continuent', async () => {
    const m = await deuxSeances();
    await m.world.users.updateMany({ where: { id: PROCHE }, data: { deactivatedAt: new Date(T0) } });

    await rejudgeTogetherWhere(m.deps, { userId: PROCHE });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SEANCE_SANG, playing: true, positionMs: 0 })).toMatchObject({ success: true });
  });

  it('un compte supprimé, hôte de deux séances : les deux finissent', async () => {
    const m = await deuxSeances();
    await m.world.users.updateMany({ where: { id: HOTE }, data: { isActive: false, deletedAt: new Date(T0) } });

    await rejudgeTogetherWhere(m.deps, { userId: HOTE });

    expect(fins(m).map(([room, id]) => `${id}@${room}`).sort()).toEqual(
      [`${SESSION_ID}@${ROOMS.user(HOTE)}`, `${SESSION_ID}@${ROOMS.user(PROCHE)}`, `${SEANCE_SANG}@${ROOMS.user(HOTE)}`, `${SEANCE_SANG}@${ROOMS.user(SANG)}`].sort(),
    );
  });

  it('un membre banni de la conversation : sa séance finit chez les deux, sans dire le bannissement', async () => {
    const m = await deuxSeances();
    await m.world.participant.updateMany({ where: { userId: PROCHE }, data: { bannedAt: new Date(T0), isActive: false, leftAt: new Date(T0) } });

    await rejudgeTogetherWhere(m.deps, { userId: PROCHE });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
  });

  it('le départ d\'une conversation ne rejuge que les séances de ce fil : une panne ailleurs ne coupe rien d\'étranger', async () => {
    const m = await deuxSeances();
    const prisma = m.deps.prisma as unknown as { messageAttachment: { findUnique: () => Promise<unknown> } };
    prisma.messageAttachment.findUnique = () => Promise.reject(new Error('base en panne'));

    await rejudgeTogetherWhere(m.deps, { userId: HOTE, conversationId: AUTRE_CONV });

    expect(m.emissions).toEqual([]);
  });

  it('une invitation en attente vers un membre parti finit aussi', async () => {
    const m = monde();
    await inviter(m);
    m.emissions.length = 0;
    await m.world.participant.updateMany({ where: { userId: PROCHE }, data: { isActive: false, leftAt: new Date(T0) } });

    await rejudgeTogetherWhere(m.deps, { userId: PROCHE });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
  });

  it('le message du média supprimé : la séance de cette pièce finit, celle d\'une autre pièce de la conversation continue', async () => {
    const m = await deuxSeances();
    const video = (m.deps.prisma as unknown as { messageAttachment: { rows: Row[] } }).messageAttachment.rows.find((r) => r.id === VIDEO)!;
    Object.assign(video, { message: { ...(video.message as Row), deletedAt: new Date(T0) } });

    await rejudgeTogetherWhere(m.deps, { conversationId: CONV });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
    expect(await syncTogether(m.deps, SANG, { sessionId: SEANCE_SANG, playing: false, positionMs: 1 })).toMatchObject({ success: true });
  });

  it('une conversation sans séance ne dit rien', async () => {
    const m = await deuxSeances();
    await rejudgeTogetherWhere(m.deps, { conversationId: AUTRE_CONV });
    await rejudgeTogetherWhere(m.deps, { userId: ETRANGER });
    expect(m.emissions).toEqual([]);
  });

  it('une séance sortie de l\'index de paire (invitations concurrentes) est retrouvée par la coupure de route', async () => {
    const m = await deuxSeances();
    m.cache.entries.delete(togetherPairKey(HOTE, PROCHE));
    await m.lier(HOTE, PROCHE, 'FRIEND');

    await rejudgeTogetherBetween(m.deps, { userA: PROCHE, userB: HOTE });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
  });

  it('l\'index de conversation ne nomme pas la conversation, et la fin l\'efface', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = await deuxSeances();
    const key = togetherConversationKey(CONV);
    expect(key).not.toContain(CONV);
    expect(m.cache.entries.has(key)).toBe(true);

    await leaveTogether(m.deps, HOTE, { sessionId: SESSION_ID });
    await leaveTogether(m.deps, SANG, { sessionId: SEANCE_SANG });

    expect(m.cache.entries.has(key)).toBe(false);
  });
});

describe('une conversation close ne porte aucune séance (#17147)', () => {
  const fermer = async (m: ReturnType<typeof monde>, data: Row = { isActive: false, closedAt: new Date(T0) }) => {
    await m.world.conversation.updateMany({ where: { id: CONV }, data });
  };
  const fins = (m: ReturnType<typeof monde>) =>
    m.emissions.filter((e) => e.event === SERVER_EVENTS.TOGETHER_ENDED).map((e) => [e.room, e.data.sessionId, e.data.reason]);

  it.each([
    ['close', { isActive: false, closedAt: new Date(T0) }],
    ['supprimée', { isActive: false, closedAt: new Date(T0), deletedAt: new Date(T0) }],
    ['inactive sans date de clôture', { isActive: false }],
  ])('refuse une invitation dans une conversation %s, sous le même code, sans rien émettre', async (_cas, data) => {
    const m = monde();
    await fermer(m, data);
    expect(await inviter(m)).toEqual(REFUS);
    expect(m.emissions).toEqual([]);
  });

  it('une conversation dont la ligne manque refuse aussi', async () => {
    const m = monde();
    m.world.conversation.rows.length = 0;
    expect(await inviter(m)).toEqual(REFUS);
  });

  it('la clôture coupe la séance en cours chez les deux (`left`), sans dire la clôture', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    m.emissions.length = 0;
    await fermer(m);

    await rejudgeTogetherWhere(m.deps, { conversationId: CONV });

    expect(fins(m)).toEqual([
      [ROOMS.user(HOTE), SESSION_ID, 'left'],
      [ROOMS.user(PROCHE), SESSION_ID, 'left'],
    ]);
    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toEqual(INTROUVABLE);
  });

  it('une séance dans une conversation close ne continue pas à la synchronisation suivante', async () => {
    const m = monde();
    await inviter(m);
    await joinTogether(m.deps, PROCHE, { sessionId: SESSION_ID });
    await fermer(m);

    expect(await syncTogether(m.deps, HOTE, { sessionId: SESSION_ID, playing: true, positionMs: 0 })).toMatchObject({ success: false });
  });
});
