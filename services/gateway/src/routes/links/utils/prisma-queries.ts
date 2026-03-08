import type { PrismaClient } from '@meeshy/shared/prisma/client';

const senderInclude = {
  select: {
    id: true,
    displayName: true,
    avatar: true,
    type: true,
    language: true,
    isOnline: true,
    user: {
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        systemLanguage: true
      }
    }
  }
};

/**
 * Structure d'inclusion pour récupérer un lien de partage avec toutes ses relations
 */
export const shareLinkIncludeStructure = {
  conversation: {
    select: {
      id: true,
      identifier: true,
      title: true,
      description: true,
      type: true,
      createdAt: true,
      participants: {
        where: { isActive: true },
        select: {
          id: true,
          type: true,
          displayName: true,
          avatar: true,
          language: true,
          isOnline: true,
          role: true,
          joinedAt: true,
          userId: true,
          permissions: true,
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              systemLanguage: true,
              isOnline: true,
              lastActiveAt: true
            }
          }
        }
      }
    }
  },
  creator: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true
    }
  }
};

/**
 * Récupère un lien de partage par différents identifiants
 */
export async function findShareLinkByIdentifier(
  prisma: PrismaClient,
  identifier: string
): Promise<any> {
  const isLinkId = identifier.startsWith('mshy_');
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

  if (isLinkId) {
    return prisma.conversationShareLink.findUnique({
      where: { linkId: identifier },
      include: shareLinkIncludeStructure
    });
  } else if (isObjectId) {
    return prisma.conversationShareLink.findUnique({
      where: { id: identifier },
      include: shareLinkIncludeStructure
    });
  } else {
    return prisma.conversationShareLink.findFirst({
      where: { identifier: identifier },
      include: shareLinkIncludeStructure
    });
  }
}

/**
 * Récupère les messages d'une conversation avec pagination
 */
export async function getConversationMessages(
  prisma: PrismaClient,
  conversationId: string,
  limit: number,
  offset: number
): Promise<any[]> {
  return prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      sender: senderInclude,
      statusEntries: {
        select: {
          participantId: true,
          readAt: true
        }
      }
    }
  });
}

/**
 * Récupère les messages avec toutes les relations pour l'endpoint /messages
 */
export async function getConversationMessagesWithDetails(
  prisma: PrismaClient,
  conversationId: string,
  limit: number,
  offset: number
): Promise<any[]> {
  return prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      sender: senderInclude,
      attachments: {
        select: {
          id: true,
          messageId: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          thumbnailUrl: true,
          width: true,
          height: true,
          duration: true,
          bitrate: true,
          sampleRate: true,
          codec: true,
          channels: true,
          fps: true,
          videoCodec: true,
          pageCount: true,
          lineCount: true,
          metadata: true,
          uploadedBy: true,
          isAnonymous: true,
          createdAt: true
        }
      },
      replyTo: {
        include: {
          sender: senderInclude,
          attachments: {
            select: {
              id: true,
              messageId: true,
              fileName: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              fileUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
              duration: true,
              bitrate: true,
              sampleRate: true,
              codec: true,
              channels: true,
              fps: true,
              videoCodec: true,
              pageCount: true,
              lineCount: true,
              metadata: true,
              uploadedBy: true,
              isAnonymous: true,
              createdAt: true
            }
          },
          reactions: {
            select: {
              id: true,
              emoji: true,
              participantId: true,
              createdAt: true
            }
          }
        }
      },
      statusEntries: {
        select: {
          participantId: true,
          readAt: true
        }
      },
      reactions: {
        select: {
          id: true,
          emoji: true,
          participantId: true,
          createdAt: true
        }
      }
    }
  });
}

/**
 * Compte le nombre total de messages dans une conversation
 */
export async function countConversationMessages(
  prisma: PrismaClient,
  conversationId: string
): Promise<number> {
  return prisma.message.count({
    where: {
      conversationId,
      deletedAt: null
    }
  });
}
