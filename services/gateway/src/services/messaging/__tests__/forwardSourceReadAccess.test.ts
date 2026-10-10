/**
 * LE DROIT DE LIRE LA SOURCE D'UN TRANSFERT (#9579) — la loi de lecture
 * (`messageReadAccess.ts`) et sa place dans l'admission (`forwardAdmission.ts`).
 *
 * `forwardAdmission.test.ts` prouve ce que la source IMPOSE à sa copie ; ici,
 * QUI a le droit de la désigner. Les deux gardes sont indépendantes, et leur
 * ORDRE est une propriété : ce qu'une source est ne se dit pas à qui ne la lit
 * pas.
 *
 * La base est celle du favori de message — une base en mémoire qui ÉVALUE les
 * `where`. La loi de lecture étant la même pour les deux gestes, les deux
 * familles de témoins tombent ensemble si la requête cesse de garder.
 *
 * Le câblage sur `handleMessage` (les trois transports d'envoi) est prouvé
 * dans `MessagingService.forwardSourceAccess.test.ts`.
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
  OTHER_USER_ID,
  USER_ID,
  matchesWhere,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  type Store,
} from '../../../__tests__/unit/routes/me/starred-messages-harness';
import { isEphemeralServableToReader } from '../../../routes/conversations/ephemeralReaderDeadlines';
import { admitMessageForward, forwardedCopyRequest } from '../forwardAdmission';
import {
  loadMessageReadableByParticipant,
  messageReaderOfParticipant,
  readerMayReadMessage,
} from '../messageReadAccess';

type Row = Record<string, unknown>;

const SOURCE_CONVERSATION = CONV_A;
const TARGET_CONVERSATION = CONV_B;
const SOURCE = MSG_1;
const UNKNOWN_MESSAGE = '68b0000000000000000001ff';
const UNKNOWN_PARTICIPANT = '68b0000000000000000002ff';

const SENDER = '68b000000000000000000021';
const GUEST = '68b0000000000000000000f1';
const LINK = '68b0000000000000000000e9';

const AT = new Date('2026-09-21T12:00:00.000Z');
const AFTER_THE_SOURCE = new Date('2026-09-20T11:00:00.000Z');
const EPHEMERAL_BIT = 1 << 0;
const VIEW_ONCE_BIT = 1 << 2;
const AFTER_READ_BIT = 1 << 3;

/** La ligne de l'expéditeur DANS la conversation de la source — la clé de ses accusés. */
const READER_IN_SOURCE = '68b000000000000000000011';
const AUTHOR_IN_SOURCE = '68b0000000000000000000e1';
const PEER_IN_SOURCE = '68b000000000000000000012';

const secondsFrom = (instant: Date, seconds: number): Date => new Date(instant.getTime() + seconds * 1000);

const sourceMessage = (overrides: Row = {}): Row =>
  messageRow({ ephemeralDuration: null, attachments: [], _count: { attachments: 1 }, ...overrides });

const senderInTarget = (overrides: Row = {}): Row =>
  participantRow({ id: SENDER, conversationId: TARGET_CONVERSATION, ...overrides });

const guestIn = (conversationId: string, overrides: Row = {}): Row =>
  participantRow({ id: GUEST, conversationId, userId: null, user: null, ...overrides });

const readableStore = (overrides: Partial<Store> = {}): Store =>
  makeStore({ messages: [sourceMessage()], participants: [senderInTarget(), participantRow()], ...overrides });

/**
 * La base du favori, plus la lecture par identifiant d'une ligne `Participant`
 * (l'expéditeur d'un envoi), et un relevé des lectures de la source.
 */
function database(store: Store, statusEntries: Row[] = []) {
  const base = makePrisma(store);
  const messageReads: Array<{ where: { id: string }; select?: Row }> = [];
  const prisma = {
    ...base,
    // Le double répond à la REQUÊTE qu'on lui pose : un balayage rend ses
    // lignes dans l'ordre de la collection et s'arrête à son `take`, une
    // lecture ordonnée rend la première de SON ordre. Une tranche complaisante
    // rendrait vert un garde qui décide sur une lecture tronquée.
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
    message: {
      ...base.message,
      findUnique: async (args: { where: { id: string }; select?: Row }) => {
        messageReads.push(args);
        return base.message.findUnique(args);
      },
    },
    participant: {
      ...base.participant,
      findUnique: async (args: { where: { id: string } }) =>
        store.participants.find((p) => p.id === args.where.id) ?? null,
    },
  };
  // La lecture de la LOI DE SORTIE est celle qui demande le flou et les pièces —
  // le droit de lire, lui, ne charge aucune de ces deux colonnes.
  const exitLawReads = () => messageReads.filter((read) => read.select?.isBlurred === true);
  return { prisma: prisma as never, raw: prisma, exitLawReads };
}

