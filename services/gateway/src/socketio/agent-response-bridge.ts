import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import type { MentionParticipant } from '@meeshy/shared/utils/mention-parser';
import { logger } from '../utils/logger';
import type { FileToUpload, UploadResult } from '../services/attachments';
import { resolveAgentIllustration, type ResolvedIllustration } from '../services/zmq-agent/agent-illustration';

/**
 * Pont entre une réponse de l'agent (ZMQ `agent:response`) et le pipeline de
 * messagerie. Extrait de `MeeshySocketIOManager` (#6192) : le manager délègue
 * ici et ne porte plus que le câblage.
 */

export type AgentResponsePayload = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  mentionedUsernames?: string[];
  messageSource: 'agent';
  /** Article source d'un sujet lancé : son image Open Graph est jointe au message (#6192). */
  illustration?: { sourceUrl: string };
  metadata: { agentType: 'impersonator' | 'animator' | 'orchestrator'; roleConfidence: number; archetypeId?: string };
};

type AgentMessageRequest = {
  conversationId: string;
  content: string;
  originalLanguage: string;
  messageType: 'text';
  messageSource: 'agent';
  replyToId?: string;
  mentionedUserIds?: string[];
  attachmentIds?: readonly string[];
  isAnonymous: false;
  metadata: { source: 'api' };
};

export type AgentResponseBridgeDeps = {
  prisma: Pick<PrismaClient, 'participant'>;
  messagingService: {
    handleMessage(request: AgentMessageRequest, senderParticipantId: string): Promise<{ success: boolean; data?: unknown; error?: unknown }>;
  };
  mentionService: {
    extractMentionsWithParticipants(content: string, participants: MentionParticipant[]): string[];
    resolveUsernames(usernames: string[]): Promise<Map<string, { id: string }>>;
  };
  resolveUsernamesToIds(usernames: string[]): Promise<string[]>;
  attachmentService: { uploadFile(file: FileToUpload, userId: string): Promise<Pick<UploadResult, 'id'>> };
  resolveIllustration?: (sourceUrl: string) => Promise<ResolvedIllustration | null>;
  /** Budget global (résolution + téléversement), en ms. Défaut `ILLUSTRATION_BUDGET_MS` (#6198). */
  illustrationBudgetMs?: number;
  broadcastNewMessage(message: Message, conversationId: string): Promise<void>;
};

/**
 * Budget GLOBAL, tout compris (résolution de l'image + téléversement), au-delà
 * duquel le message part en texte plutôt que d'attendre (#6198). La file ZMQ
 * est traitée en série (`startListening`) : une source lente retarde toutes
 * les réponses suivantes, alors que le message d'agent n'est sur aucun chemin
 * utilisateur synchrone — un sujet lancé en retard ne vaut rien de plus qu'un
 * sujet lancé sans photo.
 *
 * `resolveAgentIllustration` borne déjà CHAQUE saut réseau (8 s par défaut,
 * jusqu'à 4 sauts pour la page comme pour l'image) mais rien ne borne leur
 * SOMME : ce budget est la seule garde sur le total.
 */
const ILLUSTRATION_BUDGET_MS = 10_000;

const BUDGET_EXCEEDED = Symbol('agent-illustration-budget-exceeded');

/**
 * Course contre une horloge : ne PAS annuler `work` — `resolveAgentIllustration`
 * n'expose aucun signal d'annulation, et l'appel abandonné reste borné par ses
 * propres délais de saut. Le perdant de la course reste résolu SANS écouteur
 * dédié : `Promise.race` lui attache déjà une réaction, donc son issue tardive
 * — succès ou rejet — ne produit jamais de rejet non observé (§ CLAUDE.md
 * « `void p` exige TOUJOURS `p.catch(...)` », qui ne s'applique qu'à une
 * promesse réellement détachée).
 */
function withBudget<T>(work: Promise<T>, budgetMs: number): Promise<T | typeof BUDGET_EXCEEDED> {
  const timeout = new Promise<typeof BUDGET_EXCEEDED>((resolve) => {
    const timer = setTimeout(() => resolve(BUDGET_EXCEEDED), budgetMs);
    timer.unref?.();
  });
  return Promise.race([work, timeout]);
}

