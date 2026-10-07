/**
 * #9617 — une capture d'un contenu qui disparaît s'annonce à toute la
 * conversation ; une tentative sur une vue unique aussi. Chaque garde a son
 * témoin : participant (actif, non banni), conversation close, budget de
 * déclarations, conversation du message, auteur, loi de sortie, droit de
 * lecture (masquage illisible ⇒ refus, et le VRAI `readerMayReadMessage`),
 * affichage ATTESTÉ et récent, une annonce par (acteur, message, sorte), plafond
 * par déclaration et par heure (audit A1, A2, A5, A6).
 *
 * Le double Prisma HONORE les filtres qu'il reçoit (conversation, identifiants,
 * `isActive`, `bannedAt`, ligne d'accusés de CE participant).
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { parseCaptureNotice } from '@meeshy/shared/utils/capture-notice';

import {
  CAPTURE_AFTER_DISPLAY_MAX_MS,
  CAPTURE_REPORT_GRACE_MS,
  MAX_NOTICES_PER_REPORT,
  VIEW_ONCE_CAPTURE_WINDOW_MS,
  captureRateLimitKey,
  recordContentCapture,
  wasOnActorScreen,
  type ContentCaptureDeps,
} from '../contentCaptureNotices';
import { SOCKET_RATE_LIMITS, SocketRateLimiter } from '../../../utils/socket-rate-limiter';

const { EPHEMERAL, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439012';
const ACTOR = '507f1f77bcf86cd7994390a1';
const SENDER = '507f1f77bcf86cd7994390af';
const USER = '507f1f77bcf86cd7994390c1';

const TIMED = '507f1f77bcf86cd799439031';
const AFTER_READ = '507f1f77bcf86cd799439032';
const ONCE = '507f1f77bcf86cd799439033';
const PLAIN = '507f1f77bcf86cd799439034';
const OWN = '507f1f77bcf86cd799439035';
const FOREIGN = '507f1f77bcf86cd799439036';
const SECRET = '507f1f77bcf86cd799439037';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const SENT_AT = new Date('2026-10-07T11:58:00.000Z');
const minutes = (n: number) => n * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const many = (n: number) => Array.from({ length: n }, (_, i) => (0x100000 + i).toString(16).padStart(24, 'a'));

type MessageRow = {
  id: string;
  conversationId: string;
  createdAt: Date;
  deletedAt: Date | null;
  senderId: string;
  isViewOnce: boolean | null;
  isBlurred: boolean | null;
  effectFlags: number | null;
  ephemeralDuration: number | null;
  expiresAt: Date | null;
  content: string;
  attachments: { isViewOnce: boolean | null; isBlurred: boolean | null; effectFlags: number | null }[];
};

type EntryRow = {
  messageId: string;
  participantId: string;
  deliveredAt: Date | null;
  readAt: Date | null;
  viewedOnceAt: Date | null;
  ephemeralExpiresAt: Date | null;
};

type ActorRow = {
  id: string;
  conversationId: string;
  userId: string | null;
  displayName: string;
  nickname: string | null;
  isActive: boolean;
  bannedAt: Date | null;
  user: { username: string } | null;
  role: string;
  joinedAt: Date;
  shareLinkId: string | null;
  historyVisibleFrom: Date | null;
  permissions: null;
  anonymousSession: null;
};

const message = (overrides: Partial<MessageRow> & { id: string }): MessageRow => ({
  conversationId: CONV,
  createdAt: SENT_AT,
  deletedAt: null,
  senderId: SENDER,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  content: 'texte',
  attachments: [],
  ...overrides,
});

const entry = (messageId: string, overrides: Partial<EntryRow> = {}): EntryRow => ({
  messageId,
  participantId: ACTOR,
  deliveredAt: ago(minutes(1)),
  readAt: ago(minutes(1)),
  viewedOnceAt: null,
  ephemeralExpiresAt: null,
  ...overrides,
});

const actorRow = (overrides: Partial<ActorRow> = {}): ActorRow => ({
  id: ACTOR,
  conversationId: CONV,
  userId: USER,
  displayName: 'Alice',
  nickname: null,
  isActive: true,
  bannedAt: null,
  user: { username: 'alice' },
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  ...overrides,
});

const flame = (id: string) => message({ id, effectFlags: EPHEMERAL, ephemeralDuration: 86_400 });

const DEFAULT_MESSAGES: MessageRow[] = [
  message({ id: TIMED, effectFlags: EPHEMERAL, ephemeralDuration: 60, expiresAt: new Date('2026-10-14T12:00:00Z') }),
  message({ id: AFTER_READ, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, expiresAt: new Date('2026-10-14T12:00:00Z') }),
  message({ id: ONCE, isViewOnce: true }),
  message({ id: PLAIN }),
  message({ id: OWN, senderId: ACTOR, effectFlags: EPHEMERAL, ephemeralDuration: 60 }),
  message({ id: FOREIGN, conversationId: OTHER_CONV, effectFlags: EPHEMERAL, ephemeralDuration: 60 }),
  message({ id: SECRET, effectFlags: EPHEMERAL, ephemeralDuration: 60, content: 'le code est 4242' }),
];

const DEFAULT_ENTRIES: EntryRow[] = [
  entry(TIMED, { ephemeralExpiresAt: new Date(NOW.getTime() + 30_000) }),
  entry(AFTER_READ),
  entry(ONCE, { readAt: null, viewedOnceAt: ago(minutes(1)) }),
  entry(PLAIN),
  entry(OWN),
  entry(FOREIGN),
  entry(SECRET),
];

type World = {
  messages?: MessageRow[];
  entries?: EntryRow[];
  actor?: ActorRow | null;
  closed?: { isActive: boolean; closedAt: Date | null };
  /** Injecté : sinon le VRAI `readerMayReadMessage` juge sur la base double. */
  mayRead?: ((messageId: string) => boolean | Promise<boolean>) | 'real';
  hiddenForActor?: readonly string[];
  allowDeclarations?: boolean;
  failWrites?: boolean;
};