const UNREADABLE: ReadonlyArray<readonly [string, () => Store, string?]> = [
  ['n’a jamais participé à la conversation du message', () => readableStore({ participants: [senderInTarget()] })],
  ['a quitté la conversation du message', () => readableStore({ participants: [senderInTarget(), participantRow({ isActive: false })] })],
  ['en est banni, sa ligne restée active', () => readableStore({ participants: [senderInTarget(), participantRow({ bannedAt: new Date('2026-09-10T00:00:00.000Z') })] })],
  ['est borné par un plancher d’historique postérieur au message', () => readableStore({ participants: [senderInTarget(), participantRow({ historyVisibleFrom: AFTER_THE_SOURCE })] })],
  ['a retiré le message de sa vue', () => readableStore({ deletions: [{ userId: USER_ID, messageId: SOURCE }] })],
  ['a vidé son historique après le message', () => readableStore({ prefs: [{ userId: USER_ID, conversationId: SOURCE_CONVERSATION, clearHistoryBefore: AFTER_THE_SOURCE }] })],
  ['désigne un message supprimé pour tous', () => readableStore({ messages: [sourceMessage({ deletedAt: new Date('2026-09-20T10:30:00.000Z') })] })],
  [
    'est entré par un lien de partage échu',
    () => readableStore({
      participants: [senderInTarget(), participantRow({ shareLinkId: LINK })],
      shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: new Date('2026-01-01T00:00:00.000Z') }],
    }),
  ],
  [
    'est entré par un lien qui n’ouvre pas l’historique, après le message',
    () => readableStore({
      participants: [senderInTarget(), participantRow({ shareLinkId: LINK, joinedAt: AFTER_THE_SOURCE })],
      shareLinks: [{ id: LINK, allowViewHistory: false, expiresAt: null }],
    }),
  ],
  [
    'est un invité anonyme d’une AUTRE conversation',
    () => readableStore({ participants: [guestIn(TARGET_CONVERSATION), participantRow({ userId: OTHER_USER_ID })] }),
    GUEST,
  ],
  [
    'est un invité dont la ligne, dans la conversation du message, est éteinte',
    () => readableStore({ participants: [guestIn(SOURCE_CONVERSATION, { isActive: false })] }),
    GUEST,
  ],
  [
    'est un invité BANNI de la conversation du message, sa ligne restée active',
    () => readableStore({ participants: [guestIn(SOURCE_CONVERSATION, { bannedAt: new Date('2026-09-10T00:00:00.000Z') })] }),
    GUEST,
  ],
  ['n’a pas de ligne `Participant`', () => readableStore(), UNKNOWN_PARTICIPANT],
];

