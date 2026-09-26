import { aggregateQuality, appliedTier, encodingFor, peerRate, readStats, type PeerQuality, type StatsRead, type VideoTier } from './call-quality';
import { initialSurvival, stepSurvival, type SurvivalStage, type SurvivalState } from './call-survival';

/**
 * **LA BOUCLE DE QUALITÉ** (#8047) — à chaque relevé, `getStats` sur CHAQUE
 * lien : le palier d'encodage vidéo de chaque pair suit SON lien
 * (`setParameters`, sans renégociation — un pair lent ne ralentit pas les
 * autres), la survie suit le PIRE lien (`call-survival.ts`) et impose son
 * plancher à tous. L'audio passe en priorité haute une fois pour toutes : c'est
 * lui qui garde l'appel quand la vidéo se tait. Le moteur (`engine.ts`) ne fait
 * que lancer `tick` et publier ce qu'il rend.
 */

export type QualityTick = { readonly total: PeerQuality; readonly stage: SurvivalStage; readonly codec: string | null };

export type QualityLoopDeps = {
  readonly links: () => ReadonlyArray<readonly [string, RTCPeerConnection]>;
  readonly wantsVideo: () => boolean;
  readonly now: () => number;
};

export type QualityLoop = { readonly tick: () => Promise<QualityTick | null> };

const senderOf = (pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | null =>
  typeof pc.getTransceivers !== 'function' ? null : (pc.getTransceivers().find((transceiver) => transceiver.receiver.track?.kind === kind)?.sender ?? null);

async function rewrite(sender: RTCRtpSender | null, change: (encoding: RTCRtpEncodingParameters) => RTCRtpEncodingParameters): Promise<boolean> {
  if (sender === null || typeof sender.getParameters !== 'function') return false;
  const parameters = sender.getParameters();
  if (parameters.encodings.length === 0) return false;
  return sender.setParameters({ ...parameters, encodings: parameters.encodings.map(change) }).then(
    () => true,
    () => false,
  );
}

export function createQualityLoop(deps: QualityLoopDeps): QualityLoop {
  let survival: SurvivalState = initialSurvival();
  let previous: ReadonlyMap<string, StatsRead> = new Map();
  let applied: ReadonlyMap<string, VideoTier> = new Map();
  let prioritized: ReadonlySet<RTCRtpSender> = new Set();

  const measure = async ([userId, pc]: readonly [string, RTCPeerConnection]): Promise<readonly [string, RTCPeerConnection, StatsRead] | null> => {
    if (typeof pc.getStats !== 'function') return null;
    const report = await pc.getStats().catch(() => null);
    return report === null ? null : [userId, pc, readStats(report, deps.now())];
  };

  const prioritizeAudio = async (pc: RTCPeerConnection): Promise<void> => {
    const sender = senderOf(pc, 'audio');
    if (sender === null || prioritized.has(sender)) return;
    if (await rewrite(sender, (encoding) => ({ ...encoding, priority: 'high', networkPriority: 'high' }))) prioritized = new Set([...prioritized, sender]);
  };

  const applyTier = async (userId: string, pc: RTCPeerConnection, tier: VideoTier): Promise<readonly [string, VideoTier] | null> => {
    if (applied.get(userId) === tier) return [userId, tier];
    return (await rewrite(senderOf(pc, 'video'), (encoding) => encodingFor(encoding, tier))) ? [userId, tier] : null;
  };

  let inFlight = false;

  const measureAll = async (): Promise<QualityTick | null> => {
    const reads = (await Promise.all(deps.links().map(measure))).filter((entry): entry is readonly [string, RTCPeerConnection, StatsRead] => entry !== null);
    const rates = reads.map(([userId, pc, read]) => [userId, pc, peerRate(read, previous.get(userId) ?? null)] as const);
    previous = new Map(reads.map(([userId, , read]) => [userId, read]));
    const total = aggregateQuality(rates.map(([, , rate]) => rate));
    if (total === null) return null;
    const wantsVideo = deps.wantsVideo();
    survival = stepSurvival(survival, { at: deps.now(), level: total.level, wantsVideo });
    await Promise.all(rates.map(([, pc]) => prioritizeAudio(pc)));
    const tiers = await Promise.all(rates.map(([userId, pc, rate]) => applyTier(userId, pc, wantsVideo ? appliedTier(rate.level, survival.stage) : 'high')));
    applied = new Map(tiers.filter((entry): entry is readonly [string, VideoTier] => entry !== null));
    return { total, stage: survival.stage, codec: reads.map(([, , read]) => read.codec).find((codec) => codec !== null) ?? null };
  };

  /** Un relevé lent n'en chevauche pas un autre : la survie n'avance qu'une fois par relevé. */
  const tick = async (): Promise<QualityTick | null> => {
    if (inFlight) return null;
    inFlight = true;
    try {
      return await measureAll();
    } finally {
      inFlight = false;
    }
  };

  return { tick };
}
