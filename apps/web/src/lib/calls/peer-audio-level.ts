import { useEffect, useState } from 'react';

import { hearing, isSpeaking, QUIET } from './call-speaking';

/**
 * **LE NIVEAU AUDIO REÇU D'UN PAIR** (P9.6) — un `AnalyserNode` sur son flux distant,
 * relevé toutes les 200 ms : la valeur efficace du signal (0…1), l'équivalent de l'`audioLevel`
 * des statistiques `inbound-rtp` que lisent iOS et Android. Aucune image n'est calculée : le
 * composant ne se redessine qu'au BASCULEMENT de la parole (`hearing`, hystérésis).
 */
const POLL_MS = 200;
const FFT = 1024;

type AudioContextConstructor = typeof AudioContext;

const contextOf = (): AudioContextConstructor | null => (typeof AudioContext === 'function' ? AudioContext : null);

/** Ce flux porte-t-il de l'audio à mesurer ? Un flux sans piste (sonnerie, vidéo muette) n'ouvre aucun contexte. */
const hasAudio = (stream: MediaStream | null): stream is MediaStream => stream !== null && typeof stream.getAudioTracks === 'function' && stream.getAudioTracks().length > 0;

export function usePeerSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const Context = contextOf();
    if (Context === null || !hasAudio(stream)) {
      setSpeaking(false);
      return undefined;
    }
    const context = new Context();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT;
    source.connect(analyser);
    void context.resume?.().catch(() => undefined);
    const samples = new Float32Array(FFT);
    let speech = QUIET;
    const poll = (): void => {
      analyser.getFloatTimeDomainData(samples);
      const energy = samples.reduce((sum, sample) => sum + sample * sample, 0);
      speech = hearing(speech, Math.sqrt(energy / samples.length), Date.now());
      setSpeaking(isSpeaking(speech));
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close().catch(() => undefined);
      setSpeaking(false);
    };
  }, [stream]);
  return speaking;
}
