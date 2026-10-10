import { useEffect, useRef } from 'react';

import { createBrowserEnv } from '@/lib/game/gl/browser-env';
import { startEffect, type EffectController, type EffectEnv } from '@/lib/game/gl/effect-runner';
import type { GameEffect } from '@/lib/game/gl/shaders';

import '@/styles/game.css';

/**
 * LA COUCHE D'EFFETS D'UN OBJET (#9381) — un `<canvas>` posé sur son hôte, où le
 * moteur WebGL2 (`lib/game/gl/`) peint le reflet, l'onde de frappe ou
 * l'irisation. L'hôte doit être `position: relative` (ou autre repère de
 * positionnement) : le canvas le recouvre, sans jamais intercepter un geste.
 *
 * L'hôte reçoit `data-game-gl` : `on` quand WebGL2 peint (le trait SVG de repli
 * se tait), `off` sinon (WebGL2 manque, ou l'utilisateur limite les animations :
 * le repli CSS de `styles/game.css` joue, sous `prefers-reduced-motion:
 * no-preference` seulement). Le démontage arrête la boucle, se désabonne de
 * tout et libère le contexte WebGL.
 *
 * `replayKey` : un nombre que l'hôte incrémente pour rejouer l'effet (une
 * nouvelle frappe, un badge rallumé). DÉCORATIF (`aria-hidden`).
 */

type Props = {
  readonly effect: GameEffect;
  /** Masque circulaire (la Meesh) ; sinon plan entier. */
  readonly circle?: boolean;
  /** Passages du reflet (défaut : 3). */
  readonly passes?: number;
  readonly replayKey?: number;
  /** `false` : l'effet attend son premier `replayKey` (l'onde de frappe attend le « tchak »). Défaut : vrai. */
  readonly autoStart?: boolean;
  /** Le reflet balaie tout de suite, sans son repos (le passage d'un niveau). */
  readonly immediate?: boolean;
  /** Pour les témoins : remplace l'environnement du navigateur. Défaut : `window`. */
  readonly createEnv?: (host: HTMLElement, canvas: HTMLCanvasElement) => EffectEnv;
};

const browserEnv = (host: HTMLElement, canvas: HTMLCanvasElement): EffectEnv => createBrowserEnv({ win: window, host, canvas });

export function GameEffectLayer({ effect, circle = false, passes, replayKey = 0, autoStart = true, immediate = false, createEnv = browserEnv }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<EffectController | null>(null);
  const firstReplay = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (canvas === null || canvas === undefined || host === null || host === undefined) return undefined;
    const controller = startEffect({ effect, circle, autoStart, immediate, ...(passes === undefined ? {} : { passes }) }, createEnv(host, canvas));
    controllerRef.current = controller;
    host.setAttribute('data-game-gl', controller.backend === 'webgl2' ? 'on' : 'off');
    return () => {
      controller.dispose();
      controllerRef.current = null;
      host.removeAttribute('data-game-gl');
    };
  }, [effect, circle, passes, autoStart, immediate, createEnv]);

  useEffect(() => {
    if (firstReplay.current) {
      firstReplay.current = false;
      return;
    }
    controllerRef.current?.replay();
  }, [replayKey]);

  return <canvas ref={canvasRef} aria-hidden="true" data-game-effect={effect} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
