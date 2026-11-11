import { useEffect, useState } from 'react';

/**
 * **QUI PARLE DANS LE DUO AUDIO** (P9.6) — le pair d'un flux, au niveau audio reçu (`peer-audio-meter.ts`,
 * chargé à la demande), jamais lu dans les sous-titres : l'anneau s'allume aussi quand ils sont éteints.
 * `null` : aucun flux à mesurer (sonnerie, appel pas joint) — personne ne parle.
 */
export function usePeerSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (stream === null) return undefined;
    const meter: { stop: (() => void) | null; closed: boolean } = { stop: null, closed: false };
    void import('./peer-audio-meter').then(({ meterPeer }) => {
      if (!meter.closed) meter.stop = meterPeer(stream, setSpeaking);
    });
    return () => {
      meter.closed = true;
      meter.stop?.();
      setSpeaking(false);
    };
  }, [stream]);
  return speaking;
}
