import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MentionParticipant } from '@meeshy/shared/utils/mention-parser';

/**
 * Le message tel que la résolution de mentions le lit. Structural et minimal :
 * les routes de lien de partage ne construisent pas un `Message` Prisma
 * complet, et rien ici n'a besoin de plus que ces trois champs.
 *
 * `senderId` est un `Participant.id` sur les chemins d'envoi (socket, REST,
 * lien) — c'est ce que `validateMentionPermissions` reçoit déjà du chemin
 * nominal.
 */
export interface MentionTargetMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
}

/**
 * La seule surface Prisma que la résolution touche. `Pick<PrismaClient, …>`
 * plutôt qu'une interface maison, même raison que `FanOutPrisma` : les
 * délégués générés portent des surcharges que rien de recopié à la main ne
 * satisfait.
 */
export type MentionPrisma = Pick<PrismaClient, 'participant' | 'user' | 'message' | 'mention'>;

/**
 * Les quatre méthodes de `MentionService` que la résolution appelle, en
 * structural pour que le double de test soit trivial et pour qu'une route
 * n'ait pas à importer la classe entière.
 */
export interface MentionResolver {
  extractMentionsWithParticipants(content: string, participants: MentionParticipant[]): string[];
  resolveUsernames(usernames: string[]): Promise<Map<string, { id: string; username: string }>>;
  validateMentionPermissions(
    conversationId: string,
    mentionedUserIds: string[],
    senderId: string
  ): Promise<{ validUserIds: string[] }>;
  createMentions(messageId: string, mentionedUserIds: string[]): Promise<void>;
}

export interface ResolvedMentions {
  /** `User.id` des mentionnés retenus — ce que l'éventail de notifications attend. */
  readonly validatedUserIds: readonly string[];
  /** Leurs `username`, tels que persistés dans `Message.validatedMentions`. */
  readonly validatedUsernames: readonly string[];
}

const EMPTY: ResolvedMentions = { validatedUserIds: [], validatedUsernames: [] };

/**
 * Les participants inscrits d'une conversation, sous la forme que le parseur de
 * mentions attend (il résout `@Display Name` autant que `@username`).
 *
 * Best-effort : une lecture en échec dégrade vers la liste vide, où seuls les
 * `@handle` bruts restent extractibles. Perdre les mentions par nom d'affichage
 * vaut mieux que perdre le message.
 */
