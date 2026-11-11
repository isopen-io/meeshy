import { hearing, isSpeaking, QUIET } from './call-speaking';

/**
 * **LE NIVEAU AUDIO REÇU D'UN PAIR** (P9.6) — un `AnalyserNode` sur son flux distant, relevé
 * toutes les 200 ms : la valeur efficace du signal (0…1), l'équivalent de l'`audioLevel` des
 * statistiques `inbound-rtp` que lisent iOS et Android. Une minuterie et non `requestAnimationFrame` :
 * cinq relevés par seconde suffisent à l'hystérésis, soixante la paieraient pour rien. L'hôte n'est
 * prévenu qu'au BASCULEMENT de la parole (`hearing`) : aucun rendu par relevé. Chargé à la demande
 * (`peer-audio-level.ts`) : l'écran d'appel n'en paie pas les octets avant qu'un duo audio soit joint.
 */
const POLL_MS = 200;
const FFT = 1024;

/** Ouvre la mesure du flux jusqu'à `done` : minuterie, nœuds et `AudioContext` rendus, parole remise à « se tait ». Rien ne s'ouvre sans piste audio ni `AudioContext`, ni pour une mesure déjà close. */
export function meterPeer(stream: MediaStream, onChange: (speaking: boolean) => void, done: AbortSignal): void {
  if (done.aborted || typeof AudioContext !== 'function' || stream.getAudioTracks().length === 0) return;
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT;
  source.connect(analyser);
  void context.resume?.().catch(() => undefined);
  const samples = new Float32Array(FFT);
  let speech = QUIET;
  let speaking = false;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const energy = samples.reduce((sum, sample) => sum + sample * sample, 0);
    speech = hearing(speech, Math.sqrt(energy / samples.length), Date.now());
    if (isSpeaking(speech) === speaking) return;
    speaking = !speaking;
    onChange(speaking);
  }, POLL_MS);
  done.addEventListener('abort', () => {
    clearInterval(timer);
    source.disconnect();
    void context.close().catch(() => undefined);
    if (speaking) onChange(false);
  });
}
