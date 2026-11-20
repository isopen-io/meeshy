/**
 * **CE QUE `getStats` DIT DES GELS, DE LA LIMITATION ET DU RELAIS** (#19876) —
 * la projection web de `CallMediaQuality.reduce` (iOS, #11294) : gels, NACK et
 * PLI de la vidéo reçue ; tampon de gigue et échantillons masqués de l'audio
 * reçu ; cause de limitation de l'émission vidéo ; type du candidat local de la
 * paire élue et son transport vers le relais.
 *
 * Les compteurs sont CUMULÉS par WebRTC depuis l'ouverture du lien : le dernier
 * relevé les porte tous, et rien n'est lu au raccrochage (les liens y sont
 * fermés). Une mesure que le navigateur ne donne pas reste `null`, jamais 0 —
 * Firefox et Safari ne connaissent pas `freezeCount`.
 */

export type MediaQuality = {
  readonly freezeCount: number | null;
  /** Secondes. */
  readonly totalFreezesDuration: number | null;
  /** Secondes cumulées des seuls flux qui portent aussi un compte émis positif ; divisées par `jitterBufferEmittedCount` au rapport. */
  readonly jitterBufferDelay: number | null;
  readonly jitterBufferEmittedCount: number | null;
  readonly concealedSamples: number | null;
  readonly nackCount: number | null;
  readonly pliCount: number | null;
  readonly qualityLimitationReason: string | null;
  readonly candidateType: string | null;
  readonly relayProtocol: string | null;
};

type Counter = 'freezeCount' | 'totalFreezesDuration' | 'jitterBufferDelay' | 'jitterBufferEmittedCount' | 'concealedSamples' | 'nackCount' | 'pliCount';

const COUNTERS: readonly Counter[] = ['freezeCount', 'totalFreezesDuration', 'jitterBufferDelay', 'jitterBufferEmittedCount', 'concealedSamples', 'nackCount', 'pliCount'];

const addMeasured = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : a + b);

/** Un maillage : les compteurs s'additionnent sur les pairs, un relais l'emporte sur un lien direct. */
export function combineMediaQuality(peers: readonly MediaQuality[]): MediaQuality | null {
  const [first, ...rest] = peers;
  if (first === undefined) return null;
  const route = peers.find((peer) => peer.candidateType === 'relay') ?? peers.find((peer) => peer.candidateType !== null);
  const counters = rest.reduce((sum, peer) => COUNTERS.reduce((next, field) => ({ ...next, [field]: addMeasured(next[field], peer[field]) }), sum), first);
  return {
    ...counters,
    qualityLimitationReason: peers.map((peer) => peer.qualityLimitationReason).find((reason) => reason !== null) ?? null,
    candidateType: route?.candidateType ?? null,
    relayProtocol: route?.relayProtocol ?? null,
  };
}