const limiters: SocketRateLimiter[] = [];
afterEach(() => limiters.splice(0).forEach((limiter) => limiter.destroy()));

const isAbsent = (value: unknown) => value === undefined || value === null;

/** `unsetOrNull('bannedAt')` ⇒ `{ OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }] }`. */
function actorMatches(row: ActorRow, where: Record<string, unknown>): boolean {
  if (where.conversationId !== row.conversationId) return false;
  if ('id' in where && where.id !== row.id) return false;
  if ('userId' in where && where.userId !== row.userId) return false;
  if (where.isActive === true && !row.isActive) return false;
  if ('OR' in where && !isAbsent(row.bannedAt)) return false;
  return true;
}

function harness(world: World = {}) {
  const messages = world.messages ?? DEFAULT_MESSAGES;
  const entries = world.entries ?? DEFAULT_ENTRIES;
  const actor = world.actor === undefined ? actorRow() : world.actor;
  const created: Record<string, unknown>[] = [];
  const broadcasts: unknown[] = [];
  const readCalls: Record<string, unknown>[] = [];
  const clock = { now: NOW };
  const control = { failWrites: world.failWrites ?? false };
  const store = new Map<string, number>();
  const limiter = new SocketRateLimiter();
  limiters.push(limiter);

  const prisma = {
    participant: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => (actor && actorMatches(actor, where) ? actor : null),
    },
    conversation: {
      findUnique: async () => world.closed ?? { isActive: true, closedAt: null },
      update: async () => ({}),
    },
    conversationShareLink: { findUnique: async () => null },
    userConversationPreferences: { findFirst: async () => null },
    userMessageDeletion: {
      findMany: async () => (world.hiddenForActor ?? []).map((messageId) => ({ messageId })),
    },
    message: {
      findMany: async ({ where }: { where: { id: { in: string[] }; conversationId: string } }) =>
        messages.filter((m) => where.id.in.includes(m.id) && m.conversationId === where.conversationId),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (control.failWrites) throw new Error('write failed');
        const row = { ...data, id: `sys-${created.length}`, createdAt: clock.now };
        created.push(row);
        return row;
      },
    },
    messageStatusEntry: {
      findFirst: async ({ where }: { where: { messageId: string; participantId: string } }) =>
        entries.find((e) => e.messageId === where.messageId && e.participantId === where.participantId) ?? null,
    },
  } as unknown as PrismaClient;

  const injected = world.mayRead === 'real'
    ? {}
    : {
        mayRead: (async (_prisma, params) => {
          readCalls.push(params as unknown as Record<string, unknown>);
          const decide = world.mayRead;
          return typeof decide === 'function' ? decide(params.message.id) : true;
        }) as ContentCaptureDeps['mayRead'],
      };

  const deps: ContentCaptureDeps = {
    prisma,
    dedup: {
      setnx: async (key, _value, ttl) => {
        const until = store.get(key);
        if (until !== undefined && until > clock.now.getTime()) return false;
        store.set(key, clock.now.getTime() + (ttl ?? 0) * 1000);
        return true;
      },
      del: async (key) => {
        store.delete(key);
      },
    },
    limiter: {
      checkLimit: async (key, config) =>
        config === SOCKET_RATE_LIMITS.MESSAGE_CAPTURE && world.allowDeclarations === false ? false : limiter.checkLimit(key, config),
    },
    broadcast: async (msg) => {
      broadcasts.push(msg);
    },
    ...injected,
    now: () => clock.now,
  };

  const capture = (messageIds: string[], overrides: { kind?: 'screenshot' | 'recording'; captureId?: string; conversationId?: string } = {}) =>
    recordContentCapture(deps, {
      conversationId: overrides.conversationId ?? CONV,
      actorParticipantId: ACTOR,
      report: { messageIds, kind: overrides.kind ?? 'screenshot', captureId: overrides.captureId ?? 'capture-0001' },
    });

  return { capture, created, broadcasts, readCalls, clock, control, limiter };
}

