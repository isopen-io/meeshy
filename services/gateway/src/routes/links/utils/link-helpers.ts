import type { PrismaClient } from '@prisma/client';
import type { UnifiedAuthRequest } from '../../../middleware/auth';
import { isRegisteredUser } from '../../../middleware/auth';

/**
 * Adapte le nouveau contexte d'authentification unifié au format legacy
 */
export function createLegacyHybridRequest(request: UnifiedAuthRequest): any {
  const authContext = request.authContext;

  if (isRegisteredUser(authContext)) {
    return {
      isAuthenticated: true,
      isAnonymous: false,
      user: authContext.registeredUser,
      anonymousParticipant: null
    };
  } else if (authContext.type === 'session' && authContext.anonymousUser) {
    return {
      isAuthenticated: true,
      isAnonymous: true,
      user: null,
      anonymousParticipant: {
        id: authContext.anonymousUser.sessionToken,
        username: authContext.anonymousUser.username,
        firstName: authContext.anonymousUser.firstName,
        lastName: authContext.anonymousUser.lastName,
        language: authContext.anonymousUser.language,
        shareLinkId: authContext.anonymousUser.shareLinkId,
        canSendMessages: authContext.anonymousUser.permissions.canSendMessages,
        canSendFiles: authContext.anonymousUser.permissions.canSendFiles,
        canSendImages: authContext.anonymousUser.permissions.canSendImages
      }
    };
  } else {
    return {
      isAuthenticated: false,
      isAnonymous: false,
      user: null,
      anonymousParticipant: null
    };
  }
}

/**
 * Résout l'ID de ConversationShareLink réel à partir d'un identifiant
 */
export async function resolveShareLinkId(prisma: PrismaClient, identifier: string): Promise<string | null> {
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    return identifier;
  }

  const shareLink = await prisma.conversationShareLink.findFirst({
    where: { identifier: identifier }
  });

  return shareLink ? shareLink.id : null;
}

/**
 * Génère un linkId initial avec le format demandé
 */
export function generateInitialLinkId(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');

  const timestamp = `${year}${month}${day}${hour}${minute}`;
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return `${timestamp}_${randomSuffix}`;
}

/**
 * Génère un identifiant unique pour une conversation
 */
export function generateConversationIdentifier(title?: string): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  if (title) {
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (sanitizedTitle.length > 0) {
      return `mshy_${sanitizedTitle}-${timestamp}`;
    }
  }

  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `mshy_${uniqueId}-${timestamp}`;
}

/**
 * Génère le linkId final à partir de l'ID de ConversationShareLink
 */
export function generateFinalLinkId(conversationShareLinkId: string, initialId: string): string {
  return `mshy_${conversationShareLinkId}.${initialId}`;
}

/**
 * Vérifie l'unicité d'un identifiant de ConversationShareLink
 */
export async function ensureUniqueShareLinkIdentifier(prisma: PrismaClient, baseIdentifier: string): Promise<string> {
  if (!baseIdentifier || baseIdentifier.trim() === '') {
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 8);
    baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
  }

  let identifier = baseIdentifier.trim();

  const existing = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });

  if (!existing) {
    return identifier;
  }

  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  identifier = `${baseIdentifier}-${timestamp}`;

  const existingWithTimestamp = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });

  if (!existingWithTimestamp) {
    return identifier;
  }

  let counter = 1;
  while (true) {
    const newIdentifier = `${baseIdentifier}-${timestamp}-${counter}`;
    const existingWithCounter = await prisma.conversationShareLink.findFirst({
      where: { identifier: newIdentifier }
    });

    if (!existingWithCounter) {
      return newIdentifier;
    }

    counter++;
  }
}
