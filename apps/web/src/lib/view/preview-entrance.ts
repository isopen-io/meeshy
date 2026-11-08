import { PREVIEW_ENTRANCE_MAX_MS, type PreviewEntrance } from '@meeshy/shared/utils/conversation-preview';

/**
 * L'APPARITION DE LA LIGNE 2 (#16975) — la loi d'énergie du composeur partagé
 * (`PreviewEffect`), côté web : un nouveau dernier message joue son effet UNE
 * fois, sur une ligne visible, en transformation seule (composée par le GPU,
 * aucune mise en page). Le premier rendu ne joue rien : une liste qui s'ouvre
 * ou qui défile ne danse pas.
 */
export type EntranceGate = {
  /** `undefined` ⇒ premier rendu de la ligne. */
  readonly previousKey: string | null | undefined;
  readonly currentKey: string | null;
  readonly reducedMotion: boolean;
  readonly hidden: boolean;
  readonly onScreen: boolean;
};

export function shouldPlayEntrance(gate: EntranceGate): boolean {
  if (gate.previousKey === undefined || gate.currentKey === null) return false;
  if (gate.previousKey === gate.currentKey) return false;
  return !gate.reducedMotion && !gate.hidden && gate.onScreen;
}

const SHAKE_MS = 360;
const POP_MS = 280;

const KEYFRAMES: Readonly<Record<PreviewEntrance, readonly Keyframe[]>> = {
  shake: [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-3px)', offset: 0.2 },
    { transform: 'translateX(3px)', offset: 0.45 },
    { transform: 'translateX(-2px)', offset: 0.7 },
    { transform: 'translateX(0)' },
  ],
  pop: [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.45 }, { transform: 'scale(1)' }],
};

export function entranceAnimation(entrance: PreviewEntrance): { readonly keyframes: Keyframe[]; readonly options: KeyframeAnimationOptions } {
  const duration = Math.min(entrance === 'shake' ? SHAKE_MS : POP_MS, PREVIEW_ENTRANCE_MAX_MS);
  return { keyframes: [...KEYFRAMES[entrance]], options: { duration, iterations: 1, easing: 'ease-out' } };
}