describe('loadMessageReadableByParticipant — la loi de lecture d’UN message', () => {
  it('rend le message à un participant actif de SA conversation, sans rien de son contenu en question', async () => {
    const { prisma } = database(readableStore());

    const readable = await loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: SOURCE, now: AT });

    expect(readable).toMatchObject({ id: SOURCE, conversationId: SOURCE_CONVERSATION });
  });

  it('rend le message à un invité anonyme de SA propre conversation', async () => {
    const { prisma } = database(readableStore({ participants: [guestIn(SOURCE_CONVERSATION)] }));

    const readable = await loadMessageReadableByParticipant(prisma, { participantId: GUEST, messageId: SOURCE, now: AT });

    expect(readable).toMatchObject({ id: SOURCE });
  });

  it('résout un compte par son `User.id`, un invité par sa seule ligne', async () => {
    const { prisma } = database(readableStore({ participants: [senderInTarget(), guestIn(TARGET_CONVERSATION)] }));

    expect(await messageReaderOfParticipant(prisma, SENDER)).toEqual({ kind: 'user', userId: USER_ID });
    expect(await messageReaderOfParticipant(prisma, GUEST)).toEqual({ kind: 'anonymous', participantId: GUEST });
    expect(await messageReaderOfParticipant(prisma, UNKNOWN_PARTICIPANT)).toBeNull();
  });

  it.each(UNREADABLE)('ne rend rien à qui %s', async (_label, storeOf, participantId = SENDER) => {
    const { prisma } = database(storeOf());

    const readable = await loadMessageReadableByParticipant(prisma, { participantId, messageId: SOURCE, now: AT });

    expect(readable).toBeNull();
  });

  it('ne distingue pas un message illisible d’un message qui n’existe pas', async () => {
    const { prisma } = database(readableStore({ participants: [senderInTarget()] }));

    const forbidden = await loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: SOURCE, now: AT });
    const unknown = await loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: UNKNOWN_MESSAGE, now: AT });

    expect(forbidden).toBeNull();
    expect(unknown).toBeNull();
  });

  it('ferme sans rien lire quand l’expéditeur n’est pas nommé', async () => {
    const { prisma, raw } = database(readableStore());
    const participantRead = jest.spyOn(raw.participant, 'findUnique');

    const readable = await loadMessageReadableByParticipant(prisma, {
      participantId: undefined as unknown as string,
      messageId: SOURCE,
      now: AT,
    });

    expect(readable).toBeNull();
    expect(participantRead).not.toHaveBeenCalled();
  });

  it('PROPAGE une lecture d’accès qui échoue — elle n’autorise rien, l’appelant ferme', async () => {
    const { prisma, raw } = database(readableStore());
    raw.participant.findFirst = async () => {
      throw new Error('mongo down');
    };

    await expect(
      loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: SOURCE, now: AT }),
    ).rejects.toThrow('mongo down');
  });

  it.each([
    ['la participation', (raw: any) => { raw.participant.findFirst = async () => { throw new Error('mongo down'); }; }],
    ['le lien de partage', (raw: any) => { raw.conversationShareLink.findUnique = async () => { throw new Error('mongo down'); }; }],
    ['l’historique vidé', (raw: any) => { raw.userConversationPreferences.findFirst = async () => { throw new Error('mongo down'); }; }],
    ['les messages retirés de sa vue', (raw: any) => { raw.userMessageDeletion.findMany = async () => { throw new Error('mongo down'); }; }],
  ])('PROPAGE quand %s ne se lit pas : un envoi ne s’autorise d’aucune lecture ratée', async (_label, breakRead) => {
    const { prisma, raw } = database(
      readableStore({
        participants: [senderInTarget(), participantRow({ shareLinkId: LINK })],
        shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: null }],
      }),
    );
    breakRead(raw);

    await expect(
      loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: SOURCE, now: AT }),
    ).rejects.toThrow('mongo down');
  });

  it('laisse CHAQUE appelant dire ce que vaut un masquage personnel illisible — il n’y a pas de défaut', async () => {
    const { prisma, raw } = database(readableStore());
    raw.userMessageDeletion.findMany = async () => {
      throw new Error('mongo down');
    };
    const message = { id: SOURCE, conversationId: SOURCE_CONVERSATION, createdAt: new Date('2026-09-20T10:00:00.000Z'), deletedAt: null };
    const reader = { kind: 'user', userId: USER_ID } as const;

    // Le favori (décision #7377) : une courtoisie illisible sert.
    expect(await readerMayReadMessage(prisma, { reader, message, now: AT, whenHidingUnreadable: 'serve' })).toBe(true);
    // Un envoi qui désigne ce message : elle ferme.
    await expect(
      readerMayReadMessage(prisma, { reader, message, now: AT, whenHidingUnreadable: 'refuse' }),
    ).rejects.toThrow('mongo down');
  });

  it('suit le fil pour un lien de partage INTROUVABLE : il ne ferme ni ne borne (#3734 retire l’invité par un autre chemin)', async () => {
    const { prisma } = database(readableStore({ participants: [senderInTarget(), participantRow({ shareLinkId: LINK })] }));

    const readable = await loadMessageReadableByParticipant(prisma, { participantId: SENDER, messageId: SOURCE, now: AT });

    expect(readable).toMatchObject({ id: SOURCE });
  });
});

