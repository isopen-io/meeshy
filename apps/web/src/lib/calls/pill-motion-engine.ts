import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { bannerCloseKeyframes, GLASS_REGULAR_DENSITY, glassToneKeyframes, glassToneMs, glassVeil, followKeyframes, inlineSlideKeyframes, MORPH_MS, morphKeyframes, type GlassSize, type MorphRect, portraitMorphKeyframes, portraitMorphMs, STAGE_LABEL, STAGE_PORTRAIT, STOW_REDUCED_MS, stowedGlass, stowFadeKeyframes, swapKeyframes, swapMs, type SwapShape, viewSwapKeyframes, viewSwapMs } from './call-pill-motion';

/**
 * **LE MOTEUR DOM DU MOUVEMENT DU VERRE** (#17536, lois dans `call-pill-motion.ts`) — il mesure
 * et joue ce que les lois décident. Son chunk à lui (`budgets.json` › `call_pill_motion_engine`) :
 * l'écran d'appel le charge dès que l'appel vit (`use-pill-motion.ts`), et ne paie pas ses octets
 * dans `call_overlay`. Tout se joue en Web Animations, que la règle générale de « Réduire les
 * animations » (qui coupe les transitions CSS) n'éteint pas : c'est ce qui laisse le fondu court exister.
 */

/** Le liseré intérieur du verre (`p-1.5`) : ce qu'il garde autour de ses sous-titres rangés. */
const PILL_PADDING = 6;

const EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** Ce qui se range par le fondu : l'élément lui-même ou ses descendants. */
const STOW_TARGETS = '[data-call-stow], [data-call-chrome-fade]:not([data-call-chrome-keep]), [data-call-pill-rest]';

const changed = (from: GlassSize, to: GlassSize): boolean => morphKeyframes(from, to, false) !== null;

export type PillGlass = { readonly update: (stowed: boolean) => void; readonly dispose: () => void };

/**
 * Le verre de la pilule : MORPHISME quand sa taille change (une option, un panneau, les
 * rangées d'un groupe, des sous-titres qui arrivent ou repartent), RESSERRÉ autour des
 * sous-titres quand `stowed`. Le verre est un élément à lui (`skin`), seul mis à l'échelle :
 * le contenu garde ses proportions. Interruptible : un morphisme repris en route part de
 * la taille que le verre avait à cet instant. `update` est appelé à chaque rendu, et à
 * chaque changement de taille que la pilule n'a pas rendu elle-même (des sous-titres qui arrivent).
 * `rider` : ce qui est posé AU-DESSUS du verre (la barre d'un mode) suit son bord du haut.
 */
export function createPillGlass(element: HTMLElement, glass: HTMLElement, rider: HTMLElement | null = null): PillGlass {
  let last: GlassSize | null = null;
  let running: Animation | null = null;
  let riding: Animation | null = null;
  let stowed = false;
  const measure = (): void => {
    const to = { width: element.offsetWidth, height: element.offsetHeight };
    const from = last;
    last = to;
    const kept = element.querySelector<HTMLElement>('[data-call-captions-panel]');
    const stow = stowed && kept !== null ? stowedGlass({ height: to.height, keptTop: kept.offsetTop, keptHeight: kept.offsetHeight, padding: PILL_PADDING }) : null;
    if (stow !== null) {
      element.style.setProperty('--stow-scale', String(stow.scale));
      element.style.setProperty('--stow-shift', `${stow.shift}px`);
    }
    if (from === null || typeof glass.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    const seen = running === null ? from : { width: glass.getBoundingClientRect().width, height: glass.getBoundingClientRect().height };
    const frames = morphKeyframes(seen, to, reduced);
    if (frames === null) {
      if (reduced && changed(from, to)) element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: STOW_REDUCED_MS });
      return;
    }
    running?.cancel();
    running = glass.animate([...frames], { duration: MORPH_MS, easing: EASING });
    running.onfinish = () => (running = null);
    const follow = rider === null ? null : followKeyframes(seen, to, reduced);
    riding?.cancel();
    riding = follow === null ? null : (rider?.animate([...follow], { duration: MORPH_MS, easing: EASING }) ?? null);
  };
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  watch?.observe(element);
  return {
    update: (next) => {
      stowed = next;
      measure();
    },
    dispose: () => watch?.disconnect(),
  };
}

