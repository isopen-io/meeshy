/**
 * LA LIGNE D'APERÇU D'UNE CONVERSATION — un seul composeur pour le web et iOS (#7546).
 *
 * Fonction PURE : elle ne lit ni horloge, ni réseau, ni cache. Elle rend une
 * valeur STRUCTURÉE — ton, icône, auteur, segments, échéance vivante — et
 * jamais une chaîne : chaque client dessine l'icône, la couleur et l'italique
 * avec son propre système, et la mise à plat (`renderConversationPreviewText`)
 * ne sert qu'à l'accessibilité, aux tests et au fichier de cas commun
 * (`fixtures/conversation-preview-cases.json`), que le SDK Swift rejoue.
 *
 * Priorité de la ligne (la première qui s'applique gagne) : appel en cours,
 * frappe, mon brouillon, réaction plus récente que le dernier message, puis le
 * dernier message selon sa nature.
 *
 * Deux lois s'y croisent :
 *  - le PRISME : le texte d'un message sort de `resolvePrismTranslation`, jamais
 *    d'une boucle réécrite, et le segment dit la langue servie ;
 *  - la PROTECTION : un message expiré, à vue unique, flouté ou chiffré ne
 *    transporte ni son texte, ni sa traduction, ni le moindre détail de ses
 *    pièces jointes — la valeur rendue est ce qui finit dans le cache disque de
 *    la liste. Préséance : expiré > vue unique > flou > chiffré > éphémère, et
 *    un effet comportemental ne s'affiche que sur un message non protégé.
 */

import { arrivalsLineKey } from './arrivals-notice.js';
import type {
  ConversationActiveCall,
  ConversationLastReaction,
  LastMessageAttachmentSummary,
  LastMessageCallSummary,
  PreviewProtection,
} from '../types/conversation-preview.js';
import type { LastMessagePreviewAttachment } from '../types/socketio-events/conversation.js';
import type { AttachmentProtectionFlags } from './attachment-protection.js';
import { resolvePrismTranslation } from './conversation-helpers.js';
import { formatClock } from './duration-format.js';
import { ephemeralDeadline } from './ephemeral-deadline.js';
import { behavioralEffects, messageProtection, type BehavioralEffect } from './message-protection.js';
import {
  conversationPreviewString,
  formatPreviewFileSize,
  formatPreviewRemaining,
  type ConversationPreviewStringKey,
} from './conversation-preview-strings.js';

export type PreviewTone = 'default' | 'accent' | 'success' | 'danger' | 'system';

export type PreviewIcon =
  | 'call-audio'
  | 'call-video'
  | 'voice'
  | 'audio'
  | 'video'
  | 'photo'
  | 'file'
  | 'location'
  | 'sticker'
  | 'attachments'
  | 'effect'
  | 'forward'
  | 'view-once'
  | 'ephemeral'
  | 'expired'
  | 'hidden'
  | 'encrypted';

/** L'auteur préfixé à la ligne (`Alice : …`) — ou le brouillon, qui prend la même place. */
export type PreviewAuthor =
  | { readonly kind: 'self'; readonly label: string }
  | { readonly kind: 'member'; readonly id: string; readonly label: string }
  | { readonly kind: 'draft'; readonly label: string };

/**
 * `text` est un contenu d'utilisateur servi par le Prisme (`language` = langue
 * de la traduction servie, `null` = l'original) ; `label` est un libellé du
 * catalogue ; `countdown` est le temps restant d'un éphémère, composé à `now`.
 */
export type PreviewSegment =
  | { readonly kind: 'text'; readonly text: string; readonly language: string | null }
  | { readonly kind: 'label'; readonly text: string }
  | { readonly kind: 'countdown'; readonly text: string; readonly expiresAt: number };

export type ConversationPreviewKind =
  | 'active-call'
  | 'typing'
  | 'draft'
  | 'reaction'
  | 'message'
  | 'call'
  | 'system'
  | 'empty';

