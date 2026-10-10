/**
 * Un appel est une ACTIVITÉ (#9026) : son message « en cours » (début) et son
 * résumé (fin, manqué, refusé — créé OU édité en place) remontent la
 * conversation en tête pour TOUS ses participants, au rechargement
 * (`lastActivityAt`) comme en direct (`listRankAt`).
 *
 * Les deux diffuseurs de `CallEventsHandler` sont les SEULS chemins par
 * lesquels un message d'appel atteint les clients (`postLiveCallMessage`,
 * `postCallSummary`) : les envelopper, c'est couvrir chaque issue de l'appel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockAnnounce = jest.fn<(args: Record<string, unknown>) => Promise<void>>();
jest.mock('../../services/conversations/conversationActivity', () => ({
  announceConversationActivity: (args: Record<string, unknown>) => mockAnnounce(args),
}));

import { wireCallMessageBroadcasters } from '../callMessageBroadcasters';

type Broadcaster = (message: unknown, conversationId: string) => Promise<void>;

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const INITIATOR_USER_ID = '507f1f77bcf86cd799439022';

function wire(overrides: { broadcastMessage?: Broadcaster; broadcastMessageEdited?: Broadcaster } = {}) {
  const installed: { created?: Broadcaster; updated?: Broadcaster } = {};
  const handler = {
    setMessageBroadcaster: (b: Broadcaster) => { installed.created = b; },
    setMessageUpdateBroadcaster: (b: Broadcaster) => { installed.updated = b; },
  };
  const io = { to: jest.fn() };
  const prisma = {};
  const broadcastMessage = jest.fn<Broadcaster>(overrides.broadcastMessage ?? (async () => undefined));
  const broadcastMessageEdited = jest.fn<Broadcaster>(overrides.broadcastMessageEdited ?? (async () => undefined));
  wireCallMessageBroadcasters({
    handler,
    prisma: prisma as never,
    getIO: () => io as never,
    broadcastMessage,
    broadcastMessageEdited,
  });
  return { installed, io, prisma, broadcastMessage, broadcastMessageEdited };
}

const callMessage = (sender: Record<string, unknown> | null = { id: 'p-init', userId: INITIATOR_USER_ID }) => ({
  id: 'm1',
  conversationId: CONVERSATION_ID,
  senderId: 'p-init',
  sender,
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('wireCallMessageBroadcasters — un appel remonte la conversation pour tous (#9026)', () => {
  beforeEach(() => {
    mockAnnounce.mockReset();
    mockAnnounce.mockResolvedValue(undefined);
  });

  it('le message « en cours » (début d’appel) est diffusé PUIS annoncé comme activité', async () => {
    const { installed, io, prisma, broadcastMessage } = wire();
    const before = Date.now();

    await installed.created!(callMessage(), CONVERSATION_ID);
    await flush();

    expect(broadcastMessage).toHaveBeenCalledWith(callMessage(), CONVERSATION_ID);
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    const [args] = mockAnnounce.mock.calls[0];
    expect(args).toMatchObject({ prisma, io, conversationId: CONVERSATION_ID, updatedByUserId: INITIATOR_USER_ID });
    expect((args.at as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('le résumé édité en place (fin, manqué) est diffusé en édition PUIS annoncé comme activité', async () => {
    const { installed, broadcastMessageEdited } = wire();

    await installed.updated!(callMessage(), CONVERSATION_ID);
    await flush();

    expect(broadcastMessageEdited).toHaveBeenCalledWith(callMessage(), CONVERSATION_ID);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONVERSATION_ID }));
  });

  it('un initiateur sans compte est désigné par son Participant.id', async () => {
    const { installed } = wire();

    await installed.created!(callMessage(null), CONVERSATION_ID);
    await flush();

    expect(mockAnnounce).toHaveBeenCalledWith(expect.objectContaining({ updatedByUserId: 'p-init' }));
  });

  it("une diffusion qui lève annonce QUAND MÊME l'activité, et rend son erreur (le réessai de l'appelant)", async () => {
    const { installed } = wire({ broadcastMessage: async () => { throw new Error('adapter down'); } });

    await expect(installed.created!(callMessage(), CONVERSATION_ID)).rejects.toThrow('adapter down');
    await flush();

    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });

  it("une annonce qui échoue ne fait pas échouer la diffusion", async () => {
    mockAnnounce.mockRejectedValue(new Error('mongo down'));
    const { installed } = wire();

    await expect(installed.updated!(callMessage(), CONVERSATION_ID)).resolves.toBeUndefined();
    await flush();
  });
});
