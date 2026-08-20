import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { LIVE_MESSAGE_MARK } from '../messaging/liveMessage';
import { JOIN_NOTICE_KIND, type JoinNoticeMetadata, type JoinNoticeLinkRules } from '@meeshy/shared/utils/join-notice';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'JoinSystemMessage' });

/**
 * Discriminant du message système d'arrivée — DÉFINI DANS `@meeshy/shared`
 * (`utils/join-notice.ts`), pas ici : le gateway l'écrit, le web et iOS le
 * lisent, un jumeau local dériverait en silence. Ré-exporté pour les appelants
 * du gateway.
 */
export { JOIN_NOTICE_KIND as JOIN_SYSTEM_MESSAGE_KIND } from '@meeshy/shared/utils/join-notice';
export type { JoinNoticeMetadata as JoinSystemMessageMetadata } from '@meeshy/shared/utils/join-notice';

export type JoinSystemMessageInput = {
  readonly conversationId: string;
  /** `Participant.id` de l'arrivant — il est l'AUTEUR de son propre avis d'arrivée. */
  readonly participantId: string;
  readonly displayName: string;
  readonly isAnonymous: boolean;
  readonly viaShareLink: boolean;
  /** Pseudo stable (`ano_…` pour un visiteur sans compte). */
  readonly username?: string;
  /** Nom humain donné au formulaire d'entrée (prénom/nom), s'il existe. */
  readonly givenName?: string;
  /** Règles du lien emprunté — seules les portes `viaShareLink` les fournissent. */
  readonly linkRules?: JoinNoticeLinkRules;
};

export type JoinSystemMessageDeps = {
  readonly prisma: Pick<PrismaClient, 'message'>;
  /** `MeeshySocketIOManager.broadcastMessage`. Absent = pas de socket, l'avis reste persisté. */
  readonly broadcast?: (message: unknown, conversationId: string) => Promise<void>;
};

/**
 * Repli TEXTE, jamais la vérité affichée : les clients rendent depuis
 * `metadata` dans la langue du lecteur (Prisme Linguistique). Ce texte sert aux
 * surfaces qui n'ont pas de rendu dédié — aperçu de liste, notification,
 * export — et aux clients plus anciens que ce `kind`.
 */
function fallbackContent(input: JoinSystemMessageInput): string {
  return input.isAnonymous
    ? `${input.displayName} a rejoint la conversation — visiteur sans compte`
    : `${input.displayName} a rejoint la conversation`;
}

/**
 * Annonce une arrivée dans le fil, quelle que soit la porte empruntée.
 *
 * **Ne rejette jamais.** L'avis est un accessoire de l'entrée, pas sa
 * condition : renvoyer une erreur à un anonyme déjà admis le laisserait sans
 * recours — ce lien est sa seule identité et sa seule porte. Une panne se solde
 * par un `null` et une ligne de log, jamais par un join refusé.
 */
export async function postJoinSystemMessage(
  deps: JoinSystemMessageDeps,
  input: JoinSystemMessageInput
): Promise<unknown | null> {
  const metadata: JoinNoticeMetadata = {
    kind: JOIN_NOTICE_KIND,
    participantId: input.participantId,
    displayName: input.displayName,
    isAnonymous: input.isAnonymous,
    viaShareLink: input.viaShareLink,
    // Clés ABSENTES (jamais null) quand la porte ne les fournit pas : un
    // membre ajouté n'a pas de lien, un inscrit n'a pas de pseudo `ano_`.
    ...(input.username ? { username: input.username } : {}),
    ...(input.givenName ? { givenName: input.givenName } : {}),
    ...(input.linkRules ? { linkRules: input.linkRules } : {}),
  };

  let message: unknown;
  try {
    message = await deps.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.participantId,
        content: fallbackContent(input),
        originalLanguage: 'fr',
        messageType: 'system',
        messageSource: 'system',
        metadata: metadata as unknown as Record<string, unknown>,
        ...LIVE_MESSAGE_MARK,
      },
    } as never);
  } catch (error) {
    logger.warn('join notice not written', {
      conversationId: input.conversationId,
      participantId: input.participantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  // La diffusion est gardée SÉPARÉMENT de l'écriture : un fil sans socket, ou
  // un socket tombé, ne doit pas effacer un avis déjà persisté — les présents
  // le verront au prochain chargement.
  if (deps.broadcast) {
    try {
      await deps.broadcast(message, input.conversationId);
    } catch (error) {
      logger.warn('join notice written but not broadcast', {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return message;
}
