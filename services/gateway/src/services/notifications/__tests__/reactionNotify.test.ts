import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { notifyReactionAdded, notifyReactionRemoved } from '../reactionNotify';

const makeNotificationService = () => ({
  createReactionNotification: jest.fn(),
});

type MockPrismaOptions = {
  message?: { senderId: string | null; conversationId: string } | null;
  authorParticipant?: { userId: string } | null;
  reactorParticipant?: { userId: string } | null;
};

const makePrisma = ({
  message = { senderId: 'participant-author', conversationId: 'conv-1' } as { senderId: string | null; conversationId: string } | null,
  authorParticipant = { userId: 'user-author' } as { userId: string } | null,
  reactorParticipant = { userId: 'user-reactor' } as { userId: string } | null,
}: MockPrismaOptions = {}) => ({
  message: {
    findUnique: jest.fn().mockResolvedValue(message),
  },
  participant: {
    findUnique: jest.fn()
      .mockResolvedValueOnce(authorParticipant)
      .mockResolvedValueOnce(reactorParticipant),
  },
});

const BASE_PARAMS = {
  messageId: 'msg-001',
  reactorParticipantId: 'participant-reactor',
  emoji: '👍',
  isAnonymous: false,
};

describe('notifyReactionAdded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('anonymous reactor', () => {
    it('returns immediately without any DB calls', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        { ...BASE_PARAMS, isAnonymous: true },
      );
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('message not found', () => {
    it('returns without participant lookup or notification when message is null', async () => {
      const prisma = makePrisma({ message: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });

    it('returns without participant lookup when message.senderId is null', async () => {
      const prisma = makePrisma({ message: { senderId: null, conversationId: 'conv-1' } });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('participant resolution failures', () => {
    it('returns without notification when author participant is not found', async () => {
      const prisma = makePrisma({ authorParticipant: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).toHaveBeenCalledTimes(2);
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });

    it('returns without notification when reactor participant is not found', async () => {
      const prisma = makePrisma({ reactorParticipant: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('self-reaction', () => {
    it('returns without notification when author and reactor are the same user', async () => {
      const prisma = makePrisma({
        authorParticipant: { userId: 'user-same' },
        reactorParticipant: { userId: 'user-same' },
      });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('valid notification', () => {
    it('calls createReactionNotification with resolved user IDs', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).toHaveBeenCalledTimes(1);
      expect(notificationService.createReactionNotification).toHaveBeenCalledWith({
        messageAuthorId: 'user-author',
        reactorUserId: 'user-reactor',
        messageId: 'msg-001',
        conversationId: 'conv-1',
        reactionEmoji: '👍',
      });
    });

    it('looks up message by the provided messageId', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        { ...BASE_PARAMS, messageId: 'msg-xyz' },
      );
      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-xyz' },
        select: { senderId: true, conversationId: true },
      });
    });

    it('resolves both participants in parallel', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Le symétrique de `notifyReactionAdded` : la réaction défaite retire la
 * notification que son ajout avait produite.
 *
 * Ce que cette suite fixe, et que la simple présence de
 * `retractReactionNotifications` ne garantit pas : le retrait doit résoudre le
 * `Participant.id` du réacteur en `User.id` EXACTEMENT comme l'ajout. La
 * notification a été écrite avec `actor.id = User.id` ; un retrait qui
 * filtrerait sur le `Participant.id` reçu par le transport ne matcherait
 * jamais rien — et ne le dirait pas, puisque l'ensemble vide est le cas normal
 * (le throttle par paire supprime la plupart des notifications de réaction).
 */
describe('notifyReactionRemoved', () => {
  const makeRetracting = () => jest.fn<any>().mockResolvedValue(1);

  /**
   * Le retrait ne résout QUE le réacteur — d'où un double distinct de celui de
   * l'ajout, dont le `findUnique` sert l'auteur en premier.
   */
  const makeRemovalPrisma = (reactorParticipant: { userId: string } | null = { userId: 'user-reactor' }) => ({
    message: { findUnique: jest.fn<any>() },
    participant: { findUnique: jest.fn<any>().mockResolvedValue(reactorParticipant) },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retire la notification en désignant le réacteur par son User.id', async () => {
    const prisma = makeRemovalPrisma();
    const retract = makeRetracting();

    await notifyReactionRemoved(
      { prisma: prisma as any, notificationService: {} as any, retract },
      BASE_PARAMS,
    );

    expect(retract).toHaveBeenCalledTimes(1);
    const [, removed] = retract.mock.calls[0] as [unknown, any];
    expect(removed).toEqual({
      subject: { kind: 'message', id: 'msg-001' },
      actorId: 'user-reactor',
      emoji: '👍',
    });
  });

  /**
   * Un réacteur anonyme n'a jamais produit de notification (`notifyReactionAdded`
   * sort avant toute lecture) : il n'y a rien à retirer, et surtout rien à
   * chercher avec un acteur qu'on ne saurait pas nommer.
   */
  it('ne touche pas la base pour un réacteur anonyme', async () => {
    const prisma = makeRemovalPrisma();
    const retract = makeRetracting();

    await notifyReactionRemoved(
      { prisma: prisma as any, notificationService: {} as any, retract },
      { ...BASE_PARAMS, isAnonymous: true },
    );

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    expect(retract).not.toHaveBeenCalled();
  });

  it('ne retire rien quand le réacteur n’a pas de compte utilisateur', async () => {
    const prisma = makeRemovalPrisma(null);
    const retract = makeRetracting();

    await notifyReactionRemoved(
      { prisma: prisma as any, notificationService: {} as any, retract },
      BASE_PARAMS,
    );

    expect(retract).not.toHaveBeenCalled();
  });

  /**
   * L'ajout lit le message pour en tirer l'auteur et la conversation ; le
   * retrait n'a besoin ni de l'un ni de l'autre — la conjonction
   * (type × messageId × acteur × emoji) suffit à désigner la ligne. Une lecture
   * de message ici serait un aller-retour par dé-réaction, sur un chemin qui
   * s'exécute après l'ACK et dont le cas nominal ne retire RIEN.
   */
  it('ne relit pas le message : la cible suffit à désigner la ligne', async () => {
    const prisma = makeRemovalPrisma();
    const retract = makeRetracting();

    await notifyReactionRemoved(
      { prisma: prisma as any, notificationService: {} as any, retract },
      BASE_PARAMS,
    );

    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });
});
