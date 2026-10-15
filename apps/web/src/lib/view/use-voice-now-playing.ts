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
 * Seule la coque lit ce registre (`shell-playback.ts`, chargé derrière
 * `__SHELL__`). Le registre et la loi des étiquettes (`now-playing.ts`)
 * arrivent donc par `import()` et dans la coque SEULEMENT : un navigateur ne
 * les télécharge jamais, et le chunk des pièces jointes ne les porte pas.
 */
export function useVoiceNowPlaying(attachmentId: string, facts: VoiceNowPlayingFacts, inShell: boolean = __SHELL__): void {
  const { carrier, conversationTitle, conversationAvatarUrl, message, attachment } = facts;
  useEffect(() => {
    if (!inShell) return;
    void import('./now-playing').then(({ registerNowPlaying, voiceNowPlayingTags }) =>
      registerNowPlaying(attachmentId, voiceNowPlayingTags({ ...facts, resolve: absoluteMediaUrl })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inShell,
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
