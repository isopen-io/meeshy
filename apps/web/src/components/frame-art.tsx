import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import type { BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import { avatarRingMarkup } from '@meeshy/shared/utils/appearance-svg';
import { bannerFrameMarkup } from '@meeshy/shared/utils/banner-frame-svg';
import { FRAME_MOTION_CSS } from '@meeshy/shared/utils/frame-motion-svg';

import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';

/**
 * **LE DESSIN D'UN CADRE, JOUÉ PAR LE COMPOSITEUR** (#10935) — le contour d'avatar
 * et le cadre de bannière (#10932) se peignent depuis le rendu de référence
 * partagé (`avatarRingMarkup`, `bannerFrameMarkup`). Leurs mouvements y sont des
 * COUCHES animées sur `transform` et `opacity` seuls (`FRAME_MOTION_CSS`, posée
 * une fois dans le document) : le navigateur les joue sans redessiner.
 *
 * Ce qui ne coûte rien quand personne ne regarde :
 *   - hors écran (`IntersectionObserver`), l'hôte porte `data-frame-paused` et
 *     ses couches se figent ;
 *   - application en arrière-plan (`visibilitychange`, et `pause` / `resume` de la
 *     coque Capacitor), la racine porte `data-app-hidden` : tout se fige ;
 *   - « Réduire les animations » : aucune couche n'est créée, le cadre fixe et
 *     complet reste (la feuille l'arrête aussi, si la préférence bascule entre
 *     deux rendus).
 *
 * Le cadre de bannière se pose SUR la photo (ou le fond) : il se mesure, se
 * dessine à la largeur réelle, et son centre reste transparent — la découpe est
 * dans le balisage, jamais une promesse de la donnée. Décoratifs (`aria-hidden`),
 * ni l'un ni l'autre ne reçoit le doigt.
 */

const STYLE_ATTRIBUTE = 'data-frame-motion';

/** La feuille des couches animées, posée UNE fois dans le document. */
export function ensureFrameMotionStyles(): void {
  if (typeof document === 'undefined' || document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`) !== null) return;
  const style = document.createElement('style');
  style.setAttribute(STYLE_ATTRIBUTE, '');
  style.textContent = FRAME_MOTION_CSS;
  document.head.appendChild(style);
}

const watched = new WeakSet<Document>();

/** `data-app-hidden` sur la racine tant que l'application n'est pas au premier plan. */
function watchAppVisibility(): void {
  if (typeof document === 'undefined' || watched.has(document)) return;
  watched.add(document);
  const root = document.documentElement;
  const hide = (): void => root.setAttribute('data-app-hidden', '');
  const show = (): void => root.removeAttribute('data-app-hidden');
  const sync = (): void => (document.visibilityState === 'hidden' ? hide() : show());
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('pause', hide);
  document.addEventListener('resume', sync);
  sync();
}

/** L'hôte d'un dessin animé : feuille posée, arrière-plan suivi, pause hors écran. */
function useFrameHost(animated: boolean): { readonly node: HTMLElement | null; readonly ref: (node: HTMLElement | null) => void } {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!animated) return;
    ensureFrameMotionStyles();
    watchAppVisibility();
  }, [animated]);
  useEffect(() => {
    if (!animated || node === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      if (entry.isIntersecting) node.removeAttribute('data-frame-paused');
      else node.setAttribute('data-frame-paused', '');
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [animated, node]);
  const ref = useCallback((next: HTMLElement | null) => setNode(next), []);
  return { node, ref };
}

/** Le dessin d'un contour d'avatar, couvrant sa boîte `size` (viewBox 0 0 100 100). */
export const RingArt = memo(function RingArt({ ring, size }: { readonly ring: AvatarRingDesign; readonly size: number }) {
  const reduced = usePrefersReducedMotion();
  const animated = !reduced && (ring.motion?.length ?? 0) > 0;
  const { ref } = useFrameHost(animated);
  const html = useMemo(() => avatarRingMarkup({ ring, size, animated }), [ring, size, animated]);
  return <span ref={ref} data-frame-art aria-hidden="true" className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: html }} />;
});

type Size = { readonly width: number; readonly height: number };

/**
 * **LE CADRE DE BANNIÈRE** — posé dans une bannière `relative` (au-dessus de la
 * photo ou du fond, sous les badges), il occupe toute sa boîte.
 */
export const BannerFrame = memo(function BannerFrame({ frame }: { readonly frame: BannerFrameDesign }) {
  const reduced = usePrefersReducedMotion();
  const animated = !reduced && (frame.motion?.length ?? 0) > 0;
  const { node, ref } = useFrameHost(animated);
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    if (node === null) return undefined;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setSize((current) => (current !== null && current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  const html = useMemo(
    () => (size === null || size.width <= 0 || size.height <= 0 ? '' : bannerFrameMarkup({ frame, width: size.width, height: size.height, animated })),
    [frame, size, animated],
  );
  return <span ref={ref} data-banner-frame={frame.key} aria-hidden="true" className="pointer-events-none absolute inset-0 block" dangerouslySetInnerHTML={{ __html: html }} />;
});
