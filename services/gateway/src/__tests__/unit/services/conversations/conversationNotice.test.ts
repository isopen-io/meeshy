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
import { noticeDelivery, postConversationNotice, postSystemNotice } from '../../../../services/conversations/conversationNotice';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV_ID = '507f1f77bcf86cd799439022';
const CREATED_AT = new Date('2026-09-23T10:00:00.000Z');
const demo = { participantId: '507f1f77bcf86cd799439033', displayName: 'Demo' };
const bob = { participantId: '507f1f77bcf86cd799439044', displayName: 'Bob' };

type HarnessOverrides = {
  create?: jest.Mock;
  broadcast?: jest.Mock;
  deletedAt?: Date;
  silent?: boolean;
  creators?: ReadonlyArray<{ id: string; userId: string | null }>;
  count?: jest.Mock;
  deliverTo?: jest.Mock | null;
};

function harness(overrides: HarnessOverrides = {}) {
  const create = overrides.create ?? jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'msg-1', createdAt: CREATED_AT, ...data }));
  const update = jest.fn<any>().mockResolvedValue(undefined);
  const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn<any>().mockResolvedValue({ deletedAt: overrides.deletedAt ?? null });
  const broadcast = overrides.broadcast ?? jest.fn<any>().mockResolvedValue(undefined);
  const count = overrides.count ?? jest.fn<any>().mockResolvedValue(overrides.silent ? 1 : 0);
  const findMany = jest.fn<any>().mockResolvedValue(overrides.creators ?? []);
  const deliverTo = overrides.deliverTo === null ? undefined : overrides.deliverTo ?? jest.fn<any>().mockResolvedValue(undefined);
  return {
    deps: { prisma: { message: { create, updateMany }, conversation: { update, findUnique, count }, participant: { findMany } }, broadcast, ...(deliverTo ? { deliverTo } : {}) },
    create, update, updateMany, broadcast, count, findMany, deliverTo,
  };
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

  it('#14643 — un avis écrit pendant l’obsolescence de sa conversation naît effacé et ne part pas', async () => {
    const obsoletedAt = new Date('2026-11-02T10:00:00.000Z');
    const h = harness({ deletedAt: obsoletedAt });
    const message = await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: { kind: 'member-left', actor: bob } });

    expect(message).toBeNull();
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      data: { deletedAt: obsoletedAt },
    });
    expect(h.update).not.toHaveBeenCalled();
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

describe('postSystemNotice — un avis SILENCIEUX (#9629, #9630)', () => {
  it('porte son échéance, n’avance pas l’horloge du fil et ne diffuse pas quand on le lui demande', async () => {
    const h = harness();
    const expiresAt = new Date('2026-09-24T10:00:00.000Z');
    const message = await postSystemNotice(h.deps as never, {
      conversationId: CONV_ID,
      senderParticipantId: demo.participantId,
      content: 'Demo a capturé l’éphémère',
      metadata: { kind: 'content-capture' },
      expiresAt,
      advanceConversationClock: false,
    });

    expect((h.create.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({ expiresAt });
    expect(h.update).not.toHaveBeenCalled();
    expect(message).toMatchObject({ id: 'msg-1', expiresAt });
  });

  it('n’écrit aucune échéance quand on ne lui en donne pas', async () => {
    const h = harness();
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: { kind: 'member-left', actor: bob } });
    expect((h.create.mock.calls[0][0] as { data: Record<string, unknown> }).data).not.toHaveProperty('expiresAt');
  });
});

describe('postSystemNotice — un groupe encore SILENCIEUX ne s’annonce pas par ses avis (#14659)', () => {
  const creator = { id: '507f1f77bcf86cd799439055', userId: '507f1f77bcf86cd799439066' };
  const rename = { kind: 'conversation-renamed', actor: demo } as const;

  it('un groupe silencieux avec un créateur : l’avis ne part que vers le créateur, jamais vers la room', async () => {
    const h = harness({ silent: true, creators: [creator] });
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: rename });

    expect(h.count).toHaveBeenCalledWith({ where: { id: CONV_ID, type: { in: ['direct', 'group'] }, firstMessageSentAt: null } });
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversationId: CONV_ID, role: 'creator', isActive: true }),
    }));
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(h.deliverTo).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1' }), CONV_ID, [creator]);
  });

  it('un groupe démarré ou né avant #14644 (count nul) : la diffusion ordinaire, inchangée', async () => {
    const h = harness({ silent: false });
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: rename });

    expect(h.broadcast).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1' }), CONV_ID);
    expect(h.deliverTo).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('un groupe silencieux sans créateur est visible de tous dans la liste : la diffusion ordinaire', async () => {
    const h = harness({ silent: true, creators: [] });
    await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: rename });

    expect(h.broadcast).toHaveBeenCalled();
    expect(h.deliverTo).not.toHaveBeenCalled();
  });

  it('un groupe silencieux sans remise ciblée branchée : rien en direct, l’avis reste persisté', async () => {
    const h = harness({ silent: true, creators: [creator], deliverTo: null });
    const message = await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: rename });

    expect(message).toMatchObject({ id: 'msg-1' });
    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it('fail-closed : une lecture de l’audience qui tombe ne diffuse à personne', async () => {
    const h = harness({ count: jest.fn<any>().mockRejectedValue(new Error('mongo down')) });
    const message = await postConversationNotice(h.deps as never, { conversationId: CONV_ID, notice: rename });

    expect(message).toMatchObject({ id: 'msg-1' });
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(h.deliverTo).not.toHaveBeenCalled();
  });

  it('noticeDelivery : la remise ciblée émet message:new sur la room personnelle du créateur seule', async () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
    const delivery = noticeDelivery({ getManager: () => ({ broadcastMessage, getIO: () => ({ to }) }) } as never);

    await delivery.deliverTo?.({ id: 'msg-1', conversationId: CONV_ID, content: 'x', createdAt: CREATED_AT, metadata: rename }, CONV_ID, [creator]);

    expect(broadcastMessage).not.toHaveBeenCalled();
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(`user:${creator.userId}`);
    expect(emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ id: 'msg-1', conversationId: CONV_ID }));
  });
});
