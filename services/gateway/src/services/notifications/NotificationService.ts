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
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { formatClock } from '@meeshy/shared/utils/duration-format';
import { notificationString, buildNotificationDisplay, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger, securityLogger } from '../../utils/logger-enhanced';
import { SecuritySanitizer } from '../../utils/sanitize';
import type { Server as SocketIOServer } from 'socket.io';
import { PushNotificationService } from '../PushNotificationService';
import { EmailService } from '../EmailService';
import { getCommunityCoMemberIds } from '../posts/communityVisibility';

function formatDuration(ms: number): string {
  return formatClock(Math.round(ms / 1000));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Resolve the best available name for a notification actor:
 * displayName first, then username, then a neutral fallback.
 */
function resolveActorName(actor: NotificationActor | undefined): string {
  return actor?.displayName?.trim() || actor?.username?.trim() || 'Meeshy';
}

/**
 * Build the APN/FCM push header (title + optional subtitle) for a notification.
 *
 * Keeps the title focused on the sender so iOS Communication Notifications
 * (`INSendMessageIntent.donate`) can rewrite the banner around the sender's
 * INPerson without losing the conversation name. The conversation name is
 * carried in a separate `subtitle` field — APN-native, displayed by iOS
 * between title and body and untouched by Communication Intent donation.
 *
 * Conversation-scoped notifications (messages, mentions, reactions) get the
 * conversation name as subtitle when the conversation is a group/global chat
 * — the recipient must know WHICH group the activity happened in. System
 * events keep the title-only layout where the actor name is the natural focus.
 *
 * Exported for unit testing — the helper is pure and side-effect free.
 */
const CONVERSATION_SUBTITLE_TYPES = new Set([
  'new_message',
  'user_mentioned',
  'message_reaction',
]);

export function buildPushHeader(input: {
  type: string;
  customTitle?: string;
  actor?: NotificationActor;
  context: {
    conversationType?: string | null;
    conversationTitle?: string | null;
  };
}): { title: string; subtitle: string | undefined } {
  const isMessage = CONVERSATION_SUBTITLE_TYPES.has(input.type);
  const conversationType = input.context.conversationType?.trim() || '';
  const conversationTitle = input.context.conversationTitle?.trim() || '';
  const isGroupMessage = isMessage
    && conversationType !== ''
    && conversationType !== 'direct';

  const actorName = resolveActorName(input.actor);
  const title = input.customTitle?.trim() || actorName;
  // Le subtitle ne porte que le NOM CANONIQUE du groupe — l'icône de type et le
  // renommage local (customName) sont résolus CÔTÉ CLIENT (NSE + toast), en
  // Local-First, depuis les préférences locales (cf. ConversationSnapshot App
  // Group). Le gateway ne recompose pas la présentation systématiquement.
  const subtitle = isGroupMessage && conversationTitle !== ''
    ? conversationTitle
    : undefined;

  return { title, subtitle };
}

// ──────────────────────────────────────────────────────────────────────────
// Protected-message preview (view-once / blurred / ephemeral / encrypted)
// ──────────────────────────────────────────────────────────────────────────
//
// Replaces the previous plain-English placeholders ("View-once message",
// "Hidden message", "Encrypted message") with a compact icon-only body that
// conveys the protection type + content type without leaking content :
//   * Ephemeral (TTL):   🔥 + content-type icon + duration   (e.g. "🔥 🎵 5min")
//   * View-once:         👁️ + content-type icon              (e.g. "👁️ 🖼️")
//   * Blurred:           🌫️ + content-type icon              (e.g. "🌫️ 💬")
//   * Encrypted:         🔒 + content-type icon              (e.g. "🔒 🎬")
//
// Emojis are platform-universal so no client-side localisation is needed for
// the body itself. The `locKey` is still emitted for compatibility with the
// iOS NSE locKey path (used only as a fallback when E2EE decryption fails).

const PROTECTION_ICON = Object.freeze({
  ephemeral: '🔥',
  viewOnce:  '👁️',
  blurred:   '🌫️',
  encrypted: '🔒',
} as const);

const CONTENT_TYPE_ICON = Object.freeze({
  text:     '💬',
  audio:    '🎵',
  image:    '🖼️',
  video:    '🎬',
  file:     '📎',
  location: '📍',
  system:   '⚙️',
} as const);

type ProtectedMessageType = keyof typeof CONTENT_TYPE_ICON;

/**
 * Maps a Prisma `Message.messageType` to its visual icon. Falls back to the
 * speech-balloon (text) when the value is unknown so the body always renders.
 */
export function contentTypeIcon(messageType: string | null | undefined): string {
  if (!messageType) return CONTENT_TYPE_ICON.text;
  const key = messageType.toLowerCase() as ProtectedMessageType;
  return CONTENT_TYPE_ICON[key] ?? CONTENT_TYPE_ICON.text;
}

/**
 * Compact human-readable duration for an ephemeral message TTL. Returns
 * undefined when the duration is non-positive or unknown so the caller can
 * omit the suffix entirely.
 *
 * Outputs (rounded, FR-style abbreviations to stay locale-neutral) :
 *   < 60s   → "Ns"      ("30s")
 *   < 60min → "Nmin"    ("5min")
 *   < 24h   → "Nh"      ("2h")
 *   else    → "Nj"      ("3j" — for "jours/days")
 */
export function formatEphemeralDuration(
  expiresAt: Date | null | undefined,
  createdAt: Date | null | undefined,
): string | undefined {
  if (!expiresAt || !createdAt) return undefined;
  const ms = expiresAt.getTime() - createdAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const sec = Math.round(ms / 1000);
  if (sec < 60)     return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60)     return `${min}min`;
  const h = Math.round(min / 60);
  if (h < 24)       return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}j`;
}

/**
 * Builds the sanitised body for a protected message. Returns `null` when the
 * message is NOT protected (caller should keep the original text).
 *
 * Precedence : ephemeral > view-once > blurred > encrypted. Only one
 * protection icon is shown to keep the body compact, but the most restrictive
 * protection always wins.
 *
 * The `locKey` is returned alongside for the iOS NSE locKey path. It is
 * preserved as a semantic key (not a localised string) so client apps can
 * resolve it through their own `Localizable.xcstrings` when needed (mostly
 * for E2EE-undecryptable messages where the gateway body cannot be trusted).
 */
export function protectedPreview(input: {
  messageType: string | null | undefined;
  isEncrypted?: boolean | null;
  isViewOnce?: boolean | null;
  isBlurred?: boolean | null;
  effectFlags?: number | null;
  expiresAt?: Date | null;
  createdAt?: Date | null;
}): { preview: string; locKey: string } | null {
  const flags = input.effectFlags ?? 0;
  const isEphemeral = (input.expiresAt instanceof Date) || (flags & MESSAGE_EFFECT_FLAGS.EPHEMERAL) !== 0;
  const isViewOnce  = (input.isViewOnce === true) || (flags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0;
  const isBlurred   = (input.isBlurred  === true) || (flags & MESSAGE_EFFECT_FLAGS.BLURRED)   !== 0;
  const isEncrypted = input.isEncrypted === true;
  if (!isEphemeral && !isViewOnce && !isBlurred && !isEncrypted) return null;

  const icon = contentTypeIcon(input.messageType);

  if (isEphemeral) {
    const duration = formatEphemeralDuration(input.expiresAt ?? null, input.createdAt ?? null);
    const preview = duration
      ? `${PROTECTION_ICON.ephemeral} ${icon} ${duration}`
      : `${PROTECTION_ICON.ephemeral} ${icon}`;
    return { preview, locKey: 'notification.ephemeral_message' };
  }
  if (isViewOnce) {
    return { preview: `${PROTECTION_ICON.viewOnce} ${icon}`, locKey: 'notification.view_once_message' };
  }
  if (isBlurred) {
    return { preview: `${PROTECTION_ICON.blurred} ${icon}`, locKey: 'notification.hidden_message' };
  }
  // isEncrypted (last branch — least restrictive flag)
  return { preview: `${PROTECTION_ICON.encrypted} ${icon}`, locKey: 'notification.encrypted_message' };
}

function extractExtension(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

const DOC_LABELS: Record<string, string> = {
  pdf: '📄 PDF',
  doc: '📝 Word',
  docx: '📝 Word',
  xls: '📊 Excel',
  xlsx: '📊 Excel',
  csv: '📊 CSV',
  ppt: '📊 PowerPoint',
  pptx: '📊 PowerPoint',
  txt: '📝 Texte',
  rtf: '📝 RTF',
  md: '📝 Markdown',
  json: '📋 JSON',
  xml: '📋 XML',
  html: '📋 HTML',
  zip: '📦 ZIP',
  rar: '📦 RAR',
  '7z': '📦 7z',
  tar: '📦 TAR',
  gz: '📦 GZ',
};

function formatDocumentLabel(ext: string): string {
  return DOC_LABELS[ext] ?? `📎 Fichier .${ext}`;
}

type NotificationAttachmentType = 'image' | 'video' | 'audio' | 'document';

type NotificationAttachmentSummary = {
  type: NotificationAttachmentType;
  filename?: string | null;
};

/**
 * Detailed label for a single attachment — used as the notification body base
 * when the message carries no text. Includes dimensions/duration/size.
 */
export function formatSingleAttachmentLabelI18n(lang: string, params: {
  type: NotificationAttachmentType;
  filename?: string | null;
  fileSize?: number | null;
  /** Durée en MILLISECONDES (champ `duration` de MessageAttachment, cf. schema.prisma). */
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}): string {
  const details: string[] = [];

  if (params.type === 'audio') {
    if (params.duration) details.push(formatDuration(params.duration));
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.audio');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  if (params.type === 'video') {
    if (params.duration) details.push(formatDuration(params.duration));
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.video');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  if (params.type === 'image') {
    if (params.width && params.height) details.push(`${params.width}×${params.height}`);
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.photo');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  const ext = extractExtension(params.filename);
  const docLabel = ext ? formatDocumentLabel(ext) : notificationString(lang, 'attachment.document');
  return params.fileSize ? `${docLabel} · ${formatFileSize(params.fileSize)}` : docLabel;
}

/**
 * Badge for a group of extra document attachments. Keeps the per-extension
 * label (📄 PDF, 📝 Word…) when the group is homogeneous, falls back to a
 * generic paperclip count otherwise.
 */
function formatDocumentBadge(lang: string, docs: ReadonlyArray<NotificationAttachmentSummary>): string {
  const labels = docs.map(doc => {
    const ext = extractExtension(doc.filename);
    return ext ? formatDocumentLabel(ext) : notificationString(lang, 'attachment.document');
  });
  const homogeneous = labels.every(label => label === labels[0]);
  if (homogeneous) {
    return docs.length > 1 ? `${labels[0]} · ${docs.length}` : labels[0];
  }
  return notificationString(lang, 'attachment.files', { count: docs.length });
}

/**
 * Per-type `+N` badges for the attachments beyond the first one (the first is
 * surfaced as inline rich media). Order: images, audios, videos, documents.
 */
function buildAttachmentBadges(lang: string, rest: ReadonlyArray<NotificationAttachmentSummary>): string {
  const images = rest.filter(att => att.type === 'image');
  const audios = rest.filter(att => att.type === 'audio');
  const videos = rest.filter(att => att.type === 'video');
  const documents = rest.filter(att => att.type === 'document');

  const segments: string[] = [];
  if (images.length > 0) segments.push(`+${images.length}📷`);
  if (audios.length > 0) segments.push(`+${audios.length}🎵`);
  if (videos.length > 0) segments.push(`+${videos.length}🎬`);
  if (documents.length > 0) segments.push(formatDocumentBadge(lang, documents));
  return segments.join(' ');
}

/**
 * Compose the message notification body: message text (or, when absent, a
 * detailed label for the first attachment) followed by per-type `+N` badges
 * for the remaining attachments. Localized to the recipient's language.
 */
export function buildMessageNotificationBodyI18n(lang: string, params: {
  messagePreview?: string;
  attachments?: ReadonlyArray<NotificationAttachmentSummary>;
  firstAttachmentFileSize?: number | null;
  firstAttachmentDuration?: number | null;
  firstAttachmentWidth?: number | null;
  firstAttachmentHeight?: number | null;
}): string {
  const text = params.messagePreview?.trim() || '';
  const attachments = params.attachments ?? [];

  if (attachments.length === 0) return text;

  const [first, ...rest] = attachments;
  const badges = buildAttachmentBadges(lang, rest);
  const base = text || formatSingleAttachmentLabelI18n(lang, {
    type: first.type,
    filename: first.filename,
    fileSize: params.firstAttachmentFileSize,
    duration: params.firstAttachmentDuration,
    width: params.firstAttachmentWidth,
    height: params.firstAttachmentHeight,
  });

  return [base, badges].filter(Boolean).join(' ');
}

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
    private io?: SocketIOServer
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

  /** Langue de notification d'un destinataire (Prisme-first, fallback 'fr'). */
  private async resolveRecipientLang(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.LANG_SELECT,
    });
    if (!user) return 'fr';
    return resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined });
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
  private async shouldCreateNotification(userId: string, type: NotificationType): Promise<boolean> {
    // Les notifications système/sécurité passent toujours
    if (type === 'system') return true;

    try {
      const userPrefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { notification: true },
      });

      const raw = (userPrefs?.notification ?? {}) as Record<string, unknown>;
      const prefs: NotifPrefs = { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...raw };

      // 1) Vérifier le toggle par type
      if (!this.isTypeEnabled(prefs, type)) {
        notificationLogger.info('Notification bloquée par préférence de type', { userId, type });
        return false;
      }

      // 2) Vérifier le mode Ne Pas Déranger
      if (this.isDNDActive(prefs)) {
        notificationLogger.info('Notification bloquée par DND', { userId, type });
        return false;
      }

      return true;
    } catch (error) {
      // Fail open : en cas d'erreur de lecture des prefs, on crée la notification
      notificationLogger.error('Erreur lecture préférences, notification autorisée par défaut', { error, userId, type });
      return true;
    }
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
      case 'new_conversation_direct':
      case 'new_conversation_group':
      case 'new_conversation':  return prefs.conversationEnabled;
      case 'added_to_conversation':
      case 'removed_from_conversation':
      case 'member_removed':
      case 'member_left':           return prefs.memberJoinedEnabled;
      case 'member_promoted':
      case 'member_demoted':
      case 'member_role_changed':   return prefs.memberJoinedEnabled;
      case 'password_changed':
      case 'two_factor_enabled':
      case 'two_factor_disabled':
      case 'login_new_device':      return true; // sécurité = toujours actif
      default:                  return true;
    }
  }

  /**
   * Vérifie si le mode DND est actuellement actif.
   * Utilise l'heure UTC du serveur.
   */
  private isDNDActive(prefs: NotifPrefs): boolean {
    if (!prefs.dndEnabled) return false;

    const now = new Date();

    // Si dndDays est défini et non vide, vérifier le jour
    if (prefs.dndDays && prefs.dndDays.length > 0) {
      const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const today = dayMap[now.getUTCDay()];
      if (!prefs.dndDays.includes(today as any)) return false;
    }

    const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
    const start = prefs.dndStartTime;
    const end = prefs.dndEndTime;

    // DND nocturne (ex: 22:00 - 08:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }

    // DND diurne (ex: 14:00 - 16:00)
    return currentTime >= start && currentTime < end;
  }

  // ==============================================
  // CORE - Méthode générique de création
  // ==============================================

  /**
   * Crée une notification avec la structure V2
   */
  private async createNotification(params: {
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

      // Vérifier les préférences utilisateur avant création
      const allowed = await this.shouldCreateNotification(params.userId, params.type);
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
        avatar: params.actor.avatar
          ? SecuritySanitizer.sanitizeURL(params.actor.avatar) ?? params.actor.avatar
          : params.actor.avatar,
      } : undefined;
      const sanitizedMetadata = SecuritySanitizer.sanitizeJSON(params.metadata);

      // Titre/sous-titre localisés, conscients de l'entité — calculés UNE fois
      // côté serveur (langue du destinataire) puis persistés. Source unique pour
      // la liste in-app (iOS/iPadOS/macOS) et le web ; corrige les libellés
      // imprécis/non localisés historiquement reconstruits côté client.
      const meta = (params.metadata ?? {}) as Record<string, unknown>;
      const displayInput = {
        type: params.type,
        actorName: sanitizedActor?.displayName ?? params.actor?.username ?? null,
        postType: typeof meta.postType === 'string' ? meta.postType : null,
        emoji: (typeof meta.reactionEmoji === 'string' ? meta.reactionEmoji
          : typeof meta.emoji === 'string' ? meta.emoji : null),
        parentCommentPreview: (typeof meta.parentCommentPreview === 'string' ? meta.parentCommentPreview : null),
      };
      // On ne touche la base pour la langue du destinataire QUE si le type
      // produit réellement un titre localisé ET que l'appelant ne l'a pas déjà
      // fournie — évite une requête inutile pour les types non gérés (messages,
      // appels, sécurité…), qui retombent sur le rendu client.
      let display = buildNotificationDisplay(params.lang ?? 'fr', displayInput);
      if (display.title !== null && params.lang === undefined) {
        display = buildNotificationDisplay(await this.resolveRecipientLang(params.userId), displayInput);
      }
      // Sous-titre persisté : l'override explicite riche d'une méthode `create*`
      // (ex. « Votre publication : « aperçu » ») prime, sinon la base localisée
      // du builder. SANS date — le client append la date locale.
      const persistedSubtitle = (params.subtitle && params.subtitle.trim() !== '')
        ? params.subtitle.trim().slice(0, 160)
        : (display.subtitle ?? null);

      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          priority: params.priority,
          title: display.title,
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
      const { title: pushTitle, subtitle: derivedSubtitle } = buildPushHeader({
        type: params.type,
        customTitle: params.title,
        actor: params.actor,
        context: {
          conversationType: params.context.conversationType,
          conversationTitle: params.context.conversationTitle,
        },
      });
      // Explicit subtitle (e.g. comment preview for reactions) overrides the
      // type-based derivation. Trim to keep the iOS banner readable —
      // anything past ~120 chars on a 3-line banner gets cut anyway.
      const pushSubtitle = (params.subtitle && params.subtitle.trim() !== '')
        ? params.subtitle.trim().slice(0, 120)
        : derivedSubtitle;

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
      if (this.io) {
        await emitWithSeq(this.io, this.sequenceService, params.userId, SERVER_EVENTS.NOTIFICATION_NEW, socketPayload as unknown as Record<string, unknown>);
        notificationLogger.debug('notification:new emitted via socket', { userId: params.userId, type: params.type, conversationId: params.context.conversationId ?? 'none' });
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
          const pushBody = params.content.substring(0, 200);

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
              where: { userId: params.userId, readAt: null },
            });
            if (typeof count === 'number') unreadBadge = count;
          } catch {
            unreadBadge = undefined;
          }

          notificationLogger.debug('push (APNs/FCM) sending', { userId: params.userId, type: params.type, conversationId: params.context.conversationId ?? 'none' });
          this.pushService.sendToUser({
            userId: params.userId,
            // CRITICAL: exclude 'voip' tokens — regular notifications must NEVER be
            // delivered to PushKit, otherwise iOS shows a fake CallKit incoming call
            // for every message/friend-request/conversation-creation. Real call
            // pushes are dispatched separately from CallEventsHandler with types: ['voip'].
            types: ['apns', 'fcm'],
            payload: {
              title: pushTitle,
              // Subtitle carries the conversation name for group/global chats
              // — survives iOS Communication Notification rewriting that would
              // otherwise drop a "<sender> | <conv>" concatenated title.
              ...(pushSubtitle ? { subtitle: pushSubtitle } : {}),
              body: pushBody,
              link,
              collapseId: params.collapseId,
              ...(unreadBadge !== undefined ? { badge: unreadBadge } : {}),
              data: {
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
                postType: (params.metadata && 'postType' in params.metadata ? String(params.metadata.postType ?? '') : ''),
                senderId: params.actor?.id || '',
                senderUsername: params.actor?.username || '',
                senderDisplayName: params.actor?.displayName || '',
                senderAvatar: params.actor?.avatar || '',
                imageURL: params.actor?.avatar || '',
                // Phase A — message media inline (audio waveform, image preview, video thumb).
                // L'extension iOS lit ces champs pour télécharger le fichier et l'attacher
                // comme UNNotificationAttachment avec le bon UTI typeHint.
                attachmentUrl: params.context.firstAttachmentUrl || '',
                attachmentMimeType: params.context.firstAttachmentMimeType || '',
                attachmentDurationMs: params.context.firstAttachmentDurationMs != null
                  ? String(params.context.firstAttachmentDurationMs)
                  : '',
                // Phase B — reactions. Emoji used so the iOS extension can format
                // the body as "<sender> a réagi <emoji> à votre message" while the
                // INSendMessageIntent path still renders the reactor's avatar.
                reactionEmoji: (params.metadata && 'reactionEmoji' in params.metadata
                  ? String(params.metadata.reactionEmoji ?? '')
                  : ''),
                encryptedContent: params.context.encryptedContent || '',
                notificationLocKey: params.context.notificationLocKey || '',
              },
            },
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
          const sockets = this.io ? await this.io.in(params.userId).fetchSockets() : [];
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
                select: { email: true, systemLanguage: true, username: true }
              });
              if (user?.email) {
                if (params.type === 'login_new_device' && (params as any)._loginAlertData) {
                  const alertData = (params as any)._loginAlertData;
                  this.emailService.sendLoginAlertEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: user.systemLanguage || 'fr',
                    ...alertData,
                  }).catch(err => {
                    notificationLogger.error('Login alert email failed', { error: err, userId: params.userId });
                  });
                } else if (isSecurityEmailType(params.type)) {
                  this.emailService.sendSecurityAlertEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: user.systemLanguage || 'fr',
                    alertType: params.type,
                    details: params.content.substring(0, 500),
                  }).catch(err => {
                    notificationLogger.error('Immediate email failed', { error: err, userId: params.userId });
                  });
                } else {
                  // Social / general notification (mention, missed call, …):
                  // neutral notification email, never the security template.
                  this.emailService.sendNotificationEmail({
                    to: user.email,
                    name: user.username || 'User',
                    language: user.systemLanguage || 'fr',
                    notificationType: params.type,
                    details: params.content.substring(0, 500),
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
   * Convertit une date en ISO string de manière sûre
   * Retourne null si la date est null/invalide
   */
  private toISOStringOrNull(date: Date | null): string | null {
    if (!date) return null;
    try {
      return date.toISOString();
    } catch (error) {
      notificationLogger.error('Failed to convert date to ISO string', { error, date });
      return null;
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
    encryptedContent?: string;
    notificationLocKey?: string;
  }): Promise<Notification | null> {
    // Race-condition guard: between `MessageProcessor.handleMessage` and the
    // moment the notification actually fans out (sender lookup + conversation
    // lookup + push enqueue + socket emit) there can be hundreds of
    // milliseconds. If the sender soft-deletes / burns / lets the message
    // expire in that window we MUST NOT leak the original content via the
    // banner. Refetch the live state right before the fan-out and bail when
    // the message is no longer eligible.
    const liveMessage = await this.prisma.message.findUnique({
      where: { id: params.messageId },
      select: { deletedAt: true, expiresAt: true, isViewOnce: true, viewOnceCount: true },
    });
    if (!liveMessage) {
      notificationLogger.info('Skipping message notification (message vanished)', {
        messageId: params.messageId,
      });
      return null;
    }
    if (liveMessage.deletedAt) {
      notificationLogger.info('Skipping message notification (soft-deleted in flight)', {
        messageId: params.messageId,
        deletedAt: liveMessage.deletedAt,
      });
      return null;
    }
    if (liveMessage.expiresAt instanceof Date && liveMessage.expiresAt.getTime() <= Date.now()) {
      notificationLogger.info('Skipping message notification (already expired)', {
        messageId: params.messageId,
        expiresAt: liveMessage.expiresAt,
      });
      return null;
    }

    // Expéditeur + conversation : lectures indépendantes, en parallèle
    const [sender, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.senderId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true, avatar: true },
      }),
    ]);

    if (!sender) {
      notificationLogger.warn('Sender not found for message notification', {
        senderId: params.senderId,
      });
      return null;
    }

    const recipientLang = await this.resolveRecipientLang(params.recipientUserId);

    const content = buildMessageNotificationBodyI18n(recipientLang, {
      messagePreview: params.messagePreview,
      attachments: params.attachments,
      firstAttachmentFileSize: params.firstAttachmentFileSize,
      firstAttachmentDuration: params.firstAttachmentDuration,
      firstAttachmentWidth: params.firstAttachmentWidth,
      firstAttachmentHeight: params.firstAttachmentHeight,
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'new_message',
      priority: 'normal',
      content,
      collapseId: `conv-${params.conversationId}`,
      lang: recipientLang,

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
        firstAttachmentUrl: params.firstAttachmentUrl,
        firstAttachmentMimeType: params.firstAttachmentMimeType,
        firstAttachmentDurationMs: params.firstAttachmentDuration != null
          ? Math.round(params.firstAttachmentDuration * 1000)
          : undefined,
        encryptedContent: params.encryptedContent,
        notificationLocKey: params.notificationLocKey,
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
        ...(params.hasAttachments && params.attachmentCount && {
          attachments: {
            count: params.attachmentCount,
            firstType: params.firstAttachmentType || 'document',
            firstFilename: params.firstAttachmentFilename || 'file',
            ...(params.firstAttachmentDuration != null
              ? { firstDurationMs: Math.round(params.firstAttachmentDuration * 1000) }
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
  }): Promise<Notification | null> {
    // Anti-spam: rate limit des mentions par paire (sender → recipient)
    if (!this.shouldCreateMentionNotification(params.mentionerUserId, params.mentionedUserId)) {
      notificationLogger.info('Mention notification blocked (rate limit)', {
        senderId: params.mentionerUserId,
        mentionedUserId: params.mentionedUserId,
      });
      return null;
    }

    const [mentioner, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.mentionerUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true, avatar: true },
      }),
    ]);

    if (!mentioner) return null;

    return this.createNotification({
      userId: params.mentionedUserId,
      type: 'user_mentioned',
      priority: 'high',
      content: params.messagePreview,
      collapseId: `conv-${params.conversationId}`,

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
      senderUsername: string;
      senderAvatar?: string;
      messageContent: string;
      conversationId: string;
      messageId: string;
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

    const results = await Promise.all(
      eligibleUserIds.map(userId =>
        this.createMentionNotification({
          mentionedUserId: userId,
          mentionerUserId: commonData.senderId,
          messageId: commonData.messageId,
          conversationId: commonData.conversationId,
          messagePreview: commonData.messageContent,
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
        select: { content: true },
      }),
    ]);

    if (!reactor) return null;

    const lang = await this.resolveRecipientLang(params.messageAuthorId);
    const messagePreview = message?.content
      ? message.content.length > 100
        ? message.content.substring(0, 100) + '…'
        : message.content
      : null;

    return this.createNotification({
      userId: params.messageAuthorId,
      type: 'message_reaction',
      priority: 'low',
      content: notificationString(lang, 'reaction.message', { emoji: params.reactionEmoji }),

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
    const subtitle = params.commentPreview && params.commentPreview.trim() !== ''
      ? `« ${params.commentPreview.trim()} »`
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
      },
    });
  }

  // ==============================================
  // STORY COMMENT FAN-OUT (Phase 1D)
  // ==============================================

  /**
   * Resolves the three recipient buckets for story comment notifications.
   *
   * Priority order (a user appears in EXACTLY ONE bucket):
   *   1. storyAuthorId  → STORY_NEW_COMMENT
   *   2. previousCommenterIds (prior commenters on this post, excl. commenter & author)
   *                     → STORY_THREAD_REPLY
   *   3. friendIds (friends of the author, excl. commenter, author, and prior commenters)
   *                     → FRIEND_STORY_COMMENT
   */
  async getStoryNotificationRecipients(
    postId: string,
    authorId: string,
    commenterId: string
  ): Promise<{ authorId: string; friendIds: string[]; previousCommenterIds: string[] }> {
    // Cap at 500 rows to bound fan-out cost on viral posts.
    // Future: large posts should use a background queue for fan-out.
    const [previousComments, friendRequests, reactors] = await Promise.all([
      this.prisma.postComment.findMany({
        where: {
          postId,
          deletedAt: null,
          NOT: { authorId: commenterId },
        },
        distinct: ['authorId'],
        select: { authorId: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: authorId }, { receiverId: authorId }],
        },
        select: { senderId: true, receiverId: true },
        take: 500,
        orderBy: { updatedAt: 'desc' },
      }),
      // Include post reactors as thread-engaged participants (same bucket as prior commenters)
      this.prisma.postReaction.findMany({
        where: {
          postId,
          NOT: { userId: commenterId },
        },
        distinct: ['userId'],
        select: { userId: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const rawPreviousCommenterIds = previousComments
      .map((c: { authorId: string }) => c.authorId)
      .filter((id: string) => id !== authorId);

    // Merge reactor user IDs into the "thread engagement" bucket.
    // Reactors who also commented are deduplicated via Set — they still appear only once.
    const reactorIds = reactors
      .map((r: { userId: string }) => r.userId)
      .filter((id: string) => id !== authorId);

    const rawEngagedIds = Array.from(new Set([...rawPreviousCommenterIds, ...reactorIds]));

    const previousCommenterSet = new Set(rawEngagedIds);

    const allFriendIds = friendRequests.flatMap(
      (fr: { senderId: string; receiverId: string }) => [fr.senderId, fr.receiverId]
    ).filter((id: string) => id !== authorId);

    const friendIds = Array.from(new Set(allFriendIds)).filter(
      (id: string) =>
        id !== commenterId &&
        id !== authorId &&
        !previousCommenterSet.has(id)
    );

    const previousCommenterIds = rawEngagedIds.filter(
      (id: string) => id !== commenterId
    );

    return { authorId, friendIds, previousCommenterIds };
  }

  /**
   * Fan-out notifications when a new top-level comment is added to a story.
   *
   *  - Story author        → STORY_NEW_COMMENT  (priority: normal)
   *  - Previous commenters → STORY_THREAD_REPLY (priority: low)
   *  - Friends of author   → FRIEND_STORY_COMMENT (priority: low)
   *
   * Commenter never receives a notification.
   */
  async createStoryCommentNotificationsBatch(params: {
    postId: string;
    commentId: string;
    storyAuthorId: string;
    commenterId: string;
    commentExcerpt?: string;
    /**
     * Type du post commenté. Pilote le wording (« story » vs « publication »
     * vs « humeur ») et le bucket auteur : pour un post non-story, l'auteur
     * est déjà notifié via `createPostCommentNotification` (route), donc le
     * bucket 1 est sauté pour éviter la double notification.
     * Défaut STORY (compat avec les appels existants).
     */
    postType?: 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du contenu commenté (contexte expiry côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO du contenu commenté (story/status éphémère). */
    postExpiresAt?: string | Date;
    /**
     * User IDs to exclude from fan-out buckets (story_thread_reply, friend_story_comment).
     * Use to pass mentionedUserIds so users who received user_mentioned don't also get
     * a lower-priority story thread/friend notification.
     * The story author always gets STORY_NEW_COMMENT regardless of this list.
     */
    excludeUserIds?: string[];
  }): Promise<void> {
    const [actor, postAuthor] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.commenterId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.user.findUnique({
        where: { id: params.storyAuthorId },
        select: { username: true, displayName: true },
      }),
    ]);

    if (!actor) return;

    const { authorId, friendIds, previousCommenterIds } =
      await this.getStoryNotificationRecipients(
        params.postId,
        params.storyAuthorId,
        params.commenterId
      );

    const excerpt = params.commentExcerpt
      ? this.truncateMessage(params.commentExcerpt)
      : '';

    // Wording typé : le destinataire doit savoir SUR QUOI porte le commentaire
    // (story / publication / humeur / statut) et, pour les buckets fan-out, la
    // story/publication DE QUI. Le contexte voyage en `subtitle` (APN-natif,
    // restauré côté NSE après la donation d'intent), le body reste le contenu
    // du commentaire.
    const postType = params.postType ?? 'STORY';
    // REEL est une variante de post : le catalogue i18n serveur le rend comme
    // « publication », mais on conserve REEL dans la metadata pour que le client
    // affiche le libellé/icône « Réel » distinct.
    const i18nPostType = postType === 'REEL' ? 'POST' : postType;
    const authorName = postAuthor?.displayName?.trim()
      || postAuthor?.username?.trim()
      || '';
    const langs = await this.resolveRecipientLangs([authorId, ...previousCommenterIds, ...friendIds]);
    const contextSubtitleFor = (lang: string): string => authorName
      ? notificationString(lang, 'comment.subtitleFrom', { postType: i18nPostType, author: authorName })
      : notificationString(lang, 'comment.subtitleBare', { postType: i18nPostType });

    const commonContext = {
      postId: params.postId,
      commentId: params.commentId,
      ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
      ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
    };
    const commonMetadata = {
      action: 'view_post' as const,
      postId: params.postId,
      commentId: params.commentId,
      commentPreview: excerpt,
      postType,
    };
    const actorInfo = {
      id: params.commenterId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    };

    const excludeSet = new Set(params.excludeUserIds ?? []);
    const tasks: Array<Promise<unknown>> = [];

    // 1. Story author notification — always sent regardless of excludeUserIds
    //    (STORY_NEW_COMMENT has priority over all fan-out notifications).
    //    Pour un post non-story, l'auteur est déjà notifié via post_comment
    //    (route) — bucket sauté pour ne pas le notifier deux fois.
    if (authorId !== params.commenterId && postType === 'STORY') {
      const aLang = langs.get(authorId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: authorId,
          type: 'story_new_comment',
          priority: 'normal',
          content: excerpt || notificationString(aLang, 'comment.your', { postType: i18nPostType }),
          subtitle: notificationString(aLang, 'comment.subtitleOwner', { postType: i18nPostType }),
          actor: actorInfo,
          context: commonContext,
          metadata: commonMetadata,
          lang: aLang,
        })
      );
    }

    // 2. Previous commenters (thread participants) — skip mentioned users
    for (const recipientId of previousCommenterIds) {
      if (excludeSet.has(recipientId)) continue;
      const rLang = langs.get(recipientId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: recipientId,
          type: 'story_thread_reply',
          priority: 'low',
          content: excerpt || notificationString(rLang, 'comment.repliedIn', { postType: i18nPostType }),
          subtitle: contextSubtitleFor(rLang),
          actor: actorInfo,
          context: commonContext,
          metadata: commonMetadata,
          lang: rLang,
        })
      );
    }

    // 3. Friends of the story author — skip mentioned users
    for (const recipientId of friendIds) {
      if (excludeSet.has(recipientId)) continue;
      const rLang = langs.get(recipientId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: recipientId,
          type: 'friend_story_comment',
          priority: 'low',
          content: excerpt || notificationString(rLang, 'comment.generic', { postType: i18nPostType }),
          subtitle: contextSubtitleFor(rLang),
          actor: actorInfo,
          context: commonContext,
          metadata: commonMetadata,
          lang: rLang,
        })
      );
    }

    // createNotification ne rejette jamais (catch interne + log du userId
    // exact) : attendre les tasks suffit, pas de gestion rejected ici.
    await Promise.allSettled(tasks);
  }

  // ==============================================
  // COMMENT MENTION NOTIFICATIONS (Phase 2B)
  // ==============================================

  /**
   * Envoie des notifications user_mentioned en batch pour les mentions dans un commentaire.
   *
   * Priority dedup: user_mentioned > story_new_comment > story_thread_reply > friend_story_comment
   * Les mentionedUserIds doivent être passés en excludeUserIds dans createStoryCommentNotificationsBatch
   * pour éviter la double notification.
   *
   * Skip: self-mention, rate-limit anti-spam (MAX_MENTIONS_PER_MINUTE par paire sender:recipient).
   */
  async createCommentMentionNotificationsBatch(params: {
    commentId: string;
    postId: string;
    commenterId: string;
    mentionedUserIds: string[];
    commentExcerpt?: string;
  }): Promise<void> {
    if (params.mentionedUserIds.length === 0) return;

    const commenter = await this.prisma.user.findUnique({
      where: { id: params.commenterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!commenter) return;

    const content = params.commentExcerpt
      ? this.truncateMessage(params.commentExcerpt)
      : '';
    const langs = await this.resolveRecipientLangs(params.mentionedUserIds);

    const actorInfo = {
      id: params.commenterId,
      username: commenter.username,
      displayName: commenter.displayName,
      avatar: commenter.avatar,
    };

    const tasks: Array<Promise<unknown>> = [];

    for (const userId of params.mentionedUserIds) {
      if (userId === params.commenterId) continue;

      if (!this.shouldCreateMentionNotification(params.commenterId, userId)) {
        notificationLogger.info('Comment mention notification blocked (rate limit)', {
          commenterId: params.commenterId,
          recipientId: userId,
        });
        continue;
      }

      tasks.push(
        this.createNotification({
          userId,
          type: 'user_mentioned',
          priority: 'high',
          content,
          actor: actorInfo,
          lang: langs.get(userId) ?? 'fr',
          context: {
            postId: params.postId,
            commentId: params.commentId,
          },
          metadata: {
            action: 'view_post',
            entityType: 'comment',
            postId: params.postId,
            commentId: params.commentId,
            commentPreview: content,
          } as any,
        })
      );
    }

    // createNotification ne rejette jamais (catch interne + log du userId
    // exact) : attendre les tasks suffit, pas de gestion rejected ici.
    await Promise.allSettled(tasks);
  }

  // ==============================================
  // POST MENTION NOTIFICATIONS (Fix 2)
  // ==============================================

  /**
   * Envoie des notifications user_mentioned en batch pour les mentions dans un post.
   *
   * Mirrors createCommentMentionNotificationsBatch.
   * Skip: self-mention, rate-limit anti-spam (MAX_MENTIONS_PER_MINUTE per pair sender:recipient).
   */
  async createPostMentionNotificationsBatch(params: {
    postId: string;
    posterId: string;
    mentionedUserIds: string[];
    postExcerpt?: string;
  }): Promise<void> {
    if (params.mentionedUserIds.length === 0) return;

    const poster = await this.prisma.user.findUnique({
      where: { id: params.posterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!poster) return;

    const excerpt = params.postExcerpt
      ? this.truncateMessage(params.postExcerpt)
      : '';
    const langs = await this.resolveRecipientLangs(params.mentionedUserIds);

    const actorInfo = {
      id: params.posterId,
      username: poster.username,
      displayName: poster.displayName,
      avatar: poster.avatar,
    };

    const tasks: Array<Promise<unknown>> = [];

    for (const userId of params.mentionedUserIds) {
      if (userId === params.posterId) continue;

      if (!this.shouldCreateMentionNotification(params.posterId, userId)) {
        notificationLogger.info('Post mention notification blocked (rate limit)', {
          posterId: params.posterId,
          recipientId: userId,
        });
        continue;
      }

      tasks.push(
        this.createNotification({
          userId,
          type: 'user_mentioned',
          priority: 'high',
          content: excerpt || notificationString(langs.get(userId) ?? 'fr', 'mention'),
          actor: actorInfo,
          lang: langs.get(userId) ?? 'fr',
          context: {
            postId: params.postId,
          },
          metadata: {
            action: 'view_post',
            entityType: 'post',
            postId: params.postId,
            postPreview: excerpt,
          } as any,
        })
      );
    }

    // createNotification ne rejette jamais (catch interne + log du userId
    // exact) : attendre les tasks suffit, pas de gestion rejected ici.
    await Promise.allSettled(tasks);
  }

  // ==============================================
  // FRIEND CONTENT NOTIFICATIONS (Phase 4F)
  // ==============================================

  /**
   * Fan-out notifications to all friends of `authorId` when they publish new content.
   *
   * contentType mapping:
   *   STORY  → friend_new_story
   *   POST   → friend_new_post
   *   MOOD   → friend_new_mood
   *   STATUS → friend_new_mood  (lightweight/ephemeral; grouped with MOOD to avoid type proliferation)
   *
   * Rate-limit: none in v1. These are once-per-publish events so burst risk is low.
   * Aggregation: none in v1. Duplicate suppression (author vs friend) is enforced via excludeUserIds.
   *
   * Dedup with mentions: pass mentionedUserIds as `excludeUserIds`.
   * user_mentioned takes priority over friend_new_post for the same recipient.
   *
   * Cap: 500 friend rows max (mirrors createStoryCommentNotificationsBatch pattern).
   */
  async createFriendContentNotificationsBatch(params: {
    postId: string;
    authorId: string;
    contentType: 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
    excerpt?: string;
    /** Date de publication ISO du contenu (contexte « publié il y a … » côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
    /** Nature du média principal — affiché quand le contenu n'a pas de texte. */
    mediaType?: 'image' | 'video' | 'audio' | 'text';
    /**
     * User IDs to exclude from fan-out.
     * Pass mentionedUserIds so a friend who is also @mentioned only gets user_mentioned.
     */
    excludeUserIds?: string[];
    /** Post visibility — used to filter recipients (same rules as Socket.IO broadcast). */
    visibility?: string;
    /** User IDs list for ONLY/EXCEPT visibility modes. */
    visibilityUserIds?: string[];
  }): Promise<void> {
    // REEL est une variante de post : même type de notification (friend_new_post),
    // mais le contentType REEL est conservé dans la metadata pour l'affichage client.
    const typeMap: Record<'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL', 'friend_new_story' | 'friend_new_post' | 'friend_new_mood'> = {
      STORY: 'friend_new_story',
      POST: 'friend_new_post',
      MOOD: 'friend_new_mood',
      STATUS: 'friend_new_mood',
      REEL: 'friend_new_post',
    };
    const notificationType = typeMap[params.contentType];

    const author = await this.prisma.user.findUnique({
      where: { id: params.authorId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!author) return;

    const friendRequests = await this.prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: params.authorId }, { receiverId: params.authorId }],
      },
      select: { senderId: true, receiverId: true },
      take: 500,
      orderBy: { updatedAt: 'desc' },
    });

    const excludeSet = new Set(params.excludeUserIds ?? []);
    const excerpt = params.excerpt ? this.truncateMessage(params.excerpt) : '';
    // Vignette du contenu publié → rendue in-app + attachée au push iOS. Le
    // mediaType explicite de l'appelant prime ; sinon on le dérive du média.
    const media = await this.resolvePostMedia(params.postId);
    const mediaType = params.mediaType ?? media?.mediaType;

    const visibility = params.visibility ?? 'PUBLIC';
    const visibilityUserIds = params.visibilityUserIds ?? [];
    const visibilityUserIdSet = new Set(visibilityUserIds);

    if (visibility === 'PRIVATE') return;

    // Content : le wording « a publié une nouvelle … » est localisé par
    // destinataire ; le subtitle typé (« Nouvelle story » …) voyage en
    // APN-natif (restauré par le NSE) — les deux dans la langue du destinataire.
    const contentKeyByType: Record<'friend_new_story' | 'friend_new_post' | 'friend_new_mood', NotificationStringKey> = {
      friend_new_story: 'friend.story',
      friend_new_post: 'friend.post',
      friend_new_mood: 'friend.mood',
    };
    const contentKey = contentKeyByType[notificationType];

    const baseFriendIds = friendRequests
      .map(fr => (fr.senderId === params.authorId ? fr.receiverId : fr.senderId))
      .filter(id => id !== params.authorId && !excludeSet.has(id));

    let recipientIds: string[];
    if (visibility === 'COMMUNITY') {
      // Une action dans une communauté est OBLIGATOIREMENT notifiée à TOUS les
      // membres de la communauté (pas seulement aux contacts de l'auteur) —
      // miroir de SocialEventsHandler.getVisibilityFilteredRecipients pour que
      // notification et broadcast temps réel ciblent exactement le même set.
      const coMemberIds = await getCommunityCoMemberIds(this.prisma, params.authorId);
      recipientIds = coMemberIds.filter(id => id !== params.authorId && !excludeSet.has(id));
    } else if (visibility === 'ONLY') {
      recipientIds = visibilityUserIds.filter(id => id !== params.authorId && !excludeSet.has(id));
    } else if (visibility === 'EXCEPT') {
      recipientIds = baseFriendIds.filter(id => !visibilityUserIdSet.has(id));
    } else {
      recipientIds = baseFriendIds;
    }

    const uniqueRecipientIds = [...new Set(recipientIds)];
    const langs = await this.resolveRecipientLangs(uniqueRecipientIds);

    const actorInfo = {
      id: params.authorId,
      username: author.username,
      displayName: author.displayName,
      avatar: author.avatar,
    };

    const tasks: Array<Promise<unknown>> = [];

    for (const recipientId of uniqueRecipientIds) {
      const fLang = langs.get(recipientId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: recipientId,
          type: notificationType,
          priority: 'normal',
          content: excerpt || notificationString(fLang, contentKey),
          subtitle: notificationString(fLang, 'friend.subtitleNew', {
            postType: params.contentType === 'REEL' ? 'POST' : params.contentType,
          }),
          actor: actorInfo,
          lang: fLang,
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
            contentType: params.contentType,
            excerpt,
            ...(mediaType ? { mediaType } : {}),
            ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
          } as any,
        })
      );
    }

    // createNotification ne rejette jamais (catch interne + log du userId
    // exact) : attendre les tasks suffit, pas de gestion rejected ici.
    await Promise.allSettled(tasks);
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
    const [newMember, conversation, memberCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.newMemberUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
      this.prisma.participant.count({
        where: { conversationId: params.conversationId },
      }),
    ]);

    if (!newMember) return null;

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_joined',
      priority: 'low',
      content: 'Nouveau membre',

      actor: {
        id: params.newMemberUserId,
        username: newMember.username,
        displayName: newMember.displayName,
        avatar: newMember.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },

      metadata: {
        action: 'view_conversation',
        memberCount,
        isMember: true,
        joinMethod: params.joinMethod,
      },
    });
  }

  // ==============================================
  // TRANSLATION_READY
  // ==============================================

  async createTranslationReadyNotification(params: {
    recipientUserId: string;
    messageId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'translation_ready',
      priority: 'low',
      content: 'Traduction disponible',

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
      },
    });
  }

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
  }): Promise<Notification | null> {
    const [replier, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.replierUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
    ]);

    if (!replier) return null;

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'message_reply',
      priority: 'normal',
      content: params.messagePreview,
      collapseId: `conv-${params.conversationId}`,

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
    systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
    priority?: NotificationPriority;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: 'system',
      priority: params.priority || 'normal',
      content: params.content,

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
    const reactPostType = params.postType === 'STORY' ? 'STORY' : params.postType === 'STATUS' ? 'STATUS' : 'POST';
    const subtitlePostType = params.postType ?? 'POST';

    // Détail du contenu réagi : extrait texte si présent, sinon vignette/résumé
    // média (« Votre story · 📷 Photo ») — le destinataire identifie QUEL
    // contenu sans ouvrir l'app, et le push iOS attache la miniature.
    const trimmedPreview = params.postPreview?.trim() ?? '';
    const media = await this.resolvePostMedia(params.postId);
    const subtitle = this.buildOwnerSubtitleWithDetail(lang, subtitlePostType, {
      textPreview: trimmedPreview,
      mediaType: media?.mediaType,
    });

    return this.createNotification({
      userId: params.postAuthorId,
      type,
      priority: 'normal',
      content: notificationString(lang, 'reaction.post', { emoji: params.emoji, postType: reactPostType }),
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
    const media = await this.resolvePostMedia(params.postId);
    const subtitle = this.buildOwnerSubtitleWithDetail(lang, params.postType ?? 'POST', {
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
    const media = await this.resolvePostMedia(params.originalPostId);
    const subtitle = trimmedPostPreview !== ''
      ? `« ${this.truncateMessage(trimmedPostPreview)} »`
      : (this.mediaSummaryString(lang, media?.mediaType) || undefined);

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_repost',
      priority: 'normal',
      content: notificationString(lang, 'repost', {
        postType: params.postType === 'REEL' ? 'POST' : (params.postType ?? 'POST'),
      }),
      ...(subtitle ? { subtitle } : {}),
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
    const media = await this.resolvePostMedia(params.postId);

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
  }): Promise<Notification | null> {
    if (params.actorId === params.commentAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const lang = await this.resolveRecipientLang(params.commentAuthorId);
    const trimmedPreview = params.commentPreview?.trim() ?? '';
    const subtitle = trimmedPreview !== ''
      ? `« ${this.truncateMessage(trimmedPreview)} »`
      : undefined;
    // Vignette du post portant le commentaire → attachée au push iOS.
    const media = await this.resolvePostMedia(params.postId);

    return this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_like',
      priority: 'low',
      content: notificationString(lang, 'reaction.comment', { emoji: params.emoji }),
      ...(subtitle ? { subtitle } : {}),
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
      select: { systemLanguage: true }
    });
    const lang = user?.systemLanguage ?? 'fr';
    const locale = user?.systemLanguage === 'en' ? 'en-US' : 'fr-FR';

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
      const [unread, total] = await Promise.all([
        this.prisma.notification.count({ where: { userId, readAt: null } }),
        this.prisma.notification.count({ where: { userId } }),
      ]);
      this.io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_COUNTS, { unread, total });
    } catch (error) {
      notificationLogger.error('Failed to emit notification counts', { error, userId });
    }
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
    if (!message) return '';

    const words = message.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return message;
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }

  /**
   * Résout le 1er média d'un post → nature + miniature pour enrichir la
   * notification : la ligne in-app rend la vignette, le push iOS l'attache
   * (UNNotificationAttachment). Pour image on attache le fichier lui-même ;
   * pour vidéo/audio on attache la miniature générée (toujours une image).
   *
   * Défensif : retourne `null` (au lieu de jeter) si le modèle `postMedia`
   * est absent (tests) ou si le post n'a pas de média visuel — l'appelant
   * retombe alors sur le rendu texte seul.
   */
  private async resolvePostMedia(postId: string): Promise<{
    mediaType: 'image' | 'video' | 'audio';
    thumbnailUrl?: string;
    thumbnailMimeType?: string;
  } | null> {
    try {
      const media = await this.prisma.postMedia.findFirst({
        where: { postId },
        orderBy: { order: 'asc' },
        select: { mimeType: true, fileUrl: true, thumbnailUrl: true },
      });
      if (!media) return null;

      const mime = (media.mimeType ?? '').toLowerCase();
      const mediaType = mime.startsWith('image/') ? 'image'
        : mime.startsWith('video/') ? 'video'
          : mime.startsWith('audio/') ? 'audio'
            : null;
      if (!mediaType) return null;

      // Vignette poussée au client/iOS : toujours une image téléchargeable.
      // Image → le fichier ; vidéo/audio → la miniature générée (si présente).
      const rawThumb = mediaType === 'image'
        ? (media.fileUrl || media.thumbnailUrl || undefined)
        : (media.thumbnailUrl || undefined);
      const thumbnailUrl = rawThumb ? this.toPublicMediaUrl(rawThumb) : undefined;
      const thumbnailMimeType = thumbnailUrl
        ? (mediaType === 'image' ? (media.mimeType ?? 'image/jpeg') : 'image/jpeg')
        : undefined;

      return { mediaType, thumbnailUrl, thumbnailMimeType };
    } catch {
      return null;
    }
  }

  /** Absolutise une URL média relative pour qu'elle soit téléchargeable par
   *  l'extension de notification iOS (qui n'a pas de base configurée). */
  private toPublicMediaUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    const base = (process.env.API_PUBLIC_URL || 'https://gate.meeshy.me').replace(/\/$/, '');
    return `${url.startsWith('/') ? base : `${base}/`}${url}`;
  }

  /**
   * Sous-titre « Votre {entité} » enrichi du détail du contenu visé : l'extrait
   * texte (« Votre story : « … » ») ou, à défaut, un résumé média localisé
   * (« Votre story · 📷 Photo »). Source unique pour réactions / partages —
   * aligné sur le wording des commentaires. SANS date (le client l'append).
   */
  private buildOwnerSubtitleWithDetail(
    lang: string,
    postType: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
    detail: { textPreview?: string; mediaType?: 'image' | 'video' | 'audio' },
  ): string {
    const label = notificationString(lang, 'comment.subtitleOwner', { postType });
    const text = detail.textPreview?.trim();
    if (text) return `${label} : « ${this.truncateMessage(text)} »`;
    const mediaSummary = this.mediaSummaryString(lang, detail.mediaType);
    return mediaSummary ? `${label} · ${mediaSummary}` : label;
  }

  /** Résumé média localisé (« 📷 Photo » / « 🎬 Vidéo » / « 🎵 Audio ») ou ''. */
  private mediaSummaryString(lang: string, mediaType?: 'image' | 'video' | 'audio'): string {
    const key: NotificationStringKey | null = mediaType === 'image' ? 'attachment.photo'
      : mediaType === 'video' ? 'attachment.video'
        : mediaType === 'audio' ? 'attachment.audio'
          : null;
    return key ? notificationString(lang, key) : '';
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
    const where: any = { userId: params.userId };
    if (params.unreadOnly) {
      where.isRead = false;
    }

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
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      const formatted = this.formatNotification(notification);
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
    contextKey: 'conversationId' | 'postId',
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
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      // Fetch userId before deletion so we can emit counts update after
      const existing = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: { userId: true },
      });

      await this.prisma.notification.delete({
        where: { id: notificationId },
      });

      if (existing?.userId) {
        this.emitCountsUpdate(existing.userId).catch(() => {});
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

  // ==============================================
  // SOCKET.IO
  // ==============================================

  /**
   * Configure Socket.IO pour les notifications temps réel
   */
  setSocketIO(io: SocketIOServer, _userSocketsMap?: Map<string, Set<string>>): void {
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
