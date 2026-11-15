import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useFlip } from './use-flip';

/**
 * **`useFlip` JOUE LE DÉPLACEMENT D'UN ÉLÉMENT QUI A CHANGÉ DE CLÉ** (#11314) :
 * il ne joue que quand la clé change — un glissé qui redessine à chaque image
 * ne se rejoue donc pas en retard — et il relève la position de DÉPART au
 * moment même du changement, jamais au rendu précédent : un défilement entre
 * deux rendus n'est pas un déplacement.
 *
 * Le rectangle simulé se lit dans le DOM (`data-y`) moins le défilement de la
 * page : il ne bouge qu'au rendu qui le change, comme dans un vrai moteur.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Played = { readonly frames: readonly Keyframe[]; readonly options: KeyframeAnimationOptions };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let played: Played[] = [];
let scroll = 0;
let cancelled = 0;
let realAnimate: PropertyDescriptor | undefined;
let realRect: PropertyDescriptor | undefined;

beforeAll(() => {
  ensureHappyDomRegistered();
  realAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  realRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  played = [];
  scroll = 0;
  cancelled = 0;
  if (realAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', realAnimate);
  if (realRect === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
  else Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', realRect);
});

type ProbeProps = { readonly flipKey: string | null; readonly y?: number; readonly fadeFrom?: number; readonly held?: boolean; readonly ownScale?: string; readonly width?: number; readonly reducedDuration?: number };

function Probe({ flipKey, y = 0, fadeFrom, held, ownScale, width, reducedDuration }: ProbeProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, {
    key: flipKey,
    duration: 250,
    easing: 'ease-out',
    ...(fadeFrom === undefined ? {} : { fadeFrom }),
    ...(held === undefined ? {} : { held }),
    ...(width === undefined ? {} : { origin: { x: 0, y: 0 } }),
    ...(reducedDuration === undefined ? {} : { reducedDuration }),
  });
  return <div ref={ref} data-probe="" data-y={y} data-width={width} style={ownScale === undefined ? undefined : { scale: ownScale }} />;
}

function stub(): void {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(frames: readonly Keyframe[], options: KeyframeAnimationOptions) {
      played = [...played, { frames, options }];
      return {
        cancel: () => {
          cancelled += 1;
        },
      };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value(this: HTMLElement) {
      const top = Number(this.getAttribute('data-y') ?? 0) - scroll;
      const width = Number(this.getAttribute('data-width') ?? 0);
      return { left: 10, top, right: 10 + width, bottom: top + width, width, height: width, x: 10, y: top, toJSON: () => ({}) };
    },
  });
}

async function render(props: ProbeProps): Promise<void> {
  container ??= document.body.appendChild(document.createElement('div'));
  root ??= createRoot(container);
  await act(async () => root?.render(<Probe {...props} />));
}

describe('useFlip', () => {
  test('la clé change et l’élément a bougé de 120 px : il repart de là, en transform seul', async () => {
    stub();
    await render({ flipKey: 'a', y: 100 });
    await render({ flipKey: 'b', y: 220 });
    expect(played).toHaveLength(1);
    expect(played[0]?.frames).toEqual([{ transform: 'translate(0px, -120px)' }, { transform: 'none' }]);
    expect(played[0]?.options).toEqual({ duration: 250, easing: 'ease-out' });
  });

  test('la page a défilé de 500 px depuis le dernier rendu : seul le déplacement du changement se joue', async () => {
    stub();
    await render({ flipKey: 'a', y: 100 });
    scroll = 500;
    await render({ flipKey: 'b', y: 220 });
    expect(played).toHaveLength(1);
    expect(played[0]?.frames).toEqual([{ transform: 'translate(0px, -120px)' }, { transform: 'none' }]);
  });

  test('la clé ne change pas : l’élément a beau bouger (glissé), rien ne se rejoue', async () => {
    stub();
    await render({ flipKey: 'a', y: 100 });
    await render({ flipKey: 'a', y: 300 });
    expect(played).toHaveLength(0);
  });

  test('un rendu sans changement de clé n’interrompt pas le mouvement en cours', async () => {
    stub();
    await render({ flipKey: 'a', y: 100 });
    await render({ flipKey: 'b', y: 220 });
    await render({ flipKey: 'b', y: 220 });
    expect(played).toHaveLength(1);
    expect(cancelled).toBe(0);
    await render({ flipKey: 'c', y: 100 });
    expect(played).toHaveLength(2);
    expect(cancelled).toBe(1);
  });

  test('un état TENU par le doigt ne se joue pas (il interrompt le mouvement) ; le lâcher repart de là où le doigt l’a laissé', async () => {
    stub();
    await render({ flipKey: 'rest', y: 100 });
    await render({ flipKey: 'other', y: 200 });
    await render({ flipKey: 'held', y: 260, held: true });
    expect(played).toHaveLength(1);
    expect(cancelled).toBe(1);
    await render({ flipKey: 'rest', y: 100 });
    expect(played).toHaveLength(2);
    expect(played[1]?.frames).toEqual([{ transform: 'translate(0px, 160px)' }, { transform: 'none' }]);
  });

  test('un premier rendu ne joue rien ; une clé nulle désarme le crochet', async () => {
    stub();
    await render({ flipKey: 'a', y: 100 });
    expect(played).toHaveLength(0);
    await render({ flipKey: null, y: 400 });
    await render({ flipKey: 'z', y: 10 });
    expect(played).toHaveLength(0);
  });

  test('le fondu seul joue même quand rien n’a bougé', async () => {
    stub();
    await render({ flipKey: 'a', fadeFrom: 0.4 });
    await render({ flipKey: 'b', fadeFrom: 0.4 });
    expect(played[0]?.frames).toEqual([{ opacity: 0.4 }, { opacity: 1 }]);
  });

  test('l’élément porte sa propre échelle (`scale`, ma vignette rangée) : la translation jouée sous elle s’y divise, il repart bien d’où on le voyait', async () => {
    stub();
    await render({ flipKey: 'a', y: 100, ownScale: '0.5' });
    await render({ flipKey: 'b', y: 220, ownScale: '0.5' });
    expect(played[0]?.frames).toEqual([{ transform: 'translate(0px, -240px)' }, { transform: 'none' }]);
  });

  test('réduire les animations : le fondu qui remplace le changement de taille dure le temps court déclaré, pas celui du mouvement', async () => {
    stub();
    const savedMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    try {
      await render({ flipKey: 'a', width: 100, reducedDuration: 120 });
      await render({ flipKey: 'b', width: 60, reducedDuration: 120 });
    } finally {
      if (savedMedia === undefined) Reflect.deleteProperty(window, 'matchMedia');
      else Object.defineProperty(window, 'matchMedia', savedMedia);
    }
    expect(played).toHaveLength(1);
    expect(played[0]?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played[0]?.options).toEqual({ duration: 120, easing: 'ease-out' });
  });
});
