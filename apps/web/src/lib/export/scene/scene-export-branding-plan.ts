import { BRAND_JINGLE } from './brand-jingle';
import type { ExportSound, SceneExportPlan } from './scene-export-plan';

/**
 * **LE MINUTAGE DE LA MARQUE D'UN EXPORT DE STORY** (#13997, #10537) — miroir
 * pur de `StoryExportBranding.makePlan` (iOS) et de `StoryExportBrandingPlan.kt`
 * (Android), mêmes constantes. L'intro d'identité TIENT 1,2 s puis se fond sur
 * 0,5 s dans la story ; la carte de fin chevauche 1,5 s de la fin de la story
 * (2 s logo seul, ou 3,5 s logo muet puis identité quand l'auteur est peint) ;
 * jamais à l'intérieur du fondu d'ouverture, jamais avant zéro.
 *
 * Les jingles s'entendent EN ENTIER, jamais sous la story (miroir de
 * `StoryExportJingleMix` iOS) : le son de la story monte de 0 à 1 pendant la
 * queue du jingle d'ouverture, et il est muet quand le jingle de fermeture
 * entre — sur le fondu de la carte d'auteur, en 0,5 s avant le logo seul.
 */

export const BRANDING_TIMING = {
  introHoldMs: 1_200,
  introCrossfadeMs: 500,
  outroMs: 2_000,
  outroOverlapMs: 1_500,
  authorLogoPhaseMs: 1_500,
  authorIdentityPhaseMs: 2_000,
  authorIdentityFadeInMs: 400,
  authorWatermarkOpacity: 0.22,
  logoOutroDuckMs: 500,
  introJingleMs: Math.round(BRAND_JINGLE.durationSeconds * 1_000),
} as const;

export type TimeWindow = { readonly startMs: number; readonly durationMs: number };

export type BrandingPlan = {
  readonly hasIntro: boolean;
  readonly storyStartMs: number;
  readonly introFade: TimeWindow;
  readonly outroDurationMs: number;
  readonly outroJingleOffsetMs: number;
};

export function makeBrandingPlan(params: { readonly hasIntro: boolean; readonly hasAuthorOutro: boolean }): BrandingPlan {
  const start = params.hasIntro ? BRANDING_TIMING.introHoldMs : 0;
  return {
    hasIntro: params.hasIntro,
    storyStartMs: start,
    introFade: { startMs: start, durationMs: params.hasIntro ? BRANDING_TIMING.introCrossfadeMs : 0 },
    outroDurationMs: params.hasAuthorOutro ? BRANDING_TIMING.authorLogoPhaseMs + BRANDING_TIMING.authorIdentityPhaseMs : BRANDING_TIMING.outroMs,
    outroJingleOffsetMs: params.hasAuthorOutro ? BRANDING_TIMING.authorLogoPhaseMs : 0,
  };
}

export type BrandedTimeline = {
  readonly storyStartMs: number;
  readonly introFade: TimeWindow;
  readonly outroStartMs: number;
  /** La fenêtre où la carte de fin recouvre la fin de la story. */
  readonly outroFade: TimeWindow;
  /** La fenêtre où le son de la story monte de 0 à 1 : la queue du jingle d'ouverture. */
  readonly storyAudioRise: TimeWindow | null;
  /** La fenêtre où le son de la story s'éteint : il est muet quand le jingle de fermeture entre. */
  readonly storyAudioFall: TimeWindow;
  readonly outroDurationMs: number;
  readonly totalMs: number;
  readonly introJingle: { readonly whenMs: number } | null;
  readonly outroJingle: { readonly whenMs: number };
};

export function brandedTimeline(params: { readonly plan: BrandingPlan; readonly storyMs: number }): BrandedTimeline {
  const { plan } = params;
  const baseEndMs = plan.storyStartMs + params.storyMs;
  const introFadeEndMs = plan.introFade.startMs + plan.introFade.durationMs;
  const outroStartMs = Math.max(baseEndMs - BRANDING_TIMING.outroOverlapMs, 0, introFadeEndMs);
  const outroJingleMs = outroStartMs + plan.outroJingleOffsetMs;
  const rise = storyAudioRise({ plan, baseEndMs });
  return {
    storyStartMs: plan.storyStartMs,
    introFade: plan.introFade,
    outroStartMs,
    outroFade: { startMs: outroStartMs, durationMs: Math.max(0, baseEndMs - outroStartMs) },
    storyAudioRise: rise,
    storyAudioFall: storyAudioFall({ plan, baseEndMs, floorMs: rise === null ? plan.storyStartMs : rise.startMs + rise.durationMs, outroJingleMs }),
    outroDurationMs: plan.outroDurationMs,
    totalMs: outroStartMs + plan.outroDurationMs,
    introJingle: plan.hasIntro ? { whenMs: 0 } : null,
    outroJingle: { whenMs: outroJingleMs },
  };
}

function storyAudioRise(params: { readonly plan: BrandingPlan; readonly baseEndMs: number }): TimeWindow | null {
  const { plan } = params;
  const endMs = Math.min(BRANDING_TIMING.introJingleMs, params.baseEndMs);
  return plan.hasIntro && endMs > plan.storyStartMs ? { startMs: plan.storyStartMs, durationMs: endMs - plan.storyStartMs } : null;
}

function storyAudioFall(params: { readonly plan: BrandingPlan; readonly baseEndMs: number; readonly floorMs: number; readonly outroJingleMs: number }): TimeWindow {
  const endMs = Math.min(Math.max(params.outroJingleMs, params.floorMs), params.baseEndMs);
  const lengthMs = params.plan.outroJingleOffsetMs > 0 ? BRANDING_TIMING.outroOverlapMs : BRANDING_TIMING.logoOutroDuckMs;
  const startMs = Math.max(endMs - lengthMs, params.floorMs);
  return { startMs, durationMs: endMs - startMs };
}

const shiftedSound = (sound: ExportSound, offsetMs: number): ExportSound => ({
  ...sound,
  startMs: sound.startMs + offsetMs,
  endMs: sound.endMs + offsetMs,
  ...(sound.envelope === undefined ? {} : { envelope: sound.envelope.map((point) => ({ ...point, atMs: point.atMs + offsetMs })) }),
});

/** Le plan de la scène posé derrière l'intro : la marque porte du temps et du son, jamais une image fixe. */
export function shiftedPlan(params: { readonly plan: SceneExportPlan; readonly offsetMs: number; readonly totalMs: number }): SceneExportPlan {
  const { plan, offsetMs } = params;
  return {
    slides: plan.slides.map((slide) => ({ ...slide, startMs: slide.startMs + offsetMs })),
    sounds: plan.sounds.map((sound) => shiftedSound(sound, offsetMs)),
    totalMs: params.totalMs,
    still: false,
  };
}
