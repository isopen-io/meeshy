/**
 * Les lois de composition d'un aperçu / d'un corps de bannière de
 * notification, et leurs types — extrait de `NotificationService.ts`
 * (#7093). Fonctions PURES, sans effet de bord ; les doc-comments des
 * cycles 121-126 (Prisme des bannières) voyagent avec le code qu'ils
 * gardent.
 */

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { formatClock } from '@meeshy/shared/utils/duration-format';
import { notificationString, formatFileSizeI18n, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';

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

/**
 * Ce qu'UNE relecture de message rend aux éventails qui n'ont pas de gate
 * d'éligibilité — la source du Prisme, et l'horloge de la bulle.
 *
 * Les deux ne se mélangent pas : la première dit ce qui TRADUIT l'aperçu, la
 * seconde ce qui l'ORDONNE dans la conversation. Elles voyagent ensemble parce
 * qu'elles viennent de la même lecture, pas parce qu'elles répondent à la même
 * question — d'où deux types et non un.
 *
 * Cycle 126 : la NSE pré-enregistre une bulle pour TOUT éventail qui pousse un
 * `messageId`. `createMessageNotification` datait la sienne depuis sa relecture
 * VIVANTE (qui lui sert aussi de gate d'éligibilité) ; la réponse et la mention
 * n'avaient que celle-ci, qui ne demandait pas ces deux colonnes — leur bulle
 * était donc datée par l'horloge du DEVICE, et mal ordonnée dans le fil.
 */
export type MessageBannerSource = MessagePrismSource & {
  readonly createdAt: Date | null;
  readonly messageType: string | null;
  /**
   * #7451 — ce qui QUALIFIE une bulle ÉPHÉMÈRE, au même titre que l'horloge
   * ci-dessus et pour la même raison (cycle 126) : ces champs ne composent
   * AUCUNE chaîne, donc « qui compose ce texte ? » ne les trouve jamais. Sans
   * eux, la bulle pré-enregistrée par la NSE ne sait pas qu'elle doit décompter.
   */
  readonly ephemeralDuration: number | null;
  readonly effectFlags: number | null;
  readonly liveness: MessageLiveness;
};

/**
 * Ce qu'une relecture a APPRIS de la vie du message — trois états, et le
 * troisième n'est pas un détail de forme.
 *
 * `createMessageNotification` porte cette garde depuis toujours, et son
 * commentaire dit pourquoi : entre le commit du message et l'éventail il peut
 * s'écouler des centaines de millisecondes, et un message rappelé dans cette
 * fenêtre ne doit pas pousser son texte ORIGINAL sur un écran verrouillé. La
 * règle vaut mot pour mot pour la réponse et la mention, qui relisent la MÊME
 * ligne dans la MÊME fenêtre (cycle 127).
 *
 *  - `live` — la ligne a été lue : ni rappelée, ni expirée. Annoncer.
 *  - `gone` — la ligne a été lue et PROUVE le rappel ou l'expiration. Se taire.
 *  - `unknown` — la lecture n'a rien PROUVÉ : elle a levé, ou n'a rendu aucune
 *    ligne. Annoncer.
 *
 * La distinction `gone` / `unknown` est la leçon du cycle 112 : « la dépendance
 * n'a pas répondu » et « la réponse dit non » sont deux verdicts, et un `catch`
 * qui les confond transforme un hoquet Mongo en silence pour tout un fil. La
 * relecture reste donc fail-OPEN sur l'ERREUR — une bannière appauvrie se
 * rattrape, une annonce perdue non — et fail-CLOSED sur la PREUVE, où c'est un
 * secret qui est en jeu.
 *
 * **Une ligne ABSENTE est `unknown`, jamais `gone`**, et le dépôt le tenait déjà
 * pour dit : le balayage de rétraction de l'éventail refuse d'agir dessus dans
 * les mêmes termes — « `deletedAt` non nul est la SEULE preuve d'un rappel. Une
 * ligne absente ne prouve rien, et aucun chemin de la gateway ne supprime un
 * message physiquement ». Le mécanisme qui la produit est réel : le message vient
 * d'être committé, et une lecture servie par un secondaire en retard sur le jeu
 * de réplicas rend `null` pour un message parfaitement vivant. En faire une
 * preuve ferait perdre des annonces qu'aucun réessai ne rattrape.
 */
export type MessageLiveness = 'live' | 'gone' | 'unknown';

/** Rien à traduire — la réponse de `previewPrismSource` sur un aperçu sans source. */
export const EMPTY_PRISM_SOURCE: MessagePrismSource = {
  translations: {},
  originalLanguage: null,
};

/**
 * Ce qu'une relecture EN ÉCHEC rend : aucune traduction, aucune horloge, et un
 * verdict de vie qui n'accuse RIEN. Distinct d'`EMPTY_PRISM_SOURCE`, dont il
 * partage la forme mais pas la question : l'un dit « rien ne traduit cet
 * aperçu », l'autre « je n'ai pas pu lire ».
 */
export const UNKNOWN_BANNER_SOURCE: MessageBannerSource = {
  ...EMPTY_PRISM_SOURCE,
  createdAt: null,
  messageType: null,
  ephemeralDuration: null,
  effectFlags: null,
  liveness: 'unknown',
};

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

export const MESSAGE_CONTENT_BASIS: PreviewPrismBasis = { kind: 'message-content' };

/**
 * Ce qu'il faut d'un média pour COMPOSER le corps d'une bannière — cycle 125 bis.
 *
 * `buildMessageNotificationBodyI18n` remplace un texte ABSENT par le libellé
 * détaillé de la première pièce jointe (« 🎵 Audio · 0:07 », « 📷 Photo ·
 * 1024×768 ») et suffixe les badges des suivantes. Les TROIS éventails de
 * `messageNotificationFanOut` en ont besoin : sans ces champs, la bannière
 * d'une RÉPONSE ou d'une MENTION portant un vocal ou une photo sans légende a
 * un corps VIDE, pendant que celle d'un message simple porte le libellé.
 *
 * Distinct des champs de RICH-PUSH (`firstAttachmentUrl`, `firstAttachmentMimeType`)
 * et de l'inventaire persisté (`hasAttachments`, `firstAttachmentFilename`),
 * que seule la bannière d'un message simple porte : ceux-ci composent un TEXTE,
 * ceux-là transportent un fichier. La séparation est celle du cycle 125 — une
 * charge ne se garde pas comme une chaîne.
 */
export type NotificationBannerMedia = {
  readonly attachments?: ReadonlyArray<NotificationAttachmentSummary>;
  readonly firstAttachmentFileSize?: number | null;
  readonly firstAttachmentDuration?: number | null;
  readonly firstAttachmentWidth?: number | null;
  readonly firstAttachmentHeight?: number | null;
};


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

/**
 * LE DOMICILE DE CETTE LOI EST `@meeshy/shared/utils/attachment-protection`
 * depuis #6189 — elle gouverne TROIS clients, donc elle ne pouvait pas rester
 * dans un service du gateway : `apps/web-v2` ne pouvait pas l'importer, et ne
 * la lisait donc nulle part (une pièce `isViewOnce` sur un message non protégé
 * rendait son `<img>` et l'URL en clair).
 *
 * Réexportée ici, et SEULEMENT réexportée : un second corps serait deux lois
 * pour une règle, ce que `tasks/lessons.md` § 586 fait payer. Les appelants du
 * gateway peuvent continuer à l'importer d'ici ; les nouveaux la prennent à son
 * domicile.
 */
export { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

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

export type NotificationAttachmentSummary = {
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
 * Tronque un message par nombre de mots (pas de caractères).
 * Plus naturel pour les aperçus de messages multilingues.
 */
export function truncateMessage(message: string, maxWords: number = 25): string {
  if (!message) return '';

  const words = message.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return message;
  }
  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Sous-titre « Votre {entité} » enrichi du détail du contenu visé : l'extrait
 * texte (« Votre story : « … » ») ou, à défaut, un résumé média localisé
 * (« Votre story · 📷 Photo »). Source unique pour réactions / partages —
 * aligné sur le wording des commentaires. SANS date (le client l'append).
 */
export function buildOwnerSubtitleWithDetail(
  lang: string,
  postType: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
  detail: { textPreview?: string; mediaType?: 'image' | 'video' | 'audio' },
): string {
  const label = notificationString(lang, 'comment.subtitleOwner', { postType });
  const text = detail.textPreview?.trim();
  if (text) return `${label} : « ${truncateMessage(text)} »`;
  const mediaSummary = mediaSummaryString(lang, detail.mediaType);
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
export function targetPreviewBody(
  lang: string,
  postType: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
  detail: { textPreview?: string; mediaType?: 'image' | 'video' | 'audio' },
): string {
  const text = detail.textPreview?.trim();
  const mediaSummary = mediaSummaryString(lang, detail.mediaType);
  if (text && mediaSummary) return `${mediaSummary} · ${truncateMessage(text)}`;
  if (text) return truncateMessage(text);
  if (mediaSummary) return mediaSummary;
  return notificationString(lang, 'comment.subtitleOwner', { postType });
}

/** Résumé média localisé (« 📷 Photo » / « 🎬 Vidéo » / « 🎵 Audio ») ou ''. */
export function mediaSummaryString(lang: string, mediaType?: 'image' | 'video' | 'audio'): string {
  const key: NotificationStringKey | null = mediaType === 'image' ? 'attachment.photo'
    : mediaType === 'video' ? 'attachment.video'
      : mediaType === 'audio' ? 'attachment.audio'
        : null;
  return key ? notificationString(lang, key) : '';
}