const noticesOf = (created: Record<string, unknown>[]) => created.map((row) => parseCaptureNotice(row.metadata));

describe('recordContentCapture — ce qui s’annonce (#9617)', () => {
  it('annonce la capture d’une flamme à durée, par le chemin des avis système, diffusé au fil', async () => {
    const h = harness();
    const outcome = await h.capture([TIMED]);

    expect(outcome).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED] });
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      conversationId: CONV,
      senderId: ACTOR,
      messageType: 'system',
      messageSource: 'system',
      content: 'Alice (@alice) a capturé l’éphémère du 07/10/2026 à 11:58 (UTC)',
    });
    expect(noticesOf(h.created)[0]).toEqual({
      kind: 'content-capture',
      actor: { participantId: ACTOR, displayName: 'Alice', isAnonymous: false, username: 'alice' },
      capturedMessageId: TIMED,
      nature: 'timed-flame',
      outcome: 'announced',
      captureKind: 'screenshot',
      sentAt: SENT_AT.toISOString(),
    });
    expect(h.broadcasts).toHaveLength(1);
  });

  it('annonce une flamme après lecture déjà consommée à la fermeture — la capture a eu lieu PENDANT l’affichage', async () => {
    const h = harness({ entries: [entry(AFTER_READ, { ephemeralExpiresAt: ago(minutes(1)) })] });
    expect(await h.capture([AFTER_READ])).toEqual({ kind: 'recorded', noticedMessageIds: [AFTER_READ] });
    expect(noticesOf(h.created)[0]).toMatchObject({ nature: 'after-read-flame', outcome: 'announced' });
  });

  it('dit la TENTATIVE sur une vue unique ouverte par l’acteur', async () => {
    const h = harness();
    await h.capture([ONCE], { kind: 'recording' });
    expect(noticesOf(h.created)[0]).toMatchObject({ nature: 'view-once', outcome: 'blocked', captureKind: 'recording' });
    expect(h.created[0]).toMatchObject({ content: 'Alice (@alice) a tenté d’enregistrer un message à vue unique — impossible' });
  });

  it('dit qu’un invité est un invité, et prend le surnom dans la conversation', async () => {
    const guest = harness({ actor: actorRow({ userId: null, user: null, displayName: 'Bob' }) });
    await guest.capture([TIMED]);
    expect(noticesOf(guest.created)[0]?.actor).toEqual({ participantId: ACTOR, displayName: 'Bob', isAnonymous: true });
    expect(guest.readCalls[0]).toMatchObject({ reader: { kind: 'anonymous', participantId: ACTOR } });

    const nick = harness({ actor: actorRow({ nickname: 'Ali' }) });
    await nick.capture([TIMED]);
    expect(noticesOf(nick.created)[0]?.actor.displayName).toBe('Ali');
  });

  it('n’emporte AUCUN contenu du message capturé — ni dans la métadonnée, ni dans le texte', async () => {
    const h = harness();
    await h.capture([SECRET]);
    expect(h.created).toHaveLength(1);
    expect(JSON.stringify(h.created[0])).not.toContain('4242');
  });
});

