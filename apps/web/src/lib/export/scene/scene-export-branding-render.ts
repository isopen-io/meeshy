import type { AppliedBranding } from './scene-export-branding';
import { paintAuthorOutroCard, paintIntroCard, paintLogoCard, type BrandingCanvas } from './scene-export-branding-paint';
import type { BrandedTimeline } from './scene-export-branding-plan';

/**
 * **QUI EST PEINT, À CHAQUE INSTANT** (#13997) — l'intro opaque tient 1,2 s
 * puis s'efface sur la story (crossfade symétrique d'iOS : l'intro à `1 → 0`
 * par-dessus la story pleine) ; la carte de fin monte de `0 → 1` sur la fin de
 * la story puis tient seule. La loi est pure ; `paintBrandedFrame` la pose sur
 * le canvas.
 */

export type BrandedFrameLayers = {
  /** La story est peinte (sous l'intro qui s'efface, sous la carte de fin qui monte). */
  readonly story: boolean;
  readonly intro: { readonly alpha: number } | null;
  readonly outro: { readonly alpha: number; readonly localMs: number } | null;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function brandedFrameLayers(timeline: BrandedTimeline, tMs: number): BrandedFrameLayers {
  const introFadeEnd = timeline.introFade.startMs + timeline.introFade.durationMs;
  const baseEndMs = timeline.outroFade.startMs + timeline.outroFade.durationMs;
  const inHold = timeline.introFade.durationMs > 0 && tMs < timeline.introFade.startMs;
  const inFade = timeline.introFade.durationMs > 0 && tMs >= timeline.introFade.startMs && tMs < introFadeEnd;
  const intro = inHold ? { alpha: 1 } : inFade ? { alpha: 1 - (tMs - timeline.introFade.startMs) / timeline.introFade.durationMs } : null;
  const outroOn = tMs >= timeline.outroStartMs;
  const outro = outroOn
    ? {
        alpha: timeline.outroFade.durationMs > 0 ? clamp01((tMs - timeline.outroStartMs) / timeline.outroFade.durationMs) : 1,
        localMs: tMs - timeline.outroStartMs,
      }
    : null;
  return { story: !inHold && tMs < baseEndMs, intro, outro };
}

function paintLayer(canvas: BrandingCanvas, alpha: number, paint: () => void): void {
  canvas.ctx.save();
  canvas.ctx.globalAlpha *= alpha;
  paint();
  canvas.ctx.restore();
}

export function paintBrandedFrame(params: { readonly canvas: BrandingCanvas; readonly branding: AppliedBranding; readonly tMs: number; readonly paintStory: () => void }): void {
  const { canvas, branding } = params;
  const layers = brandedFrameLayers(branding.timeline, params.tMs);
  if (layers.story) params.paintStory();
  const { identity, images } = branding;
  if (layers.intro !== null && identity !== null) paintLayer(canvas, layers.intro.alpha, () => paintIntroCard(canvas, identity, images));
  if (layers.outro === null) return;
  const { localMs } = layers.outro;
  paintLayer(canvas, layers.outro.alpha, () =>
    identity === null ? paintLogoCard(canvas, localMs / 1000) : paintAuthorOutroCard(canvas, { tMs: localMs, identity, images }),
  );
}
