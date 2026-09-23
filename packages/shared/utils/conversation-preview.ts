/**
 * LA LIGNE D'APERÇU D'UNE CONVERSATION — un seul composeur pour le web et iOS (#7546).
 *
 * Squelette : la forme de la valeur rendue est posée ici en premier pour que
 * les sessions web-v2 (#7547) et iOS (#7548) puissent s'y brancher.
 */

export type PreviewTone = 'default' | 'accent' | 'success' | 'danger' | 'system';

export type PreviewIcon =
  | 'call-audio'
  | 'call-video'
  | 'call-missed'
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

export type PreviewAuthor =
  | { readonly kind: 'self'; readonly label: string }
  | { readonly kind: 'member'; readonly id: string; readonly label: string };

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
  readonly live?: { readonly expiresAt: number };
  readonly action?: 'join';
  readonly direction?: 'incoming' | 'outgoing';
};
