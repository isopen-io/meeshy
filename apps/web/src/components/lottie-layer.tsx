import { useEffect, useRef } from 'react';

import { decodeLottie } from '@/lib/lottie/decode';
import { loadLottiePlayer, type LottieHandle, type LottiePlayerLoader } from '@/lib/lottie/engine';
import type { LottieBytesLoader } from '@/lib/lottie/sources';
import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';

/**
 * **LA COUCHE ANIMÉE** (#10638) — une animation Lottie posée AU-DESSUS d'un
 * dessin statique, qui reste l'image fixe : sous « Réduire les animations », ou
 * si quoi que ce soit échoue (réseau, zip illisible, JSON refusé par le
 * validateur partagé, moteur indisponible), la couche ne monte RIEN, sans bruit.
 *
 * - le moteur et les octets ne se chargent qu'à la PREMIÈRE visibilité réelle
 *   (jamais sur le chemin du premier rendu) ;
 * - la lecture est en pause hors écran et quand l'onglet est caché ;
 * - le démontage détruit l'animation et ses observateurs : aucune fuite.
 *
 * Décorative (`aria-hidden`, non cliquable) ; l'hôte lui donne sa place.
 * `sourceKey` identifie la source : `load` peut changer d'identité sans relancer.
 */
export function LottieLayer({
  sourceKey,
  load,
  loop = true,
  className,
  player = loadLottiePlayer,
}: {
  readonly sourceKey: string;
  readonly load: LottieBytesLoader;
  readonly loop?: boolean;
  readonly className?: string;
  readonly player?: LottiePlayerLoader;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const loadRef = useRef(load);
  const playerRef = useRef(player);
  loadRef.current = load;
  playerRef.current = player;
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = host.current;
    if (reduced || node === null) return undefined;
    let live = true;
    let started = false;
    let visible = typeof IntersectionObserver === 'undefined';
    let handle: LottieHandle | null = null;

    const sync = (): void => {
      if (handle === null) return;
      if (visible && !document.hidden) handle.play();
      else handle.pause();
    };

    const start = async (): Promise<void> => {
      try {
        const bytes = await loadRef.current();
        if (bytes === null || !live) return;
        const decoded = await decodeLottie(bytes);
        if (!decoded.ok || !live) return;
        const engine = await playerRef.current();
        if (!live) return;
        handle = engine.loadAnimation({
          container: node,
          renderer: 'svg',
          loop,
          autoplay: false,
          animationData: decoded.animation,
          rendererSettings: { preserveAspectRatio: 'xMidYMid slice', progressiveLoad: true },
        });
        sync();
      } catch {
        handle = null;
      }
    };

    const begin = (): void => {
      if (started) return;
      started = true;
      void start();
    };

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            if (visible) begin();
            sync();
          });
    observer?.observe(node);
    if (observer === null) begin();
    document.addEventListener('visibilitychange', sync);

    return () => {
      live = false;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handle?.destroy();
      handle = null;
    };
  }, [sourceKey, reduced, loop]);

  return <span ref={host} aria-hidden="true" data-lottie-layer={sourceKey} className={className ?? 'pointer-events-none absolute inset-0 block overflow-hidden [&>svg]:block [&>svg]:size-full'} />;
}
