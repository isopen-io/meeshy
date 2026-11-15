import type { CardLayout } from './message-card-layout';
import type { CardOp } from './message-card-ops';

/**
 * **LA VITESSE D'UNE CARTE QUI DÉFILE** (#18671, miroir de
 * `MessageCardScrollSpeed`) — de ×0,5 à ×3, comme une lecture qu'on ralentit
 * ou qu'on accélère. ×1 est la lecture posée.
 */
export const SCROLL_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export type ScrollSpeed = (typeof SCROLL_SPEEDS)[number];
export const STANDARD_SCROLL_SPEED: ScrollSpeed = 1;

/** « ×0,75 » en français, « ×0.75 » en anglais : la décimale de la langue. */
export const scrollSpeedLabel = (speed: ScrollSpeed, locale: string): string => `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(speed)}`;

/** La lecture posée (×1), en pixels de carte par seconde : une ligne de réponse toutes les 1,6 s environ. */
export const SCROLL_PIXELS_PER_SECOND = 54;
export const SCROLL_LEAD_IN_S = 1.5;
export const SCROLL_LEAD_OUT_S = 2;
/** Les images par seconde de la vidéo qui défile. */
export const SCROLL_FPS = 30;
/** La plus longue vidéo produite : au-delà, le défilement accélère pour tenir. */
export const SCROLL_MAX_DURATION_S = 180;
/** La plus haute carte qu'on fait défiler. */
export const SCROLL_MAX_HEIGHT = 40_000;

/**
 * **LE PLAN D'UNE VIDÉO QUI DÉFILE** (#18671, miroir de `MessageCardScrollPlan`) :
 * la carte se montre d'abord immobile, puis glisse à vitesse constante sous la
 * fenêtre du format jusqu'à sa dernière ligne, qui reste un instant.
 */
export type ScrollPlan = { readonly travel: number; readonly scrollDuration: number; readonly duration: number };

/** `null` quand la carte tient dans son format : il n'y a rien à faire défiler. */
export function scrollPlanOf(contentHeight: number, viewportHeight: number, speed: ScrollSpeed): ScrollPlan | null {
  const travel = contentHeight - viewportHeight;
  if (!Number.isFinite(travel) || travel <= 1 || viewportHeight <= 0) return null;
  const scrollDuration = Math.min(SCROLL_MAX_DURATION_S - SCROLL_LEAD_IN_S - SCROLL_LEAD_OUT_S, travel / (SCROLL_PIXELS_PER_SECOND * speed));
  return { travel, scrollDuration, duration: SCROLL_LEAD_IN_S + scrollDuration + SCROLL_LEAD_OUT_S };
}

/** Le décalage de la carte, en pixels, à l'instant `seconds`. */
export function scrollOffsetAt(plan: ScrollPlan, seconds: number): number {
  if (plan.scrollDuration <= 0) return 0;
  return plan.travel * Math.min(1, Math.max(0, (seconds - SCROLL_LEAD_IN_S) / plan.scrollDuration));
}

/** « 1 min 12 s », « 38 s » — la durée à la seconde près. */
export function scrollDurationLabel(seconds: number, locale: string): string {
  const total = Math.round(seconds);
  const unit = (value: number, kind: 'minute' | 'second') => new Intl.NumberFormat(locale, { style: 'unit', unit: kind, unitDisplay: 'narrow' }).format(value);
  return total >= 60 ? `${unit(Math.floor(total / 60), 'minute')} ${unit(total % 60, 'second')}` : unit(total, 'second');
}

const spanOf = (op: CardOp): readonly [number, number] | null => {
  switch (op.kind) {
    case 'text':
      return op.rotate === undefined ? [op.y - fontSize(op.font) * 1.3, op.y + fontSize(op.font) * 0.5] : null;
    case 'bar':
    case 'panel':
    case 'media':
    case 'wave':
      return [op.y, op.y + Math.max(0, op.height)];
    case 'separator':
      return [op.y - op.radius - op.lineWidth, op.y + op.radius + op.lineWidth];
    case 'dot':
      return [op.y - op.radius, op.y + op.radius];
    case 'play':
      return [op.y - op.size, op.y + op.size];
  }
};

const fontSize = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);

/** Ce qui touche la bande `[top, bottom]` de la carte : une image de la vidéo qui défile ne peint que ce que sa fenêtre montre. */
export function opsBetween(layout: CardLayout, top: number, bottom: number): readonly CardOp[] {
  return layout.ops.filter((op) => {
    const span = spanOf(op);
    return span === null || (span[1] >= top && span[0] <= bottom);
  });
}
