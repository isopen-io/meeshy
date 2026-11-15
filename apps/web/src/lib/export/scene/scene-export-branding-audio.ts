import { BRAND_JINGLE, brandIntroSamples, brandOutroSamples } from './brand-jingle';
import type { BrandedTimeline, TimeWindow } from './scene-export-branding-plan';

/**
 * **LE SON DE LA MARQUE DANS LA PISTE DE L'EXPORT** (#13997, #10537) — le
 * jingle d'ouverture joue dès zéro, EN ENTIER ; celui de fermeture entre avec
 * le logo (carte sans auteur) ou à la 2e phase de la carte d'auteur, le logo
 * terminant en silence. C'est le son de la story qui leur fait place : il
 * monte de 0 à 1 pendant la queue du jingle d'ouverture et il est muet quand
 * celui de fermeture entre (miroir d'iOS : `StoryExportJingleMix`).
 *
 * Le programme est une loi pure (`brandAudioPlan`) ; `playBrandAudio` ne fait
 * que le poser sur un contexte Web Audio. Le PCM est calculé (`brand-jingle`),
 * jamais chargé : aucun fichier à tirer, aucune attente.
 */

export type BrandJingleKind = 'intro' | 'outro';

export type BrandJinglePlay = {
  readonly kind: BrandJingleKind;
  readonly whenS: number;
};

type Span = { readonly startS: number; readonly endS: number };

export type BrandAudioPlan = {
  readonly jingles: readonly BrandJinglePlay[];
  /** La fenêtre où le son de la story monte (0 → 1), sous la queue du jingle d'ouverture. */
  readonly storyRise: Span | null;
  /** La fenêtre où le son de la story s'éteint (1 → 0), avant le jingle de fermeture. */
  readonly storyFade: Span;
};

const span = (window: TimeWindow): Span => ({ startS: window.startMs / 1000, endS: (window.startMs + window.durationMs) / 1000 });

export function brandAudioPlan(params: { readonly timeline: BrandedTimeline; readonly lengthMs: number }): BrandAudioPlan {
  const { timeline, lengthMs } = params;
  const intro: BrandJinglePlay | null = timeline.introJingle === null ? null : { kind: 'intro', whenS: timeline.introJingle.whenMs / 1000 };
  const outro: BrandJinglePlay = { kind: 'outro', whenS: timeline.outroJingle.whenMs / 1000 };
  return {
    jingles: [intro, outro].filter((jingle): jingle is BrandJinglePlay => jingle !== null && jingle.whenS * 1000 < lengthMs),
    storyRise: timeline.storyAudioRise === null ? null : span(timeline.storyAudioRise),
    storyFade: span(timeline.storyAudioFall),
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
  if (plan.storyRise !== null) {
    storyBus.gain.setValueAtTime(0, startAt + plan.storyRise.startS);
    storyBus.gain.linearRampToValueAtTime(1, startAt + plan.storyRise.endS);
  }
  storyBus.gain.setValueAtTime(1, startAt + plan.storyFade.startS);
  storyBus.gain.linearRampToValueAtTime(0, startAt + plan.storyFade.endS);
  storyBus.connect(destination);
  const sources = plan.jingles.map((jingle) => {
    const samples = samplesOf(jingle.kind);
    const buffer = context.createBuffer(1, samples.length, BRAND_JINGLE.sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
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
