/**
 * Aides de la LISTE DE MESSAGES (issue #4284 — découpage de `messages.ts`,
 * 2945 lignes, en fichiers frères par responsabilité). La route
 * `GET /conversations/:id/messages` fait à elle seule ~1140 lignes et dépasse
 * le budget même isolée dans son propre fichier — ce module porte donc ses
 * AIDES (construction du `select`, chargement des accusés de lecture,
 * sérialisation d'une ligne de message, enrichissement transfert/citation de
 * post) en fonctions pures nommées, appelées depuis le handler resté dans
 * `messages-list.ts`. Voir `messages.ts` pour le composeur
 * (`registerMessagesRoutes`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { aggregateAttachmentReactions } from '../../socketio/serializeAttachmentForSocket';
import {
  buildPostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
} from '../../services/messaging/postReplySnapshot';
import { sharedPlaceFromMetadata, hoistLocationOnto } from '../../services/location/sharedPlace';
import { stickerFromMetadata, hoistStickerOnto } from '../../services/stickers/messageSticker';
import { resolveForwardSourceGateForReader } from '../../services/preferences/forward-source-visibility.js';
import { redactForwardedAttachmentUrlsIn } from '../../services/preferences/forwarded-attachment-urls.js';
import { attachmentMediaSelect, attachmentFullSelect, attachmentForwardPreviewSelect } from '../../services/attachments/attachmentIncludes';
import { resolveParticipantAvatar, resolveParticipantDisplayName, resolveAnonymousSenderIdentity } from '@meeshy/shared/utils/participant-helpers';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { transformTranslationsToArray } from '../../utils/translation-transformer';
import { messageSenderUserSelect } from './utils/message-sender-select';
import { logger } from './messages-shared';

/**
 * Nettoie les attachments pour l'API en transformant les valeurs invalides
 * Fixe spécifiquement voiceSimilarityScore: false -> null pour compatibilité schéma
 */
