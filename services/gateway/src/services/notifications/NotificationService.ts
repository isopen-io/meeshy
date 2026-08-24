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
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  resolveUserLanguage,
  resolveUserLanguagesOrdered,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';
import { formatClock } from '@meeshy/shared/utils/duration-format';
import { notificationString, buildNotificationDisplay, formatFileSizeI18n, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger, securityLogger } from '../../utils/logger-enhanced';
import { SecuritySanitizer } from '../../utils/sanitize';
import { filterMutedRecipients } from './mutedRecipients';
import { visibleNotificationsWhere } from './visibleNotificationsWhere';
import type { ServerEmitIOWithRooms } from '../../socketio/serverEmit';
import { PushNotificationService } from '../PushNotificationService';
import { EmailService } from '../EmailService';
import { getCommunityCoMemberIds } from '../posts/communityVisibility';
import { filterPostConsumers } from '../posts/postAudience';
import { loadPostAcl, canUserConsumePost } from '../posts/postVisibility';

function formatDuration(ms: number): string {
  return formatClock(Math.round(ms / 1000));
}

/**
 * La SOURCE du Prisme d'un message : ses traductions SERVABLES sur le canal
 * push, plus sa langue d'origine — qui concourt à son propre rang (règle #3) et
 * n'est donc jamais un court-circuit.
 *
 * Elle ne dépend PAS du destinataire : un même message se relit une fois pour
 * tout un éventail, et c'est la DESCENTE qui est par lecteur.
 */
export type MessagePrismSource = {
  readonly translations: Readonly<Record<string, string>>;
  readonly originalLanguage: string | null;
};

const EMPTY_PRISM_SOURCE: MessagePrismSource = { translations: {}, originalLanguage: null };

/**
 * Ce que l'aperçu composé par un éventail EST — donc ce qui le traduit.
 *
 * `Message.translations` ne traduit que `Message.content` : la question « peut-on
 * substituer une traduction dans ce texte ? » n'a de réponse qu'au site qui a
 * COMPOSÉ l'aperçu, jamais chez le résolveur, qui verrait trois textes de même
 * type. Le cycle 122 la posait par un booléen (`previewIsMessageContent`) ; le
 * cycle 123 en fait un type SOMME, pour une raison mesurée : la transcription
 * d'un vocal n'est pas « non substituable », elle est substituable par une AUTRE
 * carte (`MessageAttachment.translations`). Un booléen et une source séparés
 * pourraient se contredire ; ces trois formes s'excluent par construction.
 *
 *  - `message-content` — cas nominal : l'aperçu EST le contenu du message ;
 *  - `protected-placeholder` — éphémère / vue unique / flouté / chiffré :
 *    l'aperçu est un placeholder. Rien ne le traduit, et rien de la traduction
 *    du texte masqué ne doit partir sur le fil (cycle 123) ;
 *  - `transcript` — la transcription d'un vocal, avec SA carte.
 */
export type PreviewPrismBasis =
  | { readonly kind: 'message-content' }
  | { readonly kind: 'protected-placeholder' }
  | { readonly kind: 'transcript'; readonly source: MessagePrismSource };

const MESSAGE_CONTENT_BASIS: PreviewPrismBasis = { kind: 'message-content' };

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
 * Resolve the best available name for a notification actor:
 * displayName first, then username, then a neutral fallback.
 */
function resolveActorName(actor: NotificationActor | undefined): string {
  return actor?.displayName?.trim() || actor?.username?.trim() || 'Meeshy';
}

/**
 * GW4 — native iOS category set by the PRODUCER (the NSE `applyCategory`
 * stays as fallback for legacy payloads). Mirrors the NSE type mapping with
 * one deliberate divergence: the CALL family is split into
 * `MEESHY_CALL_INCOMING` (answer/decline) vs `MEESHY_CALL_MISSED`
 * (callback/view) so a finished call never shows an "Answer" action.
 * Unknown types return undefined — no category means no misleading actions.
 */
