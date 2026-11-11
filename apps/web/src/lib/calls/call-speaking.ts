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

/**
 * **LA PAROLE D'UN PAIR, AU NIVEAU AUDIO REÇU** (P9.6) — la même hystérésis que les
 * vignettes d'un groupe (`ActiveSpeakerDetector` sur iOS et Android, mêmes seuils) :
 * on entre au-dessus de `SPEECH_ENTER`, on ne sort qu'après `SPEECH_HOLD_MS` passé sous
 * `SPEECH_EXIT` — sans elle, l'anneau clignoterait entre deux syllabes. Valeur immuable ;
 * le niveau (0…1, valeur efficace du signal) vient de `peer-audio-level.ts`, indépendant
 * des sous-titres : l'anneau s'allume aussi quand ils sont éteints.
 */
export const SPEECH_ENTER = 0.06;
export const SPEECH_EXIT = 0.03;
export const SPEECH_HOLD_MS = 800;

/** `loudAt` : le dernier instant où le pair était au-dessus du seuil en vigueur ; `null` : il se tait. */
export type PeerSpeech = { readonly loudAt: number | null };

export const QUIET: PeerSpeech = { loudAt: null };

export const isSpeaking = (speech: PeerSpeech): boolean => speech.loudAt !== null;

/** Un relevé à `now` : un niveau absent (aucune mesure) laisse le maintien s'écouler sans rien rallumer. */
export function hearing(speech: PeerSpeech, level: number | null, now: number): PeerSpeech {
  const threshold = speech.loudAt === null ? SPEECH_ENTER : SPEECH_EXIT;
  const loudAt = level !== null && level >= threshold ? now : speech.loudAt;
  return loudAt !== null && now - loudAt <= SPEECH_HOLD_MS ? { loudAt } : QUIET;
}