export type ConversationPreview = {
  readonly kind: ConversationPreviewKind;
  readonly tone: PreviewTone;
  readonly icon: PreviewIcon | null;
  readonly author: PreviewAuthor | null;
  readonly segments: readonly PreviewSegment[];
  /** Présent ⇒ la ligne change d'elle-même à `expiresAt` (ms epoch) : le client recompose alors. */
  readonly live?: { readonly expiresAt: number };
  readonly action?: 'join';
  readonly direction?: 'incoming' | 'outgoing';
};

type Instant = Date | string | number;

/**
 * La première pièce jointe, avec ses détails TELS QU'ILS EXISTENT — chacun
 * n'apparaît dans la ligne que s'il est renseigné. Les champs de détail sont
 * ceux du contrat de fil (`LastMessagePreviewAttachment`, #7545) ; `duration`
 * est en MILLISECONDES, comme `MessageAttachment.duration`. Les trois drapeaux
 * de protection sont ceux de `AttachmentProtectionFlags`.
 */
export type ConversationPreviewAttachment = Partial<
  Pick<LastMessagePreviewAttachment, 'mimeType' | 'originalName' | 'fileSize' | 'duration' | 'width' | 'height' | 'pageCount'>
> & AttachmentProtectionFlags & {
  /**
   * Texte alternatif (`MessageAttachment.alt`). Pour un sticker de texte, c'est
   * la phrase tapée, dessinée dans l'image (décision porteur 2026-09-23).
   */
  readonly alt?: string | null;
};

/**
 * Le dernier message tel que le client le tient — projection de `lastMessage`
 * (REST) ou des clés plates `lastMessage*` de `conversation:updated` (socket),
 * dont les types viennent du contrat #7545 (`types/conversation-preview.ts`).
 */
export type ConversationPreviewMessage = {
  readonly id: string;
  /** `Participant.id` ou `User.id` de l'expéditeur — l'un des deux suffit à reconnaître « Vous ». */
  readonly senderId: string | null;
  readonly senderUserId?: string | null;
  readonly senderName?: string | null;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: Readonly<Record<string, string>> | null;
  readonly createdAt: Instant;
  readonly messageType?: string | null;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
  /** L'échéance SERVIE à ce lecteur (#7451) — ou, sans `ephemeralDuration`, une échéance absolue. */
  readonly expiresAt?: Instant | null;
  readonly isEncrypted?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  /** Le lecteur a déjà ouvert ce message à vue unique. */
  readonly viewOnceConsumed?: boolean | null;
  readonly isForwarded?: boolean | null;
  /**
   * `LastMessageSystemEvent`, élargi à une clé quelconque : une clé que ce
   * composeur ne connaît pas encore se rend en `system.generic`, jamais en texte brut.
   */
  readonly systemEvent?: { readonly key: string; readonly params?: Readonly<Record<string, string | number>> | null } | null;
  readonly callSummary?: LastMessageCallSummary | null;
  /** Sticker hissé de `metadata.sticker` : sa présence fait du message un sticker, quel que soit son `messageType`. */
  readonly sticker?: { readonly templateId?: string | null; readonly emoji?: string | null } | null;
  /** Lieu partagé (`location` hissé de `metadata.location`) : sa présence fait du message une position, quel que soit son `messageType` — le serveur l’écrit en `text` (#7590). */
  readonly location?: { readonly name?: string | null; readonly address?: string | null } | null;
  readonly attachment?: ConversationPreviewAttachment | null;
  readonly attachmentSummary?: LastMessageAttachmentSummary | null;
};

export type ConversationPreviewInput = {
  /** `User.id` du lecteur. */
  readonly viewerId: string;
  /** Langue de CADRAGE : celle des libellés. */
  readonly language: string;
  /** Le prisme du lecteur, dans l'ordre (`ReaderPrism` / `resolveUserLanguagesOrdered`). */
  readonly preferredLanguages: readonly string[];
  readonly now: Instant;
  /** Première réception locale du dernier message — le départ du décompte d'un éphémère (#7451). */
  readonly receivedAt?: Instant | null;
  readonly activeCall?: ConversationActiveCall | null;
  /** Noms des personnes qui écrivent, lecteur exclu. */
  readonly typing?: readonly string[] | null;
  readonly draft?: string | null;
  readonly lastReaction?: ConversationLastReaction | null;
  readonly lastMessage?: ConversationPreviewMessage | null;
};

