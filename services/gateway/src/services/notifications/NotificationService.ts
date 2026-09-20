/**
 * NotificationService V2 - Structure groupée et moderne
 *
 * Changements majeurs :
 * - Pas de champ `title` (construit côté frontend via i18n)
 * - Structure groupée : actor, context, metadata, state, delivery
 * - Pas de backward compatibility
 * - Code simplifié et type-safe
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { AttachmentTranslationTrack } from '@meeshy/shared/types/attachment-audio';
import type {
  NotificationDeletedBulkScope,
  NotificationReadBulkScope,
} from '@meeshy/shared/types/notification';
import { SequenceService } from '../SequenceService';
import { emitWithSeq } from '../../socketio/utils/emitWithSeq';
import type {
  NotificationActor,
  NotificationContext,
  NotificationMetadata,
  NotificationPriority,
  NotificationType,
  Notification,
} from '@meeshy/shared/types/notification';
import type { UserUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { getDistinctConversationPartnerUserIds } from '../../utils/conversation-partners';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreference as NotifPrefs,
} from '@meeshy/shared/types/preferences';
import { isWithinDnd } from '@meeshy/shared/utils/notification-dnd';
import {
  resolveUserLanguage,
  resolveUserLanguagesOrdered,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';
import { notificationString, buildNotificationDisplay } from '@meeshy/shared/utils/notification-strings';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';
import { recipientDateLocale, recipientLanguage } from '../../utils/recipient-language';
import { notificationLogger, securityLogger } from '../../utils/logger-enhanced';
import { SecuritySanitizer } from '../../utils/sanitize';
import { truncateByCodePoints } from '../../utils/truncate-text';
import { filterMutedRecipients } from './mutedRecipients';
import { retractedNotificationOf, type RetractedNotification } from './retractedNotifications';
import { sendNotificationRevocationPushes } from './notificationRevocationPush';
import { visibleNotificationsWhere } from './visibleNotificationsWhere';
import type { ServerEmitIOWithRooms } from '../../socketio/serverEmit';
import { PushNotificationService } from '../PushNotificationService';
import { EmailService } from '../EmailService';
import { loadPostAcl, canUserConsumePost } from '../posts/postVisibility';
import { pushCategoryForNotificationType, buildPushHeader, dedupePushSubtitle } from './push-header';
import {
  type MessagePrismSource,
  type MessageBannerSource,
  type MessageLiveness,
  type PreviewPrismBasis,
  type NotificationBannerMedia,
  type NotificationActorProfile,
  EMPTY_PRISM_SOURCE,
  UNKNOWN_BANNER_SOURCE,
  MESSAGE_CONTENT_BASIS,
  protectedPreview,
  buildMessageNotificationBodyI18n,
  truncateMessage,
  buildOwnerSubtitleWithDetail,
  targetPreviewBody,
} from './notification-preview';
import { resolvePostMedia } from './post-media-thumbnail';
import type { FanoutDependencies } from './fanout/dependencies';
import {
  getStoryNotificationRecipients,
  createStoryCommentNotificationsBatch,
  type StoryNotificationRecipients,
  type StoryCommentFanoutParams,
} from './fanout/story-comment';
import {
  createCommentMentionNotificationsBatch,
  type CommentMentionFanoutParams,
} from './fanout/comment-mention';
import {
  createPostMentionNotificationsBatch,
  type PostMentionFanoutParams,
} from './fanout/post-mention';
import {
  createFriendContentNotificationsBatch,
  type FriendContentFanoutParams,
} from './fanout/friend-content';
import {
  createMemberJoinedNotification,
  createMemberJoinedNotificationsBatch,
} from './fanout/member-joined';

/** Budget APNs — au-delà, la charge est dégradée par étages (cf. `createNotification`). */
const PUSHED_TRANSLATION_MAX_CHARS = 200;

/**
 * Lit une clé de metadata comme chaîne non vide pour le payload push (les
 * `data` APNs/FCM ne transportent que des chaînes). Retourne `''` quand la clé
 * est absente, nulle ou vide — ce que le client interprète comme « pas de
 * valeur » (`NotificationPayload` mappe la chaîne vide vers `nil`).
 */
function pickMetadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || !(key in metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return value == null ? '' : String(value);
}

/**
 * Ce qu'il faut pour remplacer une bannière réécrite : la ligne RELUE (seule
 * source du texte d'après) et le cadrage déjà composé pour le socket, pour que
 * la bannière et le toast in-app disent exactement la même chose.
 */
type ReproducedNotificationPush = {
  readonly row: Record<string, unknown>;
  readonly title: string;
  readonly subtitle?: string;
};

/**
 * Notification types whose offline email is a genuine account-security alert
 * (login, password, 2FA, lockout…). Used to (a) keep these in a separate
 * email-throttle bucket so a social email can never suppress a security alert,
 * and (b) route them to the security email template rather than the generic one.
 */
const SECURITY_EMAIL_NOTIFICATION_TYPES = new Set<string>([
  'login_new_device',
  'login_suspicious',
  'suspicious_activity',
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'account_locked',
  'security_alert',
]);

const isSecurityEmailType = (type: string): boolean => SECURITY_EMAIL_NOTIFICATION_TYPES.has(type);

/**
 * Le lot d'un retrait par chemin JSON. Très au-dessus du réel — une demande
 * d'amitié produit UNE notification, à sa création — et `singleBatch` en fait
 * une lecture close plutôt qu'un curseur laissé ouvert côté serveur.
 */
const RETRACTION_BATCH_SIZE = 1000;

/**
 * Le retour d'une commande Mongo `find` brute réduite à sa projection d'ids.
 *
 * `_id` arrive en Extended JSON (`{ $oid }`) et non en `string` : c'est la
 * différence entre la commande brute et un `findMany` Prisma, et la raison pour
 * laquelle le retrait relit puis supprime par ids typés plutôt que d'enchaîner
 * deux commandes brutes.
 */
type RawNotificationIdBatch = {
  cursor?: { firstBatch?: ReadonlyArray<{ _id: string | { $oid: string } }> };
};

export class NotificationService {
  // Anti-spam: tracking des mentions récentes par paire (sender:recipient)
  private recentMentions: Map<string, number[]> = new Map();
  private readonly MAX_MENTIONS_PER_MINUTE = 5;
  private readonly MENTION_WINDOW_MS = 60000; // 1 minute
  private readonly MAX_MENTION_MAP_ENTRIES = 10_000;

  // Anti-spam: tracking des réactions récentes par paire (sender:recipient)
  private recentReactions: Map<string, number[]> = new Map();
  private readonly MAX_REACTIONS_PER_MINUTE = 5;
  private readonly REACTION_WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REACTION_MAP_ENTRIES = 10_000;

  private pushService?: PushNotificationService;
  private emailService?: EmailService;
  private readonly sequenceService: SequenceService;

  constructor(
    private prisma: PrismaClient,
    private io?: ServerEmitIOWithRooms
  ) {
    // A2 — allocation des `_seq` per-user pour les events user-scoped.
    this.sequenceService = new SequenceService(prisma);
    // Nettoyer les entrées de rate limit périmées toutes les 2 minutes
    const mentionsCleanup = setInterval(() => this.cleanupOldMentions(), 120_000);
    mentionsCleanup.unref?.();
    const reactionsCleanup = setInterval(() => this.cleanupOldReactions(), 120_000);
    reactionsCleanup.unref?.();
  }

  // ==============================================
  // LANGUAGE RESOLUTION (i18n notifications)
  // ==============================================

  private readonly LANG_SELECT = {
    systemLanguage: true,
    regionalLanguage: true,
    customDestinationLanguage: true,
    deviceLocale: true,
  } as const;

