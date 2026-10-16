import { useEffect, useRef } from 'react';

import { decodeLottie } from '@/lib/lottie/decode';
import { sharedLottieBudget, type LottieBudget } from '@/lib/lottie/budget';
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
 * - le démontage détruit l'animation et ses observateurs : aucune fuite ;
 * - les films VIVANTS sont plafonnés (`budget`, #10815) : dans une liste
 *   longue, la couche sortie de l'écran depuis le plus longtemps rend sa place
 *   à celle qui entre — son film est détruit, son dessin statique reste.
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
  budget = sharedLottieBudget,
}: {
  readonly sourceKey: string;
  readonly load: LottieBytesLoader;
  readonly loop?: boolean;
  readonly className?: string;
  readonly player?: LottiePlayerLoader;
  readonly budget?: LottieBudget;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const loadRef = useRef(load);
  const playerRef = useRef(player);
  loadRef.current = load;
  playerRef.current = player;
  const budgetRef = useRef(budget);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = host.current;
    if (reduced || node === null) return undefined;
    let live = true;
    let generation = 0;
    let visible = false;
    let handle: LottieHandle | null = null;

    const sync = (): void => {
      if (handle === null) return;
      if (visible && !document.hidden) handle.play();
      else handle.pause();
    };

    const drop = (): void => {
      generation += 1;
      handle?.destroy();
      handle = null;
      node.replaceChildren();
    };

    const start = async (): Promise<void> => {
      const run = generation;
      const current = (): boolean => live && run === generation;
      const giveUp = (): void => {
        if (!current()) return;
        drop();
        slot.release();
      };
      try {
        const bytes = await loadRef.current();
        if (!current()) return;
        if (bytes === null) return giveUp();
        const decoded = await decodeLottie(bytes);
        if (!current()) return;
        if (!decoded.ok) return giveUp();
        const engine = await playerRef.current();
        if (!current()) return;
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
        giveUp();
      }
    };

    const slot = budgetRef.current.claim({ grant: () => void start(), evict: drop });

    const see = (seen: boolean): void => {
      visible = seen;
      slot.setVisible(seen);
      sync();
    };

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => see(entries.some((entry) => entry.isIntersecting)));
    observer?.observe(node);
    if (observer === null) see(true);
    document.addEventListener('visibilitychange', sync);

    return () => {
      live = false;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      slot.release();
      handle?.destroy();
      handle = null;
    };
  }, [sourceKey, reduced, loop]);

  return <span ref={host} aria-hidden="true" data-lottie-layer={sourceKey} className={className ?? 'pointer-events-none absolute inset-0 block overflow-hidden [&>svg]:block [&>svg]:size-full'} />;
}