describe('recordContentCapture — ce qui ne s’annonce pas, sans dire pourquoi', () => {
  it('ignore un message ordinaire, le sien, et celui d’une autre conversation', async () => {
    const h = harness();
    expect(await h.capture([PLAIN, OWN, FOREIGN])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
    expect(h.created).toHaveLength(0);
  });

  it('ignore un message illisible, et juge la lecture avec le masquage illisible REFUSÉ', async () => {
    const h = harness({ mayRead: (id) => id !== TIMED });
    expect(await h.capture([TIMED, ONCE])).toEqual({ kind: 'recorded', noticedMessageIds: [ONCE] });
    expect(h.readCalls.every((call) => call.whenHidingUnreadable === 'refuse')).toBe(true);
    expect(h.readCalls[0]).toMatchObject({ reader: { kind: 'user', userId: USER }, now: NOW });
  });

  it('n’annonce rien d’une source à la projection incomplète — sa nature n’est pas prouvée (A3)', async () => {
    const { isBlurred: _forgotten, ...partial } = DEFAULT_MESSAGES[0];
    const h = harness({ messages: [partial as MessageRow] });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
    expect(h.created).toHaveLength(0);
  });

  it('refuse un message dont la lecture lève, et juge les autres', async () => {
    const h = harness({
      mayRead: (id) => {
        if (id === TIMED) throw new Error('mongo down');
        return true;
      },
    });
    expect(await h.capture([TIMED, ONCE])).toEqual({ kind: 'recorded', noticedMessageIds: [ONCE] });
  });

  it('ignore un message REMIS mais jamais lu — une remise n’est pas un affichage (A5)', async () => {
    const h = harness({
      entries: [
        entry(AFTER_READ, { deliveredAt: ago(3 * 86_400_000), readAt: null }),
        entry(TIMED, { readAt: null }),
      ],
    });
    await h.capture([AFTER_READ, TIMED]);
    expect(h.created).toHaveLength(0);
  });

  it('ignore un message jamais servi à l’acteur', async () => {
    const h = harness({ entries: [] });
    await h.capture([TIMED, AFTER_READ, ONCE]);
    expect(h.created).toHaveLength(0);
  });

  it('borne l’annonce d’un éphémère à la fin de son affichage plus la grâce', async () => {
    const within = harness({ entries: [entry(TIMED, { ephemeralExpiresAt: ago(CAPTURE_REPORT_GRACE_MS) })] });
    await within.capture([TIMED]);
    expect(within.created).toHaveLength(1);

    const late = harness({ entries: [entry(TIMED, { ephemeralExpiresAt: ago(CAPTURE_REPORT_GRACE_MS + 1) })] });
    await late.capture([TIMED]);
    expect(late.created).toHaveLength(0);
  });

  it('borne l’annonce depuis la LECTURE même sans aucune échéance — pas un an plus tard (A5)', async () => {
    const legacy = message({ id: TIMED, effectFlags: EPHEMERAL, ephemeralDuration: 60, expiresAt: null });
    const old = harness({ messages: [legacy], entries: [entry(TIMED, { readAt: ago(365 * 86_400_000) })] });
    await old.capture([TIMED]);
    expect(old.created).toHaveLength(0);

    const edge = harness({ messages: [legacy], entries: [entry(TIMED, { readAt: ago(CAPTURE_AFTER_DISPLAY_MAX_MS) })] });
    await edge.capture([TIMED]);
    expect(edge.created).toHaveLength(1);
  });

  it('retombe sur l’échéance du message quand la ligne n’en porte pas', async () => {
    const legacy = message({ id: TIMED, effectFlags: EPHEMERAL, ephemeralDuration: 60, expiresAt: ago(CAPTURE_REPORT_GRACE_MS + 1) });
    const h = harness({ messages: [legacy], entries: [entry(TIMED)] });
    await h.capture([TIMED]);
    expect(h.created).toHaveLength(0);
  });

  it('ignore une vue unique que l’acteur n’a pas ouverte, ou ouverte hors de la fenêtre', async () => {
    const sealed = harness({ entries: [entry(ONCE)] });
    await sealed.capture([ONCE]);
    expect(sealed.created).toHaveLength(0);

    const stale = harness({ entries: [entry(ONCE, { viewedOnceAt: ago(VIEW_ONCE_CAPTURE_WINDOW_MS + 1) })] });
    await stale.capture([ONCE]);
    expect(stale.created).toHaveLength(0);

    const fresh = harness({ entries: [entry(ONCE, { viewedOnceAt: ago(VIEW_ONCE_CAPTURE_WINDOW_MS) })] });
    await fresh.capture([ONCE]);
    expect(fresh.created).toHaveLength(1);
  });
});

describe('wasOnActorScreen — la borne d’affichage, pure (A6)', () => {
  const base = { readAt: null, viewedOnceAt: null, ephemeralExpiresAt: null };

  it('refuse une vue unique sans ouverture, sans lever', () => {
    expect(wasOnActorScreen({ nature: 'view-once', entry: { ...base, readAt: NOW }, messageExpiresAt: null, now: NOW })).toBe(false);
  });

  it('refuse une flamme non lue, même livrée et sans échéance', () => {
    expect(wasOnActorScreen({ nature: 'after-read-flame', entry: base, messageExpiresAt: null, now: NOW })).toBe(false);
  });

  it('refuse une lecture postérieure à l’instant jugé', () => {
    expect(
      wasOnActorScreen({ nature: 'timed-flame', entry: { ...base, readAt: new Date(NOW.getTime() + 1) }, messageExpiresAt: null, now: NOW }),
    ).toBe(false);
  });
});

describe('recordContentCapture — le VRAI readerMayReadMessage (A6)', () => {
  it('annonce un message lisible', async () => {
    const h = harness({ mayRead: 'real' });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED] });
  });

  it('refuse un message retiré de la vue de l’acteur', async () => {
    const h = harness({ mayRead: 'real', hiddenForActor: [TIMED] });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
  });

  it('refuse un message antérieur au plancher d’historique de l’acteur', async () => {
    const h = harness({ mayRead: 'real', actor: actorRow({ historyVisibleFrom: new Date(SENT_AT.getTime() + 1) }) });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
  });

  it('refuse un message supprimé pour tous', async () => {
    const h = harness({ mayRead: 'real', messages: [{ ...DEFAULT_MESSAGES[0], deletedAt: ago(1) }] });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
  });
});

