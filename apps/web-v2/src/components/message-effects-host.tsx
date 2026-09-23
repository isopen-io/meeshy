import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { hasDecorativeEffects } from '@/lib/effects-playback';
import { playMessageEffects } from '@/lib/view/effects-runner';

/**
 * L'HÔTE DES EFFETS D'UN MESSAGE (#7596) — monté par `ThreadModes` autour de
 * CHAQUE peau (rangée plate de Focal/Script, bulle de Bulles/Rivière, et tout
 * mode ajouté demain), jamais par une peau : c'est le même motif que l'effet de
 * destruction de l'éphémère (#7468), posé sur le nœud qui les enveloppe toutes.
 *
 * **L'écrasante majorité des messages n'a aucun effet** : pour eux, cet hôte
 * ne rend que ses enfants — aucun nœud, aucun observateur, rien à payer au
 * défilement (même règle qu'iOS : « ils ne doivent pas payer huit
 * ViewModifier inertes par cellule de liste »).
 *
 * Pour un message à effets, UN `IntersectionObserver` dit quand la rangée est
 * à l'écran : à l'entrée, les effets se JOUENT (`playMessageEffects`) ; à la
 * sortie, tout s'arrête — animations annulées, boucles de particules coupées,
 * calques retirés. Refaire défiler la bulle rejoue l'apparition, comme iOS.
 *
 * `useLayoutEffect`, pas `useEffect` : sous preact/compat un effet PASSIF
 * s'enregistre une image APRÈS la peinture (`decisions.md`) — la bulle
 * apparaîtrait d'abord immobile, puis sursauterait.
 */
export function MessageEffectsHost({
  effectFlags,
  children,
}: {
  readonly effectFlags: number | undefined;
  readonly children: ReactNode;
}) {
  if (!hasDecorativeEffects(effectFlags)) return <>{children}</>;
  return <EffectsStage effectFlags={effectFlags ?? 0}>{children}</EffectsStage>;
}

function EffectsStage({ effectFlags, children }: { readonly effectFlags: number; readonly children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const Observer = globalThis.IntersectionObserver;
    if (host === null || typeof Observer !== 'function') return undefined;

    let stop: (() => void) | null = null;
    const observer = new Observer((entries) => {
      const latest = entries[entries.length - 1];
      if (latest === undefined) return;
      if (latest.isIntersecting && stop === null) stop = playMessageEffects(host, effectFlags);
      if (!latest.isIntersecting && stop !== null) {
        stop();
        stop = null;
      }
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, [effectFlags]);

  return (
    <div ref={hostRef} data-effects-host className="relative">
      {children}
    </div>
  );
}