type Str = (key: ConversationPreviewStringKey, params?: Readonly<Record<string, string | number>>) => string;

const msOf = (instant: Instant): number => (instant instanceof Date ? instant.getTime() : new Date(instant).getTime());

const label = (text: string): PreviewSegment => ({ kind: 'label', text });

const hasText = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function preview(fields: Omit<ConversationPreview, 'author' | 'icon' | 'tone'> & Partial<ConversationPreview>): ConversationPreview {
  return { tone: 'default', icon: null, author: null, ...fields };
}

export function composeConversationPreview(input: ConversationPreviewInput): ConversationPreview {
  const str: Str = (key, params) => conversationPreviewString(input.language, key, params);
  const lastMessage = input.lastMessage ?? null;

  if (input.activeCall) return activeCallLine(input.activeCall, str);

  const typing = (input.typing ?? []).filter(hasText);
  if (typing.length > 0) return typingLine(typing, str);

  if (hasText(input.draft)) {
    return preview({
      kind: 'draft',
      tone: 'accent',
      author: { kind: 'draft', label: str('draft') },
      segments: [{ kind: 'text', text: input.draft.trim(), language: null }],
    });
  }

  const reaction = input.lastReaction ?? null;
  if (reaction && (!lastMessage || msOf(reaction.createdAt) > msOf(lastMessage.createdAt))) {
    return reactionLine(reaction, input, str);
  }

  if (!lastMessage) return preview({ kind: 'empty', segments: [label(str('conversation.empty'))] });

  return messageLine(lastMessage, input, str);
}

function activeCallLine(call: ConversationActiveCall, str: Str): ConversationPreview {
  const count = Math.max(0, Math.floor(call.participantCount));
  return preview({
    kind: 'active-call',
    tone: 'success',
    icon: call.kind === 'video' ? 'call-video' : 'call-audio',
    segments: [
      label(str('call.active')),
      ...(count > 0 ? [label(str(count === 1 ? 'call.participants.one' : 'call.participants.other', { count }))] : []),
    ],
    action: 'join',
  });
}

function typingLine(names: readonly string[], str: Str): ConversationPreview {
  const [first = '', second = ''] = names;
  const text = names.length === 1
    ? str('typing.one', { name: first })
    : names.length === 2
      ? str('typing.two', { name: first, other: second })
      : str('typing.many', { count: names.length });
  return preview({ kind: 'typing', tone: 'accent', segments: [label(text)] });
}

const PROTECTION_PLACEHOLDER: Readonly<Record<Exclude<PreviewProtection, 'ephemeral'>, ConversationPreviewStringKey>> = {
  expired: 'protection.expired',
  'view-once': 'protection.viewOnce',
  blurred: 'protection.hidden',
  encrypted: 'protection.encrypted',
};

/**
 * L'extrait du message réagi : servi par le Prisme comme un contenu, ou
 * remplacé par le placeholder de sa protection — le serveur l'a déjà retenu
 * (`excerptProtection`), le composeur ne fait que le nommer.
 */
function reactionExcerpt(reaction: ConversationLastReaction, input: ConversationPreviewInput, str: Str): string | null {
  const protection = reaction.excerptProtection;
  if (protection && protection !== 'ephemeral') return str(PROTECTION_PLACEHOLDER[protection]);
  if (!hasText(reaction.excerpt)) return null;
  const served = resolvePrismTranslation({
    translations: reaction.excerptTranslations,
    originalLanguage: reaction.excerptOriginalLanguage,
    preferredLanguages: input.preferredLanguages,
  });
  return (served?.text ?? reaction.excerpt).trim();
}

