import { useEffect, useState } from 'react';

/**
 * **QUI PARLE DANS LE DUO AUDIO** (P9.6) — le pair d'un flux, au niveau audio reçu (`peer-audio-meter.ts`,
 * chargé à la demande), jamais lu dans les sous-titres : l'anneau s'allume aussi quand ils sont éteints.
 * `null` : aucun flux à mesurer (sonnerie, appel pas joint, appel fini) — la mesure se clôt, personne ne parle.
 */
export function usePeerSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (stream === null) return undefined;
    const meter = new AbortController();
    import('./peer-audio-meter').then((module) => module.meterPeer(stream, setSpeaking, meter.signal), () => undefined);
    return () => meter.abort();
  }, [stream]);
  return speaking;
}