async function conversationParticipantsForMention(
  prisma: AgentResponseBridgeDeps['prisma'],
  conversationId: string,
): Promise<MentionParticipant[]> {
  try {
    const participants = await prisma.participant.findMany({
      where: { conversationId, isActive: true, userId: { not: null } },
      select: {
        userId: true,
        displayName: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return participants
      .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user !== null)
      .map((p) => ({
        userId: p.user.id,
        username: p.user.username,
        displayName: p.user.displayName ?? p.user.username,
      }));
  } catch {
    return [];
  }
}

async function resolveMentionedUserIds(deps: AgentResponseBridgeDeps, response: AgentResponsePayload): Promise<string[] | undefined> {
  if (response.mentionedUsernames && response.mentionedUsernames.length > 0) {
    const ids = await deps.resolveUsernamesToIds(response.mentionedUsernames);
    return ids.length > 0 ? ids : undefined;
  }
  if (!response.content?.includes('@')) return undefined;
  const participants = await conversationParticipantsForMention(deps.prisma, response.conversationId);
  if (participants.length === 0) return undefined;
  const usernames = deps.mentionService.extractMentionsWithParticipants(response.content, participants);
  if (usernames.length === 0) return undefined;
  const userMap = await deps.mentionService.resolveUsernames(usernames);
  const resolved = [...userMap.values()].map((u) => u.id);
  return resolved.length > 0 ? resolved : undefined;
}

/**
 * L'image de l'article, téléversée comme l'utilisateur emprunté. Chaque étape
 * peut refuser (hôte, type, taille, signature du fichier) : on rend alors
 * `undefined` et le message part en texte — un sujet lancé sans photo vaut
 * mieux qu'un sujet jamais lancé.
 */
async function uploadIllustration(deps: AgentResponseBridgeDeps, response: AgentResponsePayload): Promise<readonly string[] | undefined> {
  const sourceUrl = response.illustration?.sourceUrl;
  if (!sourceUrl) return undefined;
  const budgetMs = deps.illustrationBudgetMs ?? ILLUSTRATION_BUDGET_MS;
  const startedAt = Date.now();
  try {
    const resolve = deps.resolveIllustration ?? ((url: string) => resolveAgentIllustration({ sourceUrl: url }));
    const work = (async (): Promise<readonly string[] | undefined> => {
      const resolved = await resolve(sourceUrl);
      if (!resolved) return undefined;
      const uploaded = await deps.attachmentService.uploadFile(
        { buffer: resolved.buffer, filename: resolved.filename, mimeType: resolved.mimeType, size: resolved.buffer.length },
        response.asUserId,
      );
      return [uploaded.id];
    })();
    const result = await withBudget(work, budgetMs);
    if (result === BUDGET_EXCEEDED) {
      logger.warn(`[Agent] Illustration budget exceeded (${budgetMs}ms) — conv=${response.conversationId} source=${sourceUrl}`);
      return undefined;
    }
    return result;
  } catch (error) {
    logger.warn(`[Agent] Illustration abandonnée (${Date.now() - startedAt}ms) — conv=${response.conversationId} source=${sourceUrl}`, error);
    return undefined;
  }
}

export async function handleAgentResponse(deps: AgentResponseBridgeDeps, response: AgentResponsePayload): Promise<void> {
  try {
    const mentionedUserIds = await resolveMentionedUserIds(deps, response);
    const attachmentIds = await uploadIllustration(deps, response);

    // Le pipeline attend un Participant.id, pas un User.id : le résoudre ici
    // évite son repli DEPRECATED (requête supplémentaire + log d'erreur).
    const senderParticipant = await deps.prisma.participant.findFirst({
      where: { userId: response.asUserId, conversationId: response.conversationId, isActive: true },
      select: { id: true },
    });
    if (!senderParticipant) {
      logger.warn(`[Agent] No active participant for userId=${response.asUserId} in conv=${response.conversationId}`);
      return;
    }

    const messageRequest: AgentMessageRequest = {
      conversationId: response.conversationId,
      content: response.content,
      originalLanguage: response.originalLanguage,
      messageType: 'text',
      messageSource: 'agent',
      replyToId: response.replyToId,
      mentionedUserIds,
      ...(attachmentIds ? { attachmentIds } : {}),
      isAnonymous: false,
      metadata: { source: 'api' },
    };

    const result = await deps.messagingService.handleMessage(messageRequest, senderParticipant.id);
    if (!result.success || !result.data) {
      logger.error(`[Agent] handleMessage failed — conv=${response.conversationId}`, result.error);
      return;
    }

    // Notifications et traduction partent déjà de handleMessage ; ici on diffuse aux membres.
    const saved = result.data as Message & { createdAt: Date };
    const messageWithTimestamp = { ...saved, timestamp: saved.createdAt } as Message;
    await deps.broadcastNewMessage(messageWithTimestamp, response.conversationId);

    logger.info(`[Agent] Response sent — conv=${response.conversationId} user=${response.asUserId} type=${response.metadata.agentType} msgId=${saved.id}${attachmentIds ? ' illustrated' : ''}`);
  } catch (error) {
    logger.error('[Agent] handleAgentResponse error:', error);
  }
}
