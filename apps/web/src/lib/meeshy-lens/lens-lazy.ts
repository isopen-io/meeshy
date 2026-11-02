import type { LensStage } from './lens-stage';

/**
 * **L'ÉTAGE LENS, CHARGÉ À LA PREMIÈRE LENS** (W14, #11320) — le worker des
 * effets d'appel a un plafond de poids (`scripts/measure-weight.mjs`) :
 * le rendu d'une lens (plan, LUT, peintre) reste un chunk à part, demandé la
 * première fois qu'une image porte une lens. D'ici là, et s'il ne se charge
 * pas, l'image part sans la lens — jamais retenue.
 */
export function lazyLensStage(load: () => Promise<LensStage>): LensStage {
  const state: { stage: LensStage | null; asked: boolean } = { stage: null, asked: false };
  const ask = (): LensStage | null => {
    if (!state.asked) {
      state.asked = true;
      load().then(
        (stage) => void (state.stage = stage),
        () => undefined,
      );
    }
    return state.stage;
  };
  return {
    plan: (settings, source, frame, t) => ask()?.plan(settings, source, frame, t) ?? [],
    grade: (image, settings, frame) => ask()?.grade(image, settings, frame) ?? image,
    paint: (context, ops, frame) => state.stage?.paint(context, ops, frame),
    close: () => state.stage?.close(),
  };
}
