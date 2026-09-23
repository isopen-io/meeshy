/**
 * #7593 — « Demo a retiré Bob », « Bob a quitté la conversation », « Nom du
 * groupe modifié », « Photo du groupe modifiée » : un avis de vie du groupe est
 * un message SYSTÈME attribué à l'ACTEUR, dont le sens vit dans `metadata`,
 * qui avance l'horloge du fil et part par la diffusion d'un message ordinaire
 * (`message:new` + `conversation:updated`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { parseConversationNotice } from '@meeshy/shared/utils/conversation-notice';
import { postConversationNotice } from '../../../../services/conversations/conversationNotice';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV_ID = '507f1f77bcf86cd799439022';
const CREATED_AT = new Date('2026-09-23T10:00:00.000Z');
const demo = { participantId: '507f1f77bcf86cd799439033', displayName: 'Demo' };
const bob = { participantId: '507f1f77bcf86cd799439044', displayName: 'Bob' };

function harness(overrides: { create?: jest.Mock; broadcast?: jest.Mock } = {}) {
  const create = overrides.create ?? jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'msg-1', createdAt: CREATED_AT, ...data }));
  const update = jest.fn<any>().mockResolvedValue(undefined);
  const broadcast = overrides.broadcast ?? jest.fn<any>().mockResolvedValue(undefined);
  return { deps: { prisma: { message: { create }, conversation: { update } }, broadcast }, create, update, broadcast };
}

const NOTICES = [
  { notice: { kind: 'member-removed', actor: demo, target: bob }, content: 'Demo a retiré Bob', key: 'system.member-removed' },
  { notice: { kind: 'member-left', actor: bob }, content: 'Bob a quitté la conversation', key: 'system.member-left' },
  { notice: { kind: 'conversation-renamed', actor: demo }, content: 'Demo a modifié le nom du groupe', key: 'system.conversation-renamed' },
  { notice: { kind: 'conversation-image', actor: demo }, content: 'Demo a modifié la photo du groupe', key: 'system.conversation-image' },
] as const;

describe('postConversationNotice', () => {
  it.each(NOTICES)('$notice.kind : message système attribué à l’acteur, sens dans metadata', async ({ notice, content, key }) => {
    const h = harness();
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice });

    const data = (h.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      conversationId: CONV_ID,
      senderId: notice.actor.participantId,
      messageType: 'system',
      messageSource: 'system',
      originalLanguage: 'fr',
      content,
    });
    expect(parseConversationNotice(data.metadata)).toEqual(notice);
    expect(systemEventFromMessage(data)?.key).toBe(key);
  });

  it('avance l’horloge du fil sur celle du message, puis le diffuse', async () => {
    const h = harness();
    const notice = { kind: 'member-left', actor: bob } as const;
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice });

    expect(h.update).toHaveBeenCalledWith({ where: { id: CONV_ID }, data: { lastMessageAt: CREATED_AT } });
    expect(h.broadcast).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1', metadata: notice }), CONV_ID);
  });

  it('ne rejette jamais : une écriture qui échoue rend null sans diffuser', async () => {
    const h = harness({ create: jest.fn<any>().mockRejectedValue(new Error('mongo down')) });
    await expect(
      postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: { kind: 'member-left', actor: bob } }),
    ).resolves.toBeNull();
    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it('une diffusion qui échoue laisse l’avis persisté', async () => {
    const h = harness({ broadcast: jest.fn<any>().mockRejectedValue(new Error('socket down')) });
    const message = await postConversationNotice(h.deps as never, {
      conversationId: CONV_ID,
      notice: { kind: 'conversation-renamed', actor: demo },
    });
    expect(message).toMatchObject({ id: 'msg-1' });
  });
});
