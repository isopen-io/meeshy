import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressSegments } from './onboarding-visuals';

/**
 * LA BARRE DE L'ACCUEIL AVANCE SANS RELANCER LA MISE EN PAGE À CHAQUE IMAGE (#18322, M6).
 * Le segment courant s'élargit et le précédent revient à sa taille : la nouvelle mise en page est
 * posée d'un coup, puis chaque segment déplacé part de son ancienne boîte par `translate` et `scale`
 * pour rejoindre la nouvelle. Sous « Réduire les animations », rien ne bouge : la barre change d'état.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const SEGMENT = 44;
const CURRENT = 200;
const GAP = 6;

type Played = { readonly index: number; readonly frames: readonly Keyframe[] };

/** La mise en page que la feuille donnerait : 44 px par segment, le courant prend le reste. */
function layOut(segment: HTMLElement): DOMRect {
  const siblings = [...(segment.parentElement?.children ?? [])] as HTMLElement[];
  const widthOf = (node: HTMLElement) => (node.getAttribute('data-current') === 'true' ? CURRENT : SEGMENT);
  const index = siblings.indexOf(segment);
  const left = siblings.slice(0, index).reduce((sum, node) => sum + widthOf(node) + GAP, 0);
  return { left, right: left + widthOf(segment), top: 0, bottom: 6, width: widthOf(segment), height: 6, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
}

async function stepping({ reduced }: { readonly reduced: boolean }): Promise<readonly Played[]> {
  const played: Played[] = [];
  const ownAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const ownRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  const ownMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, frames: Keyframe[]) {
      played.push({ index: [...(this.parentElement?.children ?? [])].indexOf(this), frames });
      return { cancel: () => undefined, onfinish: null } as unknown as Animation;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      if (this.classList.contains('onb-progress-seg')) return layOut(this);
      return { left: 0, right: 600, top: 0, bottom: 6, width: 600, height: 6, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  try {
    const host = await mounter.mount(<ProgressSegments position={2} count={5} label="2 sur 5" />);
    expect(played).toEqual([]);
    await mounter.rerender(host, <ProgressSegments position={3} count={5} label="3 sur 5" />);
    return played;
  } finally {
    const restore = (target: object, name: string, own: PropertyDescriptor | undefined) => {
      if (own === undefined) Reflect.deleteProperty(target, name);
      else Object.defineProperty(target, name, own);
    };
    restore(HTMLElement.prototype, 'animate', ownAnimate);
    restore(HTMLElement.prototype, 'getBoundingClientRect', ownRect);
    restore(window, 'matchMedia', ownMedia);
  }
}

describe('la barre de progression de l’accueil', () => {
  test('le segment qui devient courant part de son ancienne largeur par une échelle, sans animer sa largeur', async () => {
    const played = await stepping({ reduced: false });
    const grown = played.find((entry) => entry.index === 2);
    const shrunk = played.find((entry) => entry.index === 1);
    expect(grown?.frames[0]).toMatchObject({ scale: `${SEGMENT / CURRENT} 1` });
    expect(grown?.frames.at(-1)).toMatchObject({ scale: '1 1', translate: '0 0' });
    expect(shrunk?.frames[0]).toMatchObject({ scale: `${CURRENT / SEGMENT} 1` });
    expect(played.find((entry) => entry.index === 0)).toBeUndefined();
    expect(JSON.stringify(played)).not.toMatch(/width|flex/);
  });

  test('le segment qui devient courant part de son ancienne place, et ceux qui n’ont pas bougé ne jouent rien', async () => {
    const played = await stepping({ reduced: false });
    const oldLeft = SEGMENT + GAP + CURRENT + GAP;
    const newLeft = 2 * (SEGMENT + GAP);
    expect(played.find((entry) => entry.index === 2)?.frames[0]).toMatchObject({ translate: `${oldLeft - newLeft}px 0` });
    expect(played.map((entry) => entry.index).sort()).toEqual([1, 2]);
  });

  test('sous « Réduire les animations », la barre change d’état sans mouvement', async () => {
    expect(await stepping({ reduced: true })).toEqual([]);
  });
});
