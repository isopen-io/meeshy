/**
 * La loi de lecture d'un transfert (`messageReadAccess.ts`, `forwardAdmission.ts`)
 * face à ce que le message CITE, et à ce que sa décision COÛTE (#9625, #9579).
 *
 * Témoins posés par l'audit adversarial de #9579, repris par le lot qui les
 * fait passer. Deux écarts entre la loi que le lot ÉNONÇAIT et celle qu'il
 * APPLIQUAIT, et un oracle :
 *
 * 1. « Le contenu est encore à l'écran de ce lecteur » (borne de la BULLE) ne
 *    tient compte que de l'échéance PROPRE du message désigné. Or une réponse
 *    meurt, pour un lecteur, avec ce qu'elle cite (#8630, `quoteCascade.ts`) :
 *    le fil lui sert `withInheritedExpiry`, et la bulle part à cette échéance.
 *    La garde du transfert l'ignore.
 *
 * 2. « Un lien de partage INTROUVABLE ne ferme ni ne borne » repose sur une
 *    prémisse : #3734 retire l'invité par un autre chemin. Elle ne vaut que
 *    pour les invités ANONYMES (`revokeShareLinkGuests` : `type: 'anonymous'`).
 *    Un inscrit entré par lien n'est jamais révoqué à l'échéance, et la purge
 *    quotidienne (`cleanupExpiredData`) EFFACE la ligne d'un lien échu : la
 *    porte « lien échu » se rouvre alors, et la sortie avec elle. C'est une
 *    DÉCISION PRODUIT ouverte (#9626) : son témoin reste suspendu, et le
 *    témoin qui fige la posture actuelle vit dans `forwardSourceReadAccess.test.ts`.
 *
 * 3. L'oracle du TRAVAIL : une réponse identique ne suffit pas si le nombre
 *    de lectures dit qu'un message existe ailleurs.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  CONV_A,
  CONV_B,
  MSG_1,
  MSG_2,
  matchesWhere,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  type Store,
} from '../../../__tests__/unit/routes/me/starred-messages-harness';
import { admitMessageForward } from '../forwardAdmission';
import { loadMessageReadableByParticipant } from '../messageReadAccess';
import { loadInheritedEphemeralDeadlines } from '../quoteCascade';

type Row = Record<string, unknown>;

const SOURCE_CONVERSATION = CONV_A;
const TARGET_CONVERSATION = CONV_B;
const REPLY = MSG_1;
const QUOTED = MSG_2;

const SENDER = '68b000000000000000000021';
const READER_IN_SOURCE = '68b000000000000000000011';
const AUTHOR_IN_SOURCE = '68b0000000000000000000e1';
const LINK = '68b0000000000000000000e9';

const AT = new Date('2026-09-21T12:00:00.000Z');
const EPHEMERAL_BIT = 1 << 0;

const secondsFrom = (instant: Date, seconds: number): Date => new Date(instant.getTime() + seconds * 1000);

const senderInTarget = (): Row => participantRow({ id: SENDER, conversationId: TARGET_CONVERSATION });

function database(store: Store, statusEntries: Row[] = []) {
  const base = makePrisma(store);
  const prisma = {
    ...base,
    messageStatusEntry: {
      findMany: async (args: { where?: Row; take?: number }) => {
        const rows = statusEntries.filter((entry) => matchesWhere(entry, args.where));
        return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
      },
      findFirst: async (args: { where?: Row; orderBy?: Record<string, 'asc' | 'desc'> }) => {
        const rows = statusEntries.filter((entry) => matchesWhere(entry, args.where));
        const [field, direction] = Object.entries(args.orderBy ?? {})[0] ?? [];
        if (!field) return rows[0] ?? null;
        const sign = direction === 'desc' ? -1 : 1;
        return [...rows].sort((a, b) => sign * ((a[field] as Date).getTime() - (b[field] as Date).getTime()))[0] ?? null;
      },
    },
    participant: {
      ...base.participant,
      findUnique: async (args: { where: { id: string } }) =>
        store.participants.find((p) => p.id === args.where.id) ?? null,
    },
  };
  return prisma as never;
}

const UNAVAILABLE = { admitted: true, sourceUnavailable: true };

describe('#8630 × #9579 — une réponse morte avec ce qu’elle cite est partie de l’écran de ce lecteur', () => {
  const quotedFlame = (): Row =>
    messageRow({
      id: QUOTED,
      senderId: AUTHOR_IN_SOURCE,
      effectFlags: EPHEMERAL_BIT,
      ephemeralDuration: 30,
      expiresAt: secondsFrom(AT, 7 * 24 * 3600),
      replyToId: null,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
      attachments: [],
      _count: { attachments: 0 },
    });

  const reply = (overrides: Row = {}): Row =>
    messageRow({
      id: REPLY,
      senderId: AUTHOR_IN_SOURCE,
      replyToId: QUOTED,
      ephemeralDuration: null,
      viewOnceBurnedAt: null,
      attachments: [],
      _count: { attachments: 1 },
      ...overrides,
    });

  const quotedDiedForReader = (secondsAgo: number): Row => ({
    messageId: QUOTED,
    participantId: READER_IN_SOURCE,
    ephemeralExpiresAt: secondsFrom(AT, -secondsAgo),
  });

  it('prémisse : la loi du fil date la bulle de la réponse à la mort de ce qu’elle cite, déjà passée', async () => {
    const store = makeStore({ messages: [reply(), quotedFlame()], participants: [senderInTarget(), participantRow()] });

    const inherited = await loadInheritedEphemeralDeadlines(
      database(store, [quotedDiedForReader(60)]),
      [{ id: REPLY, replyToId: QUOTED }],
      READER_IN_SOURCE,
    );

    expect(inherited.get(REPLY)?.getTime()).toBe(secondsFrom(AT, -60).getTime());
  });

  it('une réponse ORDINAIRE (écrite avant la contagion #8557) n’est plus désignable — sinon sa copie naît IMMORTELLE', async () => {
    const store = makeStore({ messages: [reply(), quotedFlame()], participants: [senderInTarget(), participantRow()] });
    const prisma = database(store, [quotedDiedForReader(60)]);

    expect(await loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: REPLY, now: AT })).toBeNull();
    expect(await admitMessageForward(prisma, { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT } as never)).toEqual(UNAVAILABLE);
  });

  it('une réponse CONTAMINÉE dont la propre échéance est plus tardive n’est plus désignable une fois la citée morte pour lui', async () => {
    const contaminated = reply({ effectFlags: EPHEMERAL_BIT, ephemeralDuration: 30, expiresAt: secondsFrom(AT, 7 * 24 * 3600) });
    const store = makeStore({ messages: [contaminated, quotedFlame()], participants: [senderInTarget(), participantRow()] });
    const entries = [
      quotedDiedForReader(10),
      { messageId: REPLY, participantId: READER_IN_SOURCE, ephemeralExpiresAt: secondsFrom(AT, 20) },
    ];
    const prisma = database(store, entries);

    expect(await admitMessageForward(prisma, { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT } as never)).toEqual(UNAVAILABLE);
  });

  it('frontière : désignable une seconde AVANT la mort de ce qu’elle cite pour lui, indisponible une seconde APRÈS', async () => {
    const store = makeStore({ messages: [reply(), quotedFlame()], participants: [senderInTarget(), participantRow()] });
    const quotedDiesIn = (seconds: number): Row => ({
      messageId: QUOTED,
      participantId: READER_IN_SOURCE,
      ephemeralExpiresAt: secondsFrom(AT, seconds),
    });

    expect(
      await admitMessageForward(database(store, [quotedDiesIn(1)]), { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT } as never),
    ).toEqual({ admitted: true, imposes: null });
    expect(
      await admitMessageForward(database(store, [quotedDiesIn(-1)]), { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT } as never),
    ).toEqual(UNAVAILABLE);
  });

  it('reste désignable tant que le décompte de la citée n’a pas démarré pour lui — la mort d’un AUTRE lecteur ne compte pas', async () => {
    const store = makeStore({ messages: [reply(), quotedFlame()], participants: [senderInTarget(), participantRow()] });
    const another = { messageId: QUOTED, participantId: '68b000000000000000000012', ephemeralExpiresAt: secondsFrom(AT, -3600) };

    expect(await loadMessageReadableByParticipant(database(store, [another]), { participantId: SENDER, messageId: REPLY, now: AT })).toMatchObject({ id: REPLY });
  });

  it('descend la chaîne : la réponse à une réponse meurt avec la flamme citée deux crans plus haut', async () => {
    const MIDDLE = '68b000000000000000000104';
    const middle = messageRow({ id: MIDDLE, senderId: AUTHOR_IN_SOURCE, replyToId: QUOTED, ephemeralDuration: null, createdAt: new Date('2026-09-20T09:30:00.000Z') });
    const top = reply({ replyToId: MIDDLE });
    const store = makeStore({ messages: [top, middle, quotedFlame()], participants: [senderInTarget(), participantRow()] });

    expect(await loadMessageReadableByParticipant(database(store, [quotedDiedForReader(60)]), { participantId: SENDER, messageId: REPLY, now: AT })).toBeNull();
  });

  it('ne tourne pas en rond sur une chaîne qui se cite elle-même', async () => {
    const looping = reply({ replyToId: REPLY });
    const store = makeStore({ messages: [looping], participants: [senderInTarget(), participantRow()] });

    expect(await loadMessageReadableByParticipant(database(store), { participantId: SENDER, messageId: REPLY, now: AT })).toMatchObject({ id: REPLY });
  });

  it.each([
    ['le message cité', (raw: any, store: Store) => {
      raw.message.findUnique = async (args: { where: { id: string } }) => {
        if (args.where.id === QUOTED) throw new Error('mongo down');
        return store.messages.find((m) => m.id === args.where.id) ?? null;
      };
    }],
    ['l’échéance de la citée', (raw: any) => {
      raw.messageStatusEntry.findFirst = async () => {
        throw new Error('mongo down');
      };
    }],
  ])('ferme quand %s ne se lit pas', async (_label, breakRead) => {
    const store = makeStore({ messages: [reply(), quotedFlame()], participants: [senderInTarget(), participantRow()] });
    const prisma = database(store) as any;
    breakRead(prisma, store);

    expect(await admitMessageForward(prisma, { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT } as never)).toEqual(UNAVAILABLE);
    expect(
      await admitMessageForward(prisma, { forwardedFromId: REPLY, senderParticipantId: SENDER, at: AT, bodyOnlyFromSource: true } as never),
    ).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
  });
});

describe('#9579 — l’oracle se mesure aussi au TRAVAIL fait, pas seulement à la réponse', () => {
  const UNKNOWN_MESSAGE = '68b0000000000000000001ff';

  const countingReads = (store: Store) => {
    const prisma = database(store) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
    const reads = { count: 0 };
    for (const model of Object.values(prisma)) {
      for (const [name, method] of Object.entries(model)) {
        model[name] = (...args: unknown[]) => {
          reads.count += 1;
          return method(...args);
        };
      }
    }
    return { prisma: prisma as never, reads };
  };

  it('une source hors de portée coûte autant de lectures qu’un identifiant qui ne désigne rien', async () => {
    const outsider = makeStore({
      messages: [messageRow({ id: REPLY, ephemeralDuration: null, viewOnceBurnedAt: null })],
      participants: [senderInTarget()],
    });

    const forbidden = countingReads(outsider);
    await loadMessageReadableByParticipant(forbidden.prisma, { participantId: SENDER, messageId: REPLY, now: AT });
    const unknown = countingReads(outsider);
    await loadMessageReadableByParticipant(unknown.prisma, { participantId: SENDER, messageId: UNKNOWN_MESSAGE, now: AT });

    expect(forbidden.reads.count).toBe(unknown.reads.count);
  });
});

describe('#3734 × #9579 — un lien ÉCHU ne redevient pas une porte quand la purge efface sa ligne', () => {
  const linkJoiner = (): Row =>
    participantRow({ shareLinkId: LINK, permissions: { canViewHistory: true } });
  const source = (): Row =>
    messageRow({ id: REPLY, ephemeralDuration: null, viewOnceBurnedAt: null, attachments: [], _count: { attachments: 1 } });

  it('prémisse : tant que la ligne du lien échu existe, l’inscrit entré par ce lien ne désigne plus la source', async () => {
    const expired = makeStore({
      messages: [source()],
      participants: [senderInTarget(), linkJoiner()],
      shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: secondsFrom(AT, -3600), isActive: false }],
    });

    expect(await loadMessageReadableByParticipant(database(expired), { participantId: SENDER, messageId: REPLY, now: AT })).toBeNull();
  });

  it.skip('#9626 (décision produit ouverte) — après la purge quotidienne des liens échus (`cleanupExpiredData`), il ne la désigne TOUJOURS pas', async () => {
    const purged = makeStore({
      messages: [source()],
      participants: [senderInTarget(), linkJoiner()],
      shareLinks: [],
    });

    expect(await loadMessageReadableByParticipant(database(purged), { participantId: SENDER, messageId: REPLY, now: AT })).toBeNull();
  });
});