/**
 * Un fondu d'OPACITÉ, interruptible (la caméra coupée du duo, G4.6, #17567) : de l'opacité
 * affichée à cet instant vers `to`, le fondu en cours annulé (son `finished` est rejeté). La
 * valeur visée est posée dessous : rien n'est tenu par l'animation une fois finie. `ms` nul
 * (la première peinture) : posée d'un coup, sans animation.
 */
export function fadeOpacity(element: HTMLElement, to: number, ms: number, previous: Animation | null): Animation | null {
  const from = getComputedStyle(element).opacity;
  previous?.cancel();
  element.style.opacity = String(to);
  return ms > 0 && typeof element.animate === 'function' ? element.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out' }) : null;
}

/**
 * Ranger les commandes ou les rendre, sous « Réduire les animations » : l'en-tête, la
 * pilule et les bandeaux ne se déplacent pas, ils s'effacent (et reviennent) en un fondu
 * court. Hors de ce régime, la feuille (`call-motion.css`) les mène vers leur bord.
 */
export function fadeStow(element: HTMLElement, stowed: boolean): void {
  if (!prefersReducedMotion()) return;
  const targets = [...(element.matches(STOW_TARGETS) ? [element] : []), ...element.querySelectorAll<HTMLElement>(STOW_TARGETS)];
  for (const target of targets) if (typeof target.animate === 'function') target.animate([...stowFadeKeyframes(stowed)], { duration: STOW_REDUCED_MS, easing: 'linear' });
}

/**
 * Ce qui prend la place d'un autre (Réglages du mode Effets, P8b.6) arrive en fondu et en montée,
 * ce qui lui cède la place repart de même, ou en fondu seul sous « Réduire les animations ».
 * Interruptible : un mouvement repris en route annule le précédent et part de l'opacité affichée
 * à cet instant. Ce qui repart reste invisible jusqu'à son démontage (`fill`).
 */
export function playSwap(element: HTMLElement, entering: boolean, previous: Animation | null, shape: SwapShape = 'rise'): Animation | null {
  if (typeof element.animate !== 'function') return null;
  const reduced = prefersReducedMotion();
  const [from = {}, to = {}] = swapKeyframes(entering, reduced, shape, getComputedStyle(element).direction === 'rtl');
  const resumed = (previous?.effect as KeyframeEffect | null | undefined)?.target === element;
  const shown = resumed ? { ...from, opacity: getComputedStyle(element).opacity } : from;
  previous?.cancel();
  const playing = element.animate([shown, to], { duration: swapMs(reduced), easing: EASING, fill: entering ? 'none' : 'forwards' });
  playing.finished?.catch(() => undefined);
  return playing;
}

const FADE_IN: readonly Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** Où se voit l'avatar de la scène audio, à cet instant (un passage en cours compris). */
export function stagePortraitRect(stage: HTMLElement | null): MorphRect | null {
  const rect = stage?.querySelector(STAGE_PORTRAIT)?.getBoundingClientRect();
  return rect === undefined ? null : { x: rect.left, y: rect.top, width: rect.width };
}

/** Un passage annulé en route rejette son `finished` : ce rejet attendu ne remonte pas. */
const quiet = (animation: Animation): Animation => {
  animation.finished?.catch(() => undefined);
  return animation;
};

/**
 * LA SCÈNE AUDIO PASSE DE PLEINE À COMPACTE, ET RETOUR (#17529, P9b) : l'avatar repart de sa place
 * d'avant (`first`, relevée avant que la mise en page ne change) et rejoint la nouvelle (FLIP), le nom
 * et la durée arrivent en fondu ; sous « Réduire les animations », la scène entière en un fondu court,
 * sans déplacement. Interruptible : un passage repris en route annule le précédent, et part de la
 * place où l'avatar se voyait.
 */
