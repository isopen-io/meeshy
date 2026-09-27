import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StudioPose } from '@/lib/stories/studio-pose';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioObjectHandles } from './story-compose-stage';

/**
 * LES LIMITES ET LES AIMANTS PENDANT UN GESTE (#8413) — le contour de la
 * scène et les dix lignes magnétiques n'existent qu'entre l'appui et le
 * relâchement ; le déplacement s'accroche aux cibles d'iOS, et la ligne
 * accrochée se détache.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const STAGE = { left: 0, top: 0, width: 100, height: 200 };

function mountHandles(onCommit: (pose: StudioPose) => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const stage = document.createElement('div');
  stage.getBoundingClientRect = () =>
    ({ ...STAGE, x: 0, y: 0, right: STAGE.width, bottom: STAGE.height, toJSON: () => ({}) }) as DOMRect;
  const object = document.createElement('span');
  object.setAttribute('data-scene-object-id', 't1');
  stage.appendChild(object);
  host.appendChild(stage);
  const mountPoint = document.createElement('div');
  stage.appendChild(mountPoint);
  root = createRoot(mountPoint);
  act(() => {
    root!.render(
      <StudioObjectHandles lang="fr" name="Texte 1" pose={{ x: 0.3, y: 0.3, scale: 1, rotation: 0 }} stageRef={{ current: stage }} objectId="t1" onCommit={onCommit} />,
    );
  });
  const move = host.querySelector<HTMLButtonElement>('[data-story-object-move]')!;
  move.setPointerCapture = () => undefined;
  return { move };
}

const pointer = (target: Element, type: string, clientX: number, clientY: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 }));
  });

describe('StudioObjectHandles — le contour et les aimants, pendant le geste seulement', () => {
  test('au repos rien ; à l’appui le contour et 10 lignes ; au relâchement plus rien', () => {
    const { move } = mountHandles(() => undefined);
    expect(host!.querySelector('[data-story-studio-limits]')).toBeNull();
    pointer(move, 'pointerdown', 30, 60);
    expect(host!.querySelector('[data-story-studio-contour]')).not.toBeNull();
    expect(host!.querySelectorAll('[data-story-snap-line]')).toHaveLength(10);
    pointer(move, 'pointerup', 30, 60);
    expect(host!.querySelector('[data-story-studio-limits]')).toBeNull();
  });

  test('glisser près du centre s’y ACCROCHE, la ligne accrochée se détache, et la pose commise est aimantée', () => {
    const commits: StudioPose[] = [];
    const { move } = mountHandles((pose) => commits.push(pose));
    pointer(move, 'pointerdown', 30, 60);
    // 0.3 + (51 − 30)/100 = 0.51 → 0.5 ; 0.3 + (101 − 60)/200 = 0.505 → 0.5
    pointer(move, 'pointermove', 51, 101);
    const engaged = [...host!.querySelectorAll('[data-story-snap-engaged]')].map((line) => `${line.getAttribute('data-story-snap-line')}:${line.getAttribute('data-story-snap-target')}`);
    expect(engaged.sort()).toEqual(['x:0.5', 'y:0.5']);
    pointer(move, 'pointerup', 51, 101);
    expect(commits.at(-1)).toMatchObject({ x: 0.5, y: 0.5 });
  });
});