describe('le contenu a-t-il disparu POUR CE LECTEUR ? — la borne de la bulle, sans la grâce du service', () => {
  const flame = (overrides: Row = {}): Row =>
    sourceMessage({ senderId: AUTHOR_IN_SOURCE, effectFlags: EPHEMERAL_BIT, ephemeralDuration: 30, expiresAt: secondsFrom(AT, 7 * 24 * 3600), viewOnceBurnedAt: null, ...overrides });
  const afterReadFlame = (overrides: Row = {}): Row =>
    flame({ effectFlags: EPHEMERAL_BIT | AFTER_READ_BIT, ephemeralDuration: null, ...overrides });
  const viewOnce = (overrides: Row = {}): Row =>
    sourceMessage({ senderId: AUTHOR_IN_SOURCE, isViewOnce: true, effectFlags: VIEW_ONCE_BIT, viewOnceBurnedAt: null, ...overrides });

  const countdown = (participantId: string, deadline: Date): Row => ({ messageId: SOURCE, participantId, ephemeralExpiresAt: deadline });
  const opening = (participantId: string): Row => ({ messageId: SOURCE, participantId, viewedOnceAt: secondsFrom(AT, -60) });

  const readable = (store: Store, entries: Row[], participantId = SENDER) =>
    loadMessageReadableByParticipant(database(store, entries).prisma, { participantId, messageId: SOURCE, now: AT });
  const admit = (store: Store, entries: Row[], params: Row = {}) =>
    admitMessageForward(database(store, entries).prisma, {
      forwardedFromId: SOURCE, senderParticipantId: SENDER, at: AT, ...params,
    } as never);

  const UNAVAILABLE = { admitted: true, sourceUnavailable: true };
  const REFUSED_AS_UNAVAILABLE = { admitted: false, reason: 'forward-source-unavailable' };

  describe('flamme à durée', () => {
    it('reste transférable tant que le décompte de ce lecteur n’a pas démarré, avec sa durée bornée', async () => {
      const store = readableStore({ messages: [flame()] });

      expect(await admit(store, [])).toEqual({ admitted: true, imposes: { ephemeralDuration: 30, isBlurred: false } });
    });

    it('frontière : admise une seconde AVANT la fin de son décompte, indisponible une seconde APRÈS — alors que le fil la sert encore', async () => {
      const store = readableStore({ messages: [flame()] });
      const before = [countdown(READER_IN_SOURCE, secondsFrom(AT, 1))];
      const after = [countdown(READER_IN_SOURCE, secondsFrom(AT, -1))];

      expect(await admit(store, before)).toEqual({ admitted: true, imposes: { ephemeralDuration: 30, isBlurred: false } });
      expect(await admit(store, after)).toEqual(UNAVAILABLE);
      expect(await admit(store, after, { bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);

      // La borne de SERVICE, elle, tient encore une heure : le même message
      // reste servi à ce lecteur par le fil. Ce n'est pas elle qu'un transfert lit.
      const stillServed = isEphemeralServableToReader(
        flame() as never,
        { isSender: false, readerDeadline: secondsFrom(AT, -1), latestRecipientDeadline: secondsFrom(AT, -1) },
        AT,
      );
      expect(stillServed).toBe(true);
    });

    it('ferme à l’instant exact de l’échéance', async () => {
      const store = readableStore({ messages: [flame()] });

      expect(await readable(store, [countdown(READER_IN_SOURCE, AT)])).toBeNull();
    });

    it('ne se ferme pas pour ce lecteur parce que le décompte d’un AUTRE est fini', async () => {
      const store = readableStore({ messages: [flame()] });

      expect(await readable(store, [countdown(PEER_IN_SOURCE, secondsFrom(AT, -3600))])).toMatchObject({ id: SOURCE });
    });

    it('son AUTEUR la transfère tant que sa propre bulle vit — jusqu’à la plus tardive des échéances de ses destinataires', async () => {
      const authored = readableStore({ messages: [flame({ senderId: READER_IN_SOURCE })] });

      expect(await readable(authored, [])).toMatchObject({ id: SOURCE });
      expect(
        await readable(authored, [countdown(PEER_IN_SOURCE, secondsFrom(AT, -10)), countdown(AUTHOR_IN_SOURCE, secondsFrom(AT, 5))]),
      ).toMatchObject({ id: SOURCE });
      expect(await readable(authored, [countdown(PEER_IN_SOURCE, secondsFrom(AT, -10))])).toBeNull();
    });
  });

  describe('la copie transférée d’une flamme — durée ET après lecture (#9588)', () => {
    it('est partie de l’écran de son EXPÉDITEUR à « envoi + durée », quoi que dise l’heure de destruction', async () => {
      const copyOf = (sentSecondsAgo: number): Store =>
        readableStore({
          messages: [
            flame({
              senderId: READER_IN_SOURCE,
              effectFlags: EPHEMERAL_BIT | AFTER_READ_BIT,
              createdAt: secondsFrom(AT, -sentSecondsAgo),
            }),
          ],
        });

      // Envoyée il y a 60 s pour une durée de 30 s : elle a quitté son écran.
      expect(await admit(copyOf(60), [])).toEqual(UNAVAILABLE);
      // Envoyée il y a 10 s : il la lit encore, et c'est la loi de sortie qui la refuse.
      expect(await admit(copyOf(10), [])).toEqual({ admitted: false, reason: 'ephemeral-not-forwardable' });
    });
  });

  describe('flamme après lecture', () => {
    it('consommée par ce lecteur : indisponible — jamais le motif de sa nature', async () => {
      const store = readableStore({ messages: [afterReadFlame()] });
      const consumed = [countdown(READER_IN_SOURCE, secondsFrom(AT, -5))];

      expect(await admit(store, consumed)).toEqual(UNAVAILABLE);
      expect(await admit(store, consumed, { bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);
    });

    it('pas encore consommée : il la lit, et c’est la loi de sortie qui la refuse', async () => {
      const store = readableStore({ messages: [afterReadFlame()] });

      expect(await admit(store, [])).toEqual({ admitted: false, reason: 'ephemeral-not-forwardable' });
    });
  });

  describe('vue unique', () => {
    it('déjà ouverte par ce lecteur : indisponible — jamais le motif de sa nature', async () => {
      const store = readableStore({ messages: [viewOnce()] });
      const burnt = [opening(READER_IN_SOURCE)];

      expect(await admit(store, burnt)).toEqual(UNAVAILABLE);
      expect(await admit(store, burnt, { bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);
    });

    it('purgée pour tous : indisponible', async () => {
      const store = readableStore({ messages: [viewOnce({ viewOnceBurnedAt: secondsFrom(AT, -60) })] });

      expect(await admit(store, [])).toEqual(UNAVAILABLE);
    });

    it('ouverte par un AUTRE seulement : il la lit encore, et c’est la loi de sortie qui la refuse', async () => {
      const store = readableStore({ messages: [viewOnce()] });

      expect(await admit(store, [opening(PEER_IN_SOURCE)])).toEqual({ admitted: false, reason: 'view-once-not-forwardable' });
    });
  });

  describe('au-delà du PLAFOND des balayages de page — la décision lit SA ligne, jamais une tranche', () => {
    // Les balayages de page (`loadEphemeralReaderDeadlines`, `computeViewOnceStates`)
    // sont plafonnés et sans ordre : dans une conversation où plus de
    // destinataires que le plafond ont une ligne, celle du lecteur peut manquer
    // à la tranche lue — ce qui se lirait « décompte pas démarré », « pas
    // encore ouverte ». Un écran en retard pour une page ; pour une sortie, une
    // porte ouverte.
    const others = (count: number, entryOf: (participantId: string, index: number) => Row): Row[] =>
      Array.from({ length: count }, (_unused, index) => entryOf(`68c${index.toString(16).padStart(21, '0')}`, index));

    it('refuse le lecteur dont le décompte est fini, même quand sa ligne tombe après 2 500 autres', async () => {
      const store = readableStore({ messages: [flame()] });
      const entries = [
        ...others(2500, (participantId) => countdown(participantId, secondsFrom(AT, 3600))),
        countdown(READER_IN_SOURCE, secondsFrom(AT, -1)),
      ];

      expect(await admit(store, entries)).toEqual(UNAVAILABLE);
      expect(await admit(store, entries, { bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);
    });

    it('l’auteur suit la plus tardive échéance RÉELLE de ses destinataires, où qu’elle soit dans la collection', async () => {
      const authored = readableStore({ messages: [flame({ senderId: READER_IN_SOURCE })] });
      const allOver = others(2500, (participantId) => countdown(participantId, secondsFrom(AT, -60)));

      expect(await readable(authored, [...allOver, countdown(PEER_IN_SOURCE, secondsFrom(AT, 30))])).toMatchObject({ id: SOURCE });
      expect(await readable(authored, allOver)).toBeNull();
    });

    it('tient pour ouverte la vue unique que ce lecteur a ouverte, même quand sa ligne tombe après 5 200 autres', async () => {
      const store = readableStore({ messages: [viewOnce()] });
      const entries = [...others(5200, (participantId) => opening(participantId)), opening(READER_IN_SOURCE)];

      expect(await admit(store, entries)).toEqual(UNAVAILABLE);
      expect(await admit(store, entries, { bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);
    });
  });

  it.each([
    ['d’une flamme', () => flame()],
    ['d’une vue unique', () => viewOnce()],
  ])('ferme quand l’échéance ou l’ouverture %s ne se lit pas', async (_label, messageOf) => {
    const { prisma, raw, exitLawReads } = database(readableStore({ messages: [messageOf()] }));
    const down = async () => {
      throw new Error('mongo down');
    };
    raw.messageStatusEntry.findMany = down;
    raw.messageStatusEntry.findFirst = down;
    const admitBroken = (params: Row = {}) =>
      admitMessageForward(prisma, { forwardedFromId: SOURCE, senderParticipantId: SENDER, at: AT, ...params } as never);

    expect(await admitBroken()).toEqual(UNAVAILABLE);
    expect(await admitBroken({ bodyOnlyFromSource: true })).toEqual(REFUSED_AS_UNAVAILABLE);
    expect(exitLawReads()).toHaveLength(0);
  });
});

describe('admitMessageForward — le droit de lire passe AVANT ce que la source impose', () => {
  const admit = (prisma: never, params: Row = {}) =>
    admitMessageForward(prisma, { forwardedFromId: SOURCE, senderParticipantId: SENDER, at: AT, ...params } as never);

  it('admet la source qu’on lit, et la loi de sortie la juge ensuite', async () => {
    const { prisma, exitLawReads } = database(readableStore());

    expect(await admit(prisma)).toEqual({ admitted: true, imposes: null });
    expect(exitLawReads()).toHaveLength(1);
  });

  it.each(UNREADABLE)('tient pour INDISPONIBLE la source de qui %s — sans jamais consulter la loi de sortie', async (_label, storeOf, participantId = SENDER) => {
    const { prisma, exitLawReads } = database(storeOf());

    expect(await admit(prisma, { senderParticipantId: participantId })).toEqual({ admitted: true, sourceUnavailable: true });
    expect(await admit(prisma, { senderParticipantId: participantId, bodyOnlyFromSource: true })).toEqual({
      admitted: false,
      reason: 'forward-source-unavailable',
    });
    expect(exitLawReads()).toHaveLength(0);
  });

  it('rend le MÊME verdict pour une source illisible et pour un identifiant qui ne désigne rien', async () => {
    const { prisma } = database(readableStore({ participants: [senderInTarget()] }));

    for (const bodyOnlyFromSource of [false, true]) {
      const forbidden = await admit(prisma, { bodyOnlyFromSource });
      const unknown = await admit(prisma, { forwardedFromId: UNKNOWN_MESSAGE, bodyOnlyFromSource });
      expect(forbidden).toEqual(unknown);
    }
  });

  it.each([
    ['à vue unique', { isViewOnce: true, effectFlags: VIEW_ONCE_BIT }, 'view-once-not-forwardable'],
    ['une flamme après lecture', { effectFlags: EPHEMERAL_BIT | AFTER_READ_BIT, ephemeralDuration: null }, 'ephemeral-not-forwardable'],
    ['une échéance sans durée', { effectFlags: EPHEMERAL_BIT, ephemeralDuration: null }, 'ephemeral-not-forwardable'],
  ])('ne dit pas qu’une source est %s à qui ne la lit pas — le motif de nature serait un oracle', async (_label, nature, motive) => {
    const protectedSource = sourceMessage({ senderId: AUTHOR_IN_SOURCE, viewOnceBurnedAt: null, ...nature });
    const outsider = database(readableStore({ messages: [protectedSource], participants: [senderInTarget()] }));
    const member = database(readableStore({ messages: [protectedSource] }));

    for (const bodyOnlyFromSource of [false, true]) {
      const verdict = await admit(outsider.prisma, { bodyOnlyFromSource });
      expect(verdict).toEqual(await admit(outsider.prisma, { forwardedFromId: UNKNOWN_MESSAGE, bodyOnlyFromSource }));
      expect(JSON.stringify(verdict)).not.toContain('not-forwardable');
    }
    expect(outsider.exitLawReads()).toHaveLength(0);
    expect(await admit(member.prisma, { bodyOnlyFromSource: true })).toEqual({ admitted: false, reason: motive });
  });

  it('ferme quand la lecture d’accès échoue — ce droit n’a pas de best-effort', async () => {
    const { prisma, raw, exitLawReads } = database(readableStore());
    raw.participant.findFirst = async () => {
      throw new Error('mongo down');
    };

    expect(await admit(prisma)).toEqual({ admitted: true, sourceUnavailable: true });
    expect(await admit(prisma, { bodyOnlyFromSource: true })).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
    expect(exitLawReads()).toHaveLength(0);
  });

  it('ferme quand l’expéditeur n’est pas remis au garde', async () => {
    const { prisma } = database(readableStore());

    expect(await admit(prisma, { senderParticipantId: undefined })).toEqual({ admitted: true, sourceUnavailable: true });
  });

  describe('la conversation de provenance', () => {
    it('est prouvée quand l’envoi nomme celle où la source vit', async () => {
      const { prisma } = database(readableStore());

      expect(await admit(prisma, { forwardedFromConversationId: SOURCE_CONVERSATION })).toEqual({
        admitted: true,
        imposes: null,
        provenanceConversationId: SOURCE_CONVERSATION,
      });
    });

    it('n’est pas prouvée quand l’envoi en nomme une autre, ni quand il n’en nomme aucune', async () => {
      const { prisma } = database(readableStore());

      expect(await admit(prisma, { forwardedFromConversationId: TARGET_CONVERSATION })).toEqual({ admitted: true, imposes: null });
      expect(await admit(prisma)).toEqual({ admitted: true, imposes: null });
    });

    it('n’est jamais prouvée pour une source indisponible', async () => {
      const { prisma } = database(readableStore({ participants: [senderInTarget()] }));

      expect(await admit(prisma, { forwardedFromConversationId: SOURCE_CONVERSATION })).toEqual({
        admitted: true,
        sourceUnavailable: true,
      });
    });
  });
});

describe('forwardedCopyRequest — la provenance que l’envoi garde est celle que l’admission a prouvée', () => {
  it('garde la conversation prouvée', () => {
    expect(
      forwardedCopyRequest(
        { forwardedFromId: SOURCE },
        { admitted: true, imposes: null, provenanceConversationId: SOURCE_CONVERSATION },
      ),
    ).toEqual({ forwardImposes: null, forwardedFromConversationId: SOURCE_CONVERSATION });
  });

  it('POSE `undefined` par-dessus la conversation déclarée quand rien n’est prouvé', () => {
    const request = { forwardedFromId: SOURCE, forwardedFromConversationId: TARGET_CONVERSATION };

    const sent = { ...request, ...forwardedCopyRequest(request, { admitted: true, imposes: null }) };

    expect(sent.forwardedFromId).toBe(SOURCE);
    expect(sent.forwardedFromConversationId).toBeUndefined();
  });

  it('retire la conversation déclarée d’un envoi qui ne nomme AUCUN message source', () => {
    const request: { forwardedFromId?: string; forwardedFromConversationId?: string } = {
      forwardedFromConversationId: TARGET_CONVERSATION,
    };

    const sent = { ...request, ...forwardedCopyRequest(request, { admitted: true }) };

    expect(sent.forwardedFromConversationId).toBeUndefined();
  });

  it('retire les deux références d’une source indisponible', () => {
    const request = { forwardedFromId: SOURCE, forwardedFromConversationId: SOURCE_CONVERSATION };

    const sent = { ...request, ...forwardedCopyRequest(request, { admitted: true, sourceUnavailable: true }) };

    expect(sent.forwardedFromId).toBeUndefined();
    expect(sent.forwardedFromConversationId).toBeUndefined();
  });
});
