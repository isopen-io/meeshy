/**
 * LE DROIT DE LIRE PLUSIEURS MESSAGES D'UNE CONVERSATION (#9899) —
 * `readerMayReadMessages` est la forme ENSEMBLISTE de `readerMayReadMessage` :
 * la même loi, lue une fois pour la conversation au lieu d'une fois par message.
 *
 * Deux propriétés, et chacune a son témoin :
 *
 * - l'ÉQUIVALENCE — pour tout lecteur et tout message, le verdict de la forme
 *   ensembliste est celui de la forme unitaire. Une seconde écriture de la loi
 *   divergerait au premier plancher ajouté ; la table de scénarios confronte
 *   donc les deux à chaque ligne, ET fige le verdict attendu (deux formes qui
 *   se tromperaient ensemble ne passeraient pas).
 * - le COÛT — la participation, le lien, le plancher et le masquage se lisent
 *   une fois, que la page porte un message ou cent. C'est la raison d'être de
 *   la forme : sans elle, une lecture de cent messages coûtait trois cents
 *   requêtes.
 *
 * La base est celle du favori de message : une base en mémoire qui ÉVALUE les
 * `where`, donc qui laisse tomber un témoin quand la requête cesse de garder.
 *
 * @jest-environment node
 */

import { afterEach, describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  CONV_A,
  CONV_B,
  MSG_1,
  MSG_2,
  MSG_3,
  USER_ID,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  type Store,
} from '../../../__tests__/unit/routes/me/starred-messages-harness';
import type { HistoryReader } from '../../historyFloor';
import { readerMayReadMessage, readerMayReadMessages } from '../messageReadAccess';

type Row = Record<string, unknown>;

const AT = new Date('2026-09-21T12:00:00.000Z');
const BETWEEN_FIRST_AND_SECOND = new Date('2026-09-20T10:30:00.000Z');
const BETWEEN_SECOND_AND_THIRD = new Date('2026-09-20T11:30:00.000Z');
const LINK = '68b0000000000000000000e9';
const GUEST = '68b0000000000000000000f1';
const FOREIGN_MESSAGE = '68b000000000000000000199';

const USER_READER: HistoryReader = { kind: 'user', userId: USER_ID };
const GUEST_READER: HistoryReader = { kind: 'anonymous', participantId: GUEST };

const thread = (overrides: Record<string, Row> = {}): Row[] =>
  [
    [MSG_1, '2026-09-20T10:00:00.000Z'],
    [MSG_2, '2026-09-20T11:00:00.000Z'],
    [MSG_3, '2026-09-20T12:00:00.000Z'],
  ].map(([id, at]) => messageRow({ id, createdAt: new Date(at), ...overrides[id] }));

const guestIn = (overrides: Row = {}): Row =>
  participantRow({ id: GUEST, userId: null, user: null, ...overrides });

const storeOf = (overrides: Partial<Store> = {}): Store =>
  makeStore({ messages: thread(), participants: [participantRow()], ...overrides });

type Scenario = {
  readonly label: string;
  readonly store: Store;
  readonly reader?: HistoryReader;
  readonly readable: readonly string[];
};