export function playStageMorph(stage: HTMLElement, first: MorphRect | null, previous: readonly Animation[]): readonly Animation[] {
  for (const running of previous) running.cancel();
  if (typeof stage.animate !== 'function') return [];
  const reduced = prefersReducedMotion();
  const duration = portraitMorphMs(reduced);
  if (reduced) return [quiet(stage.animate([...FADE_IN], { duration, easing: 'linear' }))];
  const portrait = stage.querySelector<HTMLElement>(STAGE_PORTRAIT);
  const last = stagePortraitRect(stage);
  const frames = first === null || last === null ? null : portraitMorphKeyframes(first, last, false);
  const moved = frames === null || portrait === null ? [] : [quiet(portrait.animate([...frames], { duration, easing: EASING }))];
  const labels = [...stage.querySelectorAll<HTMLElement>(STAGE_LABEL)].map((label) => quiet(label.animate([...FADE_IN], { duration, easing: 'ease-out' })));
  return [...moved, ...labels];
}

/**
 * L'ÉCRAN D'APPEL ET LA CAPSULE S'ÉCHANGENT (S1.7, S2.1, #17774) : ce qui arrive grandit de 0,92 à 1 en
 * fondu, ce qui repart fait le chemin inverse — l'ancre est `transform-origin`, posée par la feuille — depuis
 * là où il se voit (l'écran que le glissé vers le bas a laissé sous le doigt). Ce qui repart reste invisible
 * jusqu'à son démontage (`fill`). Interruptible : un mouvement repris en route annule le précédent et part
 * de l'opacité et de la transformation affichées à cet instant.
 */
export function playViewSwap(element: HTMLElement, entering: boolean, previous: Animation | null): Animation | null {
  if (typeof element.animate !== 'function') return null;
  const reduced = prefersReducedMotion();
  const seen = getComputedStyle(element);
  const resumed = (previous?.effect as KeyframeEffect | null | undefined)?.target === element;
  const [from = {}, to = {}] = viewSwapKeyframes(entering, reduced, resumed ? 'none' : seen.transform || 'none');
  const shown = resumed ? { ...from, opacity: seen.opacity, ...(reduced ? {} : { transform: seen.transform || 'none' }) } : from;
  previous?.cancel();
  return quiet(element.animate([shown, to], { duration: viewSwapMs(entering, reduced), easing: EASING, fill: entering ? 'none' : 'forwards' }));
}

const SLIDING = new WeakMap<Element, Animation>();

/** Où se voit un élément à cet instant — un mouvement en cours compris. */
export const placeOf = (element: Element | null): number | undefined => element?.getBoundingClientRect().top;

/** Où se voit chaque bandeau de la pile à cet instant — un mouvement en cours compris. */
export const measureBanners = (stack: HTMLElement | null): ReadonlyMap<Element, number> => new Map([...(stack?.children ?? [])].map((banner) => [banner, banner.getBoundingClientRect().top] as const));

/**
 * CE QUI CHANGE DE PLACE REJOINT LA SIENNE EN GLISSANT (S2.6, #17774) : l'élément repart de sa place d'avant
 * (`before`, relevée avant que la mise en page ne change), vue comme une translation, et rejoint la nouvelle.
 * Interruptible : le glissé en cours est annulé, `before` comptant déjà là où il se voyait.
 */
export function slideFrom(element: HTMLElement, before: number | undefined, reduced = prefersReducedMotion()): void {
  SLIDING.get(element)?.cancel();
  const frames = before === undefined || typeof element.animate !== 'function' ? null : bannerCloseKeyframes(before - element.getBoundingClientRect().top, reduced);
  if (frames !== null) SLIDING.set(element, quiet(element.animate([...frames], { duration: reduced ? STOW_REDUCED_MS : MORPH_MS, easing: EASING })));
}

/** Où se voit le centre horizontal d'un élément à cet instant — un mouvement en cours compris. */
export const centerOf = (element: Element | null): number | undefined => {
  const rect = element?.getBoundingClientRect();
  return rect === undefined ? undefined : rect.left + rect.width / 2;
};

const SLID_INLINE = new WeakMap<Element, Animation>();