describe('recordContentCapture — qui peut déclarer', () => {
  it('refuse un appelant absent, inactif ou banni de la conversation', async () => {
    expect(await harness({ actor: null }).capture([TIMED])).toEqual({ kind: 'not-a-participant' });
    expect(await harness({ actor: actorRow({ isActive: false }) }).capture([TIMED])).toEqual({ kind: 'not-a-participant' });
    expect(await harness({ actor: actorRow({ bannedAt: ago(1) }) }).capture([TIMED])).toEqual({ kind: 'not-a-participant' });
  });

  it('refuse une participation déclarée dans une AUTRE conversation que celle de la capture', async () => {
    expect(await harness().capture([FOREIGN], { conversationId: OTHER_CONV })).toEqual({ kind: 'not-a-participant' });
  });

  it('refuse dans une conversation close, active ou non, sans rien écrire (A2)', async () => {
    const closed = harness({ closed: { isActive: true, closedAt: ago(1) } });
    expect(await closed.capture([TIMED])).toEqual({ kind: 'conversation-closed' });
    expect(closed.created).toHaveLength(0);
    expect(await harness({ closed: { isActive: false, closedAt: null } }).capture([TIMED])).toEqual({ kind: 'conversation-closed' });
  });

  it('refuse quand le budget de déclarations est épuisé', async () => {
    const h = harness({ allowDeclarations: false });
    expect(await h.capture([TIMED])).toEqual({ kind: 'rate-limited' });
    expect(h.created).toHaveLength(0);
  });

  it('compte les déclarations par acteur ET conversation, au vrai limiteur', () => {
    expect(captureRateLimitKey({ actorParticipantId: ACTOR, conversationId: CONV })).toBe(`${ACTOR}:${CONV}`);
  });
});

