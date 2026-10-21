import { maskedAttachment, type AttachmentProtectionFlags } from '@meeshy/shared/utils/attachment-protection';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { Message } from '@/lib/api/types';
import type { MediaCarrier } from './media';

/**
 * **CE QUE LA CARTE DE LECTURE DE LA COQUE DIT DU VOCAL QUI JOUE** (#10624) —
 * miroir de la carte Now Playing d'iOS (`ConversationAudioCoordinator+
 * NowPlaying.swift`) : l'auteur, la conversation, la date du vocal, l'avatar
 * de l'auteur, sinon celui de la conversation. La coque compose le titre
 * « {conversation} — {date} » dans la langue de ses libellés ; la page ne lui
 * remet que ces faits, déjà résolus — aucune seconde requête côté natif.
 *
 * Un vocal PROTÉGÉ (éphémère, vue unique, flouté, chiffré) ne dit que son
 * auteur, comme la Live Activity iOS (`VoicePlaybackActivityLaw`) : ni
 * conversation, ni date, ni image ne partent vers l'écran verrouillé.
 *
 * Les hôtes de l'`<audio>` (la bulle) ENREGISTRENT ces faits par id de pièce ;
 * tout `<audio>` qui porte `data-np-attachment` est relu ici par la coque —
 * la visionneuse et le mini-lecteur rejouent le vocal que la bulle a décrit.
 */
export type NowPlayingTags = {
  readonly sender: string | null;
  readonly conversation: string | null;
  readonly sentAtMs: number | null;
  readonly artworkUrl: string | null;
  readonly protected: boolean;
};

export type VoiceNowPlayingSource = {
  readonly carrier?: Pick<MediaCarrier, 'sender' | 'sentAt'> | undefined;
  readonly conversationTitle?: string | undefined;
  readonly conversationAvatarUrl?: string | undefined;
  readonly message?: Partial<Pick<Message, 'isViewOnce' | 'isBlurred' | 'isEncrypted' | 'expiresAt' | 'effectFlags'>> | undefined;
  readonly attachment: AttachmentProtectionFlags;
  /** L'adresse ABSOLUE d'une image — la coque la télécharge hors de la page. */
  readonly resolve: (url: string) => string;
};

const PROTECTING_FLAGS = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

function isProtected(source: VoiceNowPlayingSource): boolean {
  const message = source.message;
  return (
    maskedAttachment(source.attachment) ||
    message?.isViewOnce === true ||
    message?.isBlurred === true ||
    message?.isEncrypted === true ||
    message?.expiresAt != null ||
    ((message?.effectFlags ?? 0) & PROTECTING_FLAGS) !== 0
  );
}

export function voiceNowPlayingTags(source: VoiceNowPlayingSource): NowPlayingTags {
  const sender = present(source.carrier?.sender?.displayName);
  if (isProtected(source)) return { sender, conversation: null, sentAtMs: null, artworkUrl: null, protected: true };
  const sentAt = source.carrier !== undefined ? Date.parse(source.carrier.sentAt) : Number.NaN;
  const avatar = (sender !== null ? present(source.carrier?.sender?.avatarUrl) : null) ?? present(source.conversationAvatarUrl);
  return {
    sender,
    conversation: present(source.conversationTitle),
    sentAtMs: Number.isFinite(sentAt) ? sentAt : null,
    artworkUrl: avatar === null ? null : source.resolve(avatar),
    protected: false,
  };
}

const REGISTRY_LIMIT = 200;
const registry = new Map<string, NowPlayingTags>();

export function registerNowPlaying(attachmentId: string, tags: NowPlayingTags): void {
  registry.delete(attachmentId);
  registry.set(attachmentId, tags);
  while (registry.size > REGISTRY_LIMIT) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) return;
    registry.delete(oldest);
  }
}

export function nowPlayingTagsOf(attachmentId: string | undefined): NowPlayingTags | null {
  if (attachmentId === undefined) return null;
  return registry.get(attachmentId) ?? null;
}
