import type { CallCaption } from './call-captions';

/**
 * Qui parle, faute d'un niveau audio sur le web : un pair dont le DERNIER
 * segment de sous-titre est encore en cours. Sans sous-titres, personne.
 */
export function speakingPeers(captions: readonly CallCaption[]): ReadonlySet<string> {
  const latest = new Map(
    captions
      .filter((caption) => !caption.mine)
      .sort((a, b) => a.at - b.at)
      .map((caption) => [caption.speakerId, caption] as const),
  );
  return new Set([...latest.values()].filter((caption) => !caption.isFinal).map((caption) => caption.speakerId));
}