async function loadMentionParticipants(
  prisma: Pick<MentionPrisma, 'participant'>,
  conversationId: string,
  onError?: (error: unknown) => void
): Promise<MentionParticipant[]> {
  try {
    const participants = await prisma.participant.findMany({
      where: { conversationId, isActive: true, type: 'user' },
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
  } catch (error) {
    onError?.(error);
    return [];
  }
}

/**
 * Ce que TOUT message porteur d'un `@` doit à ceux qu'il nomme : une ligne
 * `Mention`, un `Message.validatedMentions` à jour, et le lot d'ids que
 * l'éventail de notifications transforme en push.
 *
 * Cette unité existe parce que l'obligation vivait dans une méthode PRIVÉE de
 * `MessageProcessor` (`processMentionsInDB` ← `handleMentionsAndNotifications`
 * ← `saveMessage`). Les deux routes de lien de partage contournent
 * `MessagingService.handleMessage`, donc `MessageProcessor` en entier : un
 * `@alice` envoyé par lien ne produisait AUCUNE ligne `Mention` (absent de
 * l'inbox `/mentions`), AUCUN `validatedMentions` (le web surligne depuis ce
 * champ — le texte restait brut) et AUCUNE notification de mention. Même
 * défaut et même remède que `broadcastLinkMessage`,
 * `runMessagePostSaveEffects`, `emitUnreadCountsToRecipients` et
 * `notifyMessageRecipients` : un point d'appel public que tout écrivain peut
 * atteindre.
 *
 * Le court-circuit vit ICI, pas chez l'appelant : un message sans `@` et sans
 * mention explicite ne doit coûter aucune requête, et c'est une garde qu'un
 * nouvel écrivain oublierait. Aucun appelant n'a à la reproduire.
 *
 * Best-effort de bout en bout — ne lève jamais. Une mention perdue ne doit pas
 * transformer un envoi réussi en 500 ; `onError` laisse l'appelant journaliser
 * dans le contexte de sa requête.
 *
 * Les usernames rendus sont ceux des ids RETENUS par la validation, jamais
 * l'extraction brute : `validatedMentions` est lu par le client pour surligner,
 * donc y laisser un mentionné rejeté surlignerait quelqu'un qui n'a reçu ni
 * ligne `Mention` ni notification.
 */
export async function resolveMessageMentions(params: MentionResolutionParams): Promise<ResolvedMentions> {
  const { prisma, mentionService, message, content, onError } = params;
  const explicit = params.explicitMentionedUserIds ?? [];

  if (!mentionService) return EMPTY;
  if (explicit.length === 0 && !content.includes('@')) return EMPTY;

  try {
    const resolved = await computeValidatedMentions(params, mentionService, explicit);
    if (resolved.validatedUserIds.length === 0) return EMPTY;

    await mentionService.createMentions(message.id, [...resolved.validatedUserIds]);
    await prisma.message.update({
      where: { id: message.id },
      data: { validatedMentions: [...resolved.validatedUsernames] },
    });

    return resolved;
  } catch (error) {
    onError?.(error);
    return EMPTY;
  }
}

/**
 * La même résolution, mais pour un message qui en portait DÉJÀ : l'édition.
 *
 * Deux différences avec `resolveMessageMentions`, et les deux tiennent au fait
 * que l'ancien lot doit disparaître :
 *
 *  1. **Les lignes `Mention` existantes sont purgées d'abord.** Un `@alice`
 *     retiré du texte doit sortir de l'inbox `/mentions` d'alice.
 *  2. **`validatedMentions` est TOUJOURS réécrit, même vide.** D'où l'absence
 *     de court-circuit : un contenu édité qui ne porte plus aucun `@` doit
 *     effacer le champ, pas le laisser tel quel. C'est exactement l'inverse du
 *     chemin de création, où ne rien écrire est la bonne réponse.
 *
 * Ce qu'elle corrige : le chemin d'édition extrayait avec `extractMentions`
 * (handles bruts seulement) là où la création extrait avec
 * `extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Éditer
 * un message contenant `@John Doe` DÉTRUISAIT donc la mention — ligne
 * supprimée, champ remis à `[]` — alors que rien n'avait changé pour elle. Deux
 * extracteurs pour un même champ ne peuvent pas rester d'accord.
 */
export async function replaceMessageMentions(params: MentionResolutionParams): Promise<ResolvedMentions> {
  const { prisma, mentionService, message, onError } = params;
  const explicit = params.explicitMentionedUserIds ?? [];

  try {
    await prisma.mention.deleteMany({ where: { messageId: message.id } });

    const resolved = mentionService
      ? await computeValidatedMentions(params, mentionService, explicit)
      : EMPTY;

    if (mentionService && resolved.validatedUserIds.length > 0) {
      await mentionService.createMentions(message.id, [...resolved.validatedUserIds]);
    }

    await prisma.message.update({
      where: { id: message.id },
      data: { validatedMentions: [...resolved.validatedUsernames] },
    });

    return resolved;
  } catch (error) {
    onError?.(error);
    await prisma.message
      .update({ where: { id: message.id }, data: { validatedMentions: [] } })
      .catch((clearError: unknown) => onError?.(clearError));
    return EMPTY;
  }
}

interface MentionResolutionParams {
  prisma: MentionPrisma;
  mentionService: MentionResolver | null | undefined;
  message: MentionTargetMessage;
  content: string;
  /** Mentions déjà désignées par le client, en `User.id` — court-circuite l'extraction. */
  explicitMentionedUserIds?: readonly string[];
  onError?: (error: unknown) => void;
}

/**
 * Le cœur commun : de quoi le contenu parle, qui a le droit d'être nommé.
 * N'écrit RIEN — les deux exports décident de ce qu'ils persistent, parce que
 * c'est précisément là qu'ils diffèrent.
 */
async function computeValidatedMentions(
  params: MentionResolutionParams,
  mentionService: MentionResolver,
  explicit: readonly string[]
): Promise<ResolvedMentions> {
  const { prisma, message, content, onError } = params;

  const usernameByUserId = new Map<string, string>();
  let candidateUserIds: string[] = [];

  if (explicit.length > 0) {
    candidateUserIds = Array.from(explicit);
  } else {
    const participants = await loadMentionParticipants(prisma, message.conversationId, onError);
    const extracted = mentionService.extractMentionsWithParticipants(content, participants);
    if (extracted.length === 0) return EMPTY;

    const userMap = await mentionService.resolveUsernames(extracted);
    for (const [username, user] of userMap.entries()) {
      usernameByUserId.set(user.id, username);
    }
    candidateUserIds = Array.from(usernameByUserId.keys());
  }

  if (candidateUserIds.length === 0) return EMPTY;

  const { validUserIds } = await mentionService.validateMentionPermissions(
    message.conversationId,
    candidateUserIds,
    message.senderId
  );
  if (validUserIds.length === 0) return EMPTY;

  if (explicit.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: validUserIds } },
      select: { id: true, username: true },
    });
    for (const user of users) usernameByUserId.set(user.id, user.username);
  }

  const validatedUsernames = validUserIds
    .map((id) => usernameByUserId.get(id))
    .filter((username): username is string => username !== undefined);

  return { validatedUserIds: validUserIds, validatedUsernames };
}
