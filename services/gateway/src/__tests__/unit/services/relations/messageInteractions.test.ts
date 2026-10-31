/**
 * LES MESSAGES COMPTENT POUR LA PAIRE (#13932) — dans une conversation directe,
 * et pour les réponses et mentions visant l'autre en groupe. L'audio compte par
 * le `messageType` déclaré (D-2), jamais par le contenu.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { noteMessageInteractions } from '../../../../services/relations/messageInteractions';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const ME = '5f0000000000000000000001';
const PEER = '5f0000000000000000000002';
const THIRD = '5f0000000000000000000003';
const AT = new Date('2026-10-31T10:00:00Z');

const participants = (...ids: string[]) => ids.map((userId) => ({ userId, type: 'user', isActive: true }));

const setup = (conversation: { type: string; participants: ReturnType<typeof participants> }) =>
  pairInteractionStore({ conversations: [{ id: 'cv1', ...conversation }] });

const settle = () => new Promise((resolve) => setImmediate(resolve));

const run = async (store: ReturnType<typeof setup>, over: Partial<Parameters<typeof noteMessageInteractions>[1]> = {}) => {
  noteMessageInteractions(store.prisma, {
    conversationId: 'cv1', senderUserId: ME, messageSource: 'user', messageType: 'text', replyToAuthorUserId: null, mentionedUserIds: [], at: AT, ...over,
  });
  await settle();
  await settle();
  return store.days();
};

describe('noteMessageInteractions', () => {
  it('un message dans une conversation directe compte envers l’autre participant', async () => {
    const days = await run(setup({ type: 'direct', participants: participants(ME, PEER) }));
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ userLowId: ME, userHighId: PEER, byLowMessage: 1 });
  });

  it('un vocal compte en AUDIO seulement, jamais en plus en message', async () => {
    const days = await run(setup({ type: 'direct', participants: participants(ME, PEER) }), { messageType: 'audio' });
    expect(days[0]).toMatchObject({ byLowAudio: 1 });
    expect(days[0].byLowMessage).toBeUndefined();
  });

  it('une réponse à une story ou un mood compte en storyReply, un vocal en réponse reste un audio', async () => {
    const direct = { type: 'direct', participants: participants(ME, PEER) };
    expect((await run(setup(direct), { isStoryReply: true }))[0]).toMatchObject({ byLowStoryReply: 1 });
    const voice = await run(setup(direct), { isStoryReply: true, messageType: 'audio' });
    expect(voice[0]).toMatchObject({ byLowAudio: 1 });
    expect(voice[0].byLowStoryReply).toBeUndefined();
  });

  it('compte le type DÉCLARÉ d’une conversation chiffrée sans jamais lire le contenu (D-2)', async () => {
    const days = await run(setup({ type: 'direct', participants: participants(ME, PEER) }), { messageType: 'audio', content: 'secret' } as never);
    expect(JSON.stringify(days)).not.toContain('secret');
    expect(days[0].byLowAudio).toBe(1);
  });

  it('en groupe, un message ordinaire ne compte pour personne', async () => {
    const days = await run(setup({ type: 'group', participants: participants(ME, PEER, THIRD) }));
    expect(days).toHaveLength(0);
  });

  it('en groupe, répondre à quelqu’un compte envers lui seul', async () => {
    const days = await run(setup({ type: 'group', participants: participants(ME, PEER, THIRD) }), { replyToAuthorUserId: THIRD });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ userLowId: ME, userHighId: THIRD, byLowMessage: 1 });
  });

  it('en groupe, mentionner quelqu’un compte une mention envers lui', async () => {
    const days = await run(setup({ type: 'group', participants: participants(ME, PEER, THIRD) }), { mentionedUserIds: [PEER, THIRD] });
    expect(days.map((d) => [d.userHighId, d.byLowMention])).toEqual([[PEER, 1], [THIRD, 1]]);
  });

  it('une mention de celui à qui l’on répond ne compte pas deux fois pour le même message', async () => {
    const days = await run(setup({ type: 'group', participants: participants(ME, PEER, THIRD) }), { replyToAuthorUserId: PEER, mentionedUserIds: [PEER] });
    expect(days).toHaveLength(1);
    expect(days[0].byLowMention).toBeUndefined();
    expect(days[0].byLowMessage).toBe(1);
  });

  it('dans une conversation directe, la mention de l’autre ne s’ajoute pas au message', async () => {
    const days = await run(setup({ type: 'direct', participants: participants(ME, PEER) }), { mentionedUserIds: [PEER] });
    expect(days[0].byLowMention).toBeUndefined();
    expect(days[0].byLowMessage).toBe(1);
  });

  it('seul un message écrit par la personne compte : ni un agent à son nom, ni le système', async () => {
    const direct = { type: 'direct', participants: participants(ME, PEER) };
    expect(await run(setup(direct), { messageSource: 'agent' })).toHaveLength(0);
    expect(await run(setup(direct), { messageSource: 'system' })).toHaveLength(0);
  });

  it('un expéditeur anonyme (sans utilisateur) ne compte pour personne', async () => {
    const days = await run(setup({ type: 'direct', participants: participants(ME, PEER) }), { senderUserId: null });
    expect(days).toHaveLength(0);
  });

  it('on ne se compte pas soi-même : répondre à son propre message, se mentionner', async () => {
    const days = await run(setup({ type: 'group', participants: participants(ME, PEER) }), { replyToAuthorUserId: ME, mentionedUserIds: [ME] });
    expect(days).toHaveLength(0);
  });

  it('une conversation introuvable ne casse rien', async () => {
    const store = pairInteractionStore();
    expect(await run(store as never)).toHaveLength(0);
  });
});
