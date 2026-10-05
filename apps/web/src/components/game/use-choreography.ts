import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type { ChoreographyKind } from '@/lib/game/choreography';
import { playChoreography, type PlayHandle, type PlayOptions } from '@/lib/game/play';

/**
 * JOUER UNE CHORÉGRAPHIE SUR UN OBJET (#9381) — le crochet des écrans du jeu.
 *
 *   const { ref, play } = useChoreography<HTMLDivElement>();
 *   <div ref={ref}>…composants de components/game/…</div>
 *   play('rank');                       // l'écu monte, la Signature se grave…
 *   play('chest', { rewards: 3 });      // le couvercle s'ouvre, trois récompenses
 *
 * L'hôte pose d'abord l'ÉTAT FINAL dans le DOM (la face « revers », le badge
 * allumé, le coffre « ouvert »), puis appelle `play` : le plan ramène l'objet
 * vers cet état (voir `lib/game/choreography.ts`). Rejouer annule le geste en
 * cours — jamais deux chorégraphies sur un même objet — et le démontage
 * l'annule aussi. `play` rend `null` quand rien n'est monté derrière la ref.
 *
 * `defaults` (réduction des animations, haptique, repères…) s'applique à chaque
 * `play` ; les options de l'appel l'emportent.
 */
export function useChoreography<E extends HTMLElement | SVGElement>(defaults: PlayOptions = {}): {
  readonly ref: RefObject<E | null>;
  readonly play: (kind: ChoreographyKind, options?: PlayOptions) => PlayHandle | null;
} {
  const ref = useRef<E>(null);
  const active = useRef<PlayHandle | null>(null);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(
    () => () => {
      active.current?.cancel();
      active.current = null;
    },
    [],
  );

  const play = useCallback((kind: ChoreographyKind, options: PlayOptions = {}): PlayHandle | null => {
    const root = ref.current;
    if (root === null) return null;
    active.current?.cancel();
    const handle = playChoreography(root, kind, { ...defaultsRef.current, ...options });
    active.current = handle;
    return handle;
  }, []);

  return { ref, play };
}
