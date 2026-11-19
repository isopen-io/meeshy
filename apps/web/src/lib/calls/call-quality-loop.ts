import { audioBitrateFor, DATA_PROFILES, profiledEncoding, type DataProfile } from './call-data-profile';
import { aggregateQuality, initialTierState, linkTier, peerRate, readStats, sentTier, stepTier, TIER_ENCODING, type MediaPath, type PeerQuality, type StatsRead, type TierEncoding, type TierState, type VideoTier } from './call-quality';
import { initialSurvival, stepSurvival, type SurvivalStage, type SurvivalState } from './call-survival';

/**
 * **LA BOUCLE DE QUALITÉ** (#8047) — à chaque relevé, `getStats` sur CHAQUE
 * lien : le palier d'encodage vidéo de chaque pair suit SON lien
 * (`setParameters`, sans renégociation — un pair lent ne ralentit pas les
 * autres), la survie suit le PIRE lien (`call-survival.ts`) et impose son
 * plancher à tous. L'audio passe en priorité haute : c'est lui qui garde
 * l'appel quand la vidéo se tait. Le profil de données (#8697,
 * `call-data-profile.ts`) plafonne l'une et l'autre — débit, images par
 * seconde, résolution, débit Opus — et un lien mauvais fait descendre la voix
 * au palier dégradé. Le moteur (`engine.ts`) ne fait que lancer `tick` et
 * publier ce qu'il rend.
 *
 * #19775 — le palier d'un lien suit son débit estimé et la perte que le pair
 * constate sur MA vidéo (`linkTier`), avec hystérésis (`stepTier`) ; il est
 * rattaché à la CONNEXION, pas au pair : un lien reconstruit reçoit ses
 * plafonds au premier relevé. La vidéo part en priorité réseau haute.
 * #19777 — pendant un partage d'écran, l'image garde sa résolution : le texte
 * doit rester lisible, quitte à descendre à 15 i/s.
 */

export type QualityTick = {
  readonly total: PeerQuality;
  readonly stage: SurvivalStage;
  readonly codec: string | null;
  readonly profile: DataProfile;
  readonly audioBitrate: number;
  readonly path: MediaPath | null;
};

export type QualityLoopDeps = {
  readonly links: () => ReadonlyArray<readonly [string, RTCPeerConnection]>;
  readonly wantsVideo: () => boolean;
  readonly now: () => number;
  /** Le profil de données du moment ; Wi-Fi quand rien n'est annoncé. */
  readonly profile?: () => DataProfile;
  /** Je partage mon écran : la vidéo envoyée est un document, pas un visage (#19777). */
  readonly sharingScreen?: () => boolean;
};

const SCREEN_ENCODING: TierEncoding = { active: true, maxBitrate: 3_000_000, scaleResolutionDownBy: 1, maxFramerate: 15 };

type VideoPlan = { readonly key: string; readonly encoding: TierEncoding; readonly preference: RTCDegradationPreference };

const videoPlan = (tier: VideoTier, profile: DataProfile, sharing: boolean): VideoPlan =>
  sharing && tier !== 'suspended' && tier !== 'frozen'
    ? { key: 'screen', encoding: SCREEN_ENCODING, preference: 'maintain-resolution' }
    : { key: `${tier}:${profile}`, encoding: profiledEncoding(TIER_ENCODING[tier], profile), preference: DATA_PROFILES[profile].degradationPreference };

export type QualityLoop = { readonly tick: () => Promise<QualityTick | null> };

