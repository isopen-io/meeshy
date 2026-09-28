/**
 * OUVRIR UNE SCÈNE DU FIL SANS ACCROC (#8598). La carte du fil
 * (`FeedSceneSurface`) et la page scène de la visionneuse (`ViewerScenePage`)
 * rendent la MÊME scène par deux players distincts : rien ne les reliait, donc
 * toucher une scène faisait APPARAÎTRE le plein écran d'un bloc et repartir sa
 * timeline de zéro.
 *
 * La carte CONFIE, au moment du tap, son cadre visible (où était l'œil) et son
 * temps (ce qu'il regardait) ; la page scène les REPREND une fois, à son
 * montage — un relais à usage unique, jamais un état, même patron que
 * `video-handoff.ts` (#8234) pour une vidéo.
 */
export type SceneOpeningOrigin = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Le rayon des coins de la carte, en px d'écran. */
  readonly radius: number;
  /** `ScenePlayerFocus.y` de la carte — la part de la hauteur de la scène
   * cachée AU-DESSUS de sa fenêtre. Absent : la carte montre le centre. */
  readonly focusY?: number;
};

export type SceneOpening = {
  readonly seconds: number;
  readonly origin: SceneOpeningOrigin | null;
};

const openings = new Map<string, SceneOpening>();

export function handOffSceneOpening({ itemId, seconds, origin }: { readonly itemId: string } & SceneOpening): void {
  openings.set(itemId, { seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0, origin });
}

export function takeSceneOpening(itemId: string): SceneOpening | null {
  const opening = openings.get(itemId);
  openings.delete(itemId);
  return opening ?? null;
}

export type OpeningRect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

export type OpeningFrame = { readonly transform: string; readonly clipPath: string };

/** La dernière image : la boîte à sa place, rien de rogné. */
export const OPENED_FRAME: OpeningFrame = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 0px)' };

const px = (value: number): string => `${Math.round(value * 100) / 100}px`;

/**
 * LA PREMIÈRE IMAGE DE L'OUVERTURE (FLIP) — la boîte de la scène plein écran
 * (`target`, sa place FINALE à l'écran), ramenée sur la fenêtre que la carte
 * montrait (`origin`). Une échelle UNIFORME (la carte a la largeur de la
 * scène, jamais une scène écrasée), puis un rognage (`clip-path`, dans le
 * repère NON mis à l'échelle de la boîte) qui ne laisse voir que ce que la
 * carte montrait — une carte 4:5 cadrée par `focus` ne s'ouvre donc pas sur
 * une scène 9:16 qui déborderait d'un coup. `transform-origin: 0 0`.
 *
 * `null` sur un cadre dégénéré : la page s'ouvre alors sans animation.
 */
export function openingFrame({
  origin,
  target,
  focusY,
}: {
  readonly origin: Omit<SceneOpeningOrigin, 'focusY'>;
  readonly target: OpeningRect;
  readonly focusY?: number;
}): OpeningFrame | null {
  if (!(origin.width > 0 && origin.height > 0 && target.width > 0 && target.height > 0)) return null;
  const scale = origin.width / target.width;
  const scaledHeight = target.height * scale;
  const visibleHeight = Math.min(origin.height, scaledHeight);
  const hidden = scaledHeight - visibleHeight;
  const windowTop = Math.min(hidden, Math.max(0, focusY !== undefined ? focusY * scaledHeight : hidden / 2));
  const translateX = origin.left - target.left;
  const translateY = origin.top + (origin.height - visibleHeight) / 2 - windowTop - target.top;
  const clipTop = windowTop / scale;
  const clipBottom = (hidden - windowTop) / scale;
  return {
    transform: `translate(${px(translateX)}, ${px(translateY)}) scale(${Math.round(scale * 10_000) / 10_000})`,
    clipPath: `inset(${px(clipTop)} 0px ${px(clipBottom)} 0px round ${px(origin.radius / scale)})`,
  };
}

export const SCENE_OPENING_MS = 320;
export const SCENE_OPENING_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