function reactionLine(reaction: ConversationLastReaction, input: ConversationPreviewInput, str: Str): ConversationPreview {
  const isSelf = reaction.reactorUserId !== null && reaction.reactorUserId === input.viewerId;
  const actor = hasText(reaction.reactorName) ? reaction.reactorName : str('message.author.unknown');
  const excerpt = reactionExcerpt(reaction, input, str);
  const key: ConversationPreviewStringKey = isSelf
    ? excerpt ? 'reaction.self' : 'reaction.self.bare'
    : excerpt ? 'reaction.member' : 'reaction.member.bare';
  return preview({
    kind: 'reaction',
    segments: [label(str(key, { actor, emoji: reaction.emoji, excerpt: excerpt ?? '' }))],
  });
}

function isMine(message: ConversationPreviewMessage, viewerId: string): boolean {
  return (message.senderUserId != null && message.senderUserId === viewerId)
    || (message.senderId !== null && message.senderId === viewerId);
}

function authorOf(message: ConversationPreviewMessage, viewerId: string, str: Str): PreviewAuthor {
  if (isMine(message, viewerId)) {
    return { kind: 'self', label: str('message.author.self') };
  }
  return {
    kind: 'member',
    id: message.senderId ?? '',
    label: hasText(message.senderName) ? message.senderName : str('message.author.unknown'),
  };
}

function messageLine(message: ConversationPreviewMessage, input: ConversationPreviewInput, str: Str): ConversationPreview {
  if (message.callSummary) return callLine(message.callSummary, input.viewerId, str);
  if (message.messageType === 'system') return systemLine(message, input, str);

  const author = authorOf(message, input.viewerId, str);
  const now = msOf(input.now);
  const guard = protectionOf(message, input, now);

  switch (guard.kind) {
    case 'expired':
      return preview({ kind: 'message', author, icon: 'expired', segments: [label(str('protection.expired'))] });
    case 'view-once':
      return preview({
        kind: 'message',
        author,
        icon: 'view-once',
        segments: [label(str(message.viewOnceConsumed === true ? 'protection.viewOnce.opened' : 'protection.viewOnce'))],
      });
    case 'hidden':
      return preview({
        kind: 'message',
        author,
        icon: 'hidden',
        segments: [label(str('protection.hidden')), label(str('protection.hidden.hint'))],
      });
    case 'encrypted':
      return preview({ kind: 'message', author, icon: 'encrypted', segments: [label(str('protection.encrypted'))] });
    case 'ephemeral': {
      const body = bodyOf(message, input, str);
      const countdown: readonly PreviewSegment[] = guard.expiresAt !== null
        ? [{ kind: 'countdown', text: formatPreviewRemaining(input.language, guard.expiresAt - now), expiresAt: guard.expiresAt }]
        : guard.durationSeconds !== null
          ? [label(formatPreviewRemaining(input.language, guard.durationSeconds * 1000))]
          : [];
      return preview({
        kind: 'message',
        author,
        icon: 'ephemeral',
        segments: [...countdown, ...body.labelled],
        ...(guard.expiresAt !== null ? { live: { expiresAt: guard.expiresAt } } : {}),
      });
    }
    case 'none': {
      const body = bodyOf(message, input, str);
      const effects = effectSegments(behavioralEffects(message.effectFlags), str);
      const icon = body.icon ?? (effects.length > 0 ? 'effect' : message.isForwarded === true ? 'forward' : null);
      return preview({ kind: 'message', author, icon, segments: [...body.segments, ...effects] });
    }
  }
}

type Guard =
  | { readonly kind: 'none' | 'expired' | 'view-once' | 'hidden' | 'encrypted' }
  | { readonly kind: 'ephemeral'; readonly expiresAt: number | null; readonly durationSeconds: number | null };