const senderOf = (pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | null =>
  typeof pc.getTransceivers !== 'function' ? null : (pc.getTransceivers().find((transceiver) => transceiver.receiver.track?.kind === kind)?.sender ?? null);

/** `setParameters` exige un `getParameters` frais à chaque essai : un refus de la préférence de dégradation se rejoue sans elle. */
async function rewrite(sender: RTCRtpSender | null, change: (encoding: RTCRtpEncodingParameters) => RTCRtpEncodingParameters, preference?: RTCDegradationPreference): Promise<boolean> {
  if (sender === null || typeof sender.getParameters !== 'function') return false;
  const attempt = (degradation: RTCDegradationPreference | undefined): Promise<boolean> => {
    const parameters = sender.getParameters();
    if (parameters.encodings.length === 0) return Promise.resolve(false);
    const next = { ...parameters, encodings: parameters.encodings.map(change), ...(degradation === undefined ? {} : { degradationPreference: degradation }) };
    return sender.setParameters(next).then(
      () => true,
      () => false,
    );
  };
  return (await attempt(preference)) || (preference !== undefined && attempt(undefined));
}

export function createQualityLoop(deps: QualityLoopDeps): QualityLoop {
  let survival: SurvivalState = initialSurvival();
  let previous: ReadonlyMap<string, StatsRead> = new Map();
  let applied: ReadonlyMap<string, readonly [RTCPeerConnection, string]> = new Map();
  let steady: ReadonlyMap<string, readonly [RTCPeerConnection, TierState]> = new Map();
  let voiced: ReadonlyMap<string, readonly [RTCPeerConnection, number]> = new Map();

  const measure = async ([userId, pc]: readonly [string, RTCPeerConnection]): Promise<readonly [string, RTCPeerConnection, StatsRead] | null> => {
    if (typeof pc.getStats !== 'function') return null;
    const report = await pc.getStats().catch(() => null);
    return report === null ? null : [userId, pc, readStats(report, deps.now())];
  };

  const voice = async (userId: string, pc: RTCPeerConnection, bitrate: number): Promise<readonly [string, readonly [RTCPeerConnection, number]] | null> => {
    const current = voiced.get(userId);
    if (current !== undefined && current[0] === pc && current[1] === bitrate) return [userId, current];
    const done = await rewrite(senderOf(pc, 'audio'), (encoding) => ({ ...encoding, priority: 'high', networkPriority: 'high', maxBitrate: bitrate }));
    return done ? [userId, [pc, bitrate]] : null;
  };

  const applyTier = async (userId: string, pc: RTCPeerConnection, plan: VideoPlan): Promise<readonly [string, readonly [RTCPeerConnection, string]] | null> => {
    const current = applied.get(userId);
    if (current !== undefined && current[0] === pc && current[1] === plan.key) return [userId, current];
    const done = await rewrite(senderOf(pc, 'video'), (encoding) => ({ ...encoding, ...plan.encoding, networkPriority: 'high' }), plan.preference);
    return done ? [userId, [pc, plan.key]] : null;
  };

  const steadyTierOf = (userId: string, pc: RTCPeerConnection, read: StatsRead, rate: PeerQuality): TierState => {
    const previousState = steady.get(userId);
    const state = previousState !== undefined && previousState[0] === pc ? previousState[1] : initialTierState();
    return stepTier(state, linkTier({ level: rate.level, availableOutgoingBitrate: read.availableOutgoingBitrate, uplinkLoss: read.uplinkLoss }));
  };

  let inFlight = false;

  const measureAll = async (): Promise<QualityTick | null> => {
    const reads = (await Promise.all(deps.links().map(measure))).filter((entry): entry is readonly [string, RTCPeerConnection, StatsRead] => entry !== null);
    const rates = reads.map(([userId, pc, read]) => [userId, pc, peerRate(read, previous.get(userId) ?? null), read] as const);
    previous = new Map(reads.map(([userId, , read]) => [userId, read]));
    const total = aggregateQuality(rates.map(([, , rate]) => rate));
    if (total === null) return null;
    const wantsVideo = deps.wantsVideo();
    const profile = deps.profile?.() ?? 'wifi';
    survival = stepSurvival(survival, { at: deps.now(), level: total.level, wantsVideo });
    const voices = await Promise.all(rates.map(([userId, pc, rate]) => voice(userId, pc, audioBitrateFor(profile, rate.level))));
    voiced = new Map(voices.filter((entry): entry is readonly [string, readonly [RTCPeerConnection, number]] => entry !== null));
    const states = rates.map(([userId, pc, rate, read]) => [userId, pc, steadyTierOf(userId, pc, read, rate)] as const);
    steady = new Map(states.map(([userId, pc, state]) => [userId, [pc, state] as const]));
    const sharing = deps.sharingScreen?.() === true;
    const tiers = await Promise.all(states.map(([userId, pc, state]) => applyTier(userId, pc, videoPlan(wantsVideo ? sentTier(state.tier, survival.stage) : 'high', profile, sharing))));
    applied = new Map(tiers.filter((entry): entry is readonly [string, readonly [RTCPeerConnection, string]] => entry !== null));
    const paths = reads.map(([, , read]) => read.path);
    return {
      total,
      stage: survival.stage,
      codec: reads.map(([, , read]) => read.codec).find((codec) => codec !== null) ?? null,
      profile,
      audioBitrate: audioBitrateFor(profile, total.level),
      path: paths.includes('relay') ? 'relay' : paths.includes('direct') ? 'direct' : null,
    };
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
