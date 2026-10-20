/**
 * Le retrait d'un contenu par un TIERS (#11149) : le motif exigé, la trace
 * d'audit, et la notification `content_removed` à l'AUTEUR seul.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  completeModeratedMessageRemoval,
  moderationReasonOf,
  notifyContentRemoved,
  recordContentRemoval,
  removedPostContentType,
  MODERATION_REASON_REQUIRED,
} from '../../../../services/moderation/contentRemoval';

const AUTHOR = '64b7f0c2a1b2c3d4e5f60001';
const ACTOR = '64b7f0c2a1b2c3d4e5f60002';

const buildNotifier = () => ({ createNotification: jest.fn<any>(async () => ({ id: 'n1' })) });

const buildPrisma = (user: Record<string, unknown> | null = { systemLanguage: 'fr' }) => ({
  user: { findUnique: jest.fn<any>(async () => user) },
  adminAuditLog: { create: jest.fn<any>(async () => ({ id: 'a1' })) },
});

describe('moderationReasonOf — le motif, nettoyé, 3 à 500 caractères', () => {
  it('rend le motif nettoyé de ses espaces de bord', () => {
    expect(moderationReasonOf({ reason: '   Propos haineux  ' })).toBe('Propos haineux');
  });

  it.each([
    ['absent', undefined],
    ['corps vide', {}],
    ['non textuel', { reason: 42 }],
    ['trop court une fois nettoyé', { reason: '  ab   ' }],
    ['trop long', { reason: 'x'.repeat(501) }],
  ])('refuse un motif %s', (_label, body) => {
    expect(moderationReasonOf(body)).toBeNull();
  });

  it('accepte les bornes 3 et 500', () => {
    expect(moderationReasonOf({ reason: 'abc' })).toBe('abc');
    expect(moderationReasonOf({ reason: 'y'.repeat(500) })).toHaveLength(500);
  });

  it('nomme le code de refus du contrat', () => {
    expect(MODERATION_REASON_REQUIRED).toBe('MODERATION_REASON_REQUIRED');
  });
});

describe('removedPostContentType', () => {
  it.each([
    ['POST', 'post'],
    ['REEL', 'reel'],
    ['STORY', 'story'],
    ['STATUS', 'post'],
    [null, 'post'],
  ] as const)('%s ⇒ %s', (type, expected) => {
    expect(removedPostContentType(type)).toBe(expected);
  });
});

describe('notifyContentRemoved — la notification à l’auteur', () => {
  it('prévient l’AUTEUR seul, par `content_removed`, sans acteur ni contenu retiré', async () => {
    const notifications = buildNotifier();
    const prisma = buildPrisma();

    await notifyContentRemoved({ prisma: prisma as never, notifications }, {
      authorUserId: AUTHOR,
      contentType: 'message',
      contentId: 'm1',
      conversationId: 'c1',
      conversationTitle: 'Les Amis',
      reason: 'Spam répété',
    });

    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    const [call] = notifications.createNotification.mock.calls[0] as [Record<string, unknown>];
    expect(call).toMatchObject({
      userId: AUTHOR,
      type: 'content_removed',
      title: 'Votre message dans « Les Amis » a été retiré par un administrateur',
      content: 'Motif : Spam répété',
      context: { conversationId: 'c1', conversationTitle: 'Les Amis' },
      metadata: {
        contentType: 'message',
        contentId: 'm1',
        conversationId: 'c1',
        conversationTitle: 'Les Amis',
        reason: 'Spam répété',
      },
    });
    expect(call.actor).toBeUndefined();
    expect(JSON.stringify(call)).not.toContain(ACTOR);
  });

  it('compose dans la langue de CADRAGE du destinataire', async () => {
    const notifications = buildNotifier();
    const prisma = buildPrisma({ systemLanguage: 'en' });

    await notifyContentRemoved({ prisma: prisma as never, notifications }, {
      authorUserId: AUTHOR,
      contentType: 'reel',
      contentId: 'p1',
      postId: 'p1',
      reason: 'Contenu violent',
    });

    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      lang: 'en',
      title: 'Your reel was removed by an administrator',
      content: 'Reason: Contenu violent',
      context: { postId: 'p1' },
      metadata: { contentType: 'reel', contentId: 'p1', postId: 'p1', reason: 'Contenu violent' },
    }));
  });

  it.each([
    ['post', 'Votre publication a été retirée par un administrateur'],
    ['story', 'Votre story a été retirée par un administrateur'],
    ['comment', 'Votre commentaire a été retiré par un administrateur'],
    ['message', 'Votre message a été retiré par un administrateur'],
  ] as const)('nomme le contenu retiré : %s', async (contentType, title) => {
    const notifications = buildNotifier();

    await notifyContentRemoved({ prisma: buildPrisma() as never, notifications }, {
      authorUserId: AUTHOR,
      contentType,
      contentId: 'x1',
      reason: 'Hors sujet',
    });

    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({ title }));
  });

  it('ne part pas sans auteur inscrit (expéditeur anonyme)', async () => {
    const notifications = buildNotifier();

    await notifyContentRemoved({ prisma: buildPrisma() as never, notifications }, {
      authorUserId: null,
      contentType: 'message',
      contentId: 'm1',
      reason: 'Spam',
    });

    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('ne lève jamais : un échec de notification ne défait pas le retrait', async () => {
    const notifications = { createNotification: jest.fn<any>(async () => { throw new Error('down'); }) };

    await expect(notifyContentRemoved({ prisma: buildPrisma() as never, notifications }, {
      authorUserId: AUTHOR,
      contentType: 'post',
      contentId: 'p1',
      reason: 'Spam',
    })).resolves.toBeUndefined();
  });
});

describe('recordContentRemoval — la trace REMOVE_CONTENT', () => {
  it('écrit une ligne REMOVE_CONTENT avec le motif et `via: app`', async () => {
    const prisma = buildPrisma();

    await recordContentRemoval(prisma as never, {
      actorUserId: ACTOR,
      authorUserId: AUTHOR,
      entity: 'Message',
      entityId: 'm1',
      reason: 'Spam',
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: ACTOR,
        userId: AUTHOR,
        action: 'REMOVE_CONTENT',
        entity: 'Message',
        entityId: 'm1',
        metadata: JSON.stringify({ reason: 'Spam', via: 'app' }),
      },
    });
  });

  it("rattache la ligne à l'acteur quand l'auteur est anonyme", async () => {
    const prisma = buildPrisma();

    await recordContentRemoval(prisma as never, {
      actorUserId: ACTOR,
      authorUserId: null,
      entity: 'Message',
      entityId: 'm1',
      reason: 'Spam',
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: ACTOR, metadata: JSON.stringify({ reason: 'Spam', via: 'app', anonymousAuthor: true }) }),
    });
  });

  it('ne lève jamais', async () => {
    const prisma = buildPrisma();
    prisma.adminAuditLog.create.mockRejectedValue(new Error('down'));

    await expect(recordContentRemoval(prisma as never, {
      actorUserId: ACTOR, authorUserId: AUTHOR, entity: 'Post', entityId: 'p1', reason: 'Spam',
    })).resolves.toBeUndefined();
  });
});

describe('completeModeratedMessageRemoval — les trois transports de message', () => {
  it("journalise puis prévient l'auteur en nommant la conversation", async () => {
    const notifications = buildNotifier();
    const prisma = {
      ...buildPrisma(),
      conversation: { findUnique: jest.fn<any>(async () => ({ title: 'Équipe' })) },
    };

    await completeModeratedMessageRemoval({ prisma: prisma as never, notifications }, {
      actorUserId: ACTOR,
      authorUserId: AUTHOR,
      messageId: 'm1',
      conversationId: 'c1',
      reason: 'Insulte',
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'REMOVE_CONTENT', entity: 'Message', entityId: 'm1', adminId: ACTOR, userId: AUTHOR }),
    });
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: AUTHOR,
      type: 'content_removed',
      title: 'Votre message dans « Équipe » a été retiré par un administrateur',
      metadata: { contentType: 'message', contentId: 'm1', conversationId: 'c1', conversationTitle: 'Équipe', reason: 'Insulte' },
    }));
  });

  it('se passe du titre quand la conversation est illisible', async () => {
    const notifications = buildNotifier();
    const prisma = {
      ...buildPrisma(),
      conversation: { findUnique: jest.fn<any>(async () => { throw new Error('down'); }) },
    };

    await completeModeratedMessageRemoval({ prisma: prisma as never, notifications }, {
      actorUserId: ACTOR, authorUserId: AUTHOR, messageId: 'm1', conversationId: 'c1', reason: 'Insulte',
    });

    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Votre message a été retiré par un administrateur',
    }));
  });
});