function protectionOf(message: ConversationPreviewMessage, input: ConversationPreviewInput, now: number): Guard {
  const flags = messageProtection(message);
  const attachment = messageProtection({
    isViewOnce: message.attachment?.isViewOnce ?? null,
    isBlurred: message.attachment?.isBlurred ?? null,
    effectFlags: message.attachment?.effectFlags ?? null,
  });
  const deadline = flags.ephemeral
    ? ephemeralDeadline({
      ephemeralDuration: message.ephemeralDuration ?? null,
      servedExpiresAt: message.expiresAt ?? null,
      receivedAtMs: input.receivedAt != null ? msOf(input.receivedAt) : null,
      isMine: isMine(message, input.viewerId),
    })
    : { state: 'none' as const };

  if (deadline.state === 'scheduled' && deadline.expiresAtMs <= now) return { kind: 'expired' };
  if (flags.viewOnce || attachment.viewOnce) return { kind: 'view-once' };
  if (flags.blurred || attachment.blurred) return { kind: 'hidden' };
  if (flags.encrypted) return { kind: 'encrypted' };
  if (!flags.ephemeral) return { kind: 'none' };
  return {
    kind: 'ephemeral',
    expiresAt: deadline.state === 'scheduled' ? deadline.expiresAtMs : null,
    durationSeconds: deadline.state === 'awaiting-reception' ? deadline.durationSeconds : null,
  };
}

/**
 * Le corps d'un message lisible : `segments` pour une ligne dont l'icône porte
 * la nature (📷 Photo · …), `labelled` pour une ligne dont l'icône est prise par
 * une protection (🔥 4 min · Photo · …), où la nature doit se dire en mots.
 */
type Body = {
  readonly icon: PreviewIcon | null;
  readonly segments: readonly PreviewSegment[];
  readonly labelled: readonly PreviewSegment[];
};

function servedText(message: ConversationPreviewMessage, input: ConversationPreviewInput): PreviewSegment | null {
  if (!hasText(message.content)) return null;
  const served = resolvePrismTranslation({
    translations: message.translations ?? null,
    originalLanguage: message.originalLanguage ?? null,
    preferredLanguages: input.preferredLanguages,
  });
  return served
    ? { kind: 'text', text: served.text.trim(), language: served.language }
    : { kind: 'text', text: message.content.trim(), language: null };
}

type AttachmentKind = 'voice' | 'audio' | 'video' | 'photo' | 'file';

const MANY_KEY: Readonly<Record<AttachmentKind, ConversationPreviewStringKey>> = {
  voice: 'attachment.voice.many',
  audio: 'attachment.audio.many',
  video: 'attachment.video.many',
  photo: 'attachment.photo.many',
  file: 'attachment.file.many',
};

const ONE_KEY: Readonly<Record<AttachmentKind, ConversationPreviewStringKey>> = {
  voice: 'attachment.voice',
  audio: 'attachment.audio',
  video: 'attachment.video',
  photo: 'attachment.photo',
  file: 'attachment.file',
};

const VOICE_NAME = /^(voice|vocal|audio|recording|record|enregistrement)[-_ .]/i;

function attachmentKindOf(attachment: ConversationPreviewAttachment | null, messageType: string | null | undefined): AttachmentKind {
  const mime = attachment?.mimeType?.toLowerCase() ?? '';
  const family = mime.split('/')[0] || messageType || '';
  if (family === 'image') return 'photo';
  if (family === 'video') return 'video';
  if (family === 'audio') {
    const name = attachment?.originalName ?? '';
    return hasText(name) && !VOICE_NAME.test(name) ? 'audio' : 'voice';
  }
  return 'file';
}

function summaryKindOf(raw: string): AttachmentKind {
  if (raw === 'image') return 'photo';
  if (raw === 'video' || raw === 'audio') return raw;
  return 'file';
}

