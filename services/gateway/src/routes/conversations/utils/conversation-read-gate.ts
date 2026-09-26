import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveConversationId } from '../../../utils/conversation-id-cache';
import {
  SANS_SESSION,
  refuserAccesConversation,
  refuserCommeIntrouvable,
  verdictAccesConversation,
  type ContexteDAccesConversation,
  type MessagesDeRefusDAcces
} from './access-control';

/**
 * La PORTE de toute route de LECTURE d'une conversation (#8099) : rend
 * l'identifiant réel de la conversation, ou `null` après avoir répondu.
 *
 * L'ORDRE est la garde : la session d'abord, l'existence ensuite. Résoudre
 * l'identifiant avant de regarder la session rendait 404 à un inconnu sans
 * session et 401 au même appelant pour une conversation qui existe — l'oracle,
 * rejoué pour les appelants sans session.
 */
export async function ouvrirConversationLisible(params: {
  readonly prisma: PrismaClient;
  readonly reply: FastifyReply;
  readonly authContext: ContexteDAccesConversation;
  readonly identifiant: string;
  readonly messages: MessagesDeRefusDAcces;
}): Promise<string | null> {
  const { prisma, reply, authContext, identifiant, messages } = params;
  if (!authContext?.isAuthenticated) {
    refuserAccesConversation(reply, SANS_SESSION, messages);
    return null;
  }

  const conversationId = await resolveConversationId(prisma, identifiant);
  if (!conversationId) {
    refuserCommeIntrouvable(reply);
    return null;
  }

  const acces = await verdictAccesConversation(prisma, authContext, conversationId, identifiant);
  if (acces.genre !== 'ok') {
    refuserAccesConversation(reply, acces, messages);
    return null;
  }

  return conversationId;
}
