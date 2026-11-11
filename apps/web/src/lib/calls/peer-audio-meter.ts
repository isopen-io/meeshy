import { hearing, isSpeaking, QUIET } from './call-speaking';

/**
 * **LE NIVEAU AUDIO REÇU D'UN PAIR** (P9.6) — un `AnalyserNode` sur son flux distant, relevé
 * toutes les 200 ms : la valeur efficace du signal (0…1), l'équivalent de l'`audioLevel` des
 * statistiques `inbound-rtp` que lisent iOS et Android. Rien n'est calculé par image, et l'hôte
 * n'est prévenu qu'au BASCULEMENT de la parole (`hearing`, hystérésis). Chargé à la demande
 * (`peer-audio-level.ts`) : l'écran d'appel n'en paie pas les octets avant qu'un duo audio soit joint.
 */
const POLL_MS = 200;
const FFT = 1024;

/** Ouvre la mesure du flux ; rend de quoi la fermer, ou `null` s'il n'y a rien à mesurer (aucun `AudioContext`, aucune piste audio). */
export function meterPeer(stream: MediaStream, onChange: (speaking: boolean) => void): (() => void) | null {
  if (typeof AudioContext !== 'function' || stream.getAudioTracks().length === 0) return null;
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT;
  source.connect(analyser);
  void context.resume?.().catch(() => undefined);
  const samples = new Float32Array(FFT);
  let speech = QUIET;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const energy = samples.reduce((sum, sample) => sum + sample * sample, 0);
    speech = hearing(speech, Math.sqrt(energy / samples.length), Date.now());
    onChange(isSpeaking(speech));
  }, POLL_MS);
  return () => {
    clearInterval(timer);
    source.disconnect();
    void context.close().catch(() => undefined);
  };
}