function bodyOf(message: ConversationPreviewMessage, input: ConversationPreviewInput, str: Str): Body {
  const text = servedText(message, input);
  const attachment = message.attachment ?? null;
  const summary = message.attachmentSummary ?? null;
  const count = summary?.count ?? (attachment ? 1 : 0);

  if (message.messageType === 'location' || message.location) {
    const place = [message.location?.name, message.location?.address, message.content]
      .filter(hasText)
      .slice(0, 1)
      .map((name) => label(name.trim()));
    const segments = [label(str('attachment.location')), ...place];
    return { icon: 'location', segments, labelled: segments };
  }
  if (message.messageType === 'sticker' || message.sticker) {
    const alt = attachment?.alt;
    const segments: readonly PreviewSegment[] = hasText(alt)
      ? [{ kind: 'text', text: alt.trim(), language: null }]
      : [label(str('attachment.sticker'))];
    return { icon: 'sticker', segments, labelled: segments };
  }
  if (count === 0) {
    const segments = text ? [text] : [];
    return { icon: null, segments, labelled: segments };
  }

  if (count > 1) {
    const kinds = [...new Set(
      Object.entries(summary?.kinds ?? {})
        .filter(([, n]) => n > 0)
        .map(([raw]) => summaryKindOf(raw)),
    )];
    const [only] = kinds;
    const kind = kinds.length === 1 && only ? only : null;
    const icon: PreviewIcon = kind ?? 'attachments';
    if (text) return { icon, segments: [text], labelled: [text] };
    const size = positive(summary?.totalSize) ? [label(formatPreviewFileSize(input.language, summary.totalSize))] : [];
    const head = label(str(kind ? MANY_KEY[kind] : 'attachment.mixed.many', { count }));
    return { icon, segments: [head, ...size], labelled: [head, ...size] };
  }

  const kind = attachmentKindOf(attachment, message.messageType);
  if (text) return { icon: kind, segments: [text], labelled: [text] };
  const name = attachment?.originalName?.trim() ?? '';
  const named = (kind === 'audio' || kind === 'file') && name !== '';
  const head = label(named ? name : str(ONE_KEY[kind]));
  const details = detailsOf(kind, attachment, input.language, str);
  const labelledHead = named ? [label(str(ONE_KEY[kind])), head] : [head];
  return { icon: kind, segments: [head, ...details], labelled: [...labelledHead, ...details] };
}

function detailsOf(kind: AttachmentKind, attachment: ConversationPreviewAttachment | null, language: string, str: Str): readonly PreviewSegment[] {
  if (!attachment) return [];
  const timed = kind === 'voice' || kind === 'audio' || kind === 'video';
  const sized = kind === 'photo' || kind === 'video';
  const duration = timed && positive(attachment.duration) ? [label(formatClock(Math.round(attachment.duration / 1000)))] : [];
  const dimensions = sized && positive(attachment.width) && positive(attachment.height)
    ? [label(`${Math.round(attachment.width)}×${Math.round(attachment.height)}`)]
    : [];
  const pages = kind === 'file' && positive(attachment.pageCount)
    ? [label(str(attachment.pageCount === 1 ? 'detail.pages.one' : 'detail.pages.other', { count: Math.floor(attachment.pageCount) }))]
    : [];
  const size = positive(attachment.fileSize) ? [label(formatPreviewFileSize(language, attachment.fileSize))] : [];
  return [...duration, ...dimensions, ...pages, ...size];
}

const EFFECT_KEY: Readonly<Record<BehavioralEffect, ConversationPreviewStringKey>> = {
  SHAKE: 'effect.shake',
  ZOOM: 'effect.zoom',
  EXPLODE: 'effect.explode',
  CONFETTI: 'effect.confetti',
  FIREWORKS: 'effect.fireworks',
  WAOO: 'effect.waoo',
  GLOW: 'effect.glow',
  PULSE: 'effect.pulse',
  RAINBOW: 'effect.rainbow',
  SPARKLE: 'effect.sparkle',
};

function effectSegments(effects: readonly BehavioralEffect[], str: Str): readonly PreviewSegment[] {
  const [only] = effects;
  if (effects.length === 1 && only) return [label(str(EFFECT_KEY[only]))];
  if (effects.length > 1) return [label(str('effect.count', { count: effects.length }))];
  return [];
}

/**
 * Un appel terminé, localisé depuis sa synthèse (`LastMessageCallSummary`),
 * jamais depuis le texte français stocké. La flèche vient de l'appelant :
 * `initiatorId` est un `User.id`, comparé au lecteur.
 */
