/**
 * **La consommation d'un MÉDIA par un participant** — extraite de
 * `MessageReadStatusService` (#4605), qui pesait 3204 lignes pour un budget de
 * 800–1100 et tenait la CI de `dev` en rouge sur son cliquet de taille.
 *
 * Le découpage suit une RESPONSABILITÉ, pas une tranche : ce module répond à
 * une seule question — « qu'est-ce que CE participant a fait de CETTE pièce
 * jointe ? » (écoutée, visionnée, ouverte, téléchargée, et dans quelle version
 * linguistique). Les accusés de lecture d'un MESSAGE, les compteurs de non-lus
 * et les curseurs de conversation restent chez le service d'origine.
 *
 * La frontière n'a pas été choisie : elle a été MESURÉE. Le bloc déplacé
 * n'employait que `this.prisma` et un seul helper privé
 * (`updateAttachmentComputedStatus`), lui-même sans autre dépendance que
 * `prisma` et appelé de nulle part ailleurs. C'est ce qui rend l'extraction
 * mécanique plutôt que risquée.
 *
 * `MessageReadStatusService` DÉLÈGUE : les six méthodes publiques gardent leur
 * signature et leur place dans son API, parce que deux routes
 * (`messages-writes.ts`, `messages-reads.ts`) et les suites de tests les
 * appellent par ce nom. Le découpage est interne ; aucun appelant ne change.
 *
 * Le module de journal reste `MessageReadStatusService` À DESSEIN — les lignes
 * émises ici portent déjà le préfixe `[MessageReadStatus]`, et un tableau de
 * bord qui filtre dessus ne doit pas perdre la moitié de ses lignes le jour
 * d'un découpage interne. Le nom du module de log décrit ce qu'on OBSERVE, pas
 * l'arborescence des fichiers.
 */

import { PrismaClient } from "@meeshy/shared/prisma/client";
import { enhancedLogger } from '../utils/logger-enhanced';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { appendPlaybackStretches, parsePlaybackTrace } from '../utils/playback-trace';
import { mergeViewedLanguages, MAX_VIEWED_LANGUAGES } from '../utils/viewed-languages';

const logger = enhancedLogger.child({ module: 'MessageReadStatusService' });

