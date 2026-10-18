import { useEffect } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';

import type { VoiceNowPlayingSource } from './now-playing';

export type VoiceNowPlayingFacts = Omit<VoiceNowPlayingSource, 'resolve'>;

/** L'adresse ABSOLUE d'une image, que la coque télécharge hors de la page (#10624). */
export function absoluteMediaUrl(url: string): string {
  const src = attachmentSrc(url);
  try {
    return new URL(src, typeof location !== 'undefined' ? location.href : undefined).href;
  } catch {
    return src;
  }
}

/**
 * **LA BULLE D'UN VOCAL SE DÉCRIT À LA CARTE DE LECTURE DE LA COQUE** (#10624)
 * — l'auteur, la conversation, la date et l'avatar, enregistrés par id de
 * pièce : la coque les relit sur l'`<audio>` qui joue (`data-np-attachment`).
 *
 * La coque lit ce registre (`shell-playback.ts`), et le navigateur aussi
 * quand il sert la Media Session API (`web-now-playing.ts`, #10890). Le
 * registre et la loi des étiquettes (`now-playing.ts`) arrivent par
 * `import()` : le chunk des pièces jointes ne les porte pas, et un navigateur
 * sans carte de lecture ne les télécharge jamais.
 */
export const nowPlayingCardShown = (): boolean => __SHELL__ || (typeof navigator !== 'undefined' && 'mediaSession' in navigator);

export function useVoiceNowPlaying(attachmentId: string, facts: VoiceNowPlayingFacts, described: boolean = nowPlayingCardShown()): void {
  const { carrier, conversationTitle, conversationAvatarUrl, message, attachment } = facts;
  useEffect(() => {
    if (!described) return;
    void import('./now-playing').then(({ registerNowPlaying, voiceNowPlayingTags }) =>
      registerNowPlaying(attachmentId, voiceNowPlayingTags({ ...facts, resolve: absoluteMediaUrl })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    described,
    attachmentId,
    carrier?.sender?.displayName,
    carrier?.sender?.avatarUrl,
    carrier?.sentAt,
    conversationTitle,
    conversationAvatarUrl,
    message?.isViewOnce,
    message?.isBlurred,
    message?.isEncrypted,
    message?.expiresAt,
    message?.effectFlags,
    attachment,
  ]);
}