function callLine(call: LastMessageCallSummary, viewerId: string, str: Str): ConversationPreview {
  const outgoing = call.initiatorId === viewerId;
  const direction = outgoing ? 'outgoing' : 'incoming';
  const icon: PreviewIcon = call.kind === 'video' ? 'call-video' : 'call-audio';
  const line = (tone: PreviewTone, segments: readonly PreviewSegment[]) =>
    preview({ kind: 'call', tone, icon, direction, segments });

  switch (call.outcome) {
    case 'ongoing':
      return line('success', [label(str('call.active'))]);
    case 'missed':
      if (!outgoing) return line('danger', [label(str('call.missed'))]);
      return line('default', [label(str(call.endedByInitiator ? 'call.cancelled' : 'call.unanswered'))]);
    case 'rejected':
      return line('default', [label(str('call.declined'))]);
    case 'failed':
      return line('default', [label(str('call.failed'))]);
    case 'completed': {
      const duration = positive(call.durationSec) ? [label(formatClock(Math.round(call.durationSec)))] : [];
      return line('default', [label(str(call.kind === 'video' ? 'call.video' : 'call.audio')), ...duration]);
    }
  }
}

/**
 * Les clés d'événement système que ce composeur sait dire — toutes posées par
 * le serveur (`SystemEventKey`, #7545 puis #7593) avec des params `actor` /
 * `target` en NOMS affichés. Une clé absente d'ici se rend en `system.generic`,
 * jamais en texte brut.
 */
const SYSTEM_KEYS: Readonly<Record<string, (params: Readonly<Record<string, string | number>>) => ConversationPreviewStringKey>> = {
  'system.member-joined': () => 'system.member.joined',
  'system.members-arrived': (params) => arrivalsLineKey(Number(params['count'] ?? 1)),
  'system.encryption-enabled': (params) => (params['mode'] === 'e2ee' ? 'system.encryption.e2ee' : 'system.encryption.enabled'),
  'system.member-added': () => 'system.member.added',
  'system.member-removed': () => 'system.member.removed',
  'system.member-left': () => 'system.member.left',
  'system.conversation-renamed': () => 'system.conversation.renamed',
  'system.conversation-image': () => 'system.conversation.image',
};

function systemLine(message: ConversationPreviewMessage, input: ConversationPreviewInput, str: Str): ConversationPreview {
  const event = message.systemEvent ?? null;
  if (event) {
    const raw = event.params ?? {};
    const key = SYSTEM_KEYS[event.key]?.(raw) ?? 'system.generic';
    const someone = str('message.author.unknown');
    const params = { actor: raw['name'] ?? someone, target: someone, ...raw };
    return preview({ kind: 'system', tone: 'system', segments: [label(str(key, params))] });
  }
  const text = servedText(message, input);
  return preview({ kind: 'system', tone: 'system', segments: [text ?? label(str('system.generic'))] });
}

/**
 * Glyphes de la mise à plat. Les clients dessinent l'icône avec leur propre
 * iconographie ; ce tableau ne fait foi que pour le texte d'accessibilité et le
 * fichier de cas commun.
 */
export const PREVIEW_ICON_GLYPH: Readonly<Record<PreviewIcon, string>> = {
  'call-audio': '📞',
  'call-video': '📹',
  voice: '🎤',
  audio: '🎵',
  video: '🎬',
  photo: '📷',
  file: '📄',
  location: '📍',
  sticker: '🏷',
  attachments: '📎',
  effect: '✨',
  forward: '↪',
  'view-once': '👁',
  ephemeral: '🔥',
  expired: '⏱',
  hidden: '🙈',
  encrypted: '🔒',
};

/**
 * La ligne mise à plat, dans la langue de CADRAGE : `Auteur : 🎤 Message vocal · 0:12`.
 * Le séparateur d'auteur est celui de la langue : « Alice : » en français, « Alice: » ailleurs.
 */
export function renderConversationPreviewText(value: ConversationPreview, language: string): string {
  const glyph = value.icon ? `${PREVIEW_ICON_GLYPH[value.icon]} ` : '';
  const line = `${glyph}${value.segments.map((segment) => segment.text).join(' · ')}`;
  return value.author ? conversationPreviewString(language, 'line.author', { author: value.author.label, line }) : line;
}