// Helper pour retry des transactions en cas de deadlock (P2034)
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // P2034 = Transaction deadlock/write conflict
      if (error?.code === "P2034" && attempt < maxRetries - 1) {
        // Exponential backoff avec jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export class MessageMediaConsumptionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Enregistre qu'un message précis a été consulté dans une version linguistique
   * donnée — la bascule sur une bulle, sans changer la langue de la conversation.
   *
   * N'écrit que sur une entrée EXISTANTE : la lecture elle-même est établie par
   * `markMessagesAsRead`, appelé juste avant sur le même chemin. Créer ici
   * reviendrait à déclarer lu un message sur la seule foi d'un choix de langue.
   *
   * Résilient : une bascule perdue ne doit pas faire échouer la requête.
   */
  async recordMessageLanguageView(
    participantId: string,
    messageId: string,
    language: string | null | undefined
  ): Promise<void> {
    const code = normalizeLanguageCode(language);
    if (!code) return;

    try {
      const entry = await this.prisma.messageStatusEntry.findFirst({
        where: { messageId, participantId },
        select: { id: true, viewedLanguages: true },
      });

      if (!entry) return;
      if (entry.viewedLanguages?.includes(code)) return;
      if ((entry.viewedLanguages?.length ?? 0) >= MAX_VIEWED_LANGUAGES) return;

      await this.prisma.messageStatusEntry.update({
        where: { id: entry.id },
        data: { viewedLanguages: { push: code } },
      });
    } catch (error) {
      logger.error(
        `[MessageReadStatus] recordMessageLanguageView failed for message ${messageId}:`,
        error
      );
    }
  }

  async markAudioAsListened(
    participantId: string,
    attachmentId: string,
    options?: {
      playPositionMs?: number;
      listenDurationMs?: number;
      complete?: boolean;
      /** Écoutes réellement continues depuis le dernier rapport. */
      stretches?: readonly unknown[];
      /** Version linguistique consommée (piste traduite, transcription). */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          // La trace et l'ensemble des langues s'ACCUMULENT : il faut connaître
          // l'état courant pour y ajouter, ce qu'un upsert seul ne permet pas.
          // Lu dans la transaction, et le conflit d'unicité (attachment,
          // participant) fait rejouer l'ensemble via `withRetry`.
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { listenSegments: true, viewedLanguages: true },
          });

          const trace = appendPlaybackStretches(
            parsePlaybackTrace(previous?.listenSegments),
            options?.stretches ?? []
          );
          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              listenedAt: now,
              listenCount: 1,
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs || 0,
              listenedComplete: options?.complete || false,
              listenSegments: trace,
              viewedLanguages,
            },
            update: {
              listenedAt: now,
              listenCount: { increment: 1 },
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs
                ? { increment: options.listenDurationMs }
                : undefined,
              listenedComplete: options?.complete,
              listenSegments: trace,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking audio as listened:",
        error
      );
      throw error;
    }
  }

  async markVideoAsWatched(
    participantId: string,
    attachmentId: string,
    options?: {
      watchPositionMs?: number;
      watchDurationMs?: number;
      complete?: boolean;
      /** Visionnages réellement continus depuis le dernier rapport. */
      stretches?: readonly unknown[];
      /** Version linguistique consommée (sous-titres, piste doublée). */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          // Même raison que pour l'audio : la trace s'accumule, donc se lit
          // avant de s'écrire. Voir `markAudioAsListened`.
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { watchSegments: true, viewedLanguages: true },
          });

          const trace = appendPlaybackStretches(
            parsePlaybackTrace(previous?.watchSegments),
            options?.stretches ?? []
          );
          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              watchedAt: now,
              watchCount: 1,
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs || 0,
              watchedComplete: options?.complete || false,
              watchSegments: trace,
              viewedLanguages,
            },
            update: {
              watchedAt: now,
              watchCount: { increment: 1 },
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs
                ? { increment: options.watchDurationMs }
                : undefined,
              watchedComplete: options?.complete,
              watchSegments: trace,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking video as watched:",
        error
      );
      throw error;
    }
  }

  async markImageAsViewed(
    participantId: string,
    attachmentId: string,
    options?: {
      viewDurationMs?: number;
      wasZoomed?: boolean;
      /** Version linguistique de la légende ou du texte incrusté consulté. */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { viewedLanguages: true },
          });

          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              viewedAt: now,
              viewCount: 1,
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed || false,
              viewedLanguages,
            },
            update: {
              viewedAt: now,
              // `viewedAt` était écrasé sans rien compter : une image regardée
              // dix fois se lisait comme une image entrevue une seule.
              viewCount: { increment: 1 },
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking image as viewed:",
        error
      );
      throw error;
    }
  }

  async markAttachmentAsDownloaded(
    participantId: string,
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              downloadedAt: now,
            },
            update: {
              downloadedAt: now,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking attachment as downloaded:",
        error
      );
      throw error;
    }
  }

  async getAttachmentStatus(
    attachmentId: string,
    participantId: string
  ): Promise<{
    viewed: boolean;
    downloaded: boolean;
    listened: boolean;
    watched: boolean;
    listenCount: number;
    watchCount: number;
    listenedComplete: boolean;
    watchedComplete: boolean;
    lastPlayPositionMs: number | null;
    lastWatchPositionMs: number | null;
  } | null> {
    try {
      const status = await this.prisma.attachmentStatusEntry.findUnique({
        where: {
          attachment_participant_status: { attachmentId, participantId },
        },
      });

      if (!status) {
        return null;
      }

      return {
        viewed: !!status.viewedAt,
        downloaded: !!status.downloadedAt,
        listened: !!status.listenedAt,
        watched: !!status.watchedAt,
        listenCount: status.listenCount,
        watchCount: status.watchCount,
        listenedComplete: status.listenedComplete,
        watchedComplete: status.watchedComplete,
        lastPlayPositionMs: status.lastPlayPositionMs,
        lastWatchPositionMs: status.lastWatchPositionMs,
      };
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting attachment status:",
        error
      );
      return null;
    }
  }
  private async updateAttachmentComputedStatus(
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          mimeType: true,
          message: {
            select: {
              conversationId: true,
              senderId: true,
            },
          },
        },
      });

      if (!attachment) return;

      const authorId = attachment.message.senderId;
      const conversationId = attachment.message.conversationId;

      const totalParticipants = await this.prisma.participant.count({
        where: {
          conversationId,
          isActive: true,
          id: { not: authorId },
        },
      });

      // Deux jeux de compteurs (user 2026-08-18 : « remonter les lectures
      // de l'audio même si c'est l'auteur qui le lit ») :
      // - AFFICHÉS (`viewedCount`/`downloadedCount`/`consumedCount`) :
      //   auteur INCLUS — sa lecture compte comme celle de n'importe qui ;
      // - COMPLÉTUDE (`…ByAllAt`) : auteur EXCLU des deux côtés de la
      //   comparaison — sinon sa propre écoute allumerait « écouté par
      //   tous » avant qu'un seul destinataire n'ait ouvert le vocal.
      //
      // `participant: { conversationId }` sur CHAQUE requête : les lignes
      // HÉRITÉES du bug d'identifiant (participantId = User.id, écrites
      // avant le correctif de la route) ne référencent aucun Participant —
      // sans ce filtre elles comptaient double (l'upsert post-correctif crée
      // une seconde ligne pour le même humain) et passaient TOUJOURS
      // l'exclusion auteur (User.id ≠ Participant.id de l'auteur), allumant
      // des « écouté par tous » fantômes. Même règle d'orphelines que les
      // lectures (`if (!participant) return null`).
      const [
        viewedCount, downloadedCount, listenedCount, watchedCount,
        viewedCountOthers, downloadedCountOthers, listenedCountOthers, watchedCountOthers,
      ] =
        await Promise.all([
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, viewedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, downloadedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, listenedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, watchedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
        ]);

      const isAudio = attachment.mimeType.startsWith("audio/");
      const isVideo = attachment.mimeType.startsWith("video/");
      const consumedCount = isAudio
        ? listenedCount
        : isVideo
        ? watchedCount
        : viewedCount;

      let viewedByAllAt: Date | null = null;
      let downloadedByAllAt: Date | null = null;
      let listenedByAllAt: Date | null = null;
      let watchedByAllAt: Date | null = null;

      if (totalParticipants > 0) {
        if (viewedCountOthers >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { viewedAt: "desc" },
            select: { viewedAt: true },
          });
          viewedByAllAt = last?.viewedAt || null;
        }

        if (downloadedCountOthers >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { downloadedAt: "desc" },
            select: { downloadedAt: true },
          });
          downloadedByAllAt = last?.downloadedAt || null;
        }

        if (listenedCountOthers >= totalParticipants && isAudio) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { listenedAt: "desc" },
            select: { listenedAt: true },
          });
          listenedByAllAt = last?.listenedAt || null;
        }

        if (watchedCountOthers >= totalParticipants && isVideo) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { watchedAt: "desc" },
            select: { watchedAt: true },
          });
          watchedByAllAt = last?.watchedAt || null;
        }
      }

      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: {
          viewedCount,
          downloadedCount,
          consumedCount,
          viewedByAllAt,
          downloadedByAllAt,
          listenedByAllAt,
          watchedByAllAt,
        },
      });
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error updating attachment computed status:",
        error
      );
    }
  }
}