/**
 * CE QUI SE RECENTRE REJOINT SON NOUVEAU CENTRE EN GLISSANT (W1.20) : l'élément repart du centre d'avant
 * (`before`, relevé avant que la mise en page ne change) et rejoint le nouveau. Interruptible : le glissé en cours
 * est annulé, `before` comptant déjà là où il se voyait.
 */
export function slideInlineFrom(element: HTMLElement, before: number | undefined, reduced = prefersReducedMotion()): void {
  SLID_INLINE.get(element)?.cancel();
  const now = centerOf(element);
  const frames = before === undefined || now === undefined || typeof element.animate !== 'function' ? null : inlineSlideKeyframes(before - now, reduced);
  if (frames !== null) SLID_INLINE.set(element, quiet(element.animate([...frames], { duration: reduced ? STOW_REDUCED_MS : MORPH_MS, easing: EASING })));
}

/**
 * LA PILE SE REFERME (S2.6, #17774) : chaque bandeau resté repart de sa place d'avant (`from`, relevée avant que
 * la mise en page ne change) et rejoint la sienne ; celui qui repart a quitté la mise en page (`call-motion.css`)
 * et reste ÉPINGLÉ à sa place d'avant, d'où il glisse vers le haut (R1.6) au lieu de sauter en tête de pile.
 * Toutes les places sont relevées AVANT la première écriture : aucune mise en page forcée entre deux lectures.
 */
export function playBannersClose(stack: HTMLElement, from: ReadonlyMap<Element, number>): void {
  const reduced = prefersReducedMotion();
  const base = stack.getBoundingClientRect().top;
  const banners = [...stack.children].filter((banner): banner is HTMLElement => banner instanceof HTMLElement);
  const staying = banners.filter((banner) => !banner.hasAttribute('data-leaving'));
  for (const banner of staying) slideFrom(banner, from.get(banner), reduced);
  for (const banner of staying) banner.style.removeProperty('top');
  for (const banner of banners) {
    const was = from.get(banner);
    if (banner.hasAttribute('data-leaving') && was !== undefined) banner.style.top = `${was - base}px`;
  }
}

/** Le verre n'est plus en train de changer de ton : son état de repos (classe) fait foi. */
function settleGlassTone(element: HTMLElement): void {
  if (element.getAttribute('data-glass-fading') === 'static') element.style.removeProperty('position');
  element.removeAttribute('data-glass-fading');
  element.style.removeProperty('--glass-density');
}

/**
 * Le TON d'un verre d'appel change en fondu (L5.8, #17849) : la classe a déjà posé le ton visé, le verre
 * est tenu à sa densité régulière le temps du fondu et le voile (`::before`, `glass.css`) passe de l'opacité
 * AFFICHÉE à celle de la cible ; à la fin la classe reprend, sans saut (régulière + voile = proéminente).
 * Interruptible : un changement en route part de l'opacité vue à cet instant. Sous « Réduire la
 * transparence » le verre est plein dans les deux tons : rien à fondre. `null` : posé d'un coup.
 */
export function playGlassTone(element: HTMLElement, prominent: boolean, previous: Animation | null): Animation | null {
  if (typeof element.animate !== 'function' || window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return null;
  const seen = previous?.playState === 'running' ? Number(getComputedStyle(element, '::before').opacity) : Number.NaN;
  const shown = Number.isNaN(seen) ? glassVeil(!prominent) : seen;
  previous?.cancel();
  const fading = element.getAttribute('data-glass-fading');
  const lifted = fading === 'static' || (fading === null && getComputedStyle(element).position === 'static');
  element.setAttribute('data-glass-fading', lifted ? 'static' : 'placed');
  element.style.setProperty('--glass-density', `${GLASS_REGULAR_DENSITY}%`);
  if (lifted) element.style.position = 'relative';
  const played = element.animate([...glassToneKeyframes(shown, glassVeil(prominent))], { duration: glassToneMs(prefersReducedMotion()), easing: 'ease-in-out', fill: 'forwards', pseudoElement: '::before' });
  played.finished.then(() => settleGlassTone(element), () => undefined);
  return played;
}