describe('recordContentCapture — une annonce par (acteur, message, sorte), et des plafonds (A1)', () => {
  it('ne réannonce jamais le même message pour la même sorte de capture, quel que soit captureId ou le temps qui passe', async () => {
    const h = harness({ messages: [flame(TIMED)], entries: [entry(TIMED)] });
    for (let i = 0; i < 40; i += 1) {
      h.clock.now = new Date(NOW.getTime() + i * 31_000);
      h.limiter.reset(captureRateLimitKey({ actorParticipantId: ACTOR, conversationId: CONV }), SOCKET_RATE_LIMITS.MESSAGE_CAPTURE);
      // eslint-disable-next-line no-await-in-loop
      const outcome = await h.capture([TIMED], { captureId: `shot-${String(i).padStart(8, '0')}` });
      expect(outcome).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED] });
    }
    expect(h.created).toHaveLength(1);
  });

  it('annonce l’enregistrement à part de la capture photo, mais pas deux fois', async () => {
    const h = harness({ messages: [flame(TIMED)], entries: [entry(TIMED)] });
    await h.capture([TIMED], { kind: 'screenshot' });
    await h.capture([TIMED], { kind: 'recording', captureId: 'rec-0000001' });
    await h.capture([TIMED], { kind: 'recording', captureId: 'rec-0000002' });
    expect(noticesOf(h.created).map((n) => n?.captureKind)).toEqual(['screenshot', 'recording']);
  });

  it(`n’écrit pas plus de ${MAX_NOTICES_PER_REPORT} avis pour une déclaration de 50 flammes`, async () => {
    const ids = many(50);
    const h = harness({ messages: ids.map(flame), entries: ids.map((id) => entry(id)) });
    const outcome = await h.capture(ids);
    expect(h.created).toHaveLength(MAX_NOTICES_PER_REPORT);
    expect(h.broadcasts).toHaveLength(MAX_NOTICES_PER_REPORT);
    expect(outcome).toEqual({ kind: 'recorded', noticedMessageIds: ids.slice(0, MAX_NOTICES_PER_REPORT) });
  });

  it('n’écrit pas plus que le budget horaire par acteur et conversation, même en six déclarations', async () => {
    const ids = many(300);
    const h = harness({ messages: ids.map(flame), entries: ids.map((id) => entry(id)) });
    const outcomes = [];
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      outcomes.push(await h.capture(ids.slice(i * 50, i * 50 + 50), { captureId: `shot-real-${i}xx` }));
    }
    expect(outcomes.every((o) => o.kind === 'recorded')).toBe(true);
    expect(h.created).toHaveLength(SOCKET_RATE_LIMITS.MESSAGE_CAPTURE_NOTICES_HOURLY.maxRequests);
  });

  it('un message refusé par le budget horaire reste annonçable plus tard (sa clé est libérée)', async () => {
    const ids = many(SOCKET_RATE_LIMITS.MESSAGE_CAPTURE_NOTICES_HOURLY.maxRequests + 1);
    const h = harness({ messages: ids.map(flame), entries: ids.map((id) => entry(id)) });
    for (let i = 0; i < ids.length; i += MAX_NOTICES_PER_REPORT) {
      // eslint-disable-next-line no-await-in-loop
      await h.capture(ids.slice(i, i + MAX_NOTICES_PER_REPORT));
    }
    const last = ids[ids.length - 1];
    expect(noticesOf(h.created).map((n) => n?.capturedMessageId)).not.toContain(last);

    h.limiter.reset(captureRateLimitKey({ actorParticipantId: ACTOR, conversationId: CONV }), SOCKET_RATE_LIMITS.MESSAGE_CAPTURE_NOTICES_HOURLY);
    expect(await h.capture([last])).toEqual({ kind: 'recorded', noticedMessageIds: [last] });
  });

  it('une écriture échouée ne compte pas comme annoncée, et laisse le réessai l’écrire', async () => {
    const h = harness({ failWrites: true });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
    h.control.failWrites = false;
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED] });
    expect(h.created).toHaveLength(1);
  });
});
