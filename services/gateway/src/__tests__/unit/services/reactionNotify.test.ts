import { describe, it, expect, jest } from '@jest/globals';
import { notifyReactionAdded } from '../../../services/notifications/reactionNotify';

type MessageRow = { senderId: string | null; conversationId: string } | null;

/**
 * Factory — pas de mutation partagée (cf. CLAUDE.md). Construit des doubles
 * minimaux de prisma + NotificationService et expose les mocks pour assertion.
 *
 * Par défaut : message authoré par `author-participant` (→ User `author-user`),
 * réacteur `reactor-participant` (→ User `reactor-user`) — donc auteur ≠ réacteur.
 */
function makeDeps(
  opts: {
    message?: MessageRow;
    authorUserId?: string | null;
    reactorUserId?: string | null;
  } = {}
) {
  const message: MessageRow =
    'message' in opts ? (opts.message ?? null) : { senderId: 'author-participant', conversationId: 'conv-1' };
  const authorUserId = 'authorUserId' in opts ? opts.authorUserId : 'author-user';
  const reactorUserId = 'reactorUserId' in opts ? opts.reactorUserId : 'reactor-user';

  const messageFindUnique = jest.fn<any>().mockResolvedValue(message);
  const participantFindUnique = jest.fn<any>().mockImplementation((args: any) => {
    const id = args?.where?.id;
    if (id === 'author-participant') return Promise.resolve(authorUserId == null ? null : { userId: authorUserId });
    if (id === 'reactor-participant') return Promise.resolve(reactorUserId == null ? null : { userId: reactorUserId });
    return Promise.resolve(null);
  });
  const createReactionNotification = jest.fn<any>().mockResolvedValue({ id: 'notif-1' });

  const prisma = {
    message: { findUnique: messageFindUnique },
    participant: { findUnique: participantFindUnique },
  } as any;
  const notificationService = { createReactionNotification } as any;

  return { prisma, notificationService, createReactionNotification, messageFindUnique, participantFindUnique };
}

const baseParams = {
  messageId: 'msg-1',
  reactorParticipantId: 'reactor-participant',
  emoji: '👍',
  isAnonymous: false,
};

describe('notifyReactionAdded', () => {
  it('creates a reaction notification for the message author when the reactor differs', async () => {
    const d = makeDeps();

    await notifyReactionAdded({ prisma: d.prisma, notificationService: d.notificationService }, baseParams);

    expect(d.createReactionNotification).toHaveBeenCalledTimes(1);
    expect(d.createReactionNotification).toHaveBeenCalledWith({
      messageAuthorId: 'author-user',
      reactorUserId: 'reactor-user',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      reactionEmoji: '👍',
    });
  });

  it('does not notify (and does not even query) for anonymous reactors', async () => {
    const d = makeDeps();

    await notifyReactionAdded(
      { prisma: d.prisma, notificationService: d.notificationService },
      { ...baseParams, isAnonymous: true }
    );

    expect(d.messageFindUnique).not.toHaveBeenCalled();
    expect(d.createReactionNotification).not.toHaveBeenCalled();
  });

  it('does not notify on a self-reaction (author === reactor)', async () => {
    const d = makeDeps({ authorUserId: 'same-user', reactorUserId: 'same-user' });

    await notifyReactionAdded({ prisma: d.prisma, notificationService: d.notificationService }, baseParams);

    expect(d.createReactionNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the message is missing', async () => {
    const d = makeDeps({ message: null });

    await notifyReactionAdded({ prisma: d.prisma, notificationService: d.notificationService }, baseParams);

    expect(d.createReactionNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the message has no senderId', async () => {
    const d = makeDeps({ message: { senderId: null, conversationId: 'conv-1' } });

    await notifyReactionAdded({ prisma: d.prisma, notificationService: d.notificationService }, baseParams);

    expect(d.createReactionNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the author participant cannot be resolved to a user', async () => {
    const d = makeDeps({ authorUserId: null });

    await notifyReactionAdded({ prisma: d.prisma, notificationService: d.notificationService }, baseParams);

    expect(d.createReactionNotification).not.toHaveBeenCalled();
  });
});
