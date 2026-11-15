import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryHiddenTabPause } from './use-story-hidden-tab-pause';

/**
 * EXTRACTION PURE de `routes/story.tsx` (#7116, § budget) — ce témoin prouve
 * que le comportement n'a PAS changé : c'est la preuve qu'exiger avant
 * d'ajouter.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function Harness({ paused, pause, resume }: { readonly paused: boolean; readonly pause: () => void; readonly resume: () => void }) {
  useStoryHiddenTabPause({ paused, pause, resume });
  return null;
}

function mount(props: { readonly paused: boolean; readonly pause: () => void; readonly resume: () => void }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness {...props} />));
}

function hideTab(): void {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

function showTab(): void {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

describe('useStoryHiddenTabPause — l’onglet caché ne consomme pas une story', () => {
  test('passer en arrière-plan alors que ça JOUE met en pause, et le retour REPREND', () => {
    let pausedCalls = 0;
    let resumedCalls = 0;
    mount({ paused: false, pause: () => pausedCalls++, resume: () => resumedCalls++ });
    hideTab();
    expect(pausedCalls).toBe(1);
    showTab();
    expect(resumedCalls).toBe(1);
  });

  test('une pause VOULUE (déjà posée) survit au passage en arrière-plan — le retour ne la reprend pas', () => {
    let pausedCalls = 0;
    let resumedCalls = 0;
    mount({ paused: true, pause: () => pausedCalls++, resume: () => resumedCalls++ });
    hideTab();
    expect(pausedCalls).toBe(0); // déjà en pause, rien à refaire
    showTab();
    expect(resumedCalls).toBe(0); // ce n'est pas CETTE pause qui a mis en arrière-plan
  });
});
