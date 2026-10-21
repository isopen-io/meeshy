import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useFlip } from './use-flip';

/**
 * **`useFlip` JOUE LE DÉPLACEMENT D'UN ÉLÉMENT QUI A CHANGÉ DE CLÉ** (#11314) :
 * il mesure à chaque rendu, et ne joue que quand la clé change — un glissé qui
 * redessine à chaque image ne se rejoue donc pas en retard.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Played = { readonly frames: readonly Keyframe[]; readonly options: KeyframeAnimationOptions };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let played: Played[] = [];
let top = 0;
const realAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const realRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');

beforeAll(() => {
  ensureHappyDomRegistered();
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
  top = 0;
  if (realAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', realAnimate);
  if (realRect !== undefined) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', realRect);
});

function Probe({ flipKey, fadeFrom }: { readonly flipKey: string | null; readonly fadeFrom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, { key: flipKey, duration: 250, easing: 'ease-out', ...(fadeFrom === undefined ? {} : { fadeFrom }) });
  return <div ref={ref} data-probe="" />;
}

function stub(): void {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(frames: readonly Keyframe[], options: KeyframeAnimationOptions) {
      played = [...played, { frames, options }];
      return { cancel: () => undefined };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 10, top, right: 10, bottom: top, width: 0, height: 0, x: 10, y: top, toJSON: () => ({}) }),
  });
}

async function render(props: { readonly flipKey: string | null; readonly fadeFrom?: number }): Promise<void> {
  container ??= document.body.appendChild(document.createElement('div'));
  root ??= createRoot(container);
  await act(async () => root?.render(<Probe {...props} />));
}

describe('useFlip', () => {
  test('la clé change et l’élément a bougé de 120 px : il repart de là, en transform seul', async () => {
    stub();
    top = 100;
    await render({ flipKey: 'a' });
    top = 220;
    await render({ flipKey: 'b' });
    expect(played).toHaveLength(1);
    expect(played[0]?.frames).toEqual([{ transform: 'translate(0px, -120px)' }, { transform: 'none' }]);
    expect(played[0]?.options).toEqual({ duration: 250, easing: 'ease-out' });
  });

  test('la clé ne change pas : l’élément a beau bouger (glissé), rien ne se rejoue', async () => {
    stub();
    top = 100;
    await render({ flipKey: 'a' });
    top = 300;
    await render({ flipKey: 'a' });
    expect(played).toHaveLength(0);
  });

  test('un premier rendu ne joue rien ; une clé nulle désarme le crochet', async () => {
    stub();
    top = 100;
    await render({ flipKey: 'a' });
    expect(played).toHaveLength(0);
    top = 400;
    await render({ flipKey: null });
    top = 10;
    await render({ flipKey: 'z' });
    expect(played).toHaveLength(0);
  });

  test('le fondu seul joue même quand rien n’a bougé', async () => {
    stub();
    await render({ flipKey: 'a', fadeFrom: 0.4 });
    await render({ flipKey: 'b', fadeFrom: 0.4 });
    expect(played[0]?.frames).toEqual([{ opacity: 0.4 }, { opacity: 1 }]);
  });
});