  /**
   * Le PRISME d'un destinataire, sous ses DEUX formes — elles ne servent pas la
   * même chose et les confondre coûte dans les deux sens :
   *
   * - `lang` est la langue de **CADRAGE** : l'interface. « Alice vous a envoyé
   *   une photo » se dit dans la langue applicative du lecteur, et une seule.
   *   C'est le rang le plus haut renseigné, ce que rend `resolveUserLanguage`.
   * - `ordered` est la liste dans laquelle le **CONTENU** se résout. Le contenu
   *   n'a pas de langue d'interface : il a des traductions, et le Prisme dit de
   *   les chercher rang par rang (cf. `resolvePrismTranslation`).
   *
   * Les rendre ensemble depuis UNE lecture est ce qui empêche un appelant de
   * réutiliser la langue de cadrage comme clé de contenu — le défaut du
   * cycle 121, qui appariait la carte `Message.translations` au seul rang 1 et
   * servait donc l'original chaque fois qu'une traduction n'existait qu'à un
   * rang inférieur. La ligne de liste de la même application, elle, descendait.
   */
  private async resolveRecipientPrism(
    userId: string
  ): Promise<{ readonly lang: string; readonly ordered: readonly string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.LANG_SELECT,
    });
    if (!user) return { lang: 'fr', ordered: [] };
    const opts = { deviceLocale: user.deviceLocale ?? undefined };
    return {
      lang: resolveUserLanguage(user, opts),
      ordered: resolveUserLanguagesOrdered(user, opts),
    };
  }

  /** Langue de CADRAGE d'un destinataire (Prisme-first, fallback 'fr'). */
  private async resolveRecipientLang(userId: string): Promise<string> {
    return (await this.resolveRecipientPrism(userId)).lang;
  }

  /**
   * Les traductions d'un message SERVABLES sur le canal push, débarrassées de
   * leur enveloppe de stockage.
   *
   * Le filtre de servabilité précède la descente et ne l'INTERROMPT pas : une
   * entrée chiffrée n'est pas une raison de priver le lecteur du rang suivant
   * (la NSE déchiffre `encryptedContent`, jamais les traductions). Filtrer la
   * CARTE plutôt que l'élue est ce qui évite de transformer un refus en abandon
   * de la recherche.
   */
  private pushableTranslations(raw: unknown): Readonly<Record<string, string>> {
    if (!raw || typeof raw !== 'object') return {};
    const entries = raw as Record<string, { text?: unknown; isEncrypted?: unknown } | null>;
    return Object.fromEntries(
      Object.entries(entries)
        .filter(([, t]) => typeof t?.text === 'string' && !t.isEncrypted)
        .map(([lang, t]) => [lang, t!.text as string])
    );
  }

  /**
   * Relire ce qu'un message doit à la bannière qui l'annonce : la source du
   * Prisme, l'horloge de la bulle, et — depuis le cycle 127 — s'il est encore
   * VIVANT.
   *
   * Cette phrase disait « pour les éventails dont la lecture n'est PAS un gate
   * d'éligibilité », et c'était la description d'un défaut, pas d'un contrat :
   * la réponse et la mention relisent cette ligne dans la même fenêtre de course
   * que `createMessageNotification`, et passaient à côté des deux colonnes qui
   * disent sa vie. Un message rappelé entre son commit et l'éventail poussait
   * donc son texte ORIGINAL vers la personne à qui l'on répond et vers tous les
   * mentionnés, pendant que les membres ordinaires du fil étaient protégés.
   *
   * Le balayage de rétraction en fin d'éventail ne rattrapait pas ce cas : il
   * retire la LIGNE `Notification`, quand la bannière est déjà sur l'écran.
   *
   * Fail-OPEN sur l'ERREUR, fail-CLOSED sur la RÉPONSE — cf. {@link MessageLiveness}.
   */
  private async loadMessagePrismSource(messageId: string): Promise<MessageBannerSource> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        // Cycle 126 — `createdAt` et `messageType` ; cycle 127 — `deletedAt` et
        // `expiresAt`, dans la lecture qui se faisait déjà : quatre colonnes de
        // plus, aucune requête de plus. C'est ce qui rend la garde gratuite, et
        // c'est pourquoi elle appartient ICI plutôt qu'à chaque éventail.
        select: {
          translations: true,
          originalLanguage: true,
          createdAt: true,
          messageType: true,
          deletedAt: true,
          expiresAt: true,
        },
      });
      return {
        translations: this.pushableTranslations(message?.translations),
        originalLanguage: message?.originalLanguage ?? null,
        createdAt: message?.createdAt instanceof Date ? message.createdAt : null,
        messageType: message?.messageType ?? null,
        liveness: this.messageLiveness(message, messageId),
      };
    } catch (error) {
      notificationLogger.error('Relecture du Prisme en échec — bannière servie sans traduction', {
        error,
        messageId,
      });
      return UNKNOWN_BANNER_SOURCE;
    }
  }

  /**
   * Le verdict de vie d'une ligne relue — cf. {@link MessageLiveness}.
   *
   * Extrait de `createMessageNotification` pour qu'il n'en existe qu'un site :
   * la parité des trois éventails est le sujet même du cycle 127, et deux copies
   * l'auraient reperdue au premier cycle suivant.
   *
   * Une ligne ABSENTE rend `unknown` : ce prédicat ne se prononce que sur ce
   * qu'une ligne PROUVE. Le lot `regular` refuse en plus les lignes absentes,
   * mais il le fait CHEZ LUI — c'est sa politique, pas une propriété du message.
   */
  private messageLiveness(
    message: { deletedAt?: Date | null; expiresAt?: Date | null } | null,
    messageId: string
  ): MessageLiveness {
    if (!message) return 'unknown';
    if (message.deletedAt) {
      notificationLogger.info('Skipping notification (soft-deleted in flight)', {
        messageId,
        deletedAt: message.deletedAt,
      });
      return 'gone';
    }
    if (message.expiresAt instanceof Date && message.expiresAt.getTime() <= Date.now()) {
      notificationLogger.info('Skipping notification (already expired)', {
        messageId,
        expiresAt: message.expiresAt,
      });
      return 'gone';
    }
    return 'live';
  }

  /**
   * La source qui traduit l'APERÇU — celle du texte que la bannière affiche,
   * jamais « celle du message » par défaut.
   *
   * Elle et elle seule alimente la descente : le corps servi et les champs du
   * fil en sont deux projections. C'était la faille du cycle 122 — deux
   * résolutions parallèles vivaient dans chaque éventail, l'une gardée par
   * `previewIsMessageContent` (le corps) et l'autre pas (le fil) — si bien que
   * la traduction EN CLAIR d'un message à vue unique partait sur le canal push
   * pendant que la bannière affichait son placeholder.
   *
   * `notificationLocKey` reste un second verrou, et il n'est pas redondant : un
   * appelant qui compose un placeholder de protection sans déclarer sa base
   * perd une traduction, jamais le secret. Une garde de confidentialité échoue
   * en montrant moins.
   */
  private previewPrismSource(params: {
    basis: PreviewPrismBasis;
    messageSource: MessagePrismSource;
    protectedByLocKey?: boolean;
  }): MessagePrismSource {
    if (params.protectedByLocKey) return EMPTY_PRISM_SOURCE;
    switch (params.basis.kind) {
      case 'protected-placeholder':
        return EMPTY_PRISM_SOURCE;
      case 'transcript':
        return params.basis.source;
      case 'message-content':
        return params.messageSource;
    }
  }

  /**
   * Le COUPLE que la NSE iOS pré-enregistre — le corps de la bulle et son
   * étiquette de langue — ou RIEN.
   *
   * Troisième projection de {@link PreviewPrismBasis}, après « qu'est-ce qui
   * TRADUIT cet aperçu ? » ({@link previewPrismSource}) et « que peut-on
   * transporter à côté ? » (la garde de {@link servedTranslationFields}) : ce
   * type dit ce que l'aperçu EST, donc il est le seul à pouvoir dire s'il peut
   * être pris pour le message.
   *
   * Elle répond `{}` — donc « n'enregistre rien » — sur les trois formes où
   * l'aperçu n'est pas `Message.content` :
   *
   *  - `protected-placeholder` — l'écrire planterait « ⏱️ 💬 24h » dans la base
   *    locale, où il survivrait à la bannière si la synchro REST n'arrive pas ;
   *  - `transcript` — la parole d'un vocal appartient à la pièce jointe, pas au
   *    message qui la porte ; la bulle audio la rendra après la synchro ;
   *  - `protectedByLocKey` — second verrou, comme pour la descente : un appelant
   *    qui compose un placeholder sans déclarer sa base perd un enregistrement
   *    local, jamais le secret.
   *
   * La quatrième — le mode privé — est tenue une couche plus haut, par la garde
   * `showPreview` qui retire TOUT champ porteur de contenu de `data`.
   *
   * Ce qui voyage est l'ORIGINAL, jamais la traduction : `MessageRecord.content`
   * est le champ d'origine et `messageOriginalLanguage` son étiquette, quand la
   * traduction servie a déjà `translatedContent` et son rang (cycle 121).
   *
   * **Pourquoi un helper et non le prédicat en ligne** : les TROIS éventails de
   * `messageNotificationFanOut` poussent un `messageId`, donc les trois font
   * pré-enregistrer une bulle. Écrit une fois par site, ce prédicat finirait par
   * manquer à l'un d'eux — c'est exactement ce qui distingue une règle d'un
   * site qui l'applique (leçon 271).
   */
  private prePersistedMessageFields(params: {
    basis: PreviewPrismBasis;
    preview: string;
    originalLanguage: string | null;
    protectedByLocKey?: boolean;
  }): { messageContent?: string; messageOriginalLanguage?: string } {
    if (params.protectedByLocKey) return {};
    if (params.basis.kind !== 'message-content') return {};
    // Un aperçu VIDE ne dit rien de plus que son absence et coûte du budget APNs.
    if (params.preview.trim() === '') return {};
    return {
      messageContent: params.preview,
      ...(params.originalLanguage ? { messageOriginalLanguage: params.originalLanguage } : {}),
    };
  }

  /**
   * La DESCENTE du Prisme, sous la forme que le contexte de notification
   * attend : `translatedContent` et `translatedLanguage` côte à côte, ou RIEN.
   *
   * Prend la traduction DÉJÀ ÉLUE plutôt qu'une source, et c'est le correctif
   * du cycle 123 : ces deux champs décrivent ce que la bannière SERT, ils ne
   * peuvent donc pas venir d'une seconde descente. Site UNIQUE de la projection
   * pour les trois éventails de `messageNotificationFanOut` — la leçon 264 en
   * donne la raison : quand un consommateur a besoin d'un peu plus que ce que
   * rend le résolveur existant, l'issue par défaut est de réécrire la boucle,
   * et c'est ainsi que naissent les familles divergentes des cycles 118 à 122.
   *
   * Un contexte VIDE ⇒ servir l'original (règle #1), jamais une traduction
   * quelconque.
   */
  private servedTranslationFields(
    matched: { readonly language: string; readonly text: string } | null
  ): { translatedContent?: string; translatedLanguage?: string } {
    if (!matched) return {};
    return {
      translatedContent: truncateByCodePoints(matched.text, PUSHED_TRANSLATION_MAX_CHARS),
      // La clé TELLE QUE STOCKÉE, pas sa forme canonique : elle repart sur le
      // fil APNs et le client la rapproche de sa propre carte.
      translatedLanguage: matched.language,
    };
  }

  /**
   * La descente NUE — le couple `{ language, text }` élu, ou `null` ⇒ servir
   * l'original. Les deux consommateurs en sont des projections :
   * {@link servedPreview} pour le corps affiché (cycle 122) et
   * {@link servedTranslationFields} pour les champs du fil push. Une descente,
   * deux projections — c'est ce qui les empêche de diverger (cycle 123).
   */
  private prismTranslation(
    source: MessagePrismSource,
    preferredLanguages: readonly string[]
  ): { readonly language: string; readonly text: string } | null {
    return resolvePrismTranslation({
      translations: source.translations,
      originalLanguage: source.originalLanguage,
      preferredLanguages,
    });
  }

  /**
   * Le texte que la bannière AFFICHE — cycle 122.
   *
   * Le Prisme ne s'arrête pas aux champs `translatedContent` /
   * `translatedLanguage` du fil push : ils voyagent depuis le cycle 121 et
   * AUCUN client ne les lit — ni la NSE iOS, ni l'application, ni Android, ni
   * le service worker web. Le seul texte que les trois plateformes rendent est
   * `payload.body`, composé depuis ce `content` : tant qu'il portait l'aperçu
   * ORIGINAL, la bannière restait dans la langue de l'expéditeur pendant que la
   * ligne de liste de la même application servait la traduction. Un contenu
   * RÉSOLU n'est pas un contenu SERVI.
   *
   * La condition de substitution vit en amont, dans le choix de la SOURCE
   * (`previewPrismSource`) : `Message.translations` ne traduit que
   * `Message.content`, un placeholder de protection n'a pas de source, et une
   * transcription a la sienne. Ici il ne reste qu'à servir ce qui a été élu.
   */
  private servedPreview(params: {
    preview: string;
    translation: { readonly text: string } | null;
  }): string {
    if (!params.translation) return params.preview;
    // Un aperçu VIDE n'a rien à substituer : le corps se compose alors
    // entièrement des badges de pièce jointe, localisés dans la langue de
    // CADRAGE. Y injecter la traduction remplacerait « 📷 Foto » par un texte
    // dont `Message.content` — vide — n'est pas la source.
    if (params.preview.trim() === '') return params.preview;
    return params.translation.text;
  }

  /**
   * Le corps AFFICHÉ d'une bannière de message — cycle 125 bis.
   *
   * Deux compositions en une, et c'est leur ORDRE qui compte : le texte servi
   * par le Prisme ({@link servedPreview}), puis le passage par
   * `buildMessageNotificationBodyI18n`, qui remplace un texte ABSENT par le
   * libellé de la première pièce jointe et suffixe les badges des suivantes.
   *
   * **Site UNIQUE pour les trois éventails**, et la raison est mesurée :
   * `createMessageNotification` était le seul des trois à composer, si bien que
   * la bannière d'une RÉPONSE ou d'une MENTION portant un vocal ou une photo
   * sans légende arrivait avec un corps VIDE — le symptôme « deux textes pour
   * un même message » (cycles 121-124) dans sa forme extrême, le second étant
   * vide. C'est la leçon 271 : une règle écrite une fois par site finit par
   * manquer à l'un d'eux.
   *
   * Sans média (`media` absent ou vide), le résultat est exactement le texte
   * servi — les deux éventails qui n'en portaient pas gardent leur corps au
   * caractère près.
   */
  private servedBannerBody(params: {
    lang: string;
    preview: string;
    translation: { readonly text: string } | null;
    media?: NotificationBannerMedia;
  }): string {
    return buildMessageNotificationBodyI18n(params.lang, {
      messagePreview: this.servedPreview({
        preview: params.preview,
        translation: params.translation,
      }),
      attachments: params.media?.attachments,
      firstAttachmentFileSize: params.media?.firstAttachmentFileSize,
      firstAttachmentDuration: params.media?.firstAttachmentDuration,
      firstAttachmentWidth: params.media?.firstAttachmentWidth,
      firstAttachmentHeight: params.media?.firstAttachmentHeight,
    });
  }

  /**
   * Le média que la bannière ATTACHE, élu par le Prisme — cycle 128.
   *
   * Le cycle 123 a fait descendre le prisme au TEXTE de la bannière d'un vocal
   * (`PreviewPrismBasis.transcript`). Le FICHIER attaché à côté, lui, est resté
   * `first?.fileUrl` — l'original, sans condition, identique pour tous les
   * lecteurs : un francophone voyait une bannière en français au-dessus d'un
   * `UNNotificationAttachment` qui parle anglais. Les trois clients descendent
   * pourtant déjà le Prisme sur la piste JOUÉE en conversation
   * (`AudioTrackLanguageResolver` iOS, `resolveAutoLanguage` web,
   * `resolveTranslatedAudio` Android) ; l'écran verrouillé était la SEULE
   * surface qui ne le faisait pas.
   *
   * > Une résolution de CONTENU se mesure sur tout ce que la charge TRANSPORTE,
   * > jamais sur sa seule chaîne (leçon 275).
   *
   * **La piste est élue par la langue du TEXTE SERVI, jamais par une descente
   * indépendante.** C'est la règle centrale du cycle : deux descentes parallèles
   * laisseraient la bannière dire « la réunion est déplacée » au-dessus d'une
   * piste espagnole. Une descente, deux projections — la même discipline que
   * `servedPreview` / `servedTranslationFields` (cycle 123).
   *
   * Deux replis, tous deux vers l'ORIGINAL, et ils disent deux choses
   * différentes :
   *  - `served === null` — le Prisme n'a rien élu, le message est déjà dans la
   *    langue du lecteur ;
   *  - langue élue SANS piste — le TTS peut manquer là où la traduction texte
   *    existe. Fail-OPEN sur le médium : le son d'origine vaut mieux que le
   *    silence, et le texte reste servi traduit.
   *
   * Les trois champs voyagent ENSEMBLE. Servir la piste traduite sous le mime et
   * la durée de l'originale ferait mentir le `typeHint` UTI de la NSE et le
   * libellé « 🎤 · 0:12 » que le corps compose depuis cette durée — c'est la
   * leçon 279 : ce qui QUALIFIE une chaîne voyage avec elle.
   *
   * `durationMs` est l'unité de bout en bout : `MessageAttachment.duration` est
   * en MILLISECONDES (`schema.prisma`), ce que `formatSingleAttachmentLabelI18n`
   * redit dans son propre doc-comment.
   */
  private servedAttachmentMedia(params: {
    readonly tracks?: Readonly<Record<string, AttachmentTranslationTrack>>;
    readonly served: { readonly language: string } | null;
    readonly originalUrl?: string;
    readonly originalMimeType?: string;
    readonly originalDurationMs?: number | null;
    readonly originalFileSize?: number | null;
  }): {
    readonly url?: string;
    readonly mimeType?: string;
    readonly durationMs?: number;
    readonly fileSize?: number;
  } {
    const original = {
      url: params.originalUrl,
      mimeType: params.originalMimeType,
      durationMs: params.originalDurationMs ?? undefined,
      fileSize: params.originalFileSize ?? undefined,
    };
    if (!params.served) return original;

    const track = params.tracks?.[params.served.language];
    if (!track) return original;

    // La piste remplace le fichier ; son étiquette, sa durée et sa TAILLE ne
    // retombent PAS sur celles de l'original — elles décriraient un autre
    // fichier. Absentes, elles restent absentes : la NSE déduit l'UTI de
    // l'extension, le corps se compose sans durée plutôt qu'avec une fausse, et
    // le plafond mémoire (#7003) retombe sur sa mesure APRÈS téléchargement
    // plutôt que sur un chiffre emprunté.
    return { url: track.url, mimeType: track.mimeType, durationMs: track.durationMs };
  }

  /**
   * L'horloge SERVEUR de la bulle que la NSE PRÉ-ENREGISTRE, et son type.
   *
   * Troisième projection partagée par les trois éventails (cycle 126). Le
   * cycle 125 bis a fait converger leur CORPS ; ces deux champs-ci ne composent
   * aucun texte, donc ils sont restés en dehors — c'est la forme exacte du
   * cycle 125, où la garde tenait la chaîne pendant que l'objet voisin partait
   * seul. Réponse et mention poussent un `messageId`, donc font pré-enregistrer
   * une bulle exactement comme le message simple : sans eux, la leur porte
   * l'horloge du DEVICE et se range au mauvais endroit du fil.
   */
  private messageClockFields(source: {
    readonly createdAt: Date | null;
    readonly messageType: string | null;
  }): { messageCreatedAt?: string; messageType?: string } {
    return {
      messageCreatedAt: source.createdAt ? source.createdAt.toISOString() : undefined,
      messageType: source.messageType ?? undefined,
    };
  }

  /** Variante batch : un seul findMany, retourne une Map userId → langue (fallback 'fr'). */
  private async resolveRecipientLangs(userIds: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, ...this.LANG_SELECT },
    });
    for (const u of users) {
      out.set(u.id, resolveUserLanguage(u, { deviceLocale: u.deviceLocale ?? undefined }));
    }
    for (const id of userIds) if (!out.has(id)) out.set(id, 'fr');
    return out;
  }

  // ==============================================
  // PREFERENCE CHECKS
  // ==============================================

  /**
   * Vérifie si une notification doit être créée selon les préférences utilisateur.
   * Lit UserPreferences.notification (JSON) — source unique de vérité.
   * Les notifications système passent toujours.
   */
  /**
   * GW7 — chargement unique des préférences (null = lecture en échec, fail
   * open). Réutilisé par le gating ET par les substitutions
   * showPreview/showSenderName du push — une seule requête par notification.
   */
  private async loadNotificationPrefs(userId: string): Promise<NotifPrefs | null> {
    try {
      const userPrefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { notification: true },
      });
      const raw = (userPrefs?.notification ?? {}) as Record<string, unknown>;
      return { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...raw };
    } catch (error) {
      notificationLogger.error('Erreur lecture préférences, notification autorisée par défaut', { error, userId });
      return null;
    }
  }

  /**
   * Le destinataire a-t-il mis CETTE conversation en sourdine ?
   *
   * Unique porte pour les notifications à destinataire unique dont le type
   * respecte le mute (cf. le tableau ambiant/adressé de `mutedRecipients.ts`).
   * Elle existe parce que la règle avait déjà deux exemplaires — réaction et
   * réponse — qui devaient devenir cinq : un même verdict, un même log, une
   * même place dans l'ordre d'exécution.
   *
   * À appeler AVANT toute lecture et avant tout compteur mutant : une
   * notification supprimée par le mute ne doit ni payer ses requêtes de
   * contexte, ni consommer le budget anti-spam d'une paire (verrouillé par
   * « muted-conversation reactions do not consume the pair throttle budget »).
   */
  private async isConversationMutedFor(
    userId: string,
    conversationId: string,
    type: NotificationType
  ): Promise<boolean> {
    const nonMuted = await filterMutedRecipients(this.prisma, conversationId, [userId]);
    if (nonMuted.length > 0) return false;

    notificationLogger.info('Notification suppressed (conversation muted)', { userId, conversationId, type });
    return true;
  }

  /** Ce qu'un éventail batch emprunte à l'instance — fermé sur `this` à CHAQUE appel (jamais mis en cache : `fanout-delegation.test.ts`, #7093). */
  private fanoutDependencies(): FanoutDependencies {
    return {
      prisma: this.prisma,
      createNotification: (params) => this.createNotification(params),
      resolveRecipientLangs: (ids) => this.resolveRecipientLangs(ids),
      shouldCreateMentionNotification: (s, r) => this.shouldCreateMentionNotification(s, r),
      isConversationMutedFor: (u, c, t) => this.isConversationMutedFor(u, c, t),
    };
  }

  private async shouldCreateNotification(
    userId: string,
    type: NotificationType,
    preloadedPrefs?: NotifPrefs | null
  ): Promise<boolean> {
    const prefs = preloadedPrefs !== undefined
      ? preloadedPrefs
      : await this.loadNotificationPrefs(userId);

    // Fail open : en cas d'erreur de lecture des prefs, on crée la notification
    if (prefs === null) return true;

    // 1) Vérifier le toggle par type
    if (!this.isTypeEnabled(prefs, type)) {
      notificationLogger.info('Notification bloquée par préférence de type', { userId, type });
      return false;
    }

    // 2) Vérifier le mode Ne Pas Déranger — helper PARTAGÉ tz-aware (GW7),
    // même implémentation que PushNotificationService.isPushAllowed.
    if (isWithinDnd(prefs)) {
      notificationLogger.info('Notification bloquée par DND', { userId, type });
      return false;
    }

    return true;
  }

  /**
   * Mapping NotificationType → champ booléen dans UserPreferences.notification
   */
  private isTypeEnabled(prefs: NotifPrefs, type: NotificationType): boolean {
    switch (type) {
      case 'new_message':       return prefs.newMessageEnabled;
      case 'missed_call':       return prefs.missedCallEnabled;
      case 'system':            return prefs.systemEnabled;
      case 'user_mentioned':
      case 'mention':           return prefs.mentionEnabled;
      case 'message_reaction':
      case 'reaction':          return prefs.reactionEnabled;
      case 'contact_request':
      case 'contact_accepted':
      case 'friend_request':
      case 'friend_accepted':   return prefs.contactRequestEnabled;
      case 'member_joined':     return prefs.memberJoinedEnabled;
      case 'message_reply':
      case 'reply':             return prefs.replyEnabled;
      case 'translation_ready': return true; // toujours activé
      case 'post_like':         return prefs.postLikeEnabled ?? true;
      case 'post_comment':      return prefs.postCommentEnabled ?? true;
      case 'post_repost':       return prefs.postRepostEnabled ?? true;
      case 'story_reaction':    return prefs.storyReactionEnabled ?? true;
      case 'status_reaction':   return prefs.storyReactionEnabled ?? true;
      case 'comment_like':
      case 'comment_reaction':  return prefs.commentLikeEnabled ?? true;
      case 'comment_reply':     return prefs.commentReplyEnabled ?? true;
      case 'story_new_comment':
      case 'friend_story_comment':
      case 'story_thread_reply': return prefs.postCommentEnabled ?? true;
      case 'friend_new_post':
      case 'friend_new_story':
      case 'friend_new_mood':   return prefs.friendContentEnabled ?? true;
      case 'new_conversation_direct':
      case 'new_conversation_group':
      case 'new_conversation':
      case 'added_to_conversation':
      case 'removed_from_conversation': return prefs.conversationEnabled;
      case 'community_invite':      return prefs.groupInviteEnabled;
      case 'member_removed':
      case 'member_left':
      case 'member_promoted':
      case 'member_demoted':
      case 'member_role_changed':   return prefs.memberLeftEnabled;
      case 'password_changed':
      case 'two_factor_enabled':
      case 'two_factor_disabled':
      case 'login_new_device':      return true; // sécurité = toujours actif
      default:                  return true;
    }
  }

  // ==============================================
  // CORE - Méthode générique de création
  // ==============================================

  /**
   * Crée une notification avec la structure V2
   */
  async createNotification(params: {
    userId: string;
    type: NotificationType;
    priority: NotificationPriority;
    content: string;
    title?: string;
    /**
     * Explicit subtitle override. When set, it bypasses `buildPushHeader`'s
     * type-based subtitle derivation (which only emits a subtitle for
     * `new_message` group/global conversations). Used by reactions / comments
     * / mentions to surface contextual info (e.g. comment preview, story
     * author) under the actor's name in the iOS rich banner.
     */
    subtitle?: string;
    actor?: NotificationActor;
    context: NotificationContext;
    metadata: NotificationMetadata;
    expiresAt?: Date;
    /**
     * Forwarded to APNs `apns-collapse-id` / FCM `collapseKey` so undelivered
     * pushes pile up into one banner instead of spamming the device when it
     * reconnects. Scope it per-conversation (`conv-${conversationId}`), never
     * per-message — a per-message id is unique by construction and never
     * collapses anything.
     */
    collapseId?: string;
    /**
     * Langue résolue du destinataire (Prisme-first). Fournie par les méthodes
     * `create*` qui la résolvent déjà ; sinon résolue ici. Pilote le calcul
     * localisé du `title`/`subtitle` persistés (source unique multi-plateforme).
     */
    lang?: string;
  }): Promise<Notification | null> {
    try {
      // SECURITY: Validate notification type
      if (!SecuritySanitizer.isValidNotificationType(params.type)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_TYPE', {
          type: params.type,
          userId: params.userId,
        });
        return null;
      }

      // SECURITY: Validate priority
      if (!SecuritySanitizer.isValidPriority(params.priority)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_PRIORITY', {
          priority: params.priority,
          userId: params.userId,
        });
        return null;
      }

      // Vérifier les préférences utilisateur avant création — chargées UNE
      // fois et réutilisées par les substitutions showPreview/showSenderName
      // du push (GW7).
      const notifPrefs = await this.loadNotificationPrefs(params.userId);
      const allowed = await this.shouldCreateNotification(params.userId, params.type, notifPrefs);
      if (!allowed) {
        return null;
      }

      // SECURITY: Sanitize user-provided content (defense-in-depth)
      const sanitizedContent = SecuritySanitizer.sanitizeText(params.content);
      const sanitizedActor = params.actor ? {
        ...params.actor,
        displayName: params.actor.displayName
          ? SecuritySanitizer.sanitizeText(params.actor.displayName)
          : params.actor.displayName,
        // #7157 — le repli `?? params.actor.avatar` restituait la valeur
        // d'origine PRÉCISÉMENT quand `sanitizeURL` l'avait rejetée. Un chemin
        // relatif doit survivre, un protocole refusé doit tomber : deux cas
        // distincts, une seule règle, chez le sanitiseur.
        avatar: params.actor.avatar
          ? SecuritySanitizer.sanitizeURLOrPath(params.actor.avatar)
          : params.actor.avatar,
      } : undefined;
      const sanitizedMetadata = SecuritySanitizer.sanitizeJSON(params.metadata);

      // Titre/sous-titre localisés, conscients de l'entité — calculés UNE fois
      // côté serveur (langue du destinataire) puis persistés. Source unique pour
      // la liste in-app (iOS/iPadOS/macOS) et le web ; corrige les libellés
      // imprécis/non localisés historiquement reconstruits côté client.
      // #7159 — les champs de métadonnées qui ENTRENT DANS LA PHRASE
      // (`parentCommentPreview`, `contentAuthorName`) se lisent sur la charge
      // SANITISÉE, pas sur la brute.
      const meta = (sanitizedMetadata ?? {}) as Record<string, unknown>;
      const displayInput = {
        type: params.type,
        actorName: sanitizedActor?.displayName ?? params.actor?.username ?? null,
        postType: typeof meta.postType === 'string' ? meta.postType : null,
        emoji: (typeof meta.reactionEmoji === 'string' ? meta.reactionEmoji
          : typeof meta.emoji === 'string' ? meta.emoji : null),
        parentCommentPreview: (typeof meta.parentCommentPreview === 'string' ? meta.parentCommentPreview : null),
        // Auteur du contenu visé, quand ce n'est pas le lecteur : il entre DANS
        // la phrase (« a commenté un réel de Windie Nh ») au lieu d'être posé
        // à côté en sous-titre. Même chemin que `parentCommentPreview`.
        authorName: (typeof meta.contentAuthorName === 'string' ? meta.contentAuthorName : null),
      };
      // On ne touche la base pour la langue du destinataire QUE si un rendu
      // localisé en a réellement besoin (titre localisé du type, ou corps
      // générique showPreview:false) ET que l'appelant ne l'a pas déjà
      // fournie — résolution paresseuse mémoïsée, au plus UNE requête.
      let memoizedLang: string | undefined = params.lang;
      const recipientLang = async (): Promise<string> =>
        memoizedLang ?? (memoizedLang = await this.resolveRecipientLang(params.userId));
      let display = buildNotificationDisplay(params.lang ?? 'fr', displayInput);
      if (display.title !== null && params.lang === undefined) {
        display = buildNotificationDisplay(await recipientLang(), displayInput);
      }
      // Sous-titre persisté : l'override explicite riche d'une méthode `create*`
      // (ex. « Votre publication : « aperçu » ») prime, sinon la base localisée
      // du builder. SANS date — le client append la date locale.
      const persistedSubtitle = (params.subtitle && params.subtitle.trim() !== '')
        ? params.subtitle.trim().slice(0, 160)
        : (display.subtitle ?? null);
      // Titre persisté : le builder localisé quand il en a un (types sociaux),
      // sinon le titre explicite de l'appelant (annonce système : son sujet).
      // #7159 — le titre traversait le bloc « defense-in-depth » sans y entrer,
      // alors que le `content` du même appel y passe. Il est le POINT DE
      // PASSAGE de tout ce qui finit en titre, quelle qu'en soit la source
      // (libellé localisé, sujet d'une diffusion, nom d'acteur) : le sanitiser
      // ici couvre toutes les branches d'un coup. Sanitisation AVANT la
      // troncature, sans quoi on couperait au milieu d'une entité.
      const titreBrut = display.title ?? params.title ?? null;
      const titreSain = titreBrut !== null ? SecuritySanitizer.sanitizeText(titreBrut).trim() : null;
      const persistedTitle = (titreSain !== null && titreSain !== '') ? titreSain.slice(0, 160) : null;

      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          priority: params.priority,
          title: persistedTitle,
          subtitle: persistedSubtitle,
          content: sanitizedContent,

          // Relation optionnelle avec Message
          messageId: params.context.messageId || null,

          // Groupes V2 (cast en any car Prisma doit être régénéré)
          actor: (sanitizedActor || null) as any,
          context: params.context as any,
          metadata: sanitizedMetadata as any,

          // State (isRead, readAt, createdAt en DB, expiresAt si fourni)
          isRead: false,
          readAt: null,
          expiresAt: params.expiresAt || null,
          createdAt: new Date(),

          // Delivery (cast en any car Prisma Json type)
          delivery: {
            emailSent: false,
            pushSent: false,
          } as any,
        } as any, // Cast global pour compilation avant régénération Prisma
      });

      const formatted = this.formatNotification(notification);

      // Build the APN/FCM push header ONCE and reuse it for both the Socket.IO
      // payload and the push payload. The in-app toast (driven by
      // `notification:new` when socket is foreground-connected) needs the same
      // `title`/`subtitle` framing as the native iOS banner so the user sees
      // "<sender> · <conversation>" + body details consistently on both paths.
      //
      // `action` + `entitySubtitle` : le titre riche persisté (« elvira ndjiki
      // a commenté un réel de Windie Nh ») ne peut PAS servir de titre de
      // bannière — iOS le réécrit avec le displayName de l'INPerson sur le
      // chemin Communication Notification. L'action voyage donc en subtitle,
      // seul champ que le client peut rendre sous le nom ; le corps garde
      // l'aperçu du contenu.
      const { title: pushTitle, subtitle: pushSubtitle } = buildPushHeader({
        type: params.type,
        customTitle: params.title,
        actor: params.actor,
        context: {
          conversationType: params.context.conversationType,
          conversationTitle: params.context.conversationTitle,
        },
        action: display.action,
        entitySubtitle: persistedSubtitle,
      });

      // Socket.IO payload carries `title`/`subtitle` so the iOS in-app toast
      // can render sender + conversation context without having to re-derive
      // them client-side. `formatted` already contains the raw `actor`/`context`
      // so this is purely additive.
      // Cadrage TOAST : acteur en title + sous-titre push (nom de groupe /
      // aperçu de commentaire). On surcharge explicitement le title/subtitle que
      // `formatted` porte désormais (titre headline + sous-titre entité persistés
      // pour la LISTE/REST) afin que les messages directs restent sans sous-titre
      // et que le toast garde le nom de l'expéditeur comme title.
      const socketPayload = {
        ...formatted,
        title: pushTitle,
        subtitle: pushSubtitle,
      };

      // Émettre via Socket.IO — A2 : event user-scoped enrichi de `_seq`
      // (SyncEngine, détection de gap exacte). `emitWithSeq` est résilient :
      // sur échec d'allocation de séquence, l'event part sans `_seq`.
      //
      // ISOLÉ, comme les deux canaux qui suivent. `emitWithSeq` reste résilient
      // à l'ALLOCATION de séquence, mais pas à l'emit lui-même : `io.to(…).emit`
      // lève quand l'adaptateur Redis ou l'encodeur est en défaut. Nu, ce `await`
      // faisait porter au canal le plus fragile le sort des deux SEULS canaux
      // qui atteignent un destinataire absent — et la panne qui le déclenche est
      // exactement celle où tout le monde est absent. Le push ne partait pas
      // (malgré le « always » de la ligne d'en dessous), l'e-mail immédiat des
      // notifications `high` non plus (alertes de SÉCURITÉ comprises), et
      // `create()` rendait `null` sur une ligne pourtant écrite.
      if (this.io) {
        await this.emitBestEffort(SERVER_EVENTS.NOTIFICATION_NEW, params.userId, async () => {
          await emitWithSeq(this.io!, this.sequenceService, params.userId, SERVER_EVENTS.NOTIFICATION_NEW, socketPayload);
          // DANS le callback : « emitted » ne doit se dire que d'un emit qui est
          // effectivement parti. Sur échec, c'est le log `error` d'emitBestEffort
          // qui parle.
          notificationLogger.debug('notification:new emitted via socket', { userId: params.userId, type: params.type, conversationId: params.context.conversationId ?? 'none' });
        });
        // Update badge counters on client (fire-and-forget, non-blocking)
        this.emitCountsUpdate(params.userId).catch(() => {});
      }

      // Send push notification (always — iOS willPresent handles foreground display)
      if (this.pushService) {
        try {
          const link = params.context.conversationId ?
            (params.context.messageId ?
              `/conversations/${params.context.conversationId}?messageId=${params.context.messageId}` :
              `/conversations/${params.context.conversationId}`) :
            undefined;
          // GW7 — préférences de confidentialité du banner : showPreview:false
          // remplace le corps par un libellé générique localisé (et supprime le
          // subtitle, porteur d'aperçus) ; showSenderName:false remplace le
          // titre (nom de l'acteur) par un titre neutre.
          const showPreview = notifPrefs?.showPreview ?? true;
          const showSenderName = notifPrefs?.showSenderName ?? true;
          // Corps générique localisé dans la langue du DESTINATAIRE — résolue
          // paresseusement quand l'appelant ne l'a pas fournie (réponses,
          // réactions, mentions…), jamais un 'fr' codé en dur.
          const pushBody = showPreview
            ? truncateByCodePoints(params.content, 200)
            : notificationString(await recipientLang(), 'push.private');

          // F1 — app fermée, le badge d'icône iOS et le widget ne vivent QUE
          // par le payload push : embarquer le même compte unread que
          // `notification:counts` (même source → même sémantique, pas de
          // flicker au recale foreground). `badge` pilote `aps.badge`
          // nativement ; `data.unreadCount` (string) alimente le miroir App
          // Group écrit par la NSE pour le widget. Best-effort : sur échec
          // du count, le push part sans badge (comportement historique).
          let unreadBadge: number | undefined;
          try {
            const count = await this.prisma.notification.count({
              where: visibleNotificationsWhere({ userId: params.userId, unreadOnly: true }),
            });
            if (typeof count === 'number') unreadBadge = count;
          } catch {
            unreadBadge = undefined;
          }

          notificationLogger.debug('push (APNs/FCM) sending', { userId: params.userId, type: params.type, conversationId: params.context.conversationId ?? 'none' });
          // GW4 — native grouping + actionable banner set by the producer:
          // threadId groups by conversation on iOS; category selects the
          // action set (the NSE only fills these for legacy payloads).
          const pushCategory = pushCategoryForNotificationType(params.type);
          const pushPayload = {
              title: showSenderName ? pushTitle : 'Meeshy',
              // Subtitle carries the conversation name for group/global chats
              // — survives iOS Communication Notification rewriting that would
              // otherwise drop a "<sender> | <conv>" concatenated title.
              // Dropped with showPreview:false (rich subtitles carry previews).
              // Dédoublonnage de bannière : sans excerpt, le corps porte la
              // MÊME phrase d'action que le subtitle — on garde le corps (seul
              // champ rendu par les trois plateformes) et on laisse tomber le
              // subtitle. Cf. `dedupePushSubtitle`.
              ...(showPreview
                ? (() => {
                    const deduped = dedupePushSubtitle({ subtitle: pushSubtitle, body: pushBody });
                    return deduped ? { subtitle: deduped } : {};
                  })()
                : {}),
              body: pushBody,
              link,
              collapseId: params.collapseId,
              ...(params.context.conversationId ? { threadId: params.context.conversationId } : {}),
              ...(pushCategory ? { category: pushCategory } : {}),
              ...(unreadBadge !== undefined ? { badge: unreadBadge } : {}),
              data: {
                // Identité de la ligne créée : SEULE clé permettant au client
                // de marquer lu au tap (POST /notifications/:id/read). Sans
                // elle, les types sans context.conversationId/postId (system,
                // login_new_device, password_changed, two_factor_*,
                // friend_request) restaient non lus à vie après un tap push.
                notificationId: formatted.id,
                ...(unreadBadge !== undefined ? { unreadCount: String(unreadBadge) } : {}),
                type: params.type,
                conversationId: params.context.conversationId || '',
                conversationTitle: params.context.conversationTitle || '',
                conversationType: params.context.conversationType || '',
                messageId: params.context.messageId || '',
                postId: params.context.postId || '',
                // Comment navigation: the tapped social notification must land on the
                // exact comment (open entity → comments sheet → scroll/highlight). The
                // iOS NotificationPayload reads these to thread the commentId through to
                // PostDetailView / the story comments overlay. `parentCommentId` lets the
                // client expand the parent thread before scrolling to a reply.
                commentId: params.context.commentId
                  || (params.metadata && 'commentId' in params.metadata ? String(params.metadata.commentId ?? '') : ''),
                parentCommentId: params.context.parentCommentId
                  || (params.metadata && 'parentCommentId' in params.metadata ? String(params.metadata.parentCommentId ?? '') : ''),
                // Navigation sociale iOS — requête d'ami (friend_request). Le
                // handler iOS lit cette clé défensivement : absente →
                // résolution via receivedRequests par senderId.
                friendRequestId: params.context.friendRequestId || '',
                // Indice de ROUTE — le nom d'écran que le tap doit ouvrir quand
                // la notification ne porte ni conversation ni contenu social
                // (les quatre notifications de réengagement, #5547/#5698 :
                // `progression`). Le client qui sait naviguer par nom de route
                // le suit tel quel ; absent → chaîne vide, jamais une clé
                // inventée côté client.
                route: pickMetadataString(params.metadata, 'route'),
                // Discriminant d'entité du contenu social — pilote la surface
                // ouverte au tap côté client (lecteur de réel / viewer éphémère
                // / détail de post). `contentType` sert de repli : c'est sous ce
                // nom que la famille `friend_new_*` l'a historiquement porté.
                // Le TYPE de notification n'est JAMAIS un discriminant : le
                // fan-out de commentaires émet `story_thread_reply` pour
                // n'importe quel contenu, réel inclus.
                postType: pickMetadataString(params.metadata, 'postType')
                  || pickMetadataString(params.metadata, 'contentType'),
                senderId: params.actor?.id || '',
                senderUsername: params.actor?.username || '',
                senderDisplayName: params.actor?.displayName || '',
                senderAvatar: params.actor?.avatar || '',
                imageURL: params.actor?.avatar || '',
                // Phase B — reactions. Emoji used so the iOS extension can format
                // the body as "<sender> a réagi <emoji> à votre message" while the
                // INSendMessageIntent path still renders the reactor's avatar.
                reactionEmoji: (params.metadata && 'reactionEmoji' in params.metadata
                  ? String(params.metadata.reactionEmoji ?? '')
                  : ''),
                notificationLocKey: params.context.notificationLocKey || '',
                // GW5 — persistance NSE : timestamp serveur + type du message,
                // clés absentes (pas de '') quand la notification ne porte pas
                // de message.
                ...(params.context.messageCreatedAt ? { createdAt: params.context.messageCreatedAt } : {}),
                ...(params.context.messageType ? { messageType: params.context.messageType } : {}),
                // GW7 — showPreview:false : AUCUN champ porteur de contenu dans
                // data. La NSE réécrit inconditionnellement le body depuis
                // encryptedContent et attache le média d'attachmentUrl — les
                // embarquer vaincrait le mode privé (et translatedContent
                // voyagerait en clair dans le canal push malgré l'opt-out).
                ...(showPreview ? {
                  // Phase A — message media inline (audio waveform, image preview,
                  // video thumb). L'extension iOS lit ces champs pour télécharger le
                  // fichier et l'attacher comme UNNotificationAttachment (UTI typeHint).
                  //
                  // Cycle 125 — SECOND VERROU, même arbitrage que
                  // `previewPrismSource` et `prePersistedMessageFields` : un
                  // `notificationLocKey` ne se pose que sur un placeholder de
                  // protection (`protectedPreview` en est l'unique producteur),
                  // et la NSE attache `attachmentUrl` sans jamais le regarder.
                  // Un appelant qui masque le corps sans retirer son média perd
                  // ici le rich-push, jamais le secret : une garde de
                  // confidentialité échoue en montrant MOINS.
                  ...(params.context.notificationLocKey ? {
                    attachmentUrl: '',
                    attachmentMimeType: '',
                    attachmentDurationMs: '',
                    attachmentFileSize: '',
                  } : {
                    // #7022 — L'ADRESSE SE COMPOSE ICI : la NSE descend cette
                    // chaîne SANS base configurée, donc une clé de stockage (la
                    // forme que `normalize-media-urls.ts` laisse en base) n'y est
                    // pas une adresse. Règle et mesures : `publicMediaUrl.ts`.
                    attachmentUrl: publicMediaUrlFromEnv(params.context.firstAttachmentUrl || ''),
                    attachmentMimeType: params.context.firstAttachmentMimeType || '',
                    attachmentDurationMs: params.context.firstAttachmentDurationMs != null
                      ? String(params.context.firstAttachmentDurationMs)
                      : '',
                    // #7003 — la NSE la lit AVANT de lancer la requête : une
                    // pièce jointe trop lourde pour son enveloppe de 24 Mo ne
                    // se refuse utilement qu'avant d'être descendue. Elle
                    // voyage sous le même verrou que l'URL qu'elle décrit :
                    // un média protégé n'annonce pas plus sa taille que son
                    // adresse.
                    attachmentFileSize: params.context.firstAttachmentFileSize != null
                      ? String(params.context.firstAttachmentFileSize)
                      : '',
                  }),
                  encryptedContent: params.context.encryptedContent || '',
                  ...(params.context.translatedContent ? {
                    translatedContent: params.context.translatedContent,
                    translatedLanguage: params.context.translatedLanguage || '',
                  } : {}),
                  // Cycle 124 — le couple que la NSE PRÉ-ENREGISTRE. Les DEUX
                  // clés portent le nom que `prePersistMessage` lit, et elles
                  // voyagent ensemble : un contenu sans son étiquette de langue
                  // serait résolu par le Prisme comme de l'anglais, le repli
                  // que la NSE applique faute de mieux.
                  ...(params.context.messageContent ? {
                    content: params.context.messageContent,
                    originalLanguage: params.context.messageOriginalLanguage || '',
                  } : {}),
                } : {}),
              },
            };

          // GW5 — budget APNs 4KB (rejet silencieux PayloadTooLarge sinon, et
          // handleFailedToken compterait un strike sur un token sain).
          // Dégradation par étages avec RE-VÉRIFICATION après chaque coupe :
          // la traduction Prisme d'abord, puis encryptedContent — un banner
          // générique délivré (la NSE retombe sur le body serveur) vaut mieux
          // qu'un push rejeté qui ne s'affiche jamais.
          const APNS_SAFE_PAYLOAD_BYTES = 3800;
          const payloadBytes = (p: unknown): number => Buffer.byteLength(JSON.stringify(p), 'utf8');
          const { translatedContent: _tc, translatedLanguage: _tl, ...dataWithoutTranslation } = pushPayload.data;
          // `content` part avec `encryptedContent` : les deux portent le texte
          // du message, et un push REJETÉ ne pré-enregistre rien du tout. Ils
          // sont de toute façon exclusifs — un message chiffré n'a pas d'aperçu
          // de base `message-content`, donc jamais de `content`.
          const {
            encryptedContent: _ec,
            content: _mc,
            originalLanguage: _ol,
            ...dataWithoutContentFields
          } = dataWithoutTranslation;
          const boundedPayload = [
            pushPayload,
            { ...pushPayload, data: dataWithoutTranslation },
            { ...pushPayload, data: dataWithoutContentFields },
          ].find(candidate => payloadBytes(candidate) <= APNS_SAFE_PAYLOAD_BYTES)
            ?? { ...pushPayload, data: dataWithoutContentFields };

          this.pushService.sendToUser({
            userId: params.userId,
            // CRITICAL: exclude 'voip' tokens — regular notifications must NEVER be
            // delivered to PushKit, otherwise iOS shows a fake CallKit incoming call
            // for every message/friend-request/conversation-creation. Real call
            // pushes are dispatched separately from CallEventsHandler with types: ['voip'].
            types: ['apns', 'fcm'],
            payload: boundedPayload,
          }).then(async (results) => {
            await this.markPushDelivered(notification.id, results);
          }).catch(err => {
            notificationLogger.error('Push notification failed', { error: err, userId: params.userId });
          });
        } catch (err) {
          // non-blocking
        }
      }

      // Send immediate email for high-priority notifications to offline users
      if (this.emailService && params.priority === 'high') {
        try {
          // Presence check MUST target the room every registered socket joins
          // (`ROOMS.user(id)` === `user:${id}`, cf. AuthHandler). The room named
          // by the bare user id is always empty, so a bare-id check would mark
          // every online user "offline" and fire spurious immediate emails.
          const sockets = this.io ? await this.io.in(ROOMS.user(params.userId)).fetchSockets() : [];
          if (sockets.length === 0) {
            const { getCacheStore } = await import('../CacheStore');
            const cache = getCacheStore();
            // Per-category throttle: security alerts and social notifications
            // use independent 5-min buckets, so a social email (mention, missed
            // call) can never preempt a genuine security alert (new login,
            // suspicious activity) for the same user within the window.
            const throttleCategory = isSecurityEmailType(params.type) ? 'security' : 'social';
            const throttleKey = `notif:email:throttle:${throttleCategory}:${params.userId}`;
            const canSend = await cache.setnx(throttleKey, '1', 300);
            if (canSend) {
              const user = await this.prisma.user.findUnique({
                where: { id: params.userId },
                select: { email: true, username: true, ...this.LANG_SELECT }
              });
              if (user?.email) {
                // Cycle 125 — le CADRAGE d'un e-mail immédiat descend le même
                // Prisme que la bannière push du même destinataire. Les trois
                // envois ci-dessous lisaient `systemLanguage` en direct, donc
                // servaient le repli à tout lecteur dont le rang 1 est vide —
                // et servaient un `'pt-BR'` non normalisé aux autres.
                const emailLang = recipientLanguage(user, 'fr');
                if (params.type === 'login_new_device' && (params as any)._loginAlertData) {
                  const alertData = (params as any)._loginAlertData;
                  this.emailService.sendLoginAlertEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: emailLang,
                    ...alertData,
                  }).catch(err => {
                    notificationLogger.error('Login alert email failed', { error: err, userId: params.userId });
                  });
                } else if (isSecurityEmailType(params.type)) {
                  this.emailService.sendSecurityAlertEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: emailLang,
                    alertType: params.type,
                    details: truncateByCodePoints(params.content, 500),
                  }).catch(err => {
                    notificationLogger.error('Immediate email failed', { error: err, userId: params.userId });
                  });
                } else if (notifPrefs?.emailEnabled !== false) {
                  // Social / general notification (mention, missed call, …):
                  // neutral notification email, never the security template.
                  // Gated on emailEnabled comme le digest et les broadcasts —
                  // seules les alertes de sécurité ci-dessus passent toujours.
                  this.emailService.sendNotificationEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: emailLang,
                    notificationType: params.type,
                    details: truncateByCodePoints(params.content, 500),
                  }).catch(err => {
                    notificationLogger.error('Immediate notification email failed', { error: err, userId: params.userId });
                  });
                }
              }
            }
          }
        } catch (err) {
          // Non-blocking
        }
      }

      return formatted;
    } catch (error) {
      notificationLogger.error('Failed to create notification', {
        error,
        userId: params.userId,
        type: params.type,
      });
      return null;
    }
  }

  // ==============================================
  // FORMATTERS
  // ==============================================

  /**
   * Sanitize une date pour éviter "Invalid time value"
   * Retourne la date valide ou la valeur par défaut
   */
  private sanitizeDate(value: any, defaultValue: Date | null = null): Date | null {
    // Cas 1: valeur null/undefined/false/empty
    if (!value) return defaultValue;

    try {
      // Cas 2: déjà un objet Date (vérifier qu'il est valide)
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          notificationLogger.warn('Invalid Date object detected, using default', {
            value: value.toString(),
            defaultValue
          });
          return defaultValue;
        }
        return value;
      }

      // Cas 3: convertir en Date et vérifier
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        notificationLogger.warn('Invalid date value detected, using default', {
          value,
          valueType: typeof value,
          defaultValue
        });
        return defaultValue;
      }

      return date;
    } catch (error) {
      notificationLogger.error('Error sanitizing date, using default', {
        error,
        value,
        defaultValue
      });
      return defaultValue;
    }
  }

  /**
   * Formate une notification DB → API
   */
  private formatNotification(raw: any): Notification {
    const readAtDate = this.sanitizeDate(raw.readAt, null);
    const createdAtDate = this.sanitizeDate(raw.createdAt, null);
    const expiresAtDate = this.sanitizeDate(raw.expiresAt, null);

    return {
      id: raw.id,
      userId: raw.userId,
      type: raw.type as NotificationType,
      priority: raw.priority as NotificationPriority,
      title: raw.title ?? null,
      subtitle: raw.subtitle ?? null,
      content: raw.content,

      actor: (raw.actor || undefined) as NotificationActor | undefined,
      context: raw.context as NotificationContext,
      metadata: raw.metadata as NotificationMetadata,

      state: {
        isRead: raw.isRead,
        // Garder les objets Date pour le type TypeScript
        // Fastify les convertira automatiquement en ISO string via le schéma
        readAt: readAtDate,
        createdAt: createdAtDate,
        expiresAt: expiresAtDate || undefined,
      },

      delivery: (raw.delivery || { emailSent: false, pushSent: false }) as any,
    } as any; // Cast pour compilation avant régénération Prisma
  }

  // ==============================================
  // NEW_MESSAGE
  // ==============================================

  async createMessageNotification(params: {
    recipientUserId: string;
    senderId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
    hasAttachments?: boolean;
    attachmentCount?: number;
    firstAttachmentType?: 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';
    firstAttachmentFilename?: string;
    firstAttachmentFileSize?: number | null;
    firstAttachmentDuration?: number | null;
    firstAttachmentWidth?: number | null;
    firstAttachmentHeight?: number | null;
    /** Résumé léger de TOUS les attachments, dans l'ordre d'envoi. Le 1er est
     *  affiché en média inline, les suivants sont agrégés en badges `+N` par
     *  type dans le corps de la notification. */
    attachments?: ReadonlyArray<{
      type: 'image' | 'video' | 'audio' | 'document';
      filename?: string | null;
    }>;
    /** URL accessible publiquement pour le 1er attachment (image/audio/video).
     *  L'extension iOS télécharge ce fichier et le rend en UNNotificationAttachment
     *  natif (waveform pour audio, preview pour image, thumbnail pour video). */
    firstAttachmentUrl?: string;
    /** MIME type du 1er attachment, ex. `audio/m4a`, `image/jpeg`, `video/mp4`.
     *  Utilisé par l'extension pour choisir le UTI typeHint correct. */
    firstAttachmentMimeType?: string;
    /**
     * Les pistes TRADUITES de la première pièce jointe, par langue — cycle 128.
     * Élues par la langue du texte SERVI, cf. {@link servedAttachmentMedia}.
     * Absentes (cas de l'écrasante majorité) : l'original est attaché.
     */
    attachmentTracks?: Readonly<Record<string, AttachmentTranslationTrack>>;
    encryptedContent?: string;
    notificationLocKey?: string;
    /**
     * Ce que `messagePreview` EST, donc ce qui le traduit — cf.
     * {@link PreviewPrismBasis}. Défaut : `message-content` (cas nominal).
     * L'éventail, qui a COMPOSÉ l'aperçu, est le seul à savoir le dire.
     */
    previewBasis?: PreviewPrismBasis;
    /** Identité d'acteur déjà résolue — cf. `NotificationActorProfile`. */
    senderProfile?: NotificationActorProfile;
  }): Promise<Notification | null> {
    // Race-condition guard: between `MessageProcessor.handleMessage` and the
    // moment the notification actually fans out (sender lookup + conversation
    // lookup + push enqueue + socket emit) there can be hundreds of
    // milliseconds. If the sender soft-deletes or lets the message expire in
    // that window we MUST NOT leak the original content via the banner. Refetch
    // the live state right before the fan-out and bail when the message is no
    // longer eligible.
    // GW5 — the same refetch feeds the NSE persistence fields: authoritative
    // createdAt/messageType plus any translation already produced by the
    // pipeline at fan-out time (Message.translations JSON, keyed by language).
    //
    // Cycle 127 — la garde vit dans `messageLiveness`, que les TROIS éventails
    // partagent désormais. Ce commentaire nommait une troisième cause — un
    // message à vue unique « brûlé » en vol — que le code n'a jamais appliquée :
    // `isViewOnce` et `viewOnceCount` étaient SÉLECTIONNÉS et lus par personne.
    // C'est le select qui part, pas la garde qui arrive, et la raison se mesure :
    // `viewOnceCount > 0` dit que QUELQU'UN a consommé, jamais que CE
    // destinataire l'a fait — s'y fier ferait taire l'annonce pour tous les
    // autres. Et le contenu d'un message à vue unique est de toute façon masqué
    // en amont par `protectedPreview`, qui ne laisse partir qu'un placeholder.
    const liveMessage = await this.prisma.message.findUnique({
      where: { id: params.messageId },
      select: { deletedAt: true, expiresAt: true, createdAt: true, messageType: true, translations: true, originalLanguage: true },
    });
    // La ligne ABSENTE est la politique PROPRE à ce lot, et elle lui reste :
    // `messageLiveness` ne se prononce que sur ce qu'une ligne PROUVE (cf.
    // {@link MessageLiveness}), quand ce lot-ci tient sa source de cette
    // relecture SEULE — sans ligne, il n'a ni horloge, ni langue d'origine, ni
    // traduction à servir. La réponse et la mention, elles, tiennent leur
    // échéance de l'appelant et continuent d'annoncer : c'est une décision
    // explicite, gardée par `replyMentionNotificationPrism.test.ts`.
    if (!liveMessage) {
      notificationLogger.info('Skipping message notification (message vanished)', {
        messageId: params.messageId,
      });
      return null;
    }
    if (this.messageLiveness(liveMessage, params.messageId) === 'gone') return null;

    // Expéditeur + conversation : lectures indépendantes, en parallèle. Un
    // `senderProfile` fourni supprime la lecture `User` — elle est refaite ici
    // une fois PAR DESTINATAIRE, et elle est vouée à l'échec pour un acteur
    // anonyme (cf. `NotificationActorProfile`).
    const [resolvedSender, conversation] = await Promise.all([
      params.senderProfile
        ? Promise.resolve(params.senderProfile)
        : this.prisma.user.findUnique({
            where: { id: params.senderId },
            select: { username: true, displayName: true, avatar: true },
          }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true, avatar: true },
      }),
    ]);
    const sender = resolvedSender;

    if (!sender) {
      notificationLogger.warn('Sender not found for message notification', {
        senderId: params.senderId,
      });
      return null;
    }

    const { lang: recipientLang, ordered: recipientPrism } =
      await this.resolveRecipientPrism(params.recipientUserId);

    // Cycle 121 — Prisme : DESCENDRE les langues du destinataire dans l'ordre,
    // la première servie gagne. `recipientLang` est la langue de CADRAGE et ne
    // convient PAS ici : appariée seule, elle ratait toute traduction d'un rang
    // inférieur — cas nominal dès que la locale appareil (rang 4) diffère de la
    // langue applicative. La source vient de la relecture VIVANTE ci-dessus,
    // qui sert déjà de gate d'éligibilité : aucune lecture de plus.
    // Cycle 123 — UNE descente par destinataire, sur la source qui traduit
    // l'APERÇU. Le corps affiché et les champs du fil en sont deux projections :
    // c'est ce qui garantit que la charge remise à APNs décrit le texte que la
    // bannière montre, et rien d'autre.
    const servedTranslation = this.prismTranslation(
      this.previewPrismSource({
        basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
        messageSource: {
          translations: this.pushableTranslations(liveMessage.translations),
          originalLanguage: liveMessage.originalLanguage,
        },
        protectedByLocKey: !!params.notificationLocKey,
      }),
      recipientPrism
    );
    const prismContext = this.servedTranslationFields(servedTranslation);

    // Cycle 124 — le corps de la bulle que la NSE PRÉ-ENREGISTRE au démarrage à
    // froid, et son étiquette de langue. Le prédicat vit dans
    // `prePersistedMessageFields` — un SEUL site pour les trois éventails.
    const prePersisted = this.prePersistedMessageFields({
      basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
      preview: params.messagePreview,
      originalLanguage: liveMessage.originalLanguage,
      protectedByLocKey: !!params.notificationLocKey,
    });

    // Cycle 128 — le MÉDIUM descend la même élection que le texte. Calculé
    // AVANT le corps : c'est la durée de la piste SERVIE qui compose
    // « 🎵 Audio · 0:09 », pas celle de l'original.
    const servedMedia = this.servedAttachmentMedia({
      tracks: params.attachmentTracks,
      served: servedTranslation,
      originalUrl: params.firstAttachmentUrl,
      originalMimeType: params.firstAttachmentMimeType,
      originalDurationMs: params.firstAttachmentDuration,
      originalFileSize: params.firstAttachmentFileSize,
    });

    // Cycle 122 — le corps AFFICHÉ descend le Prisme, pas seulement les champs
    // de service ci-dessus : c'est lui que les trois plateformes rendent.
    // Cycle 125 bis — et la composition vit dans `servedBannerBody`, que les
    // TROIS éventails partagent désormais.
    const content = this.servedBannerBody({
      lang: recipientLang,
      preview: params.messagePreview,
      translation: servedTranslation,
      media: { ...params, firstAttachmentDuration: servedMedia.durationMs ?? null },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'new_message',
      priority: 'normal',
      content,
      collapseId: `conv-${params.conversationId}`,
      lang: recipientLang,
      // La notification ne survit pas au message qu'elle annonce. La valeur
      // vient de la relecture VIVANTE ci-dessus, pas de l'appelant : celui-ci
      // ne pourrait que rapporter ce qu'il croyait savoir à l'envoi.
      expiresAt: liveMessage.expiresAt ?? undefined,

      actor: {
        id: params.senderId,
        username: sender.username,
        displayName: sender.displayName,
        avatar: sender.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        // Group avatar — used by the iOS in-app toast as a fallback when the
        // sender has no personal avatar (group messages).
        conversationAvatar: conversation?.avatar ?? undefined,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
        // Phase A — propagation au payload APN pour rendu media inline iOS.
        // Cycle 128 — les TROIS champs sortent de l'élection du Prisme, pas des
        // paramètres bruts : la piste servie, son étiquette et sa durée.
        // #7022 — la RÉFÉRENCE reste telle que la base la porte (une clé de
        // stockage en sortie de `normalize-media-urls.ts`) : ce contexte est
        // PERSISTÉ et servi aux clients, qui ont tous une base configurée et
        // composent l'adresse eux-mêmes. Y absolutiser regraverait l'hôte de
        // déploiement dans la donnée — exactement ce que ce lot retire.
        // C'est la CHARGE PUSH qui compose l'adresse, parce que son lecteur
        // (la NSE iOS) n'a aucune base — voir `attachmentUrl` plus haut.
        firstAttachmentUrl: servedMedia.url,
        firstAttachmentMimeType: servedMedia.mimeType,
        // #7003 — la taille voyage avec le fichier qu'elle décrit, et c'est la
        // NSE qui la LIT : sans elle, l'extension ne pouvait décider d'attacher
        // ou non qu'après avoir ramené le corps entier dans une enveloppe de
        // 24 Mo, c'est-à-dire trop tard.
        firstAttachmentFileSize: servedMedia.fileSize,
        // `MessageAttachment.duration` est DÉJÀ en millisecondes (`schema.prisma`,
        // et le doc-comment de `formatSingleAttachmentLabelI18n` le redit). Ce
        // site la multipliait par 1000 comme si elle était en secondes : un
        // vocal de 34 s partait sur le fil annoncé pour 9 h 26.
        firstAttachmentDurationMs: servedMedia.durationMs,
        encryptedContent: params.encryptedContent,
        notificationLocKey: params.notificationLocKey,
        // GW5 — champs de persistance NSE (timestamp serveur + type + Prisme).
        ...this.messageClockFields({
          createdAt: liveMessage.createdAt instanceof Date ? liveMessage.createdAt : null,
          messageType: liveMessage.messageType ?? null,
        }),
        // Cycle 124 — le corps et la langue de la bulle pré-enregistrée.
        ...prePersisted,
        ...prismContext,
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
        ...(params.hasAttachments && params.attachmentCount && {
          attachments: {
            count: params.attachmentCount,
            firstType: params.firstAttachmentType || 'document',
            firstFilename: params.firstAttachmentFilename || 'file',
            // Cf. `firstAttachmentDurationMs` ci-dessus : la colonne est déjà en
            // millisecondes, et c'est l'unité que le SDK iOS décode sous ce nom.
            // La ligne PERSISTÉE porte la durée SERVIE, comme la bannière.
            ...(servedMedia.durationMs != null
              ? { firstDurationMs: servedMedia.durationMs }
              : {}),
            ...(params.firstAttachmentFileSize != null ? { firstFileSize: params.firstAttachmentFileSize } : {}),
            ...(params.firstAttachmentWidth != null ? { firstWidth: params.firstAttachmentWidth } : {}),
            ...(params.firstAttachmentHeight != null ? { firstHeight: params.firstAttachmentHeight } : {}),
          },
        }),
      } as any,
    });
  }

  // ==============================================
  // USER_MENTIONED
  // ==============================================

  async createMentionNotification(params: {
    mentionedUserId: string;
    mentionerUserId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
    /** Identité d'acteur déjà résolue — cf. `NotificationActorProfile`. */
    senderProfile?: NotificationActorProfile;
    /**
     * Échéance du message qui mentionne, reportée sur la notification : elle ne
     * doit pas survivre au message. Fournie par l'appelant plutôt que relue
     * ici — l'éventail la tient déjà (`FanOutMessage.expiresAt`), et
     * `Message.expiresAt` est écrit à l'insertion et jamais modifié ensuite,
     * donc sa copie ne peut pas dériver. Absente : aucune échéance, le
     * comportement de toujours.
     */
    messageExpiresAt?: Date | null;
    /**
     * Source du Prisme déjà relue — cf. `MessagePrismSource`. Elle ne dépend pas
     * du destinataire, donc l'éventail la relit UNE fois plutôt qu'une par
     * mentionné. Absente : relue ici (appel solo).
     */
    prismSource?: MessageBannerSource;
    /** Cf. `createMessageNotification.previewBasis`. */
    previewBasis?: PreviewPrismBasis;
    /**
     * Le média qui COMPOSE le corps quand l'aperçu est vide — cf.
     * {@link NotificationBannerMedia}. Sans lui, mentionner quelqu'un sous une
     * photo sans légende poussait une bannière au corps VIDE.
     */
    attachments?: NotificationBannerMedia['attachments'];
    firstAttachmentFileSize?: number | null;
    firstAttachmentDuration?: number | null;
    firstAttachmentWidth?: number | null;
    firstAttachmentHeight?: number | null;
    /**
     * Cf. `createMessageNotification.notificationLocKey` — cycle 126. La clé de
     * protection, dont `protectedPreview` est l'unique producteur du dépôt : sa
     * présence est une DÉCLARATION de protection, jamais un indice. Elle vaut
     * ici la localisation CLIENT du placeholder (la NSE le rend depuis sa propre
     * table plutôt que d'afficher la chaîne composée par la passerelle) et le
     * second verrou de `createNotification`.
     */
    notificationLocKey?: string;
  }): Promise<Notification | null> {
    // Anti-spam: rate limit des mentions par paire (sender → recipient)
    if (!this.shouldCreateMentionNotification(params.mentionerUserId, params.mentionedUserId)) {
      notificationLogger.info('Mention notification blocked (rate limit)', {
        senderId: params.mentionerUserId,
        mentionedUserId: params.mentionedUserId,
      });
      return null;
    }

    const [mentioner, conversation, prism, prismSource] = await Promise.all([
      params.senderProfile
        ? Promise.resolve(params.senderProfile)
        : this.prisma.user.findUnique({
            where: { id: params.mentionerUserId },
            select: { username: true, displayName: true, avatar: true },
          }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true, avatar: true },
      }),
      this.resolveRecipientPrism(params.mentionedUserId),
      params.prismSource
        ? Promise.resolve(params.prismSource)
        : this.loadMessagePrismSource(params.messageId),
    ]);

    if (!mentioner) return null;

    // Cycle 127 — cf. `createReplyNotification`. Le lot relit UNE fois pour tous
    // ses mentionnés et passe sa source ici : le verdict voyage avec elle, donc
    // il ne coûte pas une requête par destinataire.
    if (prismSource.liveness === 'gone') return null;

    // Cycle 123 — UNE descente, deux projections : le corps et les champs du
    // fil. Cf. `createMessageNotification`.
    const servedTranslation = this.prismTranslation(
      this.previewPrismSource({
        basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
        messageSource: prismSource,
        protectedByLocKey: !!params.notificationLocKey,
      }),
      prism.ordered
    );

    return this.createNotification({
      userId: params.mentionedUserId,
      type: 'user_mentioned',
      priority: 'high',
      // Cycle 122 — le corps AFFICHÉ porte le texte du Prisme : c'est lui que
      // les trois plateformes rendent, pas les champs de service du fil push.
      // Cycle 125 bis — et il se compose comme celui d'un message simple : le
      // libellé de la pièce jointe prend la place d'un texte absent.
      content: this.servedBannerBody({
        lang: prism.lang,
        preview: params.messagePreview,
        translation: servedTranslation,
        media: params,
      }),
      collapseId: `conv-${params.conversationId}`,
      lang: prism.lang,
      expiresAt: params.messageExpiresAt ?? undefined,

      actor: {
        id: params.mentionerUserId,
        username: mentioner.username,
        displayName: mentioner.displayName,
        avatar: mentioner.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        // Group avatar — fallback for the iOS in-app toast when the sender
        // has no personal avatar (group messages).
        conversationAvatar: conversation?.avatar ?? undefined,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
        // Cycle 122 — le Prisme s'applique à TOUT le contenu poussé vers un
        // destinataire NOMMÉ, pas au seul `new_message` : sans cette descente,
        // la bannière d'une mention restait dans la langue de l'expéditeur
        // pendant que celle d'un message simple servait la traduction.
        ...this.servedTranslationFields(servedTranslation),
        // Cycle 124 — la JUMELLE : cette bannière pousse un `messageId`, donc
        // elle fait pré-enregistrer une bulle côté NSE, exactement comme celle
        // d'un message simple. Sans ce couple, la bulle d'une MENTION restait
        // vide pendant que celle d'un message en avait une — le symptôme « deux
        // textes pour un même message » que les cycles 121 à 123 poursuivent.
        // La langue vient de la source déjà relue : aucune lecture de plus.
        ...this.prePersistedMessageFields({
          basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
          preview: params.messagePreview,
          originalLanguage: prismSource.originalLanguage,
          protectedByLocKey: !!params.notificationLocKey,
        }),
        // Cycle 126 — le verrou de protection et l'horloge de la bulle. Le
        // premier est redondant avec la base `protected-placeholder` que
        // l'éventail pose déjà, et c'est voulu : `protectedPreview` est son
        // unique producteur, donc sa présence DÉCLARE la protection là où une
        // base peut être omise par un appelant solo.
        notificationLocKey: params.notificationLocKey,
        ...this.messageClockFields(prismSource),
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
      } as any,
    });
  }

  /**
   * Créer des notifications de mention en batch (simplifié)
   */
  async createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: {
      senderId: string;
      /**
       * Identité d'acteur déjà résolue — cf. `NotificationActorProfile`. Elle
       * remplace `senderUsername`/`senderAvatar`, qui traversaient cette API
       * sans jamais être lus : `createMentionNotification` rechargeait
       * l'utilisateur par destinataire, et abandonnait pour un acteur anonyme.
       */
      senderProfile?: NotificationActorProfile;
      messageContent: string;
      conversationId: string;
      messageId: string;
      /** Échéance du message mentionnant — cf. `createMentionNotification`. */
      messageExpiresAt?: Date | null;
      /** Cf. `createMessageNotification.previewBasis`. */
      previewBasis?: PreviewPrismBasis;
      /** Cf. `createMentionNotification.notificationLocKey`. */
      notificationLocKey?: string;
      /** Cf. `createMentionNotification.attachments` — cycle 125 bis. */
      attachments?: NotificationBannerMedia['attachments'];
      firstAttachmentFileSize?: number | null;
      firstAttachmentDuration?: number | null;
      firstAttachmentWidth?: number | null;
      firstAttachmentHeight?: number | null;
    },
    memberIds: string[]
  ): Promise<number> {
    const eligibleUserIds = mentionedUserIds.filter(userId => {
      if (userId === commonData.senderId) return false;
      if (!memberIds.includes(userId)) return false;
      if (!this.shouldCreateMentionNotification(commonData.senderId, userId)) {
        notificationLogger.info('Batch mention blocked (rate limit)', {
          senderId: commonData.senderId,
          recipientId: userId,
        });
        return false;
      }
      return true;
    });

    if (eligibleUserIds.length === 0) return 0;

    // La source du Prisme ne dépend pas du destinataire : une relecture pour
    // tout l'éventail, la DESCENTE restant par lecteur.
    const prismSource = await this.loadMessagePrismSource(commonData.messageId);

    // Cycle 127 — un message rappelé l'est pour TOUT le lot. Le verdict est déjà
    // dans la source relue une fois : le poser ici évite d'ouvrir un Prisme par
    // mentionné pour n'en tirer que des `null`. La garde par destinataire de
    // `createMentionNotification` reste, pour l'appelant qui l'atteint en solo.
    if (prismSource.liveness === 'gone') return 0;

    // Cycle 126 — les deux seuls champs que ce relais RENOMME sont extraits ;
    // tout ce qui reste se répand. Recopié champ par champ, ce relais retenait
    // silencieusement chaque champ de bannière ajouté en amont — c'est ainsi que
    // le verrou de protection n'est jamais arrivé jusqu'ici.
    const { senderId, messageContent, ...banner } = commonData;

    const results = await Promise.all(
      eligibleUserIds.map(userId =>
        this.createMentionNotification({
          ...banner,
          mentionedUserId: userId,
          mentionerUserId: senderId,
          messagePreview: messageContent,
          prismSource,
        })
      )
    );

    return results.filter(Boolean).length;
  }

  // ==============================================
  // MESSAGE_REACTION
  // ==============================================

  async createReactionNotification(params: {
    messageAuthorId: string;
    reactorUserId: string;
    messageId: string;
    conversationId: string;
    reactionEmoji: string;
  }): Promise<Notification | null> {
    // GW3 — per-conversation mute suppresses reaction notifications
    // (mentions pierce the mute; reactions do not). Checked BEFORE the
    // throttle : le mute est déterministe/durable alors que
    // shouldCreateReactionNotification MUTE son bucket — une réaction
    // supprimée par le mute ne doit pas consommer le budget de la paire.
    if (await this.isConversationMutedFor(params.messageAuthorId, params.conversationId, 'message_reaction')) {
      return null;
    }

    // Anti-spam: throttle reaction notifications per sender→recipient pair
    if (!this.shouldCreateReactionNotification(params.reactorUserId, params.messageAuthorId)) {
      return null;
    }

    const [reactor, conversation, message] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.reactorUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
      this.prisma.message.findUnique({
        where: { id: params.messageId },
        // `expiresAt` voyage dans la lecture que l'extrait demandait déjà :
        // la notification d'une réaction DÉSIGNE le message réagi, donc elle
        // ne doit pas lui survivre.
        //
        // Cycle 123 bis — les drapeaux de PROTECTION voyagent avec, et ce
        // n'était pas le cas : cette lecture ne les chargeait même pas, si
        // bien qu'aucun masque n'était possible ici. `protectedPreview` n'avait
        // qu'UN appelant de production dans tout le dépôt (l'éventail d'un
        // message) — tout ce qui relit `Message.content` ailleurs le servait nu.
        select: {
          content: true, expiresAt: true, messageType: true, createdAt: true,
          isViewOnce: true, isBlurred: true, isEncrypted: true, effectFlags: true,
        },
      }),
    ]);

    if (!reactor) return null;

    const lang = await this.resolveRecipientLang(params.messageAuthorId);

    // Cycle 123 bis — un message PROTÉGÉ (éphémère / vue unique / flouté /
    // chiffré) n'a pas d'extrait, et le corps se réduit à l'action.
    //
    // Le destinataire est ici l'AUTEUR du message : il connaît son texte, ce
    // qui rend la fuite moins chère que celle des trois éventails — mais la
    // protection ne parle pas de qui SAIT, elle parle de ce qui S'AFFICHE. Un
    // message éphémère ou flouté n'a rien à faire sur un écran verrouillé, ni
    // dans une ligne `Notification` que l'inbox in-app relit.
    //
    // Pas de `notificationLocKey` ici, contrairement à l'éventail : les clients
    // s'en servent pour REMPLACER le corps, ce qui effacerait « a réagi 🔥 ».
    // L'extrait est simplement omis — la branche existait déjà pour un message
    // sans texte.
    const isProtected = protectedPreview({
      messageType: message?.messageType,
      isEncrypted: message?.isEncrypted,
      isViewOnce: message?.isViewOnce,
      isBlurred: message?.isBlurred,
      effectFlags: message?.effectFlags,
      expiresAt: message?.expiresAt ?? null,
      createdAt: message?.createdAt ?? null,
    }) !== null;

    const messagePreview = message?.content && !isProtected
      ? truncateByCodePoints(message.content, 100, '…')
      : null;

    return this.createNotification({
      userId: params.messageAuthorId,
      type: 'message_reaction',
      priority: 'low',
      // Le corps porte l'action ET le message visé — contrairement aux
      // réactions sociales, il n'a pas d'alternative : le sous-titre d'une
      // notification DE CONVERSATION est déjà pris par le nom du groupe
      // (recomposé côté client, Local-First) et purement ignoré par iOS en
      // tête-à-tête. Le destinataire doit pouvoir dire À QUEL message on a
      // réagi quand il en a écrit plusieurs.
      content: messagePreview
        ? `${notificationString(lang, 'reaction.message', { emoji: params.reactionEmoji })} : « ${messagePreview} »`
        : notificationString(lang, 'reaction.message', { emoji: params.reactionEmoji }),
      lang,
      expiresAt: message?.expiresAt ?? undefined,

      actor: {
        id: params.reactorUserId,
        username: reactor.username,
        displayName: reactor.displayName,
        avatar: reactor.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
        reactionEmoji: params.reactionEmoji,
        ...(messagePreview && { messageContent: messagePreview }),
      },
    });
  }

  // ==============================================
  // COMMENT_REACTION
  // ==============================================

  /**
   * Le destinataire d'une notification du FIL a-t-il encore le droit de voir le
   * post qui la porte ?
   *
   * Les trois notifications à destinataire unique du fil (réponse, like et
   * réaction sur commentaire) visent quelqu'un qui A pu commenter — donc admis
   * À CE MOMENT-LÀ. Rien ne garantit qu'il le soit encore : une dés-amitié ou
   * une édition de visibilité le sort de l'audience sans toucher à son
   * commentaire. Ce qui partirait alors n'est pas un ping : la réponse porte
   * l'extrait du contenu d'un TIERS et la vignette du post.
   *
   * La garde RÉSOUT le post elle-même plutôt que d'exiger un paramètre
   * `visibility` de ses appelants (le choix du cycle 28 pour les lots de
   * mention) : ces trois méthodes sont invoquées en fire-and-forget APRÈS la
   * réponse HTTP/socket, donc la requête supplémentaire ne coûte rien
   * d'observable — et une garde sans paramètre ne peut pas être désarmée par
   * omission, pas même par un appelant futur qui ignorerait la règle.
   *
   * Audience de CONSOMMATION (amis ∪ contacts DM) : être informé d'un contenu
   * qu'on a le droit de lire dans le fil est la même question que le lire.
   *
   * **En panne ou post introuvable, on REFUSE.** Une notification manquée se
   * rattrape en ouvrant le post ; un extrait poussé ne se rappelle pas.
   */
  private async canNotifyAboutPost(postId: string, recipientId: string): Promise<boolean> {
    try {
      const postAcl = await loadPostAcl(this.prisma, postId);
      if (!postAcl) return false;
      return await canUserConsumePost(this.prisma, postAcl, recipientId);
    } catch {
      return false;
    }
  }

  async createCommentReactionNotification(params: {
    commentAuthorId: string;
    reactorUserId: string;
    commentId: string;
    postId: string;
    reactionEmoji: string;
    /** Truncated comment content (≤ 80 chars) to inject into the body. */
    commentPreview?: string;
    /** Display name (fallback: username) of the post/story author. */
    postAuthorName?: string;
    /**
     * Type d'entité portant le commentaire réagi. Mirror du sibling
     * `createPostLikeNotification` : un REEL/STATUS ne s'effondre plus vers 'POST'
     * dans la métadonnée ni dans le corps localisé.
     */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
  }): Promise<void> {
    if (params.commentAuthorId === params.reactorUserId) return;

    // Anti-spam: throttle reaction notifications per sender→recipient pair
    if (!this.shouldCreateReactionNotification(params.reactorUserId, params.commentAuthorId)) {
      return;
    }

    if (!(await this.canNotifyAboutPost(params.postId, params.commentAuthorId))) return;

    const reactor = await this.prisma.user.findUnique({
      where: { id: params.reactorUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!reactor) return;

    // Body verbeux (spec user 2026-05-28) : "[reactor] a réagi [emoji] à votre
    // commentaire sur la story de [story_author]". Le précédent body
    // ne contenait QUE `reactionEmoji` (e.g. "❤️"), trop sommaire — le
    // destinataire ne savait pas QUI avait réagi NI sur QUEL commentaire /
    // QUELLE story.
    const reactorName = reactor.displayName?.trim()
      || reactor.username?.trim()
      || 'Quelqu’un';
    const lang = await this.resolveRecipientLang(params.commentAuthorId);
    const body = notificationString(lang, 'reaction.commentVerbose', {
      actor: reactorName,
      emoji: params.reactionEmoji,
      author: params.postAuthorName,
      postType: params.postType,
    });

    // Subtitle (rendu sous le title côté iOS — banner riche) : un aperçu du
    // commentaire qui a reçu la réaction. Permet au destinataire de savoir
    // *quel* de ses commentaires reçoit l'engagement sans avoir à ouvrir la
    // notification.
    // Extrait NORMALISÉ une fois : il sert au sertissage du sous-titre ET, en
    // métadonnée, de clé de réécriture quand le commentaire est édité. Les
    // dériver deux fois les ferait diverger au premier changement de troncature,
    // et la substitution ne retrouverait alors plus sa chaîne.
    const trimmedCommentPreview = params.commentPreview?.trim() ?? '';
    const subtitle = trimmedCommentPreview !== ''
      ? `« ${trimmedCommentPreview} »`
      : undefined;

    await this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_reaction',
      priority: 'low',
      content: body,
      subtitle,
      lang,

      actor: {
        id: params.reactorUserId,
        username: reactor.username,
        displayName: reactor.displayName,
        avatar: reactor.avatar,
      },

      // postId/commentId vivent dans context (cible de navigation = contexte
      // central de la notif). Ils sont désormais exposés par le schema de
      // réponse (notificationContextSchema) — plus de strip côté REST.
      context: {
        postId: params.postId,
        commentId: params.commentId,
      },

      metadata: {
        action: 'view_post',
        reactionEmoji: params.reactionEmoji,
        // Entité portant le commentaire → le client affiche « Réel »/« Statut »/« Story »/
        // « Publication » (et non un libellé générique). Ne s'effondre plus vers 'POST'
        // pour les REEL/STATUS (F58) — cohérent avec le sibling post-reaction.
        postType: params.postType ?? 'POST',
        // L'extrait est SERTI dans le `subtitle` composé juste au-dessus
        // (« « … » »), et le sertissage n'est pas inversible. Le ranger aussi
        // ici rend la ligne AUTO-DESCRIPTIVE : c'est la seule chose qui permet
        // à `reproduceEditedSubjectNotifications` de savoir quelle portion du
        // sous-titre décrivait le commentaire, donc de la réécrire quand
        // celui-ci est édité. Sans elle, ce type — et lui seul de toute la
        // famille du fil — garderait l'ancien texte pour toujours. Même clé
        // que ses voisins `comment_like` / `post_comment`.
        //
        // Stocké VERBATIM, et non re-tronqué : la réécriture cherche cette
        // chaîne DANS le sous-titre, donc les deux doivent être identiques au
        // caractère près. `truncateMessage` coupe aux MOTS — l'appliquer ici
        // ferait diverger la copie du sertissage sur tout extrait long, et la
        // substitution ne trouverait plus rien. Les appelants bornent déjà à
        // ~80 caractères.
        ...(trimmedCommentPreview !== ''
          ? { commentPreview: trimmedCommentPreview }
          : {}),
      },
    });
  }

  // ==============================================
  // STORY COMMENT FAN-OUT (Phase 1D)
  // ==============================================

  /** Fonction de module (`fanout/story-comment.ts`, ne lit que `prisma`) — le délégué reste pour les 30 témoins qui l'appellent sur l'instance (25 `storycomments` + 5 `fanouttruncation`) ; AUCUN appelant de production hors de cette classe, mesuré le 2026-09-19. */
  async getStoryNotificationRecipients(
    postId: string,
    authorId: string,
    commenterId: string
  ): Promise<StoryNotificationRecipients> {
    return getStoryNotificationRecipients(this.prisma, postId, authorId, commenterId);
  }

  async createStoryCommentNotificationsBatch(params: StoryCommentFanoutParams): Promise<void> {
    return createStoryCommentNotificationsBatch(this.fanoutDependencies(), params);
  }

  // ==============================================
  // COMMENT MENTION NOTIFICATIONS (Phase 2B)
  // ==============================================

  async createCommentMentionNotificationsBatch(params: CommentMentionFanoutParams): Promise<void> {
    return createCommentMentionNotificationsBatch(this.fanoutDependencies(), params);
  }

  // ==============================================
  // POST MENTION NOTIFICATIONS (Fix 2)
  // ==============================================

  async createPostMentionNotificationsBatch(params: PostMentionFanoutParams): Promise<void> {
    return createPostMentionNotificationsBatch(this.fanoutDependencies(), params);
  }

  // ==============================================
  // FRIEND CONTENT NOTIFICATIONS (Phase 4F)
  // ==============================================

  async createFriendContentNotificationsBatch(params: FriendContentFanoutParams): Promise<void> {
    return createFriendContentNotificationsBatch(this.fanoutDependencies(), params);
  }

  // ==============================================
  // MISSED_CALL
  // ==============================================

  async createMissedCallNotification(params: {
    recipientUserId: string;
    callerId: string;
    conversationId: string;
    callSessionId: string;
    callType: 'audio' | 'video';
  }): Promise<Notification | null> {
    const [caller, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.callerId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
    ]);

    if (!caller) return null;

    // Phase C — prefix emoji icône d'appel pour rendu visuel rapide dans le banner.
    // L'extension iOS expose en plus l'avatar du caller via INSendMessageIntent
    // (missed_call est ajouté à communicationTypes côté extension dans la même PR).
    const callIcon = params.callType === 'video' ? '📹' : '📞';
    const lang = await this.resolveRecipientLang(params.recipientUserId);

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'missed_call',
      priority: 'high',
      content: notificationString(lang, 'call.missed', { callIcon, callType: params.callType }),

      actor: {
        id: params.callerId,
        username: caller.username,
        displayName: caller.displayName,
        avatar: caller.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        callSessionId: params.callSessionId,
      },

      metadata: {
        action: 'view_conversation',
        callType: params.callType,
      },
    });
  }

  // ==============================================
  // FRIEND_REQUEST
  // ==============================================

  async createFriendRequestNotification(params: {
    recipientUserId: string;
    requesterId: string;
    friendRequestId: string;
  }): Promise<Notification | null> {
    const requester = await this.prisma.user.findUnique({
      where: { id: params.requesterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!requester) return null;

    const lang = await this.resolveRecipientLang(params.recipientUserId);

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'friend_request',
      priority: 'normal',
      content: notificationString(lang, 'contact.request'),

      actor: {
        id: params.requesterId,
        username: requester.username,
        displayName: requester.displayName,
        avatar: requester.avatar,
      },

      context: {
        friendRequestId: params.friendRequestId,
      },

      metadata: {
        action: 'accept_or_reject_contact',
      },
    });
  }

  // ==============================================
  // FRIEND_ACCEPTED
  // ==============================================

  async createFriendAcceptedNotification(params: {
    recipientUserId: string;
    accepterUserId: string;
    conversationId?: string;
  }): Promise<Notification | null> {
    const accepter = await this.prisma.user.findUnique({
      where: { id: params.accepterUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!accepter) return null;

    const lang = await this.resolveRecipientLang(params.recipientUserId);

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'friend_accepted',
      priority: 'normal',
      content: notificationString(lang, 'contact.accepted'),

      actor: {
        id: params.accepterUserId,
        username: accepter.username,
        displayName: accepter.displayName,
        avatar: accepter.avatar,
      },

      context: {
        conversationId: params.conversationId,
      },

      metadata: {
        action: 'view_conversation',
      },
    });
  }

  // ==============================================
  // FRIEND_REQUEST_CANCELLED (realtime-only, no persisted Notification)
  // ==============================================

  /**
   * Fired when a pending friend request is removed via
   * `DELETE /friend-requests/:id` — sender cancelling, or receiver
   * declining/removing without an explicit accept/reject. Unlike the other
   * `create*FriendRequest*` methods this does NOT persist a `Notification`
   * row (ephemeral realtime signal only) so the counterpart's pending list
   * can invalidate immediately without polluting their notification feed.
   */
  emitFriendRequestCancelled(params: {
    recipientUserId: string;
    friendRequestId: string;
    cancelledBy: string;
  }): void {
    if (!this.io) return;
    this.io.to(ROOMS.user(params.recipientUserId)).emit(SERVER_EVENTS.FRIEND_REQUEST_CANCELLED, {
      friendRequestId: params.friendRequestId,
      cancelledBy: params.cancelledBy,
    });
  }

  // ==============================================
  // FRIEND_REQUEST_NEW / ACCEPTED / REJECTED (typed, dual-emitted
  // alongside the legacy NOTIFICATION_NEW string-discriminated payload —
  // see socketio-events-cleanup.md #7. Same pattern as CONVERSATION_NEW /
  // FRIEND_REQUEST_CANCELLED: realtime-only signal, no separate
  // `Notification` row of their own.)
  // ==============================================

  emitFriendRequestNew(params: {
    receiverId: string;
    friendRequestId: string;
    senderId: string;
  }): void {
    if (!this.io) return;
    this.io.to(ROOMS.user(params.receiverId)).emit(SERVER_EVENTS.FRIEND_REQUEST_NEW, {
      friendRequestId: params.friendRequestId,
      senderId: params.senderId,
      receiverId: params.receiverId,
    });
  }

  emitFriendRequestAccepted(params: {
    senderId: string;
    friendRequestId: string;
    accepterId: string;
    conversationId?: string;
  }): void {
    if (!this.io) return;
    this.io.to(ROOMS.user(params.senderId)).emit(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED, {
      friendRequestId: params.friendRequestId,
      accepterId: params.accepterId,
      conversationId: params.conversationId,
    });
  }

  emitFriendRequestRejected(params: {
    senderId: string;
    friendRequestId: string;
    rejecterId: string;
  }): void {
    if (!this.io) return;
    this.io.to(ROOMS.user(params.senderId)).emit(SERVER_EVENTS.FRIEND_REQUEST_REJECTED, {
      friendRequestId: params.friendRequestId,
      rejecterId: params.rejecterId,
    });
  }

  /**
   * Propagates a profile change (displayName, avatar, banner, username) to
   * every user sharing an active conversation with `userId`, instead of a
   * full broadcast. Realtime-only signal — no `Notification` row, same
   * pattern as `emitFriendRequestCancelled`. See
   * tasks/socketio-events-cleanup.md #6.
   */
  async emitUserUpdated(params: {
    userId: string;
    changes: UserUpdatedEventData['changes'];
  }): Promise<void> {
    if (!this.io) return;
    const partnerIds = await getDistinctConversationPartnerUserIds(this.prisma, params.userId);
    if (partnerIds.length === 0) return;

    const payload: UserUpdatedEventData = { userId: params.userId, changes: params.changes };
    for (const partnerId of partnerIds) {
      this.io.to(ROOMS.user(partnerId)).emit(SERVER_EVENTS.USER_UPDATED, payload);
    }
  }

  // ==============================================
  // MEMBER_JOINED
  // ==============================================

  async createMemberJoinedNotification(params: {
    recipientUserId: string;
    newMemberUserId: string;
    conversationId: string;
    joinMethod?: 'via_link' | 'invited';
  }): Promise<Notification | null> {
    return createMemberJoinedNotification(this.fanoutDependencies(), params);
  }

  async createMemberJoinedNotificationsBatch(
    recipientUserIds: readonly string[],
    common: {
      newMemberUserId: string;
      conversationId: string;
      joinMethod?: 'via_link' | 'invited';
    }
  ): Promise<number> {
    return createMemberJoinedNotificationsBatch(this.fanoutDependencies(), recipientUserIds, common);
  }

  // ==============================================
  // TRANSLATION_READY — retiré, cf. `NotificationTypeEnum.TRANSLATION_READY`
  //
  // `createTranslationReadyNotification` vivait ici sans AUCUN appelant de
  // production : seul un test l'atteignait. Il n'a donc jamais produit une
  // ligne, et aucun client n'a jamais reçu ce type. C'était le seul des cinq
  // producteurs ancrés sur un `context.messageId` à ne pas avoir d'échéance à
  // hériter — pour la raison la plus simple : il ne créait rien.
  //
  // Le laisser en place aurait coûté plus qu'une méthode morte : il donnait à
  // l'énumération des producteurs de notification une cinquième entrée, et à
  // tout audit de la famille un cinquième cas à instruire.
  // ==============================================

  // ==============================================
  // MESSAGE_REPLY
  // ==============================================

  async createReplyNotification(params: {
    recipientUserId: string;
    replierUserId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
    originalMessageId?: string;
    /** Identité d'acteur déjà résolue — cf. `NotificationActorProfile`. */
    senderProfile?: NotificationActorProfile;
    /**
     * Échéance de la RÉPONSE — le message que cette notification désigne et
     * ouvre —, jamais celle du message cité. Même contrat que
     * `createMentionNotification.messageExpiresAt`.
     */
    messageExpiresAt?: Date | null;
    /** Cf. `createMessageNotification.previewBasis`. */
    previewBasis?: PreviewPrismBasis;
    /**
     * Le média qui COMPOSE le corps quand l'aperçu est vide — cf.
     * {@link NotificationBannerMedia}. Sans lui, répondre par un vocal poussait
     * une bannière au corps VIDE.
     */
    attachments?: NotificationBannerMedia['attachments'];
    firstAttachmentFileSize?: number | null;
    firstAttachmentDuration?: number | null;
    firstAttachmentWidth?: number | null;
    firstAttachmentHeight?: number | null;
    /**
     * Cf. `createMessageNotification.notificationLocKey` — cycle 126. La clé de
     * protection, dont `protectedPreview` est l'unique producteur du dépôt : sa
     * présence est une DÉCLARATION de protection, jamais un indice. Elle vaut
     * ici la localisation CLIENT du placeholder (la NSE le rend depuis sa propre
     * table plutôt que d'afficher la chaîne composée par la passerelle) et le
     * second verrou de `createNotification`.
     */
    notificationLocKey?: string;
  }): Promise<Notification | null> {
    // GW3 — per-conversation mute suppresses reply notifications
    // (a reply is not a mention: it does not pierce the mute).
    if (await this.isConversationMutedFor(params.recipientUserId, params.conversationId, 'message_reply')) {
      return null;
    }

    const [replier, conversation, prism, prismSource] = await Promise.all([
      params.senderProfile
        ? Promise.resolve(params.senderProfile)
        : this.prisma.user.findUnique({
            where: { id: params.replierUserId },
            select: { username: true, displayName: true, avatar: true },
          }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
      this.resolveRecipientPrism(params.recipientUserId),
      this.loadMessagePrismSource(params.messageId),
    ]);

    if (!replier) return null;

    // Cycle 127 — le message a-t-il survécu à la fenêtre de l'éventail ? La
    // relecture ci-dessus le sait déjà ; seul le lot `regular` le demandait.
    if (prismSource.liveness === 'gone') return null;

    // Cycle 123 — UNE descente, deux projections : le corps et les champs du
    // fil. Cf. `createMessageNotification`.
    const servedTranslation = this.prismTranslation(
      this.previewPrismSource({
        basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
        messageSource: prismSource,
        protectedByLocKey: !!params.notificationLocKey,
      }),
      prism.ordered
    );

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'message_reply',
      priority: 'normal',
      // Cycle 122 — cf. `createMentionNotification` : le corps servi descend le
      // Prisme, les champs du fil push ne suffisent pas.
      // Cycle 125 bis — et il se compose comme celui d'un message simple.
      content: this.servedBannerBody({
        lang: prism.lang,
        preview: params.messagePreview,
        translation: servedTranslation,
        media: params,
      }),
      collapseId: `conv-${params.conversationId}`,
      lang: prism.lang,
      expiresAt: params.messageExpiresAt ?? undefined,

      actor: {
        id: params.replierUserId,
        username: replier.username,
        displayName: replier.displayName,
        avatar: replier.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
        originalMessageId: params.originalMessageId,
        // Cycle 122 — le Prisme de la RÉPONSE, celle que cette bannière annonce
        // et ouvre : jamais celle du message cité.
        ...this.servedTranslationFields(servedTranslation),
        // Cycle 124 — cf. `createMentionNotification` : la bulle pré-enregistrée
        // est celle de la RÉPONSE, le message que cette bannière annonce et
        // ouvre — jamais celle du message cité.
        ...this.prePersistedMessageFields({
          basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
          preview: params.messagePreview,
          originalLanguage: prismSource.originalLanguage,
          protectedByLocKey: !!params.notificationLocKey,
        }),
        // Cycle 126 — le verrou de protection et l'horloge de la bulle. Le
        // premier est redondant avec la base `protected-placeholder` que
        // l'éventail pose déjà, et c'est voulu : `protectedPreview` est son
        // unique producteur, donc sa présence DÉCLARE la protection là où une
        // base peut être omise par un appelant solo.
        notificationLocKey: params.notificationLocKey,
        ...this.messageClockFields(prismSource),
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
      } as any,
    });
  }

  // ==============================================
  // SYSTEM
  // ==============================================

  async createSystemNotification(params: {
    recipientUserId: string;
    content: string;
    /** Titre explicite (sujet d'une annonce admin) — persisté, le builder n'en produit pas pour `system`. */
    title?: string;
    systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
    priority?: NotificationPriority;
    /** Langue déjà résolue du destinataire — évite une lecture en base. */
    lang?: string;
    expiresAt?: Date;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: 'system',
      priority: params.priority || 'normal',
      content: params.content,
      title: params.title,
      lang: params.lang,
      expiresAt: params.expiresAt,

      context: {},

      metadata: {
        action: 'view_details',
        systemType: params.systemType,
      },
    });
  }

  // ==============================================
  // SOCIAL — POST_LIKE / STORY_REACTION / STATUS_REACTION
  // ==============================================

  async createPostLikeNotification(params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    emoji: string;
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Aperçu du contenu réagi (≤ ~80 chars) — identifie QUELLE entité. */
    postPreview?: string;
    /** Date de publication ISO du contenu réagi (contexte expiry côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }): Promise<Notification | null> {
    // Don't notify yourself
    if (params.actorId === params.postAuthorId) return null;

    // Anti-spam: throttle reaction notifications per sender→recipient pair
    if (!this.shouldCreateReactionNotification(params.actorId, params.postAuthorId)) {
      return null;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    // Map postType to the right notification type
    const type = params.postType === 'STORY'
      ? 'story_reaction'
      : params.postType === 'STATUS'
        ? 'status_reaction'
        : 'post_like';

    const lang = await this.resolveRecipientLang(params.postAuthorId);
    const subtitlePostType = params.postType ?? 'POST';

    // Détail du contenu réagi : extrait texte si présent, sinon vignette/résumé
    // média (« Votre story · 📷 Photo ») — le destinataire identifie QUEL
    // contenu sans ouvrir l'app, et le push iOS attache la miniature.
    const trimmedPreview = params.postPreview?.trim() ?? '';
    const media = await resolvePostMedia(this.prisma, params.postId);
    // Le sous-titre nomme la cible, le corps la MONTRE : le détail (texte /
    // média) descend dans le corps, que la phrase d'action n'occupe plus.
    const subtitle = notificationString(lang, 'comment.subtitleOwner', { postType: subtitlePostType });

    return this.createNotification({
      userId: params.postAuthorId,
      type,
      priority: 'normal',
      content: targetPreviewBody(lang, subtitlePostType, {
        textPreview: trimmedPreview,
        mediaType: media?.mediaType,
      }),
      subtitle,
      lang,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
        ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
        ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
        ...(media?.thumbnailUrl
          ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
          : {}),
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        emoji: params.emoji,
        postType: params.postType || 'POST',
        ...(trimmedPreview !== ''
          ? { postPreview: this.truncateMessage(trimmedPreview) }
          : {}),
        ...(media ? { mediaType: media.mediaType } : {}),
        ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
      },
    });
  }

  // ==============================================
  // SOCIAL — POST_COMMENT
  // ==============================================

  async createPostCommentNotification(params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    commentId: string;
    commentPreview: string;
    /** Type du post commenté — pilote le wording du subtitle. Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Extrait du post commenté (≤ ~80 chars) pour identifier LE post visé. */
    postPreview?: string;
    /** Date de publication ISO du post (le client en dérive « du JJ/MM/AAAA HH:MM »). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }): Promise<Notification | null> {
    if (params.actorId === params.postAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    // Subtitle = la cible du commentaire (« Votre humeur : « … » ») ; body =
    // le texte du commentaire. Le destinataire sait QUOI a été commenté sans
    // ouvrir l'app. Libellé localisé (Prisme-first) — plus de français codé en dur.
    const lang = await this.resolveRecipientLang(params.postAuthorId);
    const trimmedPostPreview = params.postPreview?.trim() ?? '';
    // Cible du commentaire : extrait texte du post si présent, sinon résumé
    // média (« Votre publication · 📷 Photo ») + vignette poussée au push iOS.
    const media = await resolvePostMedia(this.prisma, params.postId);
    const subtitle = buildOwnerSubtitleWithDetail(lang, params.postType ?? 'POST', {
      textPreview: trimmedPostPreview,
      mediaType: media?.mediaType,
    });

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_comment',
      priority: 'normal',
      content: this.truncateMessage(params.commentPreview),
      subtitle,
      lang,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
        ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
        ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
        ...(media?.thumbnailUrl
          ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
          : {}),
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        commentPreview: this.truncateMessage(params.commentPreview),
        postType: params.postType ?? 'POST',
        ...(trimmedPostPreview !== ''
          ? { postPreview: this.truncateMessage(trimmedPostPreview) }
          : {}),
        ...(media ? { mediaType: media.mediaType } : {}),
        ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
      },
    });
  }

  // ==============================================
  // SOCIAL — POST_REPOST
  // ==============================================

  async createPostRepostNotification(params: {
    actorId: string;
    originalPostId: string;
    postAuthorId: string;
    repostId: string;
    /** Type du post partagé — pilote le wording. Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Extrait du post partagé pour identifier LE contenu repris. */
    postPreview?: string;
    /** Date de publication ISO du contenu partagé (contexte expiry côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }): Promise<Notification | null> {
    if (params.actorId === params.postAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const lang = await this.resolveRecipientLang(params.postAuthorId);
    const trimmedPostPreview = params.postPreview?.trim() ?? '';
    const media = await resolvePostMedia(this.prisma, params.originalPostId);
    // Cf. `targetPreviewBody` : un partage n'apporte aucun contenu neuf, le
    // détail du contenu partagé descend donc dans le corps.
    const subtitle = notificationString(lang, 'comment.subtitleOwner', {
      postType: params.postType ?? 'POST',
    });

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_repost',
      priority: 'normal',
      content: targetPreviewBody(lang, params.postType ?? 'POST', {
        textPreview: trimmedPostPreview,
        mediaType: media?.mediaType,
      }),
      subtitle,
      lang,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.originalPostId,
        ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
        ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
        ...(media?.thumbnailUrl
          ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
          : {}),
      },

      metadata: {
        action: 'view_post',
        originalPostId: params.originalPostId,
        repostId: params.repostId,
        postType: params.postType ?? 'POST',
        ...(trimmedPostPreview !== ''
          ? { postPreview: this.truncateMessage(trimmedPostPreview) }
          : {}),
        ...(media ? { mediaType: media.mediaType } : {}),
        ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
      },
    });
  }

  // ==============================================
  // SOCIAL — COMMENT_REPLY
  // ==============================================

  async createCommentReplyNotification(params: {
    actorId: string;
    postId: string;
    commentAuthorId: string;
    commentId: string;
    /** Identifiant du commentaire parent — permet au client de déplier le fil
     *  parent puis de défiler/surligner la réponse (`commentId`). */
    parentCommentId?: string;
    replyPreview: string;
    /** Extrait du commentaire parent — identifie À QUOI on répond. */
    parentCommentPreview?: string;
    /** Type du contenu portant le commentaire — précise « sur votre story/réel ». Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du contenu (le client en dérive « du JJ/MM/AAAA HH:MM »). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }): Promise<Notification | null> {
    if (params.actorId === params.commentAuthorId) return null;

    if (!(await this.canNotifyAboutPost(params.postId, params.commentAuthorId))) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    // Le titre « X a répondu à votre commentaire » est calculé par le builder
    // (source unique localisée). Le subtitle précise l'ENTITÉ portant le
    // commentaire (« Story », « Réel »…) — pas « publication » générique ; le
    // client y append la date locale (« · 23/06/2026 14:30 ») depuis postCreatedAt.
    const lang = await this.resolveRecipientLang(params.commentAuthorId);
    const trimmedParent = params.parentCommentPreview?.trim() ?? '';
    // POST_NOUN_CAP gère REEL distinctement (« Réel ») → pas de mapping vers POST.
    const subtitle = notificationString(lang, 'comment.subtitleBare', { postType: params.postType ?? 'POST' });
    // Vignette du contenu portant le commentaire → attachée au push iOS.
    const media = await resolvePostMedia(this.prisma, params.postId);

    return this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_reply',
      priority: 'normal',
      content: this.truncateMessage(params.replyPreview),
      subtitle,
      lang,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
        commentId: params.commentId,
        ...(params.parentCommentId ? { parentCommentId: params.parentCommentId } : {}),
        ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
        ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
        ...(media?.thumbnailUrl
          ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
          : {}),
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        ...(params.parentCommentId ? { parentCommentId: params.parentCommentId } : {}),
        commentPreview: this.truncateMessage(params.replyPreview),
        postType: params.postType ?? 'POST',
        ...(trimmedParent !== ''
          ? { parentCommentPreview: this.truncateMessage(trimmedParent) }
          : {}),
        ...(media ? { mediaType: media.mediaType } : {}),
        ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
      },
    });
  }

  // ==============================================
  // SOCIAL — COMMENT_LIKE
  // ==============================================

  async createCommentLikeNotification(params: {
    actorId: string;
    postId: string;
    commentId: string;
    commentAuthorId: string;
    emoji: string;
    /** Extrait du commentaire liké — identifie QUEL commentaire reçoit la réaction. */
    commentPreview?: string;
    /**
     * Type de l'entité PORTANT le commentaire liké. Sans lui, le client ne peut
     * pas choisir la bonne surface (lecteur de réel / viewer éphémère / détail
     * de post) et retombe sur une heuristique de cache. Défaut POST.
     */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
  }): Promise<Notification | null> {
    if (params.actorId === params.commentAuthorId) return null;

    if (!(await this.canNotifyAboutPost(params.postId, params.commentAuthorId))) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const lang = await this.resolveRecipientLang(params.commentAuthorId);
    const trimmedPreview = params.commentPreview?.trim() ?? '';
    // Vignette du post portant le commentaire → attachée au push iOS.
    const media = await resolvePostMedia(this.prisma, params.postId);
    // La cible est LE COMMENTAIRE : son extrait est ce que le corps doit
    // montrer, la phrase d'action étant déjà portée par le titre et la
    // bannière. Sans extrait, le corps nomme l'entité.
    const commentBody = trimmedPreview !== ''
      ? `« ${this.truncateMessage(trimmedPreview)} »`
      : notificationString(lang, 'comment.reply');

    return this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_like',
      priority: 'low',
      content: commentBody,
      lang,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
        ...(media?.thumbnailUrl
          ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
          : {}),
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        emoji: params.emoji,
        postType: params.postType ?? 'POST',
        ...(trimmedPreview !== ''
          ? { commentPreview: this.truncateMessage(trimmedPreview) }
          : {}),
        ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
      },
    });
  }

  // ==============================================
  // CONVERSATION_INVITE / ADDED_TO_CONVERSATION
  // ==============================================

  async createConversationInviteNotification(params: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername?: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle?: string;
    conversationType: 'direct' | 'group' | 'public' | 'global' | 'broadcast' | string;
  }): Promise<Notification | null> {
    const type = params.conversationType === 'direct' ? 'new_conversation_direct' : 'new_conversation_group';

    // Si on n'a pas les infos de l'inviteur, on les récupère
    let actor = {
      id: params.inviterId,
      username: params.inviterUsername || 'User',
      displayName: params.inviterUsername || 'User',
      avatar: params.inviterAvatar
    };

    if (!params.inviterUsername) {
      const user = await this.prisma.user.findUnique({
        where: { id: params.inviterId },
        select: { username: true, displayName: true, avatar: true }
      });
      if (user) {
        actor.username = user.username;
        actor.displayName = user.displayName || user.username;
        actor.avatar = user.avatar || undefined;
      }
    }

    const lang = await this.resolveRecipientLang(params.invitedUserId);
    const content = params.conversationType === 'direct'
      ? notificationString(lang, 'invitation.direct', { actor: actor.displayName })
      : notificationString(lang, 'invitation.group', { title: params.conversationTitle || '' });

    return this.createNotification({
      userId: params.invitedUserId,
      type: type as any,
      priority: 'normal',
      content,
      actor,
      context: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        conversationType: params.conversationType as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  async createAddedToConversationNotification(params: {
    recipientUserId: string;
    addedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.addedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    const lang = await this.resolveRecipientLang(params.recipientUserId);

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'added_to_conversation',
      priority: 'normal',
      content: conversation?.type === 'direct'
        ? notificationString(lang, 'group.newContact')
        : notificationString(lang, 'group.added', { title: conversation?.title || '' }),
      actor: {
        id: params.addedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // REMOVED_FROM_CONVERSATION
  // ==============================================

  async createRemovedFromConversationNotification(params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.removedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'removed_from_conversation',
      priority: 'normal',
      content: '',
      actor: {
        id: params.removedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // MEMBER_REMOVED (notifie les autres membres)
  // ==============================================

  async createMemberRemovedNotification(params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    // Exclusion d'un TIERS — ambiant. À ne pas confondre avec
    // `createRemovedFromConversationNotification`, qui annonce au destinataire
    // sa PROPRE exclusion et perce donc le mute.
    if (await this.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_removed')) {
      return null;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: params.removedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_removed',
      priority: 'normal',
      content: '',
      actor: {
        id: params.removedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // MEMBER_ROLE_CHANGED / PROMOTED / DEMOTED
  // ==============================================

  async createMemberRoleChangedNotification(params: {
    recipientUserId: string;
    changedByUserId: string;
    conversationId: string;
    newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    previousRole: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.changedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    const roleHierarchy: Record<string, number> = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, CREATOR: 3 };
    const oldLevel = roleHierarchy[params.previousRole] ?? 0;
    const newLevel = roleHierarchy[params.newRole] ?? 0;
    const type = newLevel > oldLevel ? 'member_promoted' : newLevel < oldLevel ? 'member_demoted' : 'member_role_changed';

    return this.createNotification({
      userId: params.recipientUserId,
      type,
      priority: 'normal',
      content: '',
      actor: {
        id: params.changedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: {
        action: 'view_conversation',
        newRole: params.newRole,
        previousRole: params.previousRole,
      },
    });
  }

  // ==============================================
  // MEMBER_LEFT
  // ==============================================

  async createMemberLeftNotification(params: {
    recipientUserId: string;
    memberUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    // Départ d'un TIERS — ambiant, comme l'arrivée et l'exclusion.
    if (await this.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_left')) {
      return null;
    }

    const member = await this.prisma.user.findUnique({
      where: { id: params.memberUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!member) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_left',
      priority: 'low',
      content: '',
      actor: {
        id: params.memberUserId,
        username: member.username,
        displayName: member.displayName,
        avatar: member.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // SECURITY — PASSWORD_CHANGED
  // ==============================================

  async createPasswordChangedNotification(params: {
    recipientUserId: string;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: 'password_changed',
      priority: 'high',
      content: '',
      context: {},
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // SECURITY — TWO_FACTOR_ENABLED / DISABLED
  // ==============================================

  async createTwoFactorNotification(params: {
    recipientUserId: string;
    enabled: boolean;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: params.enabled ? 'two_factor_enabled' : 'two_factor_disabled',
      priority: 'high',
      content: '',
      context: {},
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // SECURITY — LOGIN_NEW_DEVICE
  // ==============================================

  async createLoginNewDeviceNotification(params: {
    recipientUserId: string;
    deviceInfo?: {
      type?: string;
      vendor?: string | null;
      model?: string | null;
      os?: string | null;
      osVersion?: string | null;
      browser?: string | null;
      browserVersion?: string | null;
    } | null;
    ipAddress?: string;
    geoData?: {
      country?: string | null;
      countryName?: string | null;
      city?: string | null;
      location?: string | null;
      timezone?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    revokeToken?: string;
  }): Promise<Notification | null> {
    const device = params.deviceInfo;
    const geo = params.geoData;

    const deviceName = [device?.vendor, device?.model].filter(Boolean).join(' ') || null;
    const deviceOS = device?.os
      ? (device.osVersion ? `${device.os} ${device.osVersion}` : device.os)
      : null;
    const appOrBrowser = device?.browser
      ? (device.browserVersion ? `${device.browser} ${device.browserVersion}` : device.browser)
      : null;
    const location = geo?.location || [geo?.city, geo?.countryName].filter(Boolean).join(', ') || null;

    const apiBase = process.env.API_PUBLIC_URL || 'https://gate.meeshy.me';
    const revokeAllUrl = params.revokeToken
      ? `${apiBase}/api/v1/auth/revoke-all-sessions?token=${params.revokeToken}`
      : `${apiBase}`;

    let previousDeviceName: string | null = null;
    let previousLocation: string | null = null;
    let previousLoginTime: Date | null = null;

    try {
      const { getUserSessions } = await import('../SessionService');
      const sessions = await getUserSessions(params.recipientUserId);
      const previous = sessions.find(s => !s.isCurrentSession);
      if (previous) {
        previousDeviceName = [previous.browserName, previous.osName].filter(Boolean).join(' - ');
        previousLocation = previous.location || null;
        previousLoginTime = previous.lastActivityAt ? new Date(previous.lastActivityAt) : null;
      }
    } catch {
      // Non-blocking — previous session is optional
    }

    const loginAlertData = {
      deviceName,
      deviceOS,
      appOrBrowser,
      location,
      ip: params.ipAddress || null,
      loginTime: new Date(),
      timezone: geo?.timezone || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      previousDeviceName,
      previousLocation,
      previousLoginTime,
      revokeAllUrl,
    };

    const user = await this.prisma.user.findUnique({
      where: { id: params.recipientUserId },
      select: this.LANG_SELECT
    });
    const lang = recipientLanguage(user, 'fr');
    // Cycle 125 — l'horodatage se lit DANS la notification, donc dans la langue
    // de la notification. `systemLanguage === 'en' ? 'en-US' : 'fr-FR'` était un
    // binaire codé en dur : un lecteur allemand recevait « Neue Anmeldung
    // erkannt » — `notificationString` normalise, lui — daté à la française.
    const locale = recipientDateLocale(user, 'fr');

    const bodyParts: string[] = [];
    if (location) bodyParts.push(location);
    if (params.ipAddress) bodyParts.push(`IP : ${params.ipAddress}`);
    if (deviceName) bodyParts.push(deviceName);
    else if (deviceOS) bodyParts.push(deviceOS);
    const now = new Date();
    bodyParts.push(now.toLocaleString(locale, { timeZone: geo?.timezone || 'UTC', dateStyle: 'short', timeStyle: 'short' }));
    const content = bodyParts.join(' — ');

    const title = notificationString(lang, 'login.newDevice.title');

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'login_new_device',
      priority: 'high',
      content,
      title,
      context: {},
      metadata: {
        action: 'view_details' as const,
        deviceName,
        deviceVendor: device?.vendor || null,
        deviceOS,
        deviceOSVersion: device?.osVersion || null,
        deviceType: device?.type || null,
        ipAddress: params.ipAddress || null,
        country: geo?.country || null,
        countryName: geo?.countryName || null,
        city: geo?.city || null,
        location,
      },
      _loginAlertData: loginAlertData,
    } as any);
  }

  // ==============================================
  // NOTIFICATION COUNTS PUSH (Fix 3)
  // ==============================================

  /**
   * Emits updated notification counts to a user's socket room.
   * Called after every notification create/read/delete mutation so clients
   * can update badge counters without REST polling.
   */
  private async emitCountsUpdate(userId: string): Promise<void> {
    if (!this.io) return;
    try {
      // `isRead: false` — même prédicat (indexé [userId, isRead, expiresAt])
      // que la liste et le badge REST. `readAt: null` divergeait sur les
      // données legacy et tournait en collscan (aucun index sur readAt).
      const [unread, total] = await Promise.all([
        this.prisma.notification.count({ where: visibleNotificationsWhere({ userId, unreadOnly: true }) }),
        this.prisma.notification.count({ where: visibleNotificationsWhere({ userId }) }),
      ]);
      this.io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_COUNTS, { unread, total });
    } catch (error) {
      notificationLogger.error('Failed to emit notification counts', { error, userId });
    }
  }

  /**
   * Annonce aux AUTRES appareils le prédicat qu'un marquage en masse vient
   * d'appliquer. Les chemins bulk (`updateMany`, `$runCommandRaw`) ne renvoient
   * aucun id : il n'y a pas de `notification:read` par ligne à émettre, et les
   * refetcher annulerait le gain d'un update unique. Le client rejoue le
   * prédicat sur son cache (`notificationMatchesReadBulkScope`, @meeshy/shared).
   *
   * Émission PLAIN, jamais `emitWithSeq` : tant qu'aucun client n'observe `_seq`
   * sur cet événement, l'estampiller ferait avancer `lastSeq` sans lecteur —
   * donc des faux trous de séquence au prochain event observé (cf. gwcontract-01).
   *
   * Les compteurs restent tenus par `emitCountsUpdate`, émis juste après par
   * chaque appelant : un cache partiel matche moins de lignes que le serveur
   * n'en a marquées, un décrément déduit de ce prédicat dériverait.
   */
  private announceReadBulk(userId: string, scope: NotificationReadBulkScope): void {
    this.io?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_READ_BULK, { scope });
  }

  /**
   * Symétrique de `announceReadBulk` côté PURGE, avec un cas plus fort :
   * `emitCountsUpdate` ne dit RIEN ici. Seules des lignes DÉJÀ lues partent —
   * `unread` est inchangé par construction, et `total` n'est affiché nulle part.
   * Sans cette annonce, rien ne signale la purge aux autres appareils : la
   * cloche y reste pleine de lignes mortes, chacune ouvrant un écran dont la
   * notification n'existe plus.
   *
   * Pas de `notification:deleted` par ligne : la purge n'est pas bornée (un
   * compte ancien a des milliers de lignes lues), et les énumérer avant le
   * `deleteMany` ferait payer au chemin un coût proportionnel à l'historique.
   *
   * Émission PLAIN, jamais `emitWithSeq` — même raison qu'au-dessus.
   */
  private announceDeletedBulk(userId: string, scope: NotificationDeletedBulkScope): void {
    this.io?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_DELETED_BULK, { scope });
  }

  // ==============================================
  // ANTI-SPAM & UTILITIES
  // ==============================================

  /**
   * Vérifie le rate limit des mentions par paire (sender → recipient).
   * Maximum MAX_MENTIONS_PER_MINUTE mentions par minute par paire.
   */
  private shouldCreateMentionNotification(senderId: string, recipientId: string): boolean {
    const key = `${senderId}:${recipientId}`;
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    const timestamps = this.recentMentions.get(key) || [];
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);

    if (recentTimestamps.length >= this.MAX_MENTIONS_PER_MINUTE) {
      return false;
    }

    recentTimestamps.push(now);
    this.recentMentions.set(key, recentTimestamps);
    if (this.recentMentions.size > this.MAX_MENTION_MAP_ENTRIES) {
      const firstKey = this.recentMentions.keys().next().value!;
      this.recentMentions.delete(firstKey);
    }
    return true;
  }

  /**
   * Nettoie les entrées périmées de la map recentMentions.
   * Appelé automatiquement toutes les 2 minutes via setInterval.
   */
  private cleanupOldMentions(): void {
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    for (const [key, timestamps] of this.recentMentions.entries()) {
      const recent = timestamps.filter(ts => ts > cutoff);
      if (recent.length === 0) {
        this.recentMentions.delete(key);
      } else {
        this.recentMentions.set(key, recent);
      }
    }
  }

  /**
   * Vérifie le rate limit des réactions par paire (sender → recipient).
   * Maximum MAX_REACTIONS_PER_MINUTE réactions par minute par paire.
   * La réaction elle-même est toujours autorisée — seule la notification est throttlée.
   */
  private shouldCreateReactionNotification(senderId: string, recipientId: string): boolean {
    const key = `${senderId}:${recipientId}`;
    const now = Date.now();
    const cutoff = now - this.REACTION_WINDOW_MS;

    const timestamps = this.recentReactions.get(key) ?? [];
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);

    if (recentTimestamps.length >= this.MAX_REACTIONS_PER_MINUTE) {
      return false;
    }

    recentTimestamps.push(now);
    this.recentReactions.set(key, recentTimestamps);
    if (this.recentReactions.size > this.MAX_REACTION_MAP_ENTRIES) {
      const firstKey = this.recentReactions.keys().next().value!;
      this.recentReactions.delete(firstKey);
    }
    return true;
  }

  /**
   * Nettoie les entrées périmées de la map recentReactions.
   * Appelé automatiquement toutes les 2 minutes via setInterval.
   */
  private cleanupOldReactions(): void {
    const now = Date.now();
    const cutoff = now - this.REACTION_WINDOW_MS;

    for (const [key, timestamps] of this.recentReactions.entries()) {
      const recent = timestamps.filter(ts => ts > cutoff);
      if (recent.length === 0) {
        this.recentReactions.delete(key);
      } else {
        this.recentReactions.set(key, recent);
      }
    }
  }

  /**
   * Tronque un message par nombre de mots (pas de caractères).
   * Plus naturel pour les aperçus de messages multilingues.
   */
  private truncateMessage(message: string, maxWords: number = 25): string {
    return truncateMessage(message, maxWords);
  }

  // ==============================================
  // QUERIES
  // ==============================================

  /**
   * Récupère les notifications d'un utilisateur
   */
  async getUserNotifications(params: {
    userId: string;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<{ notifications: Notification[]; total: number }> {
    const where = visibleNotificationsWhere({
      userId: params.userId,
      unreadOnly: params.unreadOnly,
    });

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const withFreshAvatars = await this.overlayLiveActorAvatars(notifications);

    return {
      notifications: withFreshAvatars.map((n) => this.formatNotification(n)),
      total,
    };
  }

  /**
   * `Notification.actor` is a frozen JSON snapshot captured at creation time,
   * so its `avatar` URL becomes a dead link as soon as the actor changes their
   * avatar (old file deleted) — producing recurring 404s when `/notifications`
   * renders. The avatar is a presentation asset, not historical content: it
   * must always reflect the actor's current avatar. Re-resolve each distinct
   * actor's avatar live from the User table in a single batched query, then
   * overlay it onto each notification. Actors with no live record (e.g. a
   * deleted account) keep their snapshot untouched.
   */
  private async overlayLiveActorAvatars(notifications: any[]): Promise<any[]> {
    const actorIds = [
      ...new Set(
        notifications
          .map((n) => n.actor?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (actorIds.length === 0) {
      return notifications;
    }

    const liveUsers = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, avatar: true },
    });
    const liveAvatarById = new Map(liveUsers.map((u) => [u.id, u.avatar ?? null]));

    return notifications.map((n) => {
      const actorId = n.actor?.id;
      if (!actorId || !liveAvatarById.has(actorId)) {
        return n;
      }
      return { ...n, actor: { ...n.actor, avatar: liveAvatarById.get(actorId) ?? null } };
    });
  }

  /**
   * Marque une notification comme lue.
   *
   * **`userId` est EXIGÉ et entre dans la requête (#6166)** : la propriété était
   * vérifiée par la route SEULE depuis `77b39f5cdd` (2026-01-28), donc par la
   * discipline de l'appelant. La route garde sa vérification préalable — elle
   * seule distingue le 404 du 403 ; ici c'est de la défense en profondeur.
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.update({
        where: { id: notificationId, userId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      const formatted = this.formatNotification(notification);
      // Sync multi-appareils : les AUTRES appareils retirent la ligne précise
      // de leur cloche sans refetch. `notification:counts` seul ne dit pas
      // LAQUELLE a été lue.
      if (this.io) {
        this.io
          .to(ROOMS.user(formatted.userId))
          .emit(SERVER_EVENTS.NOTIFICATION_READ, { notificationId });
      }
      this.emitCountsUpdate(formatted.userId).catch(() => {});
      return formatted;
    } catch (error) {
      notificationLogger.error('Failed to mark notification as read', {
        error,
        notificationId,
      });
      return null;
    }
  }

  /**
   * Marque toutes les notifications comme lues
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      if (result.count > 0) {
        this.announceReadBulk(userId, { kind: 'all' });
      }
      this.emitCountsUpdate(userId).catch(() => {});
      return result.count;
    } catch (error) {
      notificationLogger.error('Failed to mark all notifications as read', {
        error,
        userId,
      });
      return 0;
    }
  }

  /**
   * Marque comme lues toutes les notifications non lues de l'utilisateur dont le
   * `context` JSON porte la valeur attendue (conversationId, postId, …).
   *
   * Un SEUL update Mongo via $runCommandRaw : l'API Prisma ne filtre pas les
   * chemins JSON sur MongoDB, mais le moteur sait le faire nativement
   * (`context.<clé>`), en s'appuyant sur l'index [userId, isRead]. Plus de
   * findMany de toutes les non-lues + filtre en mémoire + updateMany par ids.
   *
   * Le filtre est scopé par userId au niveau Mongo (anti-IDOR). Les utilisateurs
   * anonymes (userId = sessionToken, pas un ObjectId) n'ont pas de notifications :
   * early-return 0.
   */
  private async markContextNotificationsAsRead(
    userId: string,
    contextKey: 'conversationId' | 'postId' | 'friendRequestId',
    contextValue: string
  ): Promise<number> {
    if (!/^[0-9a-f]{24}$/i.test(userId)) {
      return 0;
    }

    try {
      const result = await (this.prisma as unknown as {
        $runCommandRaw: (cmd: Record<string, unknown>) => Promise<{ nModified?: number }>;
      }).$runCommandRaw({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: userId },
            isRead: false,
            [`context.${contextKey}`]: contextValue,
          },
          u: { $set: { isRead: true, readAt: { $date: new Date().toISOString() } } },
          multi: true,
        }],
      });

      const count = result?.nModified ?? 0;

      if (count > 0) {
        // Le scope et la requête Mongo sont dérivés du MÊME couple
        // (contextKey, contextValue) : aucun client ne peut rejouer un
        // prédicat différent de celui qui vient d'être appliqué en base.
        this.announceReadBulk(userId, { kind: 'context', contextKey, contextValue });
        // Rafraîchir les compteurs côté client (cloche + badge) en temps réel.
        this.emitCountsUpdate(userId).catch(() => {});
      }

      return count;
    } catch (error) {
      notificationLogger.error('Failed to mark context notifications as read', {
        error,
        userId,
        contextKey,
        contextValue,
      });
      return 0;
    }
  }

  /**
   * Marque toutes les notifications d'une conversation comme lues.
   *
   * Émet `notification:counts` après marquage (si `io` est branché) afin que la
   * cloche in-app et le badge se mettent à jour en temps réel dès que
   * l'utilisateur ouvre la conversation (contenu consommé → notifications lues).
   */
  async markConversationNotificationsAsRead(userId: string, conversationId: string): Promise<number> {
    return this.markContextNotificationsAsRead(userId, 'conversationId', conversationId);
  }

  /**
   * Marque toutes les notifications liées à un post (story / statut / post feed)
   * comme lues. Appelé quand l'utilisateur consomme le contenu (ouverture du
   * viewer de story, vue d'un post dans le feed, ouverture d'un statut) afin
   * que les notifications « X a publié une story / un statut / un post », ainsi
   * que les réactions / commentaires sur ce post, ne restent pas non lues.
   * Émet `notification:counts`.
   */
  async markPostNotificationsAsRead(userId: string, postId: string): Promise<number> {
    return this.markContextNotificationsAsRead(userId, 'postId', postId);
  }

  /**
   * Marque comme lues toutes les notifications de l'utilisateur liées à une
   * demande d'amitié (`context.friendRequestId`). Appelé quand l'utilisateur
   * répond à la demande (accept/reject) — la notification « X vous a envoyé une
   * demande d'amitié » ne doit plus rester non lue une fois consommée.
   *
   * Passe par la même route indexée que conversation/post (un seul update Mongo
   * scopé userId) et émet `notification:counts` afin que la cloche des AUTRES
   * appareils se mette à jour en temps réel — l'ancien chemin artisanal
   * (findMany de toutes les non-lues + filtre mémoire + N updates) n'émettait
   * rien et laissait le badge multi-appareils périmé.
   */
  async markFriendRequestNotificationsAsRead(userId: string, friendRequestId: string): Promise<number> {
    return this.markContextNotificationsAsRead(userId, 'friendRequestId', friendRequestId);
  }

  /**
   * RETIRE les notifications liées à une demande d'amitié dont la ligne vient
   * d'être supprimée (`DELETE /friend-requests/:id` — annulation par
   * l'expéditeur, ou retrait par le destinataire sans répondre).
   *
   * Pendant de `markFriendRequestNotificationsAsRead`, et l'arbitrage entre les
   * deux tient à ce qui reste au bout du lien. Répondre (accept/reject) laisse
   * la ligne `FriendRequest` en place : la notification est CONSOMMÉE, donc lue.
   * Supprimer emporte la ligne : la notification n'a plus rien à afficher ET
   * rien où mener — son `metadata.action: accept_or_reject_contact` ouvrirait
   * un écran de demande qui répond 404. Même conclusion que le rappel d'un
   * message (`retractMessageNotifications`), pour la même raison, et le même
   * geste — le seul que les clients savent déjà recevoir (`notification:deleted`,
   * écouté par le web et par le SDK iOS).
   *
   * Trois conséquences du fait que la ligne part INCONDITIONNELLEMENT :
   *
   *  1. **Aucun filtre `isRead`.** Une notification déjà lue est tout aussi
   *     morte qu'une non lue ; la laisser garderait une ligne sans destination
   *     dans la liste. C'est la seule différence de filtre avec le marquage.
   *  2. **Le destinataire est toujours `receiverId`**, quel que soit celui des
   *     deux qui a appelé la route : `createFriendRequestNotification` ne
   *     notifie que lui. Le scope `userId` reste la garde anti-IDOR, comme pour
   *     le marquage.
   *  3. **`context.friendRequestId` n'appartient qu'à `friend_request`.** Le
   *     `friend_accepted` de l'expéditeur porte `context.conversationId`, jamais
   *     cette clé — le retrait ne peut pas l'emporter au passage.
   *
   * La lecture passe par `$runCommandRaw` pour la même raison que le marquage
   * (Prisma ne filtre pas les chemins JSON sur MongoDB), puis la suppression
   * porte sur les ids RELUS et non sur le prédicat : l'ensemble supprimé et
   * l'ensemble annoncé sont alors identiques par construction, et aucune ligne
   * ne peut disparaître sans son `notification:deleted`. `singleBatch` ferme le
   * curseur côté serveur ; le lot est très au-dessus du réel (une demande
   * produit UNE notification, à sa création).
   */
  async retractFriendRequestNotifications(userId: string, friendRequestId: string): Promise<number> {
    if (!/^[0-9a-f]{24}$/i.test(userId)) {
      return 0;
    }

    try {
      const raw = await (this.prisma as unknown as {
        $runCommandRaw: (cmd: Record<string, unknown>) => Promise<RawNotificationIdBatch>;
      }).$runCommandRaw({
        find: 'Notification',
        filter: {
          userId: { $oid: userId },
          'context.friendRequestId': friendRequestId,
        },
        // `delivery.pushSent` : la révocation push ne réveille un appareil que
        // là où un push est parti (cf. `retractedNotificationOf`).
        projection: { _id: 1, 'delivery.pushSent': 1 },
        singleBatch: true,
        batchSize: RETRACTION_BATCH_SIZE,
      });

      const rows = (raw?.cursor?.firstBatch ?? []).map((row) => ({
        id: typeof row._id === 'string' ? row._id : row._id.$oid,
        delivery: (row as { delivery?: unknown }).delivery,
      }));

      if (rows.length === 0) {
        return 0;
      }

      const ids = rows.map((row) => row.id);
      await this.prisma.notification.deleteMany({ where: { id: { in: ids } } });

      // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
      // qu'elle recalcule doivent voir la base d'après le retrait.
      await this.announceNotificationsRetracted(
        rows.map((row) => retractedNotificationOf({ id: row.id, userId, delivery: row.delivery }))
      );

      return ids.length;
    } catch (error) {
      notificationLogger.error('Failed to retract friend request notifications', {
        error,
        userId,
        friendRequestId,
      });
      return 0;
    }
  }

  /**
   * Marque comme lues toutes les notifications de l'utilisateur dont le `type`
   * est dans la liste fournie. Utilisé quand l'utilisateur ouvre un écran qui
   * consomme une catégorie entière de notifications (ex : l'écran des demandes
   * d'ajout consomme `friend_request` / `contact_request` / `friend_accepted`).
   *
   * `type` est une vraie colonne : on peut filtrer directement via `updateMany`.
   * Émet `notification:counts`.
   */
  async markNotificationsByTypesAsRead(userId: string, types: string[]): Promise<number> {
    try {
      if (!Array.isArray(types) || types.length === 0) {
        return 0;
      }

      const result = await this.prisma.notification.updateMany({
        where: { userId, isRead: false, type: { in: types } },
        data: { isRead: true, readAt: new Date() },
      });

      if (result.count > 0) {
        this.announceReadBulk(userId, { kind: 'types', types });
        this.emitCountsUpdate(userId).catch(() => {});
      }

      return result.count;
    } catch (error) {
      notificationLogger.error('Failed to mark notifications by types as read', {
        error,
        userId,
        types,
      });
      return 0;
    }
  }

  /**
   * Compte les notifications non lues
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: visibleNotificationsWhere({ userId, unreadOnly: true }),
    });
  }

  /**
   * Supprime toutes les notifications LUES de l'utilisateur.
   *
   * Annonce le PRÉDICAT appliqué (`notification:deleted-bulk`) quand au moins
   * une ligne part : `notification:counts`, émis juste après, ne dit rien de
   * cette purge — `unread` est inchangé, les lignes qui partent sont lues.
   */
  async deleteAllRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: { userId, isRead: true },
      });

      if (result.count > 0) {
        this.announceDeletedBulk(userId, { kind: 'read' });
        this.emitCountsUpdate(userId).catch(() => {});
      }

      return result.count;
    } catch (error) {
      notificationLogger.error('Failed to delete read notifications', {
        error,
        userId,
      });
      return 0;
    }
  }

  /** Supprime une notification. `userId` EXIGÉ et porté par la relecture (#6166). */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      // Fetch userId before deletion so we can emit counts update after
      const existing = await this.prisma.notification.findUnique({
        where: { id: notificationId, userId },
        // `context` (sa `conversationId`) et `type` : la révocation push les
        // lit pour dire au client sous quel index la bannière a été posée ;
        // `delivery` dit s'il y a seulement une bannière à retirer.
        select: { userId: true, type: true, context: true, delivery: true },
      });

      // La relecture ci-dessus est déjà portée par `userId` : si elle ne rend
      // rien, la suppression ne doit pas partir « au cas où ».
      if (existing === null) return false;

      await this.prisma.notification.delete({
        where: { id: notificationId },
      });

      if (existing?.userId) {
        if (this.io) {
          this.io
            .to(ROOMS.user(existing.userId))
            .emit(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId });
        }
        this.emitCountsUpdate(existing.userId).catch(() => {});
        this.revokeDeliveredPushes([
          retractedNotificationOf({
            id: notificationId,
            userId: existing.userId,
            type: existing.type,
            context: existing.context,
            delivery: existing.delivery,
          }),
        ]);
      }

      return true;
    } catch (error) {
      notificationLogger.error('Failed to delete notification', {
        error,
        notificationId,
      });
      return false;
    }
  }

  /**
   * Annonce aux appareils connectés des lignes que le RAPPEL d'un message vient
   * de retirer de la base.
   *
   * Pendant du geste unitaire de `deleteNotification`, pour un retrait qui a
   * déjà eu lieu : l'écriture durable appartient à `applyMessageRemovalEffects`
   * — le seul endroit que les trois écrivains de `deletedAt` traversent — et
   * elle ne doit pas dépendre du câblage socket. Ce service n'en tient que la
   * moitié volatile, celle qui s'annonce et ne se stocke pas.
   *
   * Les deux émissions comptent, et pour deux surfaces distinctes : la liste
   * ouverte retire la ligne sur `notification:deleted`, la cloche recalcule son
   * badge sur `notification:counts`. Sans la seconde, un rappel laisserait le
   * compteur sur des lignes que le serveur vient de supprimer. Un seul
   * `notification:counts` par destinataire, quel qu'ait été son nombre de
   * lignes retirées.
   */
  async announceNotificationsRetracted(retracted: readonly RetractedNotification[]): Promise<void> {
    const affectedUserIds = new Set<string>();

    for (const { id, userId } of retracted) {
      affectedUserIds.add(userId);
      // Isolé PAR DESTINATAIRE : un emit qui lève sur le premier ne doit pas
      // priver d'annonce les suivants, ni faire sauter le recalcul de badge en
      // fin de méthode — dont le commentaire ci-dessus dit qu'il « compte ».
      await this.emitBestEffort(SERVER_EVENTS.NOTIFICATION_DELETED, userId, () => {
        this.io?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: id });
      });
    }

    this.revokeDeliveredPushes(retracted);

    await Promise.all(
      [...affectedUserIds].map((userId) => this.emitCountsUpdate(userId).catch(() => {}))
    );
  }

  /**
   * ANNULE puis REPRODUIT des notifications dont le texte vient d'être réécrit
   * par une édition du contenu qu'elles annoncent.
   *
   * Le jumeau d'`announceNotificationsRetracted`, et c'est ici que le geste
   * demandé — « annuler la notification envoyée ET reproduire une notification
   * de la mise à jour » — devient littéral sur le fil : pour chaque ligne, un
   * `notification:deleted` puis un `notification:new` portant le texte
   * D'APRÈS. Le couple est employé faute d'un événement « modifiée » : il n'en
   * existe pas dans le contrat client, et en introduire un demanderait de le
   * câbler sur web, iOS et Android avant que quoi que ce soit ne s'affiche.
   * Ces deux verbes-là, les clients les traitent déjà.
   *
   * La ligne est RELUE plutôt que reçue en paramètre : l'appelant a écrit un
   * `metadata`/`context` partiel, alors que la charge socket doit être celle
   * que `formatNotification` produit à la création — même forme, mêmes clés,
   * même cadrage `title`/`subtitle`. Une charge reconstruite au point d'appel
   * divergerait de celle du chemin nominal, et c'est cette divergence-là que
   * les clients verraient.
   *
   * `notification:counts` est émis UNE fois par destinataire, comme pour le
   * retrait. Le total ne change pourtant pas — la reproduction ne crée ni ne
   * détruit de ligne, et n'altère pas `isRead` : c'est le `notification:deleted`
   * intermédiaire qui l'exige, puisqu'un client qui décrémente son badge en le
   * recevant doit pouvoir se recaler.
   *
   * SUR L'APPAREIL, le même couple, dans le même ordre : un push de CONTRÔLE
   * `notification_revoked` retire la bannière portant le texte d'avant, puis un
   * push NOMINAL affiche celui d'après (`pushReproducedNotifications`). Sans le
   * second, un destinataire dont l'app est tuée perdrait la bannière sans rien
   * recevoir à la place — le socket n'atteint que les clients présents. Les
   * trois éditions y passent : message (`reproduceEditedMessageNotifications`),
   * post et commentaire (`reproduceEditedSubjectNotifications`).
   */
  async announceNotificationsReproduced(
    reproduced: readonly { readonly id: string; readonly userId: string }[]
  ): Promise<void> {
    if (!this.io || reproduced.length === 0) return;

    const affectedUserIds = new Set<string>();
    const revoked: RetractedNotification[] = [];
    const replacements: ReproducedNotificationPush[] = [];

    for (const { id, userId } of reproduced) {
      affectedUserIds.add(userId);

      const row = await this.prisma.notification.findUnique({ where: { id } }).catch(() => null);
      // Retirée entre la réécriture et l'annonce : le `notification:deleted`
      // reste dû — la ligne n'existe effectivement plus — mais il n'y a rien à
      // reproduire.
      await this.emitBestEffort(SERVER_EVENTS.NOTIFICATION_DELETED, userId, () => {
        this.io!.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: id });
      });
      // La bannière déjà livrée porte le texte D'AVANT : elle est révoquée que
      // la ligne existe encore ou non — et, quand la ligne existe encore, un
      // push NOMINAL la remplace par le texte D'APRÈS (voir plus bas).
      revoked.push(
        retractedNotificationOf({ id, userId, type: row?.type, context: row?.context, delivery: row?.delivery })
      );
      if (!row) continue;

      const formatted = this.formatNotification(row);
      const { title, subtitle } = buildPushHeader({
        type: row.type,
        customTitle: row.title ?? undefined,
        actor: (row.actor ?? undefined) as any,
        context: {
          conversationType: (row.context as any)?.conversationType,
          conversationTitle: (row.context as any)?.conversationTitle,
        },
      });
      const socketPayload = {
        ...formatted,
        title,
        subtitle: (row.subtitle && row.subtitle.trim() !== '')
          ? row.subtitle.trim().slice(0, 120)
          : subtitle,
      };

      await this.emitBestEffort(SERVER_EVENTS.NOTIFICATION_NEW, userId, () =>
        emitWithSeq(
          this.io!,
          this.sequenceService,
          userId,
          SERVER_EVENTS.NOTIFICATION_NEW,
          socketPayload
        )
      );

      replacements.push({ row, title, subtitle: socketPayload.subtitle });
    }

    // L'ORDRE est la règle, pas un détail d'ordonnancement : les deux charges
    // nomment la MÊME notification, et les clients indexent leur bannière par
    // cette identité (`notificationId` sur le web et Android, `collapseId` /
    // `threadId` sur iOS). Une révocation qui arriverait APRÈS le remplacement
    // effacerait la version à jour et laisserait le destinataire sans rien.
    // La file d'appareil garantit cet ordre sans faire attendre l'appelant.
    this.revokeDeliveredPushes(revoked);
    this.queueDeviceWork(() => this.pushReproducedNotifications(replacements));

    await Promise.all(
      [...affectedUserIds].map((userId) => this.emitCountsUpdate(userId).catch(() => {}))
    );
  }

  /**
   * Le push NOMINAL d'une notification réécrite — « annuler la notification
   * envoyée ET envoyer la nouvelle version », la moitié APPAREIL de ce que le
   * socket vient de faire pour les clients présents.
   *
   * Du CONTENU, donc le chemin nominal : ni `silent`, ni `bypassDnd`. Le push
   * de révocation qui le précède est un signal de CONTRÔLE et contourne les
   * préférences (il RETIRE) ; celui-ci AFFICHE, et se soumet donc à DND, à
   * `pushEnabled` et aux préférences de livraison comme un contenu neuf.
   *
   * En SÉRIE, sur la file d'appareil, et jamais attendu par l'appelant :
   * l'édition d'un post réécrit une audience entière par lots de 200
   * (`reproduceEditedSubjectNotifications`), et le geste qui l'a demandée ne
   * doit pas payer APNs. Un envoi qui lève n'emporte pas les suivants — et
   * surtout pas la révocation, déjà partie.
   */
  private async pushReproducedNotifications(
    replacements: readonly ReproducedNotificationPush[]
  ): Promise<void> {
    if (!this.pushService) return;

    for (const replacement of replacements) {
      try {
        await this.pushReproducedNotification(replacement);
      } catch (error) {
        notificationLogger.warn('reproduced notification push failed — rewrite already durable', {
          notificationId: replacement.row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async pushReproducedNotification(replacement: ReproducedNotificationPush): Promise<void> {
    const { row, title, subtitle } = replacement;
    const userId = row.userId as string;
    const context = (row.context ?? {}) as Record<string, unknown>;
    const contextString = (key: string): string => {
      const value = context[key];
      return typeof value === 'string' ? value : '';
    };

    // GW7 — mêmes substitutions de confidentialité que le push de création :
    // `showPreview:false` remplace le corps par un libellé générique localisé,
    // `showSenderName:false` neutralise le titre. Une bannière de remplacement
    // qui les ignorerait rendrait en clair ce que la première avait masqué.
    const prefs = await this.loadNotificationPrefs(userId);
    const showPreview = prefs?.showPreview ?? true;
    const showSenderName = prefs?.showSenderName ?? true;
    const body = showPreview
      ? truncateByCodePoints((row.content as string | null) ?? '', 200)
      : notificationString(await this.resolveRecipientLang(userId), 'push.private');

    const conversationId = contextString('conversationId');
    const messageId = contextString('messageId');
    const link = conversationId
      ? (messageId ? `/conversations/${conversationId}?messageId=${messageId}` : `/conversations/${conversationId}`)
      : undefined;

    let unreadBadge: number | undefined;
    try {
      const count = await this.prisma.notification.count({
        where: visibleNotificationsWhere({ userId, unreadOnly: true }),
      });
      if (typeof count === 'number') unreadBadge = count;
    } catch {
      unreadBadge = undefined;
    }

    const category = pushCategoryForNotificationType(row.type as NotificationType);
    const results = await this.pushService!.sendToUser({
      userId,
      // Jamais `voip` : une notification ordinaire livrée à PushKit ferait
      // sonner un faux appel (même raison qu'au chemin de création).
      types: ['apns', 'fcm'],
      payload: {
        title: showSenderName ? title : 'Meeshy',
        ...(showPreview && subtitle ? { subtitle } : {}),
        body,
        ...(link ? { link } : {}),
        // La bannière d'AVANT vient d'être révoquée ; celle-ci prend sa place
        // sous la même identité, et se replie sur la coalescence native si la
        // révocation n'a pas atteint l'appareil.
        collapseId: row.id as string,
        ...(conversationId ? { threadId: conversationId } : {}),
        ...(category ? { category } : {}),
        ...(unreadBadge !== undefined ? { badge: unreadBadge } : {}),
        data: {
          notificationId: row.id as string,
          ...(unreadBadge !== undefined ? { unreadCount: String(unreadBadge) } : {}),
          type: String(row.type ?? ''),
          conversationId,
          messageId,
          postId: contextString('postId'),
          commentId: contextString('commentId'),
          parentCommentId: contextString('parentCommentId'),
        },
      },
    });

    // Une ligne dont le premier push avait été bloqué (DND, préférences) porte
    // désormais une bannière : sans ce flip, son RETRAIT ultérieur ne la
    // révoquerait pas — la garde `pushSent` la croirait jamais poussée.
    await this.markPushDelivered(row.id as string, results);
  }

  /**
   * GW7 — `delivery.pushSent` : flippé dès qu'AU MOINS un appareil a reçu le
   * push (le champ était initialisé `false` et jamais mis à jour — tracking
   * multi-canal mort). Site unique, partagé par la création et par le
   * remplacement d'une notification réécrite : c'est ce booléen que la
   * RÉVOCATION lit pour savoir s'il y a une bannière à retirer, et il serait
   * faux si un seul des deux chemins de push le posait.
   */
  private async markPushDelivered(notificationId: string, results: unknown): Promise<void> {
    const delivered = Array.isArray(results) && results.some((result) => (result as { success?: boolean })?.success);
    if (!delivered) return;
    try {
      // RE-LIRE delivery juste avant d'écrire : un autre writer (digest
      // email quotidien) a pu poser emailSent:true entre-temps — le
      // snapshot de création { emailSent: false } est périmé.
      const current = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: { delivery: true },
      });
      const liveDelivery = ((current as { delivery?: unknown } | null)?.delivery ?? {}) as Record<string, unknown>;
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { delivery: { ...liveDelivery, pushSent: true } as any },
      });
    } catch (error) {
      notificationLogger.error('pushSent flip failed', { error, notificationId });
    }
  }

  /**
   * La FILE d'appareil : tout ce que les hubs d'annonce envoient vers APNs/FCM
   * y passe, dans l'ordre, un envoi à la fois.
   *
   * Rien n'est attendu par l'appelant : le retrait ou la réécriture qui l'a
   * demandé est déjà durable, son appelant répond à un geste utilisateur
   * (dé-réagir, supprimer, éditer), et un transport lent — APNs derrière un
   * disjoncteur à 10 s — ne doit pas retarder ce geste.
   *
   * Mais un appel LÂCHÉ n'est pas un appel sans plafond.
   * `retractPostNotifications` draine l'audience d'un post — 40 000 lignes,
   * 200 lots — en série, et documente que « le pic reste celui d'un seul lot
   * quelle que soit la taille de l'audience » ; un `void` par lot rendait ce
   * plafond caduc dès que l'envoi était plus lent que le drainage.
   *
   * La file tient DEUX invariants d'un coup : le pic reste à un envoi, et
   * l'ORDRE d'enfilement est l'ordre d'envoi — ce dont dépend la réécriture,
   * dont la révocation doit précéder le remplacement de la même bannière.
   */
  private deviceQueue: Promise<void> = Promise.resolve();

  private queueDeviceWork(work: () => Promise<void>): void {
    this.deviceQueue = this.deviceQueue.then(work).catch((error) => {
      notificationLogger.error('device push queue step failed', { error });
    });
  }

  /**
   * La moitié « appareil » d'une annonce de retrait : le socket n'atteint qu'un
   * appareil déjà là, le push de contrôle `notification_revoked` retire la
   * bannière de ceux qui ne le sont pas (`notificationRevocationPush`). Le
   * module ne rejette jamais.
   */
  private revokeDeliveredPushes(revoked: readonly RetractedNotification[]): void {
    this.queueDeviceWork(() =>
      sendNotificationRevocationPushes({ pushService: this.pushService, revoked })
    );
  }

  /**
   * Attend que la file d'appareil soit vide. Sert aux TESTS et à un arrêt
   * propre : rien du chemin nominal ne l'appelle — c'est précisément l'intérêt
   * de la file.
   */
  async flushPendingRevocations(): Promise<void> {
    await this.deviceQueue;
  }

  // ==============================================
  // SOCKET.IO
  // ==============================================

  /**
   * Émission temps réel BEST-EFFORT — le canal éphémère ne commande jamais ce
   * qui le suit.
   *
   * Une notification a trois sorties, et une seule est volatile. La ligne est
   * écrite avant elles ; le push et l'e-mail atteignent un destinataire absent ;
   * le socket n'atteint qu'un destinataire déjà là. Laisser l'emit décider du
   * reste inverse exactement l'ordre des enjeux — et la panne qui le déclenche
   * (adaptateur Redis, encodeur) est celle où personne n'est là, donc celle où
   * les deux autres comptent le plus.
   *
   * `try/catch` plutôt qu'un `.catch` sur la promesse rendue, parce que les deux
   * gardes sont DISJOINTES : `io.to(…).emit(…)` lève SYNCHRONEMENT, ce qu'aucun
   * `.catch` n'attrape. Même raison, mot pour mot, que le `try/catch` de
   * `ReactionHandler._retractReactionNotification`.
   *
   * Ne pas confondre avec un silence : l'échec est journalisé en `error`, et
   * l'événement manqué se rattrape par le chemin prévu pour ça — la file
   * hors-ligne pour les mutations, `/sync` pour le gap de séquence, la lecture
   * REST pour la liste.
   */
  private async emitBestEffort(
    event: string,
    userId: string,
    emit: () => void | Promise<void>
  ): Promise<void> {
    try {
      await emit();
    } catch (error) {
      notificationLogger.error('socket emit failed — durable channels proceed', {
        error,
        event,
        userId,
      });
    }
  }

  /**
   * Configure Socket.IO pour les notifications temps réel
   */
  setSocketIO(io: ServerEmitIOWithRooms, _userSocketsMap?: Map<string, Set<string>>): void {
    notificationLogger.info('🔌 [SOCKET.IO] setSocketIO appelé', {
      hasIo: !!io,
      ioType: typeof io,
    });
    this.io = io;
    notificationLogger.info('✅ [SOCKET.IO] this.io configuré avec succès', {
      hasThisIo: !!this.io,
    });
    // userSocketsMap non utilisé dans V2 : les émissions user-scoped ciblent la
    // room `ROOMS.user(userId)` (`user:${id}`) que chaque socket enregistré
    // rejoint à l'auth — Socket.IO gère le fan-out multi-device.
  }

  setPushNotificationService(pushService: PushNotificationService): void {
    this.pushService = pushService;
    notificationLogger.info('✅ PushNotificationService configured');
  }

  setEmailService(emailService: EmailService): void {
    this.emailService = emailService;
    notificationLogger.info('✅ EmailService configured for immediate notifications');
  }
}
