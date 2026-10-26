/**
 * **Dans une conversation e2ee, un signal en clair est refusé** (#13142, fail-closed
 * comme #9229). Une réaction, la frappe, une suppression pour tous, une vue
 * unique consommée ou un épinglage y voyagent en messages de contrôle chiffrés,
 * par la route unique `POST /e2ee/conversations/:id/signals`. Leurs routes en
 * clair, qui feraient lire et ranger au serveur l'emoji, l'instant de lecture ou
 * le geste, y répondent `409 E2EE_SIGNAL_CHANNEL_REQUIRED` avec une phrase
 * lisible, ou se taisent pour la frappe (aucun accusé à rendre). Les modes
 * `server` et `hybrid` ne changent pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';
import { ConflictError } from '../../errors/custom-errors';
import { isEndToEndMode } from '../messaging/e2eePlaintextAdmission';

export class E2eeSignalChannelRequiredError extends ConflictError {
  constructor() {
    super(E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE, E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED);
  }
}

/** La charge d'un refus, pour un accusé socket comme pour une réponse REST. */
export const SIGNAL_CHANNEL_REFUSAL = {
  error: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE,
  code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED,
} as const;

/**
 * La conversation est-elle chiffrée de bout en bout ? Une lecture illisible
 * répond OUI : un signal en clair ne part jamais sur un doute.
 */
export async function isEndToEndConversation(
  prisma: Pick<PrismaClient, 'conversation'>,
  conversationId: string,
): Promise<boolean> {
  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { encryptionMode: true } });
    return isEndToEndMode(conversation?.encryptionMode);
  } catch {
    return true;
  }
}

/** Refuse la route en clair d'un signal dans une conversation e2ee. */
export async function assertPlainSignalAdmitted(prisma: Pick<PrismaClient, 'conversation'>, conversationId: string): Promise<void> {
  if (await isEndToEndConversation(prisma, conversationId)) throw new E2eeSignalChannelRequiredError();
}