const SCENARIOS: readonly Scenario[] = [
  { label: 'un participant actif lit tout le fil', store: storeOf(), readable: [MSG_1, MSG_2, MSG_3] },
  {
    label: 'un plancher d’historique le borne au premier message qu’il a le droit de lire',
    store: storeOf({ participants: [participantRow({ historyVisibleFrom: BETWEEN_FIRST_AND_SECOND })] }),
    readable: [MSG_2, MSG_3],
  },
  {
    label: 'il a retiré un message de sa vue',
    store: storeOf({ deletions: [{ userId: USER_ID, messageId: MSG_2 }] }),
    readable: [MSG_1, MSG_3],
  },
  {
    label: 'il a vidé son historique après le deuxième message',
    store: storeOf({ prefs: [{ userId: USER_ID, conversationId: CONV_A, clearHistoryBefore: BETWEEN_SECOND_AND_THIRD }] }),
    readable: [MSG_3],
  },
  {
    label: 'un message est supprimé pour tous',
    store: storeOf({ messages: thread({ [MSG_2]: { deletedAt: new Date('2026-09-20T11:30:00.000Z') } }) }),
    readable: [MSG_1, MSG_3],
  },
  {
    label: 'il en est banni, sa ligne restée active',
    store: storeOf({ participants: [participantRow({ bannedAt: new Date('2026-09-10T00:00:00.000Z') })] }),
    readable: [],
  },
  {
    label: 'il a quitté la conversation',
    store: storeOf({ participants: [participantRow({ isActive: false })] }),
    readable: [],
  },
  { label: 'il n’y a jamais participé', store: storeOf({ participants: [] }), readable: [] },
  {
    label: 'il y est entré par un lien de partage échu',
    store: storeOf({
      participants: [participantRow({ shareLinkId: LINK })],
      shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: new Date('2026-01-01T00:00:00.000Z') }],
    }),
    readable: [],
  },
  {
    label: 'il y est entré par un lien qui n’ouvre pas l’historique, entre le premier et le deuxième message',
    store: storeOf({
      participants: [participantRow({ shareLinkId: LINK, joinedAt: BETWEEN_FIRST_AND_SECOND })],
      shareLinks: [{ id: LINK, allowViewHistory: false, expiresAt: null }],
    }),
    readable: [MSG_2, MSG_3],
  },
  {
    label: 'c’est un invité anonyme, lu par sa seule ligne',
    store: storeOf({ participants: [guestIn()] }),
    reader: GUEST_READER,
    readable: [MSG_1, MSG_2, MSG_3],
  },
  {
    label: 'c’est un invité anonyme dont la ligne est éteinte',
    store: storeOf({ participants: [guestIn({ isActive: false })] }),
    reader: GUEST_READER,
    readable: [],
  },
];

function database(store: Store) {
  const base = makePrisma(store);
  const reads = { participant: 0, shareLink: 0, preferences: 0, deletions: 0 };
  const prisma = {
    ...base,
    participant: {
      ...base.participant,
      findFirst: async (args: { where?: Row }) => {
        reads.participant += 1;
        return base.participant.findFirst(args);
      },
    },
    conversationShareLink: {
      ...base.conversationShareLink,
      findUnique: async (args: { where: { id: string } }) => {
        reads.shareLink += 1;
        return base.conversationShareLink.findUnique(args);
      },
    },
    userConversationPreferences: {
      ...base.userConversationPreferences,
      findFirst: async (args: { where?: Row }) => {
        reads.preferences += 1;
        return base.userConversationPreferences.findFirst(args);
      },
    },
    userMessageDeletion: {
      ...base.userMessageDeletion,
      findMany: async (args: { where?: Row }) => {
        reads.deletions += 1;
        return base.userMessageDeletion.findMany(args);
      },
    },
  };
  return { prisma, reads };
}

const readableByBatch = async (scenario: Scenario): Promise<readonly string[]> => {
  const { prisma } = database(scenario.store);
  const readable = await readerMayReadMessages(prisma as never, {
    reader: scenario.reader ?? USER_READER,
    conversationId: CONV_A,
    messages: scenario.store.messages as never,
    now: AT,
    whenHidingUnreadable: 'refuse',
  });
  return scenario.store.messages.map((message) => String(message.id)).filter((id) => readable.has(id));
};

const readableOneByOne = async (scenario: Scenario): Promise<readonly string[]> => {
  const { prisma } = database(scenario.store);
  const verdicts = await Promise.all(
    scenario.store.messages.map(async (message) => ({
      id: String(message.id),
      readable: await readerMayReadMessage(prisma as never, {
        reader: scenario.reader ?? USER_READER,
        message: message as never,
        now: AT,
        whenHidingUnreadable: 'refuse',
      }),
    })),
  );
  return verdicts.filter((verdict) => verdict.readable).map((verdict) => verdict.id);
};