export function pushCategoryForNotificationType(type: NotificationType): string | undefined {
  switch (type) {
    case 'new_message':
    case 'message_reply':
    case 'reply':
    case 'message_forwarded':
    case 'message_reaction':
    case 'reaction':
    case 'new_conversation':
    case 'new_conversation_direct':
    case 'new_conversation_group':
    case 'added_to_conversation':
      return 'MEESHY_MESSAGE';
    case 'mention':
    case 'user_mentioned':
      return 'MEESHY_MENTION';
    case 'friend_request':
    case 'contact_request':
      return 'MEESHY_FRIEND_REQUEST';
    case 'post_like':
    case 'post_comment':
    case 'post_repost':
    case 'story_reaction':
    case 'status_reaction':
    case 'comment_like':
    case 'comment_reply':
    case 'comment_reaction':
    case 'story_new_comment':
    case 'story_thread_reply':
    case 'friend_story_comment':
    case 'friend_new_story':
    case 'friend_new_post':
    case 'friend_new_mood':
      return 'MEESHY_SOCIAL';
    case 'incoming_call':
      return 'MEESHY_CALL_INCOMING';
    case 'missed_call':
    case 'call_ended':
    case 'call_declined':
    case 'call_recording_ready':
      return 'MEESHY_CALL_MISSED';
    default:
      return undefined;
  }
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

/** Longueur au-delà de laquelle une bannière iOS 3 lignes coupe de toute façon. */
const PUSH_SUBTITLE_MAX_LENGTH = 120;

export function buildPushHeader(input: {
  type: string;
  customTitle?: string;
  actor?: NotificationActor;
  context: {
    conversationType?: string | null;
    conversationTitle?: string | null;
  };
  /**
   * Fragment d'action localisé, SANS l'acteur (« a commenté un réel ») —
   * `NotificationDisplay.action`. Présent pour les notifications sociales,
   * `null` pour les messages / appels / système.
   *
   * Il existe parce qu'iOS réécrit le titre d'une Communication Notification
   * avec le `displayName` de l'`INPerson` expéditeur : le titre riche persisté
   * n'atteindrait jamais l'écran. L'action passe donc par le subtitle.
   */
  action?: string | null;
  /** Sous-titre d'entité persisté (cible du geste), quand la ligne en porte un. */
  entitySubtitle?: string | null;
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
  const conversationSubtitle = isGroupMessage && conversationTitle !== ''
    ? conversationTitle
    : undefined;

  // Ordre : action sociale → cible explicite → nom de conversation.
  //
  // L'action se suffit à elle-même : l'auteur du contenu y est déjà fusionné
  // (« a commenté un réel DE WINDIE NH ») et l'aperçu du contenu visé occupe
  // le CORPS. Y adjoindre la cible reproduirait, sur trois lignes, la même
  // information écrite deux fois — le défaut signalé sur les réactions.
  const action = input.action?.trim() || '';
  const entity = input.entitySubtitle?.trim() || '';
  const subtitle = (action || entity || conversationSubtitle || '').slice(0, PUSH_SUBTITLE_MAX_LENGTH)
    || undefined;

  return { title, subtitle };
}

/**
 * La bannière ne dit jamais deux fois la même phrase.
 *
 * `buildPushHeader` promeut l'ACTION en subtitle ; le corps du push est le
 * `content` PERSISTÉ. Les deux sont légitimes et, la plupart du temps,
 * différents — l'action au-dessus, l'aperçu du contenu en dessous. Mais pour
 * une story / un post / un réel SANS excerpt, `content` retombe justement sur
 * la phrase d'action (« a publié une nouvelle story »), parce que la ligne de
 * la LISTE in-app n'a pas de sous-titre pour la porter et ne doit jamais être
 * vide — invariant explicite, tenu par
 * `NotificationService.friendcontent.test.ts`. La bannière affichait alors la
 * même phrase deux fois (signalé par le porteur produit le 2026-08-22).
 *
 * Le dédoublonnage se fait ICI, au seul point où les deux lignes se
 * rencontrent : ni le contenu persisté (la liste en a besoin) ni
 * `buildPushHeader` (le toast Socket.IO consomme son subtitle) ne bougent.
 *
 * **C'est le SUBTITLE qui tombe, jamais le corps** : le corps part aussi vers
 * FCM (bloc `notification`) et WebPush, où le subtitle n'existe pas — le vider
 * exposerait trois plateformes à une alerte sans texte pour ne corriger qu'iOS.
 *
 * Seul le doublon EXACT (aux espaces de bord près) est supprimé : le corps est
 * tronqué à 200 et le subtitle à 120, donc un subtitle qui n'est qu'un préfixe
 * du corps porte peut-être une information de plus — le faire disparaître
 * cacherait du texte au lieu d'en dédoublonner.
 *
 * Exporté pour test unitaire — la fonction est pure.
 */
export function dedupePushSubtitle(input: {
  subtitle?: string;
  body: string;
}): string | undefined {
  const subtitle = input.subtitle?.trim();
  if (!subtitle) return undefined;
  return subtitle === input.body.trim() ? undefined : input.subtitle;
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
 * L'identité d'acteur qu'une notification affiche, résolue par l'APPELANT.
 *
 * Les trois créateurs ci-dessous rechargeaient l'expéditeur par
 * `user.findUnique({ id: senderId })` et abandonnaient sur `null`. Deux
 * conséquences, corrigées par ce paramètre :
 *
 *  - un participant ANONYME n'a pas de ligne `User` (`Participant.userId` est
 *    nullable), donc la lecture rendait toujours `null` : un anonyme ne
 *    notifiait personne, ni par lien de partage ni par le chemin socket. Son
 *    `displayName`/`avatar` de participant est la seule identité qui existe —
 *    et elle suffit à nommer une notification ;
 *  - la lecture était refaite PAR DESTINATAIRE alors que l'appelant venait de
 *    la faire une fois pour tout l'éventail.
 *
 * Optionnel : sans lui, le comportement historique (lecture + abandon sur
 * absence) est conservé à l'identique pour tous les appelants existants.
 */
export type NotificationActorProfile = {
  username: string;
  displayName: string | null;
  avatar: string | null;
};

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
    if (params.fileSize) details.push(formatFileSizeI18n(lang, params.fileSize));
    const word = notificationString(lang, 'attachment.audio');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  if (params.type === 'video') {
    if (params.duration) details.push(formatDuration(params.duration));
    if (params.fileSize) details.push(formatFileSizeI18n(lang, params.fileSize));
    const word = notificationString(lang, 'attachment.video');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  if (params.type === 'image') {
    if (params.width && params.height) details.push(`${params.width}×${params.height}`);
    if (params.fileSize) details.push(formatFileSizeI18n(lang, params.fileSize));
    const word = notificationString(lang, 'attachment.photo');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }

  const ext = extractExtension(params.filename);
  const docLabel = ext ? formatDocumentLabel(ext) : notificationString(lang, 'attachment.document');
  return params.fileSize ? `${docLabel} · ${formatFileSizeI18n(lang, params.fileSize)}` : docLabel;
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

/**
 * Borne appliquée à chaque lecture de graphe qui alimente un fan-out de
 * notification. Elle tient le coût sur un post viral ou un auteur à très grand
 * carnet — et elle est nommée pour que le seuil de saturation soit LE MÊME que
 * celui écrit dans le `take` : une constante partagée ne peut pas dériver du
 * test qui la surveille.
 *
 * Les requêtes prennent `FANOUT_ROW_CAP + 1`. La ligne excédentaire est un
 * TÉMOIN, jamais un destinataire : elle est lue, comptée, puis jetée par un
 * `slice`, de sorte que la borne de DIFFUSION reste à sa valeur pendant que sa
 * saturation devient dicible. Sans elle, il faudrait déduire la troncature de
 * « la requête a rendu autant de lignes que la borne » — ce qui déclare tronqué
 * un seau de très exactement `FANOUT_ROW_CAP` engagés, alors qu'il est complet,
 * et fait crier au loup à chaque publication d'un auteur à exactement 500 amis.
 *
 * Portée du témoin : sur une requête sans `distinct` (les amitiés) il est EXACT —
 * une 501e ligne existe si et seulement si la base en avait plus de 500. Sur une
 * requête `distinct` (commentaires, réactions) il reste un signal SUFFISANT : il
 * ne se déclenche jamais à tort, mais il peut se taire sur une troncature que la
 * déduplication a repliée en deçà de la borne. Le seau où la troncature est de
 * loin la plus probable — un auteur à plus de 500 amis est banal, un post à plus
 * de 500 commentateurs distincts ne l'est pas — est celui où le compte est exact.
 */
const FANOUT_ROW_CAP = 500;

/** Les trois lectures bornées qui composent les seaux d'un fan-out de fil. */
type FanoutBucket = 'previousComments' | 'friendRequests' | 'reactors';

/**
 * Les trois seaux d'un fan-out de commentaire, et ce qu'on n'a PAS pu lire.
 *
 * `truncatedBuckets` distingue « ce seau est complet » de « ce seau s'arrête à
 * la borne » — deux listes identiques en apparence, dont une seule dit la
 * vérité sur l'audience réelle. Sans ce champ, un fan-out silencieusement
 * tronqué se lit exactement comme un fan-out exhaustif.
 */
type StoryNotificationRecipients = {
  authorId: string;
  friendIds: string[];
  previousCommenterIds: string[];
  truncatedBuckets: FanoutBucket[];
};

/**
 * La part d'une notification `member_joined` qui ne dépend PAS du destinataire.
 * Lue une fois, servie à toute l'audience — c'est ce qui distingue une arrivée
 * (un événement, N destinataires) d'une boucle de N notifications distinctes.
 */
type MemberJoinedSnapshot = {
  readonly newMember: { username: string; displayName: string | null; avatar: string | null };
  readonly conversation: { title: string | null; type: string } | null;
  readonly memberCount: number;
};

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
   * Relire la source du Prisme d'un message pour les éventails dont la lecture
   * n'est PAS un gate d'éligibilité — la mention et la réponse, qui tiennent
   * leur échéance de l'appelant (`messageExpiresAt`).
   *
   * Fail-OPEN par décision : une lecture en échec rend une source vide, donc
   * une bannière sans traduction, jamais une bannière supprimée. Même arbitrage
   * que `loadNotificationPrefs` et `filterMutedRecipients` — la traduction est
   * un confort, l'annonce du message une obligation de livraison.
   */
  private async loadMessagePrismSource(messageId: string): Promise<MessagePrismSource> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { translations: true, originalLanguage: true },
      });
      return {
        translations: this.pushableTranslations(message?.translations),
        originalLanguage: message?.originalLanguage ?? null,
      };
    } catch (error) {
      notificationLogger.error('Relecture du Prisme en échec — bannière servie sans traduction', {
        error,
        messageId,
      });
      return EMPTY_PRISM_SOURCE;
    }
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
      translatedContent: matched.text.substring(0, PUSHED_TRANSLATION_MAX_CHARS),
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

  /**
   * Vérifie si le mode DND est actuellement actif.
   * GW7 — délègue au helper PARTAGÉ tz-aware `isWithinDnd` (packages/shared)
   * — même implémentation que PushNotificationService.isPushAllowed, la
   * fenêtre est évaluée dans l'heure locale utilisateur (dndUtcOffsetMinutes).
   */
  private isDNDActive(prefs: NotifPrefs): boolean {
    return isWithinDnd(prefs);
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
      const persistedTitle = display.title
        ?? ((params.title && params.title.trim() !== '') ? params.title.trim().slice(0, 160) : null);

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
            ? params.content.substring(0, 200)
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
                  attachmentUrl: params.context.firstAttachmentUrl || '',
                  attachmentMimeType: params.context.firstAttachmentMimeType || '',
                  attachmentDurationMs: params.context.firstAttachmentDurationMs != null
                    ? String(params.context.firstAttachmentDurationMs)
                    : '',
                  encryptedContent: params.context.encryptedContent || '',
                  ...(params.context.translatedContent ? {
                    translatedContent: params.context.translatedContent,
                    translatedLanguage: params.context.translatedLanguage || '',
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
          const { encryptedContent: _ec, ...dataWithoutContentFields } = dataWithoutTranslation;
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
            // GW7 — delivery.pushSent tracking : flippé dès qu'au moins un
            // device a reçu le push (le champ était initialisé false et
            // jamais mis à jour — tracking multi-canal mort).
            const delivered = Array.isArray(results) && results.some(r => r?.success);
            if (!delivered) return;
            try {
              // RE-LIRE delivery juste avant d'écrire : un autre writer (digest
              // email quotidien) a pu poser emailSent:true entre-temps — le
              // snapshot de création { emailSent: false } est périmé.
              const current = await this.prisma.notification.findUnique({
                where: { id: notification.id },
                select: { delivery: true },
              });
              const liveDelivery = ((current as { delivery?: unknown } | null)?.delivery ?? {}) as Record<string, unknown>;
              await this.prisma.notification.update({
                where: { id: notification.id },
                data: { delivery: { ...liveDelivery, pushSent: true } as any },
              });
            } catch (error) {
              notificationLogger.error('pushSent flip failed', { error, notificationId: notification.id });
            }
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
                } else if (notifPrefs?.emailEnabled !== false) {
                  // Social / general notification (mention, missed call, …):
                  // neutral notification email, never the security template.
                  // Gated on emailEnabled comme le digest et les broadcasts —
                  // seules les alertes de sécurité ci-dessus passent toujours.
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
    // milliseconds. If the sender soft-deletes / burns / lets the message
    // expire in that window we MUST NOT leak the original content via the
    // banner. Refetch the live state right before the fan-out and bail when
    // the message is no longer eligible.
    // GW5 — the same refetch feeds the NSE persistence fields: authoritative
    // createdAt/messageType plus any translation already produced by the
    // pipeline at fan-out time (Message.translations JSON, keyed by language).
    const liveMessage = await this.prisma.message.findUnique({
      where: { id: params.messageId },
      select: { deletedAt: true, expiresAt: true, isViewOnce: true, viewOnceCount: true, createdAt: true, messageType: true, translations: true, originalLanguage: true },
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

    // Cycle 122 — le corps AFFICHÉ descend le Prisme, pas seulement les champs
    // de service ci-dessus : c'est lui que les trois plateformes rendent.
    const content = buildMessageNotificationBodyI18n(recipientLang, {
      messagePreview: this.servedPreview({
        preview: params.messagePreview,
        translation: servedTranslation,
      }),
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
        firstAttachmentUrl: params.firstAttachmentUrl,
        firstAttachmentMimeType: params.firstAttachmentMimeType,
        firstAttachmentDurationMs: params.firstAttachmentDuration != null
          ? Math.round(params.firstAttachmentDuration * 1000)
          : undefined,
        encryptedContent: params.encryptedContent,
        notificationLocKey: params.notificationLocKey,
        // GW5 — champs de persistance NSE (timestamp serveur + type + Prisme).
        messageCreatedAt: liveMessage.createdAt instanceof Date ? liveMessage.createdAt.toISOString() : undefined,
        messageType: liveMessage.messageType ?? undefined,
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
    prismSource?: MessagePrismSource;
    /** Cf. `createMessageNotification.previewBasis`. */
    previewBasis?: PreviewPrismBasis;
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

    // Cycle 123 — UNE descente, deux projections : le corps et les champs du
    // fil. Cf. `createMessageNotification`.
    const servedTranslation = this.prismTranslation(
      this.previewPrismSource({
        basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
        messageSource: prismSource,
      }),
      prism.ordered
    );

    return this.createNotification({
      userId: params.mentionedUserId,
      type: 'user_mentioned',
      priority: 'high',
      // Cycle 122 — le corps AFFICHÉ porte le texte du Prisme : c'est lui que
      // les trois plateformes rendent, pas les champs de service du fil push.
      content: this.servedPreview({
        preview: params.messagePreview,
        translation: servedTranslation,
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

    const results = await Promise.all(
      eligibleUserIds.map(userId =>
        this.createMentionNotification({
          mentionedUserId: userId,
          mentionerUserId: commonData.senderId,
          messageId: commonData.messageId,
          conversationId: commonData.conversationId,
          messagePreview: commonData.messageContent,
          senderProfile: commonData.senderProfile,
          messageExpiresAt: commonData.messageExpiresAt,
          previewBasis: commonData.previewBasis,
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
      ? message.content.length > 100
        ? message.content.substring(0, 100) + '…'
        : message.content
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
  ): Promise<StoryNotificationRecipients> {
    // Cap at FANOUT_ROW_CAP rows to bound fan-out cost on viral posts.
    // Future: large posts should use a background queue for fan-out.
    //
    // Les IDs qui ne seront JAMAIS notifiés sortent PAR LA REQUÊTE, pas par un
    // filtre en aval : sous la borne, une ligne écartée après coup a quand même
    // consommé sa place. Et l'auteur qui répond à chacun de ses commentateurs est
    // l'engagé le plus prolifique de son propre fil — ses réponses évinçaient donc
    // des destinataires réels du seau, en silence.
    const excludedEngagerIds = Array.from(new Set([commenterId, authorId]));

    const [previousComments, friendRequests, reactors] = await Promise.all([
      this.prisma.postComment.findMany({
        where: {
          postId,
          deletedAt: null,
          authorId: { notIn: excludedEngagerIds },
        },
        distinct: ['authorId'],
        select: { authorId: true },
        take: FANOUT_ROW_CAP + 1,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: authorId }, { receiverId: authorId }],
        },
        select: { senderId: true, receiverId: true },
        take: FANOUT_ROW_CAP + 1,
        orderBy: { updatedAt: 'desc' },
      }),
      // Include post reactors as thread-engaged participants (same bucket as prior commenters)
      this.prisma.postReaction.findMany({
        where: {
          postId,
          userId: { notIn: excludedEngagerIds },
        },
        distinct: ['userId'],
        select: { userId: true },
        take: FANOUT_ROW_CAP + 1,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Une liste rendue à la borne exacte est INDISCERNABLE d'une liste
    // complète : le seau paraît entier, et le destinataire au-delà de la borne
    // n'apprend jamais rien. La saturation est donc nommée dans le retour — pour
    // que l'appelant puisse en tenir compte — et consignée ici, pour qu'elle
    // soit observable ailleurs que dans le silence d'un utilisateur.
    //
    // Le verdict se lit sur la LIGNE TÉMOIN (`take` = borne + 1), pas sur
    // « autant de lignes que la borne » : un seau qui compte exactement
    // `FANOUT_ROW_CAP` engagés est COMPLET, et le déclarer tronqué ferait crier
    // au loup à chaque publication d'un auteur à exactement 500 amis. C'est ce
    // que la note ci-dessus demande — distinguer « complet » de « s'arrête à la
    // borne » — et `>=` échouait précisément au point où les deux se touchent.
    const truncatedBuckets = [
      previousComments.length > FANOUT_ROW_CAP ? 'previousComments' as const : null,
      friendRequests.length > FANOUT_ROW_CAP ? 'friendRequests' as const : null,
      reactors.length > FANOUT_ROW_CAP ? 'reactors' as const : null,
    ].filter((bucket): bucket is FanoutBucket => bucket !== null);

    if (truncatedBuckets.length > 0) {
      notificationLogger.warn('Fan-out de commentaire tronqué à la borne', {
        postId,
        authorId,
        buckets: truncatedBuckets,
        cap: FANOUT_ROW_CAP,
      });
    }

    // Le `notIn` plus haut est ce qui protège le BUDGET ; les `filter` ci-dessous
    // restent la POSTCONDITION de la méthode. Deux rôles distincts, pas une garde
    // en double : la requête décide qui coûte une ligne, la méthode répond de ce
    // qu'elle rend — « ni l'auteur ni le commentateur ne sortent d'ici » tient
    // quelle que soit la clause `where` du jour.
    const isNotifiableEngager = (id: string): boolean =>
      id !== authorId && id !== commenterId;

    const rawPreviousCommenterIds = previousComments
      .slice(0, FANOUT_ROW_CAP)
      .map((c: { authorId: string }) => c.authorId)
      .filter(isNotifiableEngager);

    // Merge reactor user IDs into the "thread engagement" bucket.
    // Reactors who also commented are deduplicated via Set — they still appear only once.
    const reactorIds = reactors
      .slice(0, FANOUT_ROW_CAP)
      .map((r: { userId: string }) => r.userId)
      .filter(isNotifiableEngager);

    const previousCommenterIds = Array.from(
      new Set([...rawPreviousCommenterIds, ...reactorIds])
    );

    const previousCommenterSet = new Set(previousCommenterIds);

    // L'auteur ancre CHAQUE ligne d'amitié — l'écarter par la requête est
    // impossible ici : sa présence est structurelle, pas budgétaire.
    const allFriendIds = friendRequests
      .slice(0, FANOUT_ROW_CAP)
      .flatMap((fr: { senderId: string; receiverId: string }) => [fr.senderId, fr.receiverId])
      .filter(isNotifiableEngager);

    const friendIds = Array.from(new Set(allFriendIds)).filter(
      (id: string) => !previousCommenterSet.has(id)
    );

    return { authorId, friendIds, previousCommenterIds, truncatedBuckets };
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
    /**
     * Visibilité du post commenté. Filtre les buckets fan-out (thread + amis)
     * exactement comme `SocialEventsHandler.getVisibilityFilteredRecipients` et
     * `createFriendContentNotificationsBatch` : un post ONLY/EXCEPT/PRIVATE/
     * COMMUNITY ne doit JAMAIS notifier (extrait de commentaire inclus) un
     * utilisateur qui n'a pas le droit de le voir.
     *
     * REQUIS — annoncé par les cycles 28, 29 et 30, qui l'avaient laissé
     * `visibility?` à défaut `PUBLIC`. Une garde qu'on désarme en omettant un
     * paramètre optionnel n'est pas une garde : rien ne signalait l'oubli, ni
     * au build ni à l'exécution. Le prix se paie une fois, à la déclaration.
     */
    visibility: string | null | undefined;
    /** Liste d'IDs pour les modes ONLY (autorisés) / EXCEPT (exclus). */
    visibilityUserIds?: string[];
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

    // La saturation des seaux est consignée par `getStoryNotificationRecipients`
    // lui-même — là où elle est constatée, donc pour TOUS ses appelants et pas
    // seulement pour celui-ci.
    const { authorId, friendIds, previousCommenterIds } =
      await this.getStoryNotificationRecipients(
        params.postId,
        params.storyAuthorId,
        params.commenterId
      );

    // Filtre de visibilité — miroir de SocialEventsHandler.getVisibilityFilteredRecipients
    // et de createFriendContentNotificationsBatch : un post restreint ne doit jamais
    // fanout un commentaire (extrait inclus) vers un utilisateur qui ne peut pas le voir.
    // L'auteur (bucket STORY_NEW_COMMENT) est exempt — il possède le post.
    const visibility = params.visibility;
    const visibilityUserIdSet = new Set(params.visibilityUserIds ?? []);
    const coMemberIds = visibility === 'COMMUNITY'
      ? new Set(await getCommunityCoMemberIds(this.prisma, params.storyAuthorId))
      : null;
    // Ne s'applique QU'À `friendIds`, une sortie d'ÉNUMÉRATEUR : ces gens SONT
    // les amis actuels de l'auteur, dépliés de son graphe quelques lignes plus
    // haut. Leur amitié n'est donc pas à re-vérifier, et seules les listes
    // nominatives peuvent encore les écarter. Un post COMMUNITY ne passe jamais
    // ici : il a sa propre branche, adossée au graphe communauté.
    const canSeeAsFriend = (userId: string): boolean => {
      switch (visibility) {
        case 'PRIVATE': return false;
        case 'ONLY': return visibilityUserIdSet.has(userId);
        case 'EXCEPT': return !visibilityUserIdSet.has(userId);
        default: return true; // PUBLIC / FRIENDS — amis par construction
      }
    };
    // Un post COMMUNITY fanout aux co-membres (pas aux amis de l'auteur) — le graphe
    // amis et le graphe communauté diffèrent ; on cible exactement le même set que le
    // broadcast temps réel, buckets thread/auteur/commenter restant disjoints.
    const friendAudience = (
      visibility === 'COMMUNITY'
        ? [...coMemberIds!].filter(id =>
            id !== params.storyAuthorId &&
            id !== params.commenterId &&
            !previousCommenterIds.includes(id))
        : friendIds.filter(canSeeAsFriend)
    );
    // `previousCommenterIds` (commentateurs antérieurs ∪ réacteurs) n'est PAS une
    // sortie d'énumérateur : c'est un ensemble arbitraire au regard de l'audience
    // du moment. Ils y étaient admis quand ils ont engagé le post ; une
    // dés-amitié ou une édition de visibilité les en sort sans toucher à leur
    // commentaire. Il leur faut donc un test d'ADMISSION, pas la table locale
    // ci-dessus qui rendait `true` sur FRIENDS/EXCEPT sans lire aucun graphe.
    // Même audience que `canNotifyAboutPost`, qui garde la notification unitaire
    // de cette même population depuis le cycle 30.
    //
    // Sur un post COMMUNITY, les co-membres sont donc résolus une seconde fois
    // (deux requêtes bornées de plus, sur un chemin déjà détaché de la réponse
    // HTTP). C'est le prix assumé pour ne PAS refiltrer à la main avec le set
    // ci-dessus : une copie locale de la règle d'admission est exactement ce qui
    // avait laissé ce seau sans garde.
    const engagedAudience = await filterPostConsumers({
      prisma: this.prisma,
      authorId: params.storyAuthorId,
      visibility,
      visibilityUserIds: params.visibilityUserIds,
      candidateUserIds: previousCommenterIds,
    });

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
    const langs = await this.resolveRecipientLangs([authorId, ...engagedAudience, ...friendAudience]);
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
      ...(authorName ? { contentAuthorName: authorName } : {}),
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
    for (const recipientId of engagedAudience) {
      if (excludeSet.has(recipientId)) continue;
      const rLang = langs.get(recipientId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: recipientId,
          type: 'story_thread_reply',
          priority: 'low',
          content: excerpt || notificationString(rLang, 'comment.repliedIn', { postType: i18nPostType }),
          // Pas de `subtitle` explicite : l'auteur du contenu est désormais
          // DANS l'action (« a répondu dans une story de Alice »), et le
          // répéter en sous-titre écrirait deux fois la même chose.
          ...(authorName ? {} : { subtitle: contextSubtitleFor(rLang) }),
          actor: actorInfo,
          context: commonContext,
          metadata: commonMetadata,
          lang: rLang,
        })
      );
    }

    // 3. Friends of the story author (or community co-members) — skip mentioned users
    for (const recipientId of friendAudience) {
      if (excludeSet.has(recipientId)) continue;
      const rLang = langs.get(recipientId) ?? 'fr';
      tasks.push(
        this.createNotification({
          userId: recipientId,
          type: 'friend_story_comment',
          priority: 'low',
          content: excerpt || notificationString(rLang, 'comment.generic', { postType: i18nPostType }),
          ...(authorName ? {} : { subtitle: contextSubtitleFor(rLang) }),
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
    /**
     * Type de l'entité portant le commentaire — discriminant qui décide de la
     * surface ouverte au tap côté client. Sans lui, une mention dans le
     * commentaire d'un réel ouvre le détail de post plat. Défaut POST.
     */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /**
     * Auteur du POST commenté — le sommet du graphe qui définit l'audience.
     * C'est bien lui et non le commentateur : l'auteur seul a choisi qui peut
     * voir. Requis, pour qu'aucun appelant ne puisse rouvrir la fuite par
     * omission.
     */
    postAuthorId: string;
    /**
     * Visibilité du POST commenté. Un commentaire n'a pas d'audience propre :
     * il hérite de celle du post. Requis — cf. `postAuthorId`.
     */
    visibility: string | null | undefined;
    /** `Post.visibilityUserIds` — liste blanche en ONLY, liste noire en EXCEPT. */
    visibilityUserIds?: readonly string[];
  }): Promise<void> {
    if (params.mentionedUserIds.length === 0) return;

    const commenter = await this.prisma.user.findUnique({
      where: { id: params.commenterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!commenter) return;

    // Nommer quelqu'un ne lui donne pas le droit de voir : un mentionné hors
    // audience ne reçoit rien. Sans ce filtre, l'extrait du commentaire — donc
    // du contenu d'un post restreint — atterrissait sur son écran verrouillé,
    // avec un lien de tap vers un post qui le refuserait.
    //
    // Audience de CONSOMMATION (amis ∪ contacts DM) — la même que
    // `canNotifyAboutPost` pour les notifications unitaires du fil, et que le
    // feed. Un contact DM non-ami à qui le feed montre ce post doit être averti
    // qu'on l'y a nommé.
    const audience = await filterPostConsumers({
      prisma: this.prisma,
      authorId: params.postAuthorId,
      visibility: params.visibility,
      visibilityUserIds: params.visibilityUserIds,
      candidateUserIds: params.mentionedUserIds,
    });
    if (audience.length === 0) return;

    const content = params.commentExcerpt
      ? this.truncateMessage(params.commentExcerpt)
      : '';
    const langs = await this.resolveRecipientLangs(audience);

    const actorInfo = {
      id: params.commenterId,
      username: commenter.username,
      displayName: commenter.displayName,
      avatar: commenter.avatar,
    };

    const tasks: Array<Promise<unknown>> = [];

    for (const userId of audience) {
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
            postType: params.postType ?? 'POST',
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
    /**
     * Type du contenu mentionnant — discriminant qui décide de la surface
     * ouverte au tap côté client (lecteur de réel / viewer éphémère / détail de
     * post). Défaut POST.
     */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /**
     * `Post.visibility`. Requis — la garde d'audience ne doit pas pouvoir être
     * désarmée par simple omission d'un paramètre optionnel.
     */
    visibility: string | null | undefined;
    /** `Post.visibilityUserIds` — liste blanche en ONLY, liste noire en EXCEPT. */
    visibilityUserIds?: readonly string[];
  }): Promise<void> {
    if (params.mentionedUserIds.length === 0) return;

    const poster = await this.prisma.user.findUnique({
      where: { id: params.posterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!poster) return;

    // La garde d'audience est RETIRÉE du chemin de référence — décision produit
    // 2026-08-19. Elle empêchait l'extrait d'un post FRIENDS de partir vers un
    // non-ami ; mais nommer quelqu'un lui OUVRE désormais le contenu, donc la
    // garde n'a plus d'objet : elle taisait précisément les gens que l'auteur
    // venait de désigner.
    //
    // CE QUI PROTÈGE RÉELLEMENT — à ne pas se tromper de gardien.
    //
    // La rédaction d'origine désignait l'avertissement du composer comme « la
    // SEULE protection restante ». C'est FAUX, et dangereusement : un
    // avertissement d'interface ne protège rien côté serveur, et cette phrase
    // invite à croire que l'ACL de lecture serait retirable. Une revue de
    // sécurité automatique s'y est d'ailleurs laissé prendre le 2026-08-19 et a
    // classé ce bloc en IDOR à haute gravité.
    //
    // Le vrai gardien est un GRANT PERSISTÉ, vérifié à la lecture :
    //   PostMention                              (table, `post_user_mention_unique`)
    //     → isReferenceStillOpen                 (postVisibility.ts)
    //       → canUserViewPost(..., includeReferenced: true)
    //         → canUserConsumePost               (verdict de LECTURE)
    //
    // Le grant n'est pas perpétuel : sur un contenu EXPIRÉ il ne vaut qu'une
    // fenêtre de 24 h (`verdictFor`, referenceAccess.ts), et c'est
    // `isReferenceStillOpen` — et non la seule existence de la ligne — qui la
    // fait respecter par TOUT ce que `canUserConsumePost` garde : ce lot de
    // notifications, le fil de commentaires, la room socket.
    //
    // L'extrait ne part donc qu'à des utilisateurs qui sont EFFECTIVEMENT
    // autorisés à ouvrir le post : la notification ne leur apprend rien qu'ils
    // ne puissent déjà lire. L'ordre le garantit — `createPostMentions` est
    // `await`é AVANT `createPostMentionNotificationsBatch` (postMentions.ts),
    // donc pas de fenêtre où la notification précéderait le grant.
    //
    // L'avertissement du composer reste utile, mais il est de l'UX : il évite à
    // l'auteur d'ouvrir son contenu sans le vouloir. Il n'est pas la garde.
    // Retirer le grant persisté ou `includeReferenced`, EN REVANCHE, rouvrirait
    // une vraie fuite.
    const audience = params.mentionedUserIds;
    if (audience.length === 0) return;

    const excerpt = params.postExcerpt
      ? this.truncateMessage(params.postExcerpt)
      : '';
    const langs = await this.resolveRecipientLangs(audience);

    const actorInfo = {
      id: params.posterId,
      username: poster.username,
      displayName: poster.displayName,
      avatar: poster.avatar,
    };

    const tasks: Array<Promise<unknown>> = [];

    for (const userId of audience) {
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
            postType: params.postType ?? 'POST',
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
    /**
     * Post visibility — used to filter recipients (same rules as Socket.IO broadcast).
     *
     * **Requis**, comme sur les trois lots voisins depuis les cycles 28 et 31.
     * L'omission n'était pas anodine ici : le défaut `PUBLIC` fait retomber un
     * post `PRIVATE` — ou un `EXCEPT` et sa liste noire — sur l'énumération
     * complète des amis, avec extrait et vignette. La faute appartient au build.
     */
    visibility: string | null | undefined;
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

    const friendRequestRows = await this.prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: params.authorId }, { receiverId: params.authorId }],
      },
      select: { senderId: true, receiverId: true },
      take: FANOUT_ROW_CAP + 1,
      orderBy: { updatedAt: 'desc' },
    });

    // Le tri est `updatedAt desc` et la borne est fixe : chez un auteur qui la
    // dépasse durablement, ce sont TOUJOURS les mêmes contacts — les plus
    // anciens — qui n'apprennent aucune de ses publications. Le silence est ici
    // structurel, pas ponctuel, d'où la trace.
    //
    // Requête sans `distinct` : la ligne témoin y est un compte EXACT — elle
    // existe si et seulement si l'auteur a PLUS de `FANOUT_ROW_CAP` amitiés
    // acceptées. Elle est comptée, puis jetée par le `slice` : la borne de
    // diffusion reste à sa valeur, seule sa saturation devient dicible.
    if (friendRequestRows.length > FANOUT_ROW_CAP) {
      notificationLogger.warn('Fan-out de publication tronqué à la borne', {
        postId: params.postId,
        authorId: params.authorId,
        cap: FANOUT_ROW_CAP,
      });
    }
    const friendRequests = friendRequestRows.slice(0, FANOUT_ROW_CAP);

    const excludeSet = new Set(params.excludeUserIds ?? []);
    const excerpt = params.excerpt ? this.truncateMessage(params.excerpt) : '';
    // Vignette du contenu publié → rendue in-app + attachée au push iOS. Le
    // mediaType explicite de l'appelant prime ; sinon on le dérive du média.
    const media = await this.resolvePostMedia(params.postId);
    const mediaType = params.mediaType ?? media?.mediaType;

    // Aucun `?? 'PUBLIC'` : une visibilité absente retombe sur la branche par
    // défaut ci-dessous (l'énumération des amis), jamais sur une ouverture.
    const visibility = params.visibility;
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
    // Un réel emprunte le type friend_new_post mais garde son wording propre :
    // « a publié un nouveau réel », pas « … un nouveau post ». Le discriminant
    // REEL est conservé dans la metadata pour l'affichage client, donc le titre,
    // le corps et le sous-titre doivent tous rester conscients de l'entité —
    // sinon un réel s'annonçait comme un post (titre + corps) tout en affichant
    // « Nouveau réel » en sous-titre du builder : une contradiction.
    const contentKey: NotificationStringKey =
      params.contentType === 'REEL' ? 'friend.reel' : contentKeyByType[notificationType];

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
            postType: params.contentType,
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
            // Le discriminant d'entité voyage AUSSI sous `postType` : c'est la
            // clé que lisent le payload push (`data.postType`) et le routage
            // client. Sans ce miroir, le nouveau réel d'un ami arrivait sans
            // discriminant et ouvrait le détail de post plat au lieu du lecteur
            // immersif. `contentType` est conservé pour la rétro-compat web.
            postType: params.contentType,
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
    // Une arrivée est de l'activité AMBIANTE : elle se tait dans une
    // conversation en sourdine (cf. `mutedRecipients.ts`). Avant les lectures :
    // sur un groupe où tout le monde a coupé le son, un ajout de membre payait
    // trois requêtes par destinataire pour ne rien émettre.
    if (await this.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_joined')) {
      return null;
    }

    const snapshot = await this.loadMemberJoinedSnapshot(params.newMemberUserId, params.conversationId);
    if (!snapshot) return null;

    return this.createMemberJoinedFor(params.recipientUserId, params, snapshot);
  }

  /**
   * Prévient une audience entière de la même arrivée.
   *
   * Les trois lectures dont `member_joined` a besoin — profil du nouveau
   * membre, conversation, effectif — ne dépendent pas du destinataire : elles
   * sont faites UNE fois pour toute l'audience, et le mute est demandé en une
   * requête plutôt qu'une par personne. La boucle d'appels unitaires qui
   * précédait payait 4 requêtes par destinataire pour quatre résultats
   * identiques, et le surcoût grandissait avec le groupe.
   *
   * Rend le nombre de notifications réellement créées : une préférence de type
   * ou un DND côté destinataire peut en écarter sans que ce soit une erreur.
   */
  async createMemberJoinedNotificationsBatch(
    recipientUserIds: readonly string[],
    common: {
      newMemberUserId: string;
      conversationId: string;
      joinMethod?: 'via_link' | 'invited';
    }
  ): Promise<number> {
    const audience = [...new Set(recipientUserIds)];
    if (audience.length === 0) return 0;

    const listening = await filterMutedRecipients(this.prisma, common.conversationId, audience);
    if (listening.length === 0) {
      notificationLogger.info('Member-joined fan-out silenced (whole audience muted)', {
        conversationId: common.conversationId,
        audienceSize: audience.length,
      });
      return 0;
    }

    const snapshot = await this.loadMemberJoinedSnapshot(common.newMemberUserId, common.conversationId);
    if (!snapshot) return 0;

    // `createNotification` ne rejette jamais (catch interne) — un destinataire
    // en échec rend `null` et n'emporte pas les autres.
    const results = await Promise.all(
      listening.map((recipientUserId) => this.createMemberJoinedFor(recipientUserId, common, snapshot))
    );
    return results.filter(Boolean).length;
  }

  /**
   * La part de `member_joined` qui ne dépend PAS du destinataire. `null` quand
   * le nouveau membre est introuvable : sans acteur, la notification n'a pas de
   * sujet, et aucun destinataire ne doit en recevoir.
   */
  private async loadMemberJoinedSnapshot(
    newMemberUserId: string,
    conversationId: string
  ): Promise<MemberJoinedSnapshot | null> {
    const [newMember, conversation, memberCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: newMemberUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { title: true, type: true },
      }),
      this.prisma.participant.count({
        where: { conversationId },
      }),
    ]);

    if (!newMember) return null;
    return { newMember, conversation, memberCount };
  }

  private createMemberJoinedFor(
    recipientUserId: string,
    common: { newMemberUserId: string; conversationId: string; joinMethod?: 'via_link' | 'invited' },
    snapshot: MemberJoinedSnapshot
  ): Promise<Notification | null> {
    return this.createNotification({
      userId: recipientUserId,
      type: 'member_joined',
      priority: 'low',
      content: 'Nouveau membre',

      actor: {
        id: common.newMemberUserId,
        username: snapshot.newMember.username,
        displayName: snapshot.newMember.displayName,
        avatar: snapshot.newMember.avatar,
      },

      context: {
        conversationId: common.conversationId,
        conversationTitle: snapshot.conversation?.title,
        conversationType: snapshot.conversation?.type as any,
      },

      metadata: {
        action: 'view_conversation',
        memberCount: snapshot.memberCount,
        isMember: true,
        joinMethod: common.joinMethod,
      },
    });
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

    // Cycle 123 — UNE descente, deux projections : le corps et les champs du
    // fil. Cf. `createMessageNotification`.
    const servedTranslation = this.prismTranslation(
      this.previewPrismSource({
        basis: params.previewBasis ?? MESSAGE_CONTENT_BASIS,
        messageSource: prismSource,
      }),
      prism.ordered
    );

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'message_reply',
      priority: 'normal',
      // Cycle 122 — cf. `createMentionNotification` : le corps servi descend le
      // Prisme, les champs du fil push ne suffisent pas.
      content: this.servedPreview({
        preview: params.messagePreview,
        translation: servedTranslation,
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
    const reactPostType = params.postType === 'STORY' ? 'STORY' : params.postType === 'STATUS' ? 'STATUS' : 'POST';
    const subtitlePostType = params.postType ?? 'POST';

    // Détail du contenu réagi : extrait texte si présent, sinon vignette/résumé
    // média (« Votre story · 📷 Photo ») — le destinataire identifie QUEL
    // contenu sans ouvrir l'app, et le push iOS attache la miniature.
    const trimmedPreview = params.postPreview?.trim() ?? '';
    const media = await this.resolvePostMedia(params.postId);
    // Le sous-titre nomme la cible, le corps la MONTRE : le détail (texte /
    // média) descend dans le corps, que la phrase d'action n'occupe plus.
    const subtitle = notificationString(lang, 'comment.subtitleOwner', { postType: subtitlePostType });

    return this.createNotification({
      userId: params.postAuthorId,
      type,
      priority: 'normal',
      content: this.targetPreviewBody(lang, subtitlePostType, {
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
    // Cf. `targetPreviewBody` : un partage n'apporte aucun contenu neuf, le
    // détail du contenu partagé descend donc dans le corps.
    const subtitle = notificationString(lang, 'comment.subtitleOwner', {
      postType: params.postType ?? 'POST',
    });

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_repost',
      priority: 'normal',
      content: this.targetPreviewBody(lang, params.postType ?? 'POST', {
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
    const media = await this.resolvePostMedia(params.postId);
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

  /**
   * Corps d'une notification qui n'apporte AUCUN contenu neuf — une réaction,
   * un partage. Le geste lui-même est déjà énoncé par le titre et par le
   * sous-titre de bannière (« a réagi ❤️ à votre publication ») : répéter cette
   * phrase dans le corps écrivait la même information deux fois sur trois
   * lignes. Le corps sert donc à identifier CE QUI a été visé — le début du
   * texte, ou le résumé média, ou les deux.
   *
   * Le repli sur le libellé de l'entité (« Votre publication ») ne sert qu'aux
   * contenus sans texte NI média : un corps vide ferait disparaître la ligne.
   */
  private targetPreviewBody(
    lang: string,
    postType: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
    detail: { textPreview?: string; mediaType?: 'image' | 'video' | 'audio' },
  ): string {
    const text = detail.textPreview?.trim();
    const mediaSummary = this.mediaSummaryString(lang, detail.mediaType);
    if (text && mediaSummary) return `${mediaSummary} · ${this.truncateMessage(text)}`;
    if (text) return this.truncateMessage(text);
    if (mediaSummary) return mediaSummary;
    return notificationString(lang, 'comment.subtitleOwner', { postType });
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
        projection: { _id: 1 },
        singleBatch: true,
        batchSize: RETRACTION_BATCH_SIZE,
      });

      const ids = (raw?.cursor?.firstBatch ?? []).map((row) =>
        typeof row._id === 'string' ? row._id : row._id.$oid
      );

      if (ids.length === 0) {
        return 0;
      }

      await this.prisma.notification.deleteMany({ where: { id: { in: ids } } });

      // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
      // qu'elle recalcule doivent voir la base d'après le retrait.
      await this.announceNotificationsRetracted(ids.map((id) => ({ id, userId })));

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
        if (this.io) {
          this.io
            .to(ROOMS.user(existing.userId))
            .emit(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId });
        }
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
  async announceNotificationsRetracted(
    retracted: readonly { readonly id: string; readonly userId: string }[]
  ): Promise<void> {
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
   */
  async announceNotificationsReproduced(
    reproduced: readonly { readonly id: string; readonly userId: string }[]
  ): Promise<void> {
    if (!this.io || reproduced.length === 0) return;

    const affectedUserIds = new Set<string>();

    for (const { id, userId } of reproduced) {
      affectedUserIds.add(userId);

      const row = await this.prisma.notification.findUnique({ where: { id } }).catch(() => null);
      // Retirée entre la réécriture et l'annonce : le `notification:deleted`
      // reste dû — la ligne n'existe effectivement plus — mais il n'y a rien à
      // reproduire.
      await this.emitBestEffort(SERVER_EVENTS.NOTIFICATION_DELETED, userId, () => {
        this.io!.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: id });
      });
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
    }

    await Promise.all(
      [...affectedUserIds].map((userId) => this.emitCountsUpdate(userId).catch(() => {}))
    );
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
