import '@/styles/kit-living-banner.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { MeeshySkeleton } from './meeshy-skeleton';
import {
  MEESHY_LIVING_BANNER_MEASURE,
  meeshyBannerParallax,
  meeshyBannerSensorRuns,
  meeshyLivingBannerRecipe,
  meeshyLivingBannerStyle,
  type MeeshyLivingBannerMode,
  type MeeshyLivingBannerMotion,
  type MeeshyLivingBannerScheme,
} from './meeshy-living-banner-recipe';

export * from './meeshy-living-banner-recipe';

export type MeeshyLivingBannerProps = {
  readonly tint: string;
  readonly mode?: MeeshyLivingBannerMode | undefined;
  readonly scheme?: MeeshyLivingBannerScheme | undefined;
  readonly image?: string | undefined;
  readonly height?: number | undefined;
  readonly motion?: MeeshyLivingBannerMotion | undefined;
  readonly isMuted?: boolean | undefined;
  readonly isLoading?: boolean | undefined;
  readonly collapse?: number | undefined;
  readonly allowsDeviceTilt?: boolean | undefined;
  readonly topLeading?: ReactNode;
  readonly topTrailing?: ReactNode;
  readonly bottom?: ReactNode;
  readonly className?: string | undefined;
};

const systemReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

const slot = (content: ReactNode): boolean => content !== undefined && content !== null && content !== false;

const setParallax = (node: HTMLElement, degrees: number): void => {
  const { near, far } = meeshyBannerParallax(degrees);
  node.style.setProperty('--kit-banner-near-x', `${near}px`);
  node.style.setProperty('--kit-banner-far-x', `${far}px`);
};

/**
 * La parallaxe et le « se voit » : posés sur l'élément, jamais dans l'état React — flotter ou
 * s'incliner ne re-rend ni les emplacements ni l'hôte. Le pointeur fin pilote la parallaxe ;
 * `deviceorientation` seulement si l'hôte a déjà la permission (la bannière n'en demande
 * jamais). Hors écran, le capteur s'arrête et le flottement se met en pause.
 */
function useLiving(ref: RefObject<HTMLDivElement | null>, motion: MeeshyLivingBannerMotion, isMuted: boolean, allowsDeviceTilt: boolean): void {
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    let isVisible = true;
    const runs = (): boolean => meeshyBannerSensorRuns({ motion, isVisible, isMuted, reducedMotion: systemReducedMotion() });
    const onPointer = (event: PointerEvent): void => {
      if (!runs() || !hasFinePointer()) return;
      const box = node.getBoundingClientRect();
      if (box.width === 0) return;
      setParallax(node, ((event.clientX - box.left) / box.width - 0.5) * 2 * MEESHY_LIVING_BANNER_MEASURE.tiltRange);
    };
    const onLeave = (): void => setParallax(node, 0);
    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (runs()) setParallax(node, event.gamma ?? 0);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
      node.setAttribute('data-visible', String(isVisible));
      if (!isVisible) setParallax(node, 0);
    });
    observer?.observe(node);
    node.addEventListener('pointermove', onPointer, { passive: true });
    node.addEventListener('pointerleave', onLeave);
    const listensToDevice = allowsDeviceTilt && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    if (listensToDevice) window.addEventListener('deviceorientation', onOrientation, { passive: true });
    return () => {
      observer?.disconnect();
      node.removeEventListener('pointermove', onPointer);
      node.removeEventListener('pointerleave', onLeave);
      if (listensToDevice) window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [ref, motion, isMuted, allowsDeviceTilt]);
}

/**
 * Une bannière vivante : un décor muet (dégradé, deux orbes, fondu, image de l'hôte) et trois
 * emplacements lus dans l'ordre début, fin, bas. Sans rôle, sans nom. Chargement : le
 * squelette du kit, ni teinte, ni orbe, ni emplacement.
 */
export const MeeshyLivingBanner = memo(function MeeshyLivingBanner({
  tint,
  mode,
  scheme,
  image,
  height,
  motion = 'on',
  isMuted = false,
  isLoading = false,
  collapse,
  allowsDeviceTilt = false,
  topLeading,
  topTrailing,
  bottom,
  className,
}: MeeshyLivingBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLiving(ref, motion, isMuted, allowsDeviceTilt);
  const recipe = meeshyLivingBannerRecipe({ tint, mode, scheme, hasImage: image !== undefined, isMuted, motion, reducedMotion: systemReducedMotion(), height, collapse });
  const classes = ['kit-banner', ...(className === undefined ? [] : [className])].join(' ');
  if (isLoading) {
    return (
      <div className={classes} style={meeshyLivingBannerStyle(recipe)} data-kit-banner="" data-loading="">
        <MeeshySkeleton shape={{ kind: 'card', aspect: 1, radius: 0 }} />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={classes}
      style={meeshyLivingBannerStyle(recipe)}
      data-kit-banner=""
      data-mode={recipe.mode}
      data-motion={motion}
      data-floats={recipe.floats ? '' : undefined}
      data-muted={isMuted ? '' : undefined}
      data-has-image={image === undefined ? undefined : ''}
      data-fade={recipe.fadeToTransparent ? 'veil' : undefined}
    >
      <div className="kit-banner__decor" aria-hidden="true" data-kit-banner-decor="">
        <span className="kit-banner__gradient" />
        {recipe.orbsVisible ? (
          <>
            <span className="kit-banner__orb" data-orb="far" data-kit-banner-orb="">
              <span className="kit-banner__orb-body" />
            </span>
            {recipe.orbCount === 2 ? (
              <span className="kit-banner__orb" data-orb="near" data-kit-banner-orb="">
                <span className="kit-banner__orb-body" />
              </span>
            ) : null}
          </>
        ) : null}
        {image === undefined ? null : <img className="kit-banner__image" src={image} alt="" decoding="async" draggable={false} />}
        {image === undefined ? null : <span className="kit-banner__veil" />}
        <span className="kit-banner__fade" />
      </div>
      {slot(topLeading) ? (
        <div className="kit-banner__slot" data-slot="top-leading" data-kit-banner-top-leading="">
          {topLeading}
        </div>
      ) : null}
      {slot(topTrailing) ? (
        <div className="kit-banner__slot" data-slot="top-trailing" data-kit-banner-top-trailing="">
          {topTrailing}
        </div>
      ) : null}
      {slot(bottom) ? (
        <div className="kit-banner__slot" data-slot="bottom" data-kit-banner-bottom="">
          {bottom}
        </div>
      ) : null}
    </div>
  );
});