describe('readerMayReadMessages — la loi de lecture de readerMayReadMessage, pour une page', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(SCENARIOS.map((scenario) => [scenario.label, scenario] as const))(
    'rend ce que la loi laisse lire quand %s',
    async (_label, scenario) => {
      expect(await readableByBatch(scenario)).toEqual(scenario.readable);
    },
  );

  it.each(SCENARIOS.map((scenario) => [scenario.label, scenario] as const))(
    'rend EXACTEMENT les verdicts de la forme unitaire quand %s',
    async (_label, scenario) => {
      expect(await readableByBatch(scenario)).toEqual(await readableOneByOne(scenario));
    },
  );

  it('ne lit pas un message d’une AUTRE conversation que celle dont on juge la participation', async () => {
    const store = storeOf({
      messages: [...thread(), messageRow({ id: FOREIGN_MESSAGE, conversationId: CONV_B })],
      participants: [participantRow(), participantRow({ id: '68b000000000000000000012', conversationId: CONV_B })],
    });
    const { prisma } = database(store);

    const readable = await readerMayReadMessages(prisma as never, {
      reader: USER_READER,
      conversationId: CONV_A,
      messages: store.messages as never,
      now: AT,
      whenHidingUnreadable: 'refuse',
    });

    expect([...readable].sort()).toEqual([MSG_1, MSG_2, MSG_3]);
  });

  it('lit la participation, le lien, l’historique vidé et les retraits UNE fois, quel que soit le nombre de messages', async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      messageRow({ id: `68b0000000000000000002${String(index).padStart(2, '0')}`, createdAt: new Date(`2026-09-20T10:${String(index).padStart(2, '0')}:00.000Z`) }),
    );
    const store = storeOf({
      messages: many,
      participants: [participantRow({ shareLinkId: LINK })],
      shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: null }],
    });
    const { prisma, reads } = database(store);

    const readable = await readerMayReadMessages(prisma as never, {
      reader: USER_READER,
      conversationId: CONV_A,
      messages: many as never,
      now: AT,
      whenHidingUnreadable: 'refuse',
    });

    expect(readable.size).toBe(40);
    expect(reads).toEqual({ participant: 1, shareLink: 1, preferences: 1, deletions: 1 });
  });

  it('ne lit RIEN quand il n’y a aucun message à juger', async () => {
    const { prisma, reads } = database(storeOf());

    const readable = await readerMayReadMessages(prisma as never, {
      reader: USER_READER,
      conversationId: CONV_A,
      messages: [],
      now: AT,
      whenHidingUnreadable: 'refuse',
    });

    expect(readable.size).toBe(0);
    expect(reads).toEqual({ participant: 0, shareLink: 0, preferences: 0, deletions: 0 });
  });

  it('ne lit RIEN pour des messages tous supprimés — il n’y a rien à juger', async () => {
    const gone = { deletedAt: new Date('2026-09-20T13:00:00.000Z') };
    const store = storeOf({ messages: thread({ [MSG_1]: gone, [MSG_2]: gone, [MSG_3]: gone }) });
    const { prisma, reads } = database(store);

    const readable = await readerMayReadMessages(prisma as never, {
      reader: USER_READER,
      conversationId: CONV_A,
      messages: store.messages as never,
      now: AT,
      whenHidingUnreadable: 'refuse',
    });

    expect(readable.size).toBe(0);
    expect(reads).toEqual({ participant: 0, shareLink: 0, preferences: 0, deletions: 0 });
  });

  it('PROPAGE un masquage illisible quand l’appelant refuse, et le sert quand il sert — comme la forme unitaire', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = storeOf({ deletions: [{ userId: USER_ID, messageId: MSG_2 }] });
    const failing = () => {
      const { prisma } = database(store);
      return {
        ...prisma,
        userMessageDeletion: {
          findMany: async () => {
            throw new Error('mongo down');
          },
        },
      };
    };

    await expect(
      readerMayReadMessages(failing() as never, {
        reader: USER_READER,
        conversationId: CONV_A,
        messages: store.messages as never,
        now: AT,
        whenHidingUnreadable: 'refuse',
      }),
    ).rejects.toThrow('mongo down');

    const served = await readerMayReadMessages(failing() as never, {
      reader: USER_READER,
      conversationId: CONV_A,
      messages: store.messages as never,
      now: AT,
      whenHidingUnreadable: 'serve',
    });
    expect([...served].sort()).toEqual([MSG_1, MSG_2, MSG_3]);
  });
});
