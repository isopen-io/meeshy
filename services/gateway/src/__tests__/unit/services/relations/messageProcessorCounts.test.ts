/**
 * Le câblage du MessageProcessor (#13932) : une fois les mentions traitées, le
 * FAIT du message compte pour la paire — jamais son contenu.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const ME = '5f0000000000000000000001';
const PEER = '5f0000000000000000000002';
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const run = async (message: Record<string, unknown>) => {
  const store = pairInteractionStore({
    conversations: [{ id: 'cv1', type: 'direct', participants: [{ userId: ME, type: 'user', isActive: true }, { userId: PEER, type: 'user', isActive: true }] }],
  });
  const processor = new MessageProcessor(store.prisma as never);
  await (processor as unknown as {
    handleMentionsAndNotifications(d: unknown, m: unknown, c: string): Promise<void>;
  }).handleMentionsAndNotifications({ senderId: 'p-me', conversationId: 'cv1' }, message, 'texte');
  await settle();
  return store.days();
};

describe('MessageProcessor — les messages comptent pour la paire', () => {
  it('un message texte d’une conversation directe compte envers l’autre', async () => {
    const days = await run({ id: 'm1', messageType: 'text', sender: { userId: ME } });
    expect(days[0]).toMatchObject({ userLowId: ME, userHighId: PEER, byLowMessage: 1 });
  });

  it('un vocal déclaré compte en audio, une réponse à une story en storyReply', async () => {
    expect((await run({ id: 'm2', messageType: 'audio', sender: { userId: ME } }))[0]).toMatchObject({ byLowAudio: 1 });
    expect((await run({ id: 'm3', messageType: 'text', storyReplyToId: 's1', sender: { userId: ME } }))[0]).toMatchObject({ byLowStoryReply: 1 });
  });
});
