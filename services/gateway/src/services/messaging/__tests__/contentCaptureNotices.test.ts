/**
 * #9617 — une capture d'un contenu qui disparaît s'annonce à toute la
 * conversation ; une tentative sur une vue unique aussi. Chaque garde a son
 * témoin : participant, budget, conversation, auteur, loi de sortie, droit de
 * lecture (masquage illisible ⇒ refus), affichage RÉEL et récent, doublon de
 * capture, rafale.
 *
 * Le double Prisma HONORE les filtres qu'il reçoit (conversation, identifiants,
 * ligne d'accusés de CE participant) : un double qui rendrait toujours la même
 * ligne mesurerait l'implémentation, pas la loi.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { parseCaptureNotice } from '@meeshy/shared/utils/capture-notice';

import {
  CAPTURE_BURST_SECONDS,
  CAPTURE_REPORT_GRACE_MS,
  VIEW_ONCE_CAPTURE_WINDOW_MS,
  captureRateLimitKey,
  recordContentCapture,
  type ContentCaptureDeps,
} from '../contentCaptureNotices';
import { SOCKET_RATE_LIMITS, type RateLimitConfig } from '../../../utils/socket-rate-limiter';

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
  receivedAt: Date | null;
  readAt: Date | null;
  viewedOnceAt: Date | null;
  ephemeralExpiresAt: Date | null;
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
  receivedAt: ago(minutes(1)),
  readAt: null,
  viewedOnceAt: null,
  ephemeralExpiresAt: null,
  ...overrides,
});

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
  entry(ONCE, { viewedOnceAt: ago(minutes(1)) }),
  entry(PLAIN),
  entry(OWN),
  entry(FOREIGN),
  entry(SECRET),
];

type World = {
  messages?: MessageRow[];
  entries?: EntryRow[];
  actor?: { id: string; conversationId: string; userId: string | null; displayName: string; nickname: string | null } | null;
  mayRead?: (messageId: string) => boolean | Promise<boolean>;
  allowed?: boolean;
  failWrites?: boolean;
};

function harness(world: World = {}) {
  const messages = world.messages ?? DEFAULT_MESSAGES;
  const entries = world.entries ?? DEFAULT_ENTRIES;
  const actor =
    world.actor === undefined
      ? { id: ACTOR, conversationId: CONV, userId: USER, displayName: 'Alice', nickname: null }
      : world.actor;
  const created: Record<string, unknown>[] = [];
  const broadcasts: unknown[] = [];
  const readCalls: Record<string, unknown>[] = [];
  const limiterCalls: { key: string; config: RateLimitConfig }[] = [];
  const clock = { now: NOW };
  const control = { failWrites: world.failWrites ?? false };
  const store = new Map<string, number>();

  const prisma = {
    participant: {
      findFirst: async ({ where }: { where: { id: string; conversationId: string } }) =>
        actor && actor.id === where.id && actor.conversationId === where.conversationId ? actor : null,
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
    conversation: { update: async () => ({}) },
  } as unknown as PrismaClient;

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
      checkLimit: async (key, config) => {
        limiterCalls.push({ key, config });
        return world.allowed ?? true;
      },
    },
    broadcast: async (msg) => {
      broadcasts.push(msg);
    },
    mayRead: async (_prisma, params) => {
      readCalls.push(params as unknown as Record<string, unknown>);
      return world.mayRead ? world.mayRead(params.message.id) : true;
    },
    now: () => clock.now,
  };

  const capture = (messageIds: string[], overrides: { kind?: 'screenshot' | 'recording'; captureId?: string; conversationId?: string; actorParticipantId?: string } = {}) =>
    recordContentCapture(deps, {
      conversationId: overrides.conversationId ?? CONV,
      actorParticipantId: overrides.actorParticipantId ?? ACTOR,
      report: { messageIds, kind: overrides.kind ?? 'screenshot', captureId: overrides.captureId ?? 'capture-0001' },
    });

  return { capture, created, broadcasts, readCalls, limiterCalls, clock, control };
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
      content: 'Alice a capturé l’éphémère du 07/10/2026 à 11:58 (UTC)',
    });
    expect(noticesOf(h.created)[0]).toEqual({
      kind: 'content-capture',
      actor: { participantId: ACTOR, displayName: 'Alice' },
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
    const outcome = await h.capture([AFTER_READ]);
    expect(outcome).toEqual({ kind: 'recorded', noticedMessageIds: [AFTER_READ] });
    expect(noticesOf(h.created)[0]).toMatchObject({ nature: 'after-read-flame', outcome: 'announced' });
  });

  it('dit la TENTATIVE sur une vue unique ouverte par l’acteur', async () => {
    const h = harness();
    await h.capture([ONCE], { kind: 'recording' });
    expect(noticesOf(h.created)[0]).toMatchObject({ nature: 'view-once', outcome: 'blocked', captureKind: 'recording' });
    expect(h.created[0]).toMatchObject({ content: 'Alice a tenté d’enregistrer un message à vue unique — impossible' });
  });

  it('prend le surnom de l’acteur dans la conversation quand il en a un', async () => {
    const h = harness({ actor: { id: ACTOR, conversationId: CONV, userId: USER, displayName: 'Alice', nickname: 'Ali' } });
    await h.capture([TIMED]);
    expect(noticesOf(h.created)[0]?.actor.displayName).toBe('Ali');
  });

  it('n’emporte AUCUN contenu du message capturé — ni dans la métadonnée, ni dans le texte', async () => {
    const h = harness();
    await h.capture([SECRET]);
    expect(h.created).toHaveLength(1);
    expect(JSON.stringify(h.created[0])).not.toContain('4242');
  });
});

describe('recordContentCapture — ce qui ne s’annonce pas, sans dire pourquoi', () => {
  it('ignore un message ordinaire : sa capture est libre', async () => {
    const h = harness();
    expect(await h.capture([PLAIN])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
    expect(h.created).toHaveLength(0);
  });

  it('ignore le contenu de l’acteur lui-même', async () => {
    const h = harness();
    await h.capture([OWN]);
    expect(h.created).toHaveLength(0);
  });

  it('ignore un message d’une autre conversation, même lisible', async () => {
    const h = harness();
    await h.capture([FOREIGN]);
    expect(h.created).toHaveLength(0);
  });

  it('ignore un message que l’acteur n’a pas le droit de lire, et juge la lecture avec le masquage illisible REFUSÉ', async () => {
    const h = harness({ mayRead: (id) => id !== TIMED });
    expect(await h.capture([TIMED, ONCE])).toEqual({ kind: 'recorded', noticedMessageIds: [ONCE] });
    expect(h.readCalls.every((call) => call.whenHidingUnreadable === 'refuse')).toBe(true);
    expect(h.readCalls[0]).toMatchObject({ reader: { kind: 'user', userId: USER }, now: NOW });
  });

  it('juge un invité de lien par sa ligne, sans compte', async () => {
    const h = harness({ actor: { id: ACTOR, conversationId: CONV, userId: null, displayName: 'Invité', nickname: null } });
    await h.capture([TIMED]);
    expect(h.readCalls[0]).toMatchObject({ reader: { kind: 'anonymous', participantId: ACTOR } });
  });

  it('ignore un message jamais servi à l’acteur', async () => {
    const h = harness({ entries: [] });
    await h.capture([TIMED, AFTER_READ, ONCE]);
    expect(h.created).toHaveLength(0);
  });

  it('ignore une flamme dont la ligne existe mais ne porte ni remise, ni réception, ni lecture', async () => {
    const h = harness({ entries: [entry(TIMED, { deliveredAt: null, receivedAt: null, readAt: null })] });
    await h.capture([TIMED]);
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

  it('continue après une lecture qui lève : le message est ignoré, les autres jugés', async () => {
    const h = harness({
      mayRead: (id) => {
        if (id === TIMED) throw new Error('mongo down');
        return true;
      },
    });
    expect(await h.capture([TIMED, ONCE])).toEqual({ kind: 'recorded', noticedMessageIds: [ONCE] });
  });
});

describe('recordContentCapture — qui peut déclarer, et combien', () => {
  it('refuse un appelant qui n’est pas participant actif de la conversation', async () => {
    const h = harness({ actor: null });
    expect(await h.capture([TIMED])).toEqual({ kind: 'not-a-participant' });
    expect(h.created).toHaveLength(0);
    expect(h.limiterCalls).toHaveLength(0);
  });

  it('refuse une participation déclarée dans une AUTRE conversation que celle de la capture', async () => {
    const h = harness();
    expect(await h.capture([FOREIGN], { conversationId: OTHER_CONV })).toEqual({ kind: 'not-a-participant' });
  });

  it('compte chaque déclaration au budget de l’acteur DANS cette conversation, et s’arrête quand il est épuisé', async () => {
    const h = harness({ allowed: false });
    expect(await h.capture([TIMED])).toEqual({ kind: 'rate-limited' });
    expect(h.created).toHaveLength(0);
    expect(h.limiterCalls).toEqual([
      { key: captureRateLimitKey({ actorParticipantId: ACTOR, conversationId: CONV }), config: SOCKET_RATE_LIMITS.MESSAGE_CAPTURE },
    ]);
  });
});

describe('recordContentCapture — une annonce par message et par capture', () => {
  it('un réessai de la même capture ne crée rien de plus, et redit le message annoncé', async () => {
    const h = harness();
    await h.capture([TIMED, ONCE]);
    const again = await h.capture([TIMED, ONCE]);
    expect(again).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED, ONCE] });
    expect(h.created).toHaveLength(2);
  });

  it('un enregistrement annonce chaque éphémère UNE fois, même redéclaré, et le nouveau venu à son tour', async () => {
    const h = harness();
    await h.capture([TIMED], { kind: 'recording', captureId: 'rec-0000001' });
    h.clock.now = new Date(NOW.getTime() + (CAPTURE_BURST_SECONDS + 1) * 1000);
    await h.capture([TIMED, AFTER_READ], { kind: 'recording', captureId: 'rec-0000001' });
    expect(noticesOf(h.created).map((n) => n?.capturedMessageId)).toEqual([TIMED, AFTER_READ]);
  });

  it('une rafale de captures du même message n’en annonce qu’une ; une capture après la rafale s’annonce', async () => {
    const h = harness();
    await h.capture([TIMED], { captureId: 'shot-0000001' });
    await h.capture([TIMED], { captureId: 'shot-0000002' });
    expect(h.created).toHaveLength(1);

    h.clock.now = new Date(NOW.getTime() + (CAPTURE_BURST_SECONDS + 1) * 1000);
    await h.capture([TIMED], { captureId: 'shot-0000003' });
    expect(h.created).toHaveLength(2);
  });

  it('une écriture échouée ne compte pas comme annoncée, et libère la capture pour le réessai', async () => {
    const h = harness({ failWrites: true });
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [] });
    h.control.failWrites = false;
    expect(await h.capture([TIMED])).toEqual({ kind: 'recorded', noticedMessageIds: [TIMED] });
    expect(h.created).toHaveLength(1);
  });
});