function cleanAttachmentsForApi(
  attachments: any[],
  languageFilter?: readonly string[],
  currentParticipantId?: string,
  consumptionMap?: Map<string, CurrentUserConsumption>
): any[] {
  if (!attachments || !Array.isArray(attachments)) {
    return attachments;
  }

  // Bandwidth opt-in : restreindre les traductions audio (Prisme) aux langues
  // demandées, miroir exact du filtre appliqué aux traductions texte.
  const langSet = languageFilter && languageFilter.length > 0
    ? new Set(languageFilter.map((l) => l.toLowerCase()))
    : null;

  if (attachments.length > 0) {
    logger.debug(`🧹 [CLEAN] Nettoyage de ${attachments.length} attachment(s) pour l'API`);
  }

  return attachments.map((att, attIndex) => {
    const cleaned = { ...att };

    // BUG2 A' — agréger les réactions par-image en reactionSummary + currentUserReactions
    // (miroir des réactions message-level) et retirer les rows brutes.
    const __reactions = aggregateAttachmentReactions(cleaned.reactions, currentParticipantId);
    cleaned.reactionSummary = __reactions.reactionSummary;
    cleaned.currentUserReactions = __reactions.currentUserReactions;
    delete cleaned.reactions;

    // #3909 — la progression PERSONNELLE de lecture, REVENUE, et cette fois
    // déclarée au `messageAttachmentSchema` avant d'être calculée. #4177
    // l'avait retirée parce qu'elle mourait à la sérialisation ; l'ordre
    // corrigé est déclaration → projection → lecteur. `null` = jamais consommé
    // par ce participant, ce qu'un lecteur doit distinguer de « position 0 ».
    cleaned.currentUserConsumption = consumptionMap?.get(att.id) ?? null;

    // Nettoyer la transcription
    if (cleaned.transcription && cleaned.transcription.segments) {
      const originalSegment = cleaned.transcription.segments[0];

      // Log speakerAnalysis
      let speakerInfo = '';
      if (cleaned.transcription.speakerAnalysis) {
        const speakers = cleaned.transcription.speakerAnalysis.speakers || [];
        const withVoiceChars = speakers.filter((s: any) => s.voiceCharacteristics).length;
        speakerInfo = `speakerAnalysis: ${speakers.length} speaker(s), voiceChars: ${withVoiceChars}/${speakers.length}`;
        if (withVoiceChars > 0) {
          const firstSpeaker = speakers.find((s: any) => s.voiceCharacteristics);
          speakerInfo += `, firstSpeaker: sid=${firstSpeaker.sid}, pitch=${firstSpeaker.voiceCharacteristics.pitch?.mean_hz}Hz`;
        }
      } else {
        speakerInfo = '⚠️ AUCUN speakerAnalysis';
      }

      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - Transcription: ${cleaned.transcription.segments.length} segments | ${speakerInfo} | segment[0]: hasStartMs=${'startMs' in originalSegment}, hasEndMs=${'endMs' in originalSegment}, hasSpeakerId=${'speakerId' in originalSegment}, voiceSimilarityScoreType=${typeof originalSegment.voiceSimilarityScore}, voiceSimilarityScoreValue=${originalSegment.voiceSimilarityScore}`);

      cleaned.transcription.segments = cleaned.transcription.segments.map((seg: any) => ({
        ...seg,
        // Convertir false/true en null (schéma attend number | null)
        voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
      }));

      const cleanedSegment = cleaned.transcription.segments[0];
      logger.debug(`🧹 [CLEAN] Segment nettoyé [0]: text="${cleanedSegment.text}", startMs=${cleanedSegment.startMs}, endMs=${cleanedSegment.endMs}, speakerId=${cleanedSegment.speakerId}, voiceSimilarityScore=${cleanedSegment.voiceSimilarityScore}, confidence=${cleanedSegment.confidence}`);
    }

    // Nettoyer les traductions
    if (cleaned.translations && typeof cleaned.translations === 'object') {
      const langs = Object.keys(cleaned.translations);
      const translationsInfo = langs.map(lang => {
        const trans = cleaned.translations[lang] as any;
        return `${lang}(url="${trans.url || '⚠️ VIDE'}", segments=${trans.segments?.length || 0})`;
      }).join(', ');

      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - Traductions: ${langs.length} langue(s) [${translationsInfo}]`);

      const cleanedTranslations: any = {};
      for (const [lang, translation] of Object.entries(cleaned.translations)) {
        if (langSet && !langSet.has(lang.toLowerCase())) continue;
        const trans = translation as any;
        cleanedTranslations[lang] = {
          ...trans,
          segments: trans.segments?.map((seg: any) => ({
            ...seg,
            // Convertir false/true en null (schéma attend number | null)
            voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
          }))
        };
      }
      cleaned.translations = cleanedTranslations;
    } else {
      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - AUCUNE traduction trouvée`);
    }

    return cleaned;
  });
}

/**
 * Forward watermark filter for GET messages. Given an ISO8601 `after`
 * timestamp, returns a Prisma `createdAt > after` clause so a client can
 * resume a missed-message gap from its per-conversation high-water mark
 * (local-first incremental backfill) instead of refetching offset:0. Returns
 * null when `after` is absent or unparseable — the caller then keeps its
 * default offset/cursor paging and never builds an `Invalid Date` filter.
 */
export function buildAfterWatermarkClause(after?: string): { createdAt: { gt: Date } } | null {
  if (!after) return null;
  const d = new Date(after);
  if (isNaN(d.getTime())) return null;
  return { createdAt: { gt: d } };
}

/**
 * Construit le `select` Prisma de `GET /conversations/:id/messages` selon les
 * paramètres d'inclusion (traductions, réponses citées).
 */
export function buildMessageListSelect(options: {
  includeTranslations: boolean;
  includeReplies: boolean;
}): any {
  const { includeTranslations, includeReplies } = options;
      // Construire le select Prisma dynamiquement selon les paramètres d'inclusion
      // (avant les requêtes pour permettre la parallélisation)
      const messageSelect: any = {
        // ===== CHAMPS DE BASE =====
        id: true,
        // Idempotency key — exposed so clients reconcile optimistic rows by
        // `clientMessageId` on a cold message-list load (avoids duplicate
        // bubbles when the optimistic→server ack was missed offline).
        clientMessageId: true,
        content: true,
        originalLanguage: true,
        conversationId: true,
        senderId: true,
        messageType: true,
        messageSource: true,
        // Structured per-type payload (call-summary facts for system messages)
        metadata: true,

        // ===== ÉDITION / SUPPRESSION =====
        isEdited: true,
        editedAt: true,
        deletedAt: true,

        // ===== REPLY / FORWARD =====
        replyToId: true,
        storyReplyToId: true,
        forwardedFromId: true,
        forwardedFromConversationId: true,

        // ===== VIEW-ONCE / BLUR / EXPIRATION =====
        isViewOnce: true,
        maxViewOnceCount: true,
        viewOnceCount: true,
        isBlurred: true,
        effectFlags: true,
        expiresAt: true,

        // ===== ÉPINGLAGE =====
        pinnedAt: true,
        pinnedBy: true,

        // ===== STATUTS AGRÉGÉS =====
        // Aucune colonne dénormalisée n'est lue ici : les cinq
        // (`deliveredToAllAt`, `receivedByAllAt`, `readByAllAt`,
        // `deliveredCount`, `readCount`) ont perdu leur écrivain quand le suivi
        // est passé aux curseurs — `updateMessageComputedStatus` est un no-op
        // assumé. Tout le bloc de statut vient de
        // `MessageReadStatusService.getConversationReadStatuses`.

        // ===== RÉACTIONS (dénormalisées - toujours incluses) =====
        reactionSummary: true,
        reactionCount: true,

        // ===== CHIFFREMENT =====
        isEncrypted: true,
        encryptionMode: true,

        // ===== TIMESTAMPS =====
        createdAt: true,
        updatedAt: true,

        // ===== MENTIONS =====
        validatedMentions: true,

        // ===== RELATIONS OBLIGATOIRES =====
        sender: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            avatar: true,
            type: true,
            role: true,
            language: true,
            // Identité humaine d'un auteur SANS COMPTE : le nom donné au
            // formulaire d'entrée vit dans le profil de session. Jamais servi
            // brut (email/birthday) — résolu puis détruit au formatage.
            anonymousSession: { select: { profile: true } },
            user: {
              select: messageSenderUserSelect
            }
          }
        },
        attachments: { select: attachmentMediaSelect },
        _count: {
          select: {
            reactions: true,
            statusEntries: true
          }
        }
      };

      // ===== RELATIONS OPTIONNELLES (selon paramètres include_*) =====

      // `translations` est un champ Json sur Message (pas une relation) — on
      // ne le ramène du DB que si le client le demande. Économie bandwidth :
      // une conv warm-cache iOS (GRDB déjà peuplé + socket temps réel) appelle
      // `?include_translations=false` et évite ~22 KB par refresh sur 30
      // messages × 3 langues. Cold-start envoie `true` par défaut.
      if (includeTranslations) {
        messageSelect.translations = true;
      }

      if (includeReplies) {
        // Charger les détails du message de réponse
        messageSelect.replyTo = {
          select: {
            id: true,
            content: true,
            originalLanguage: true,
            createdAt: true,
            senderId: true,
            validatedMentions: true,
            // La protection du message CITÉ — le niveau que ce select ne
            // demandait pas du tout, alors que `attachmentFullSelect` la sert
            // déjà sur ses PIÈCES JOINTES (`reply-attachment-protection-contract`).
            // Sans ces champs, un client ne peut pas savoir qu'il rend le texte
            // d'un message à vue unique : répondre à un message protégé en
            // publiait le contenu entier dans chaque bulle-citation du fil.
            // Même famille, une couche plus haut : ce que la route CONSTRUIT et
            // ce que le schéma DÉCLARE sont deux vérités séparées — les deux
            // ont dû bouger.
            isViewOnce: true,
            isBlurred: true,
            expiresAt: true,
            effectFlags: true,
            isEncrypted: true,
            encryptionMode: true,
            // Lot 2 : le message CITÉ est un objet imbriqué, pas la racine —
            // le hoist doit porter sur `replyTo` lui-même, pas seulement sur
            // le message qui cite.
            metadata: true,
            sender: {
              select: {
                id: true,
                userId: true,
                displayName: true,
                avatar: true,
                type: true,
                language: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
                }
              }
            },
            attachments: { select: attachmentFullSelect, take: 4 },
            _count: {
              select: {
                reactions: true
              }
            }
          }
        };
      }

  return messageSelect;
}

/**
 * Charge les accusés de lecture agrégés (`MessageReadStatusService`) pour une
 * page de `GET /conversations/:id/messages`. `hasAuthenticatedUserId` reflète
 * `authRequest.authContext?.userId` au site d'appel — un anonyme ou un
 * appelant sans messages reçoit une carte vide, sans requête.
 */
export async function loadMessageReadStatusMap(
  prisma: PrismaClient,
  conversationId: string,
  messages: any[],
  hasAuthenticatedUserId: boolean
): Promise<Map<string, {
  deliveredCount: number;
  readCount: number;
  recipientCount: number;
  deliveredToAllAt: Date | null;
  readByAllAt: Date | null;
}>> {
      // Enrichir les messages avec les vrais statuts de lecture.
      // Les champs dénormalisés en base (`deliveredCount`, `readCount`) n'ont
      // AUCUN écrivain : ils valent toujours zéro. Le comptage vit dans
      // `MessageReadStatusService.getConversationReadStatuses`, l'unique
      // source de vérité partagée avec les trois autres lecteurs d'accusés
      // (`getMessageReadStatus`, `getMessageStatusDetails`,
      // `getLatestMessageSummary`). Cette route en tenait une COPIE, qui avait
      // dérivé sur un point décisif : elle ne consultait pas la préférence
      // `showReadReceipts`, si bien que le rattrapage REST révélait à
      // l'expéditeur la lecture d'un destinataire qui l'avait explicitement
      // tue — et comptait ce même destinataire dans le dénominateur, que le
      // canal socket en retire.
      const readStatusMap = new Map<string, {
        deliveredCount: number;
        readCount: number;
        recipientCount: number;
        deliveredToAllAt: Date | null;
        readByAllAt: Date | null;
      }>();
      if (messages.length > 0 && hasAuthenticatedUserId) {
        try {
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
          const readStatusService = new MessageReadStatusService(prisma);
          const statuses = await readStatusService.getConversationReadStatuses(
            conversationId,
            (messages as any[]).map((m: any) => m.id)
          );
          for (const [messageId, status] of statuses) {
            readStatusMap.set(messageId, {
              deliveredCount: status.receivedCount,
              readCount: status.readCount,
              // Dénominateur all-or-nothing faisant autorité : les
              // destinataires actifs, expéditeur exclu, opt-out exclus. Permet
              // au client d'allumer ✓✓ / « lu » sur le compte réel du serveur
              // plutôt que sur un `memberCount` local périmé.
              recipientCount: status.totalMembers,
              // Les DATES du même seuil, dérivées de la même union — l'instant
              // du DERNIER destinataire servi, `null` tant qu'il en manque un.
              deliveredToAllAt: status.deliveredToAllAt,
              readByAllAt: status.readByAllAt,
            });
          }
        } catch (err) {
          logger.warn('[CONVERSATIONS] Failed to compute read statuses:', err);
        }
      }

  return readStatusMap;
}

/**
 * La progression PERSONNELLE de lecture d'un participant sur une pièce jointe.
 *
 * Sert la reprise cross-device : rouvrir un vocal ou une vidéo repart là où on
 * s'était arrêté, sur n'importe quel appareil (#3909).
 */
export type CurrentUserConsumption = {
  lastPlayPositionMs: number | null;
  listenedComplete: boolean;
  lastWatchPositionMs: number | null;
  watchedComplete: boolean;
};

/**
 * Charge la progression du participant courant sur les pièces jointes de la
 * PAGE — une seule requête, bornée aux identifiants rendus, scopée au
 * participant. Miroir exact de `userReactionsMap`.
 *
 * ## Ce champ a déjà vécu, et il est mort d'être indéclaré
 *
 * La projection existait depuis juin 2026 et `fast-json-stringify` la retirait
 * de CHAQUE réponse, faute d'être déclarée au `messageAttachmentSchema` : deux
 * requêtes Prisma par page payées pour un champ qu'aucun client ne recevait.
 * #4177 a retiré ce travail mort, à raison.
 *
 * Ce qui la ramène n'est pas l'inverse de ce retrait : c'est la DÉCLARATION,
 * posée d'abord (`packages/shared/types/api-schemas.ts`). Sans elle, ce
 * chargeur remourrait en silence — et le lecteur web qui l'attend
 * (`useMediaConsumptionReporter`) serait un contrôle non alimenté, ce qui se
 * voit encore moins qu'un champ absent.
 */
export async function loadCurrentUserConsumptionMap(
  prisma: PrismaClient,
  messages: readonly any[],
  currentParticipantId: string | undefined
): Promise<Map<string, CurrentUserConsumption>> {
  const map = new Map<string, CurrentUserConsumption>();
  if (!currentParticipantId || messages.length === 0) return map;

  const attachmentIds: string[] = messages.flatMap((m: any) =>
    Array.isArray(m.attachments) ? m.attachments.map((a: any) => a.id) : []
  );
  if (attachmentIds.length === 0) return map;

  try {
    const rows = await prisma.attachmentStatusEntry.findMany({
      where: { attachmentId: { in: attachmentIds }, participantId: currentParticipantId },
      // Borne EXACTE, pas arbitraire : `@@unique([attachmentId, participantId])`
      // garantit au plus une ligne par pièce jointe pour ce participant, donc
      // `take` ne peut rien tronquer — il DIT seulement la borne que le couple
      // impose déjà, ce que le cliquet des `findMany` non bornés demande.
      take: attachmentIds.length,
      select: {
        attachmentId: true,
        lastPlayPositionMs: true,
        listenedComplete: true,
        lastWatchPositionMs: true,
        watchedComplete: true,
      },
    });
    for (const row of rows) {
      map.set(row.attachmentId, {
        lastPlayPositionMs: row.lastPlayPositionMs ?? null,
        listenedComplete: row.listenedComplete ?? false,
        lastWatchPositionMs: row.lastWatchPositionMs ?? null,
        watchedComplete: row.watchedComplete ?? false,
      });
    }
  } catch (err) {
    // Une reprise absente coûte un redémarrage au début ; faire échouer la
    // liste entière coûte la conversation. La carte vide est le bon repli.
    logger.warn('[CONVERSATIONS] Failed to load media consumption:', err);
  }
  return map;
}

/**
 * Sérialise une ligne `Message` de `GET /conversations/:id/messages` au
 * format `GatewayMessage` (@meeshy/shared/types) : présence de l'expéditeur,
 * pièces jointes nettoyées, traductions filtrées par le Prisme, accusés de
 * lecture agrégés.
 */
export type MessageRowMappingContext = {
  includeTranslations: boolean;
  includeReplies: boolean;
  hasLanguageFilter: boolean;
  languageFilter: readonly string[] | undefined;
  currentParticipantId: string | undefined;
  readStatusMap: Map<string, {
    deliveredCount: number;
    readCount: number;
    recipientCount: number;
    deliveredToAllAt: Date | null;
    readByAllAt: Date | null;
  }>;
  senderPresenceVis: any;
  listMissingEntry: any;
  /** #3909 — la progression de lecture du participant, par pièce jointe. */
  consumptionMap: Map<string, CurrentUserConsumption>;
};

export function mapMessageRowForList(message: any, ctx: MessageRowMappingContext): any {
  const {
    includeTranslations,
    includeReplies,
    hasLanguageFilter,
    languageFilter,
    currentParticipantId,
    readStatusMap,
    senderPresenceVis,
    listMissingEntry,
  } = ctx;
        // Construire l'objet de réponse aligné avec GatewayMessage
        const mappedMessage: any = {
          // Identifiants
          id: message.id,
          // Idempotency key — lets clients reconcile an optimistic send with
          // its server record by `clientMessageId` on a cold list load.
          clientMessageId: message.clientMessageId ?? null,
          conversationId: message.conversationId,
          // CORRECTION senderId: en DB, senderId = Participant.id (FK).
          // Les clients (iOS/Web) comparent senderId avec leur userId (User.id).
          // On résout ici : senderId devient sender.userId si disponible.
          senderId: message.sender?.userId ?? message.sender?.user?.id ?? message.senderId,
          // Conserver le participantId brut pour debug/internal usage
          senderParticipantId: message.senderId,
          

          // Contenu
          content: message.content,
          originalLanguage: message.originalLanguage || 'fr',
          messageType: message.messageType,
          messageSource: message.messageSource,
          // Structured per-type payload (call-summary facts for system messages)
          metadata: message.metadata ?? undefined,

          // Édition/Suppression
          isEdited: message.isEdited,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,

          // Reply/Forward
          replyToId: message.replyToId,
          storyReplyToId: message.storyReplyToId,
          forwardedFromId: message.forwardedFromId,
          forwardedFromConversationId: message.forwardedFromConversationId,

          // View-once / Blur / Expiration
          isViewOnce: message.isViewOnce,
          maxViewOnceCount: message.maxViewOnceCount,
          viewOnceCount: message.viewOnceCount,
          isBlurred: message.isBlurred,
          effectFlags: message.effectFlags,
          expiresAt: message.expiresAt,

          // Épinglage
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,

          // Statuts agrégés — CALCULÉS, jamais lus de la ligne Message : ses
          // champs `deliveredCount`/`readCount` n'ont aucun écrivain et valent
          // toujours zéro. Les garder en repli donnait à un compteur mort
          // l'apparence d'une valeur de secours.
          //
          // Les DATES du seuil « tous servis » avaient gardé ce repli une
          // couche de plus : `deliveredToAllAt`/`readByAllAt` sortaient encore
          // de la ligne, donc valaient `null` en permanence — et les trois
          // clients lisent `readByAllAt != null` comme la PREUVE que tous les
          // destinataires ont lu (`DeliveryStatusResolver`, iOS et Android).
          // `receivedByAllAt`, lui, n'avait aucun lecteur nulle part : il sort.
          deliveredToAllAt: readStatusMap.get(message.id)?.deliveredToAllAt ?? null,
          readByAllAt: readStatusMap.get(message.id)?.readByAllAt ?? null,
          deliveredCount: readStatusMap.get(message.id)?.deliveredCount ?? 0,
          readCount: readStatusMap.get(message.id)?.readCount ?? 0,
          // Dénominateur des destinataires actifs faisant autorité côté serveur
          // (participants moins l'expéditeur, opt-out retirés). `0` quand rien
          // n'a été calculé (pas de contexte d'authentification) — le client
          // retombe alors sur son compte de membres local.
          recipientCount: readStatusMap.get(message.id)?.recipientCount ?? 0,

          // Réactions (dénormalisées - toujours incluses)
          reactionSummary: message.reactionSummary,
          reactionCount: message.reactionCount,
          // #4177 — `currentUserReactions` (message-level) retiré : ni
          // déclaré dans `messageSchema` ni lu par aucun client, il payait
          // un `reaction.findMany` par page pour rien depuis toujours. Son
          // miroir PAR PIÈCE JOINTE (`attachments[].currentUserReactions`,
          // via `aggregateAttachmentReactions`) reste servi — lui EST
          // déclaré et lu.

          // Chiffrement
          isEncrypted: message.isEncrypted,
          encryptionMode: message.encryptionMode,

          // Timestamps
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,

          // Mentions
          validatedMentions: message.validatedMentions,

          // Relations obligatoires
          sender: message.sender ? (() => {
            // PII : le profil de session (email/birthday) ne sort JAMAIS — on
            // en résout l'identité puis on le détruit avant le spread.
            const { anonymousSession: _anonymousSession, ...senderData } = message.sender;
            const anonymousIdentity = message.sender.type === 'anonymous'
              ? resolveAnonymousSenderIdentity(message.sender)
              : null;
            return applyPresenceVisibilityAsOffline(
              {
                ...senderData,
                username: anonymousIdentity?.username
                  ?? message.sender.user?.username ?? message.sender.username ?? null,
                // T16 — firstName/lastName were serialized but read by no client and
                // are no longer fetched (messageSenderUserSelect trims them).
                // Auteur sans compte : le nom DONNÉ au formulaire prime, le pseudo
                // ano_ descend en handle (`username` ci-dessus).
                displayName: anonymousIdentity && anonymousIdentity.displayName
                  ? anonymousIdentity.displayName
                  : resolveParticipantDisplayName(message.sender),
                avatar: resolveParticipantAvatar(message.sender),
                isOnline: message.sender.user?.isOnline ?? message.sender.isOnline ?? null,
                lastActiveAt: message.sender.user?.lastActiveAt ?? message.sender.lastActiveAt ?? null,
              },
              message.sender.userId ? senderPresenceVis.get(message.sender.userId) : undefined,
              { onMissingEntry: listMissingEntry },
            );
          })() : null,
          attachments: cleanAttachmentsForApi(message.attachments, languageFilter, currentParticipantId, ctx.consumptionMap),
          _count: message._count
        };

        // Relations optionnelles (selon paramètres include_*)
        if (includeTranslations && message.translations) {
          // Transformer JSON vers array pour rétrocompatibilité frontend
          mappedMessage.translations = transformTranslationsToArray(
            message.id,
            message.translations as Record<string, any>,
            hasLanguageFilter ? { languages: languageFilter } : undefined
          );
        }
        if (includeReplies && message.replyTo) {
          const replySender = (message as any).replyTo.sender;
          // Lot 2 : hoistLocationOnto hisse metadata.location du message CITÉ
          // — sans lui, une citation d'un message géolocalisé n'affiche
          // jamais sa position, même si la liste principale la restitue.
          mappedMessage.replyTo = hoistStickerOnto(hoistLocationOnto({
            ...message.replyTo,
            originalLanguage: message.replyTo.originalLanguage || 'fr',
            sender: replySender ? {
              ...replySender,
              username: replySender.user?.username ?? replySender.username ?? null,
              displayName: resolveParticipantDisplayName(replySender),
              avatar: resolveParticipantAvatar(replySender),
            } : null,
          }));
        }

        return mappedMessage;
}

/**
 * Enrichit `mappedMessages` (mutation en place) avec l'aperçu des messages
 * transférés — source directe (`forwardedFrom`) et conversation source
 * (`forwardedFromConversation`) — en respectant la réciprocité de partage de
 * l'auteur du transfert (`resolveForwardSourceGateForReader`).
 */
export async function enrichForwardedMessagesForList(
  prisma: PrismaClient,
  userId: string | null | undefined,
  mappedMessages: any[]
): Promise<void> {
      // Charger les détails du message d'origine et de la conversation source
      const forwardedIds = mappedMessages
        .filter((m: any) => m.forwardedFromId)
        .map((m: any) => m.forwardedFromId);

      if (forwardedIds.length > 0) {
        const uniqueForwardedIds = [...new Set(forwardedIds)] as string[];

        // Réciprocité de la SOURCE : elle n'est enrichie que si l'auteur du
        // transfert ET le lecteur l'autorisent. Résolue AVANT la construction,
        // pas après : ce qui n'est pas construit ne peut pas fuiter, alors
        // qu'un objet construit puis « filtré » n'attend qu'un chemin de
        // sortie oublié. L'auteur du transfert est l'expéditeur du message
        // PORTEUR — ses préférences sont déjà chaudes dans le cache module,
        // la liste ayant lu celles de tous les expéditeurs de la page.
        const forwardSourceGate = await resolveForwardSourceGateForReader(
          prisma,
          userId,
          // Les DEUX porteurs, pas seulement `forwardedFromId` : un message
          // qui ne nomme que sa conversation source a lui aussi un auteur dont
          // la volonté compte, et c'est justement le NOM DE GROUPE que la
          // directive ajoute à la portée de la règle.
          mappedMessages
            .filter((m: any) => m.forwardedFromId || m.forwardedFromConversationId)
            .map((m: any) => m.sender?.userId ?? null)
        );

        const forwardedMessages = await prisma.message.findMany({
          where: { id: { in: uniqueForwardedIds } },
          select: {
            id: true,
            content: true,
            senderId: true,
            conversationId: true,
            messageType: true,
            createdAt: true,
            // Lot 2 : le message d'ORIGINE transféré est un objet imbriqué —
            // sans `metadata`, un message géolocalisé transféré n'affiche
            // jamais sa position dans l'aperçu de transfert.
            metadata: true,
            sender: {
              select: { id: true, userId: true, displayName: true, avatar: true, user: { select: { username: true } } }
            },
            attachments: { select: attachmentForwardPreviewSelect, take: 1 }
          }
        });

        const forwardedMap = new Map(forwardedMessages.map(m => [m.id, m]));

        // Charger les conversations sources
        const convIds = mappedMessages
          .filter((m: any) => m.forwardedFromConversationId)
          .map((m: any) => m.forwardedFromConversationId);
        const uniqueConvIds = [...new Set(convIds)] as string[];

        let convMap = new Map<string, any>();
        if (uniqueConvIds.length > 0) {
          const conversations = await prisma.conversation.findMany({
            where: { id: { in: uniqueConvIds } },
            select: { id: true, title: true, identifier: true, type: true, avatar: true }
          });
          convMap = new Map(conversations.map(c => [c.id, c]));
        }

        // Enrichir chaque message forwardé
        for (const msg of mappedMessages) {
          // Les DEUX objets nommants tombent ensemble ou pas du tout : les
          // trois politiques clientes nomment le groupe à partir du seul
          // `forwardedFromConversation` et l'auteur d'origine à partir du seul
          // `forwardedFrom.sender`. N'en taire qu'un laisse l'autre nommer.
          if (!forwardSourceGate(msg.sender?.userId ?? null)) {
            // Taire le NOM ne suffit pas : la copie de transfert réutilise le
            // chemin de stockage de l'original, qui porte le `User.id` de son
            // auteur. La même réponse livrait l'identité qu'elle refusait de
            // nommer. Les pièces jointes passent donc à l'adressage par
            // identifiant — mêmes octets, même autorisation, aucun chemin.
            msg.attachments = redactForwardedAttachmentUrlsIn(msg.attachments);
            continue;
          }
          if (msg.forwardedFromId) {
            const original = forwardedMap.get(msg.forwardedFromId);
            if (original) {
              // Lot 2 : la position du message TRANSFÉRÉ (l'objet imbriqué),
              // pas celle de `msg` lui-même — sans elle, un message transféré
              // géolocalisé n'affiche jamais sa position dans l'aperçu.
              const forwardedPlace = sharedPlaceFromMetadata((original as { metadata?: unknown }).metadata);
              const forwardedSticker = stickerFromMetadata((original as { metadata?: unknown }).metadata);
              msg.forwardedFrom = {
                id: original.id,
                content: original.content,
                messageType: original.messageType,
                createdAt: original.createdAt,
                sender: original.sender ? {
                  ...original.sender,
                  username: (original.sender as any).user?.username ?? (original.sender as any).username ?? null,
                  displayName: resolveParticipantDisplayName(original.sender as any),
                  avatar: resolveParticipantAvatar(original.sender as any),
                } : null,
                attachments: original.attachments,
                ...(forwardedPlace ? { location: forwardedPlace } : {}),
                ...(forwardedSticker ? { sticker: forwardedSticker } : {}),
              };
            }
          }
          if (msg.forwardedFromConversationId) {
            const conv = convMap.get(msg.forwardedFromConversationId);
            if (conv) {
              msg.forwardedFromConversation = {
                id: conv.id,
                title: conv.title,
                identifier: conv.identifier,
                type: conv.type,
                avatar: conv.avatar
              };
            }
          }
        }
      }
}

export async function enrichPostReplyMessagesForList(
  prisma: PrismaClient,
  mappedMessages: any[]
): Promise<void> {
      // ===== ENRICHIR LES RÉPONSES À UN POST (status/story/reel/post) =====
      // Source de vérité : le SNAPSHOT figé dans `metadata.postReplyTo`, capturé
      // au moment de la réponse — il survit à l'expiration du post (STATUS 1h /
      // STORY 21h) et à sa suppression. On le hisse en champ top-level
      // `postReplyTo` (contrat client propre). La résolution live de
      // `storyReplyToId` n'est qu'un fallback pour les messages legacy.
      for (const m of mappedMessages) {
        if (!m.storyReplyToId) continue;
        const fromSnapshot = postReplyToFromMetadata(m.metadata);
        if (fromSnapshot) m.postReplyTo = fromSnapshot;
      }

      const legacyPostReplyIds = mappedMessages
        .filter((m: any) => m.storyReplyToId && !m.postReplyTo)
        .map((m: any) => m.storyReplyToId as string);

      if (legacyPostReplyIds.length > 0) {
        const uniquePostIds = [...new Set(legacyPostReplyIds)];
        const citedPosts = await prisma.post.findMany({
          where: { id: { in: uniquePostIds } },
          select: POST_REPLY_SNAPSHOT_SELECT,
        });
        const postMap = new Map(citedPosts.map((p) => [p.id, p]));
        for (const m of mappedMessages) {
          if (!m.storyReplyToId || m.postReplyTo) continue;
          const post = postMap.get(m.storyReplyToId);
          if (!post) continue; // post supprimé sans snapshot → citation absente
          m.postReplyTo = buildPostReplyTo(post);
        }
      }
}
