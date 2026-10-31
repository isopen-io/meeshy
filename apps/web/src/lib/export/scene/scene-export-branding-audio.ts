import { BRAND_JINGLE, brandIntroSamples, brandOutroSamples } from './brand-jingle';
import type { BrandedTimeline } from './scene-export-branding-plan';

/**
 * **LE SON DE LA MARQUE DANS LA PISTE DE L'EXPORT** (#13997, #10537) — le
 * jingle d'ouverture joue dès zéro et s'estompe sur le fondu d'entrée de la
 * story ; celui de fermeture entre avec le logo (carte sans auteur) ou à la
 * 2e phase de la carte d'auteur, le logo terminant en silence. Le son de la
 * story, lui, s'éteint sur le fondu de la carte de fin (miroir d'iOS :
 * `setVolumeRamp` 1 → 0 sur `outroFade`).
 *
 * Le programme est une loi pure (`brandAudioPlan`) ; `playBrandAudio` ne fait
 * que le poser sur un contexte Web Audio. Le PCM est calculé (`brand-jingle`),
 * jamais chargé : aucun fichier à tirer, aucune attente.
 */

export type BrandJingleKind = 'intro' | 'outro';

export type BrandJinglePlay = {
  readonly kind: BrandJingleKind;
  readonly whenS: number;
  readonly fadeOut: { readonly startS: number; readonly endS: number } | null;
};

export type BrandAudioPlan = {
  readonly jingles: readonly BrandJinglePlay[];
  /** La fenêtre où le son de la story s'éteint (1 → 0). */
  readonly storyFade: { readonly startS: number; readonly endS: number };
};

export function brandAudioPlan(params: { readonly timeline: BrandedTimeline; readonly lengthMs: number }): BrandAudioPlan {
  const { timeline, lengthMs } = params;
  const intro: BrandJinglePlay | null =
    timeline.introJingle === null
      ? null
      : {
          kind: 'intro',
          whenS: timeline.introJingle.whenMs / 1000,
          fadeOut: { startS: timeline.introJingle.fadeOut.startMs / 1000, endS: (timeline.introJingle.fadeOut.startMs + timeline.introJingle.fadeOut.durationMs) / 1000 },
        };
  const outro: BrandJinglePlay = { kind: 'outro', whenS: timeline.outroJingle.whenMs / 1000, fadeOut: null };
  return {
    jingles: [intro, outro].filter((jingle): jingle is BrandJinglePlay => jingle !== null && jingle.whenS * 1000 < lengthMs),
    storyFade: { startS: timeline.outroFade.startMs / 1000, endS: (timeline.outroFade.startMs + timeline.outroFade.durationMs) / 1000 },
  };
}

const samplesOf = (kind: BrandJingleKind): Float32Array => (kind === 'intro' ? brandIntroSamples() : brandOutroSamples());

/**
 * Pose les jingles sur `destination` et rend le BUS de la story : les sons de la
 * story se branchent dessus, il s'éteint sur le fondu de la fin. `startAt` est
 * l'horloge du contexte à l'instant zéro de l'export.
 */
export function playBrandAudio(params: {
  readonly context: BaseAudioContext;
  readonly destination: AudioNode;
  readonly startAt: number;
  readonly plan: BrandAudioPlan;
}): { readonly storyBus: AudioNode; readonly stop: () => void } {
  const { context, destination, startAt, plan } = params;
  const storyBus = context.createGain();
  storyBus.gain.setValueAtTime(1, startAt + plan.storyFade.startS);
  storyBus.gain.linearRampToValueAtTime(0, startAt + plan.storyFade.endS);
  storyBus.connect(destination);
  const sources = plan.jingles.map((jingle) => {
    const samples = samplesOf(jingle.kind);
    const buffer = context.createBuffer(1, samples.length, BRAND_JINGLE.sampleRate);
    buffer.getChannelData(0).set(samples);
    const gain = context.createGain();
    if (jingle.fadeOut !== null) {
      gain.gain.setValueAtTime(1, startAt + jingle.fadeOut.startS);
      gain.gain.linearRampToValueAtTime(0, startAt + jingle.fadeOut.endS);
    }
    gain.connect(destination);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(startAt + jingle.whenS);
    return source;
  });
  return {
    storyBus,
    stop: () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* une source déjà arrêtée ne se rarrête pas */
        }
      }
    },
  };
}
