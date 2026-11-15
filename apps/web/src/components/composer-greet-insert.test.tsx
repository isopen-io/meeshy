import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { composerInsertStore } from '@/lib/view/composer-insert';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * #16338 — LE COMPOSEUR DU FIL REÇOIT LES MENTIONS DU SALUT : à la suite du
 * texte, puis le focus, le curseur en fin de champ.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(text: string, onTextChange?: (text: string) => void): HTMLTextAreaElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <Composer onSend={() => {}} preferred={['fr']} draft={{ text, language: 'fr', protection: {} }} {...(onTextChange === undefined ? {} : { onTextChange })} />,
    ),
  );
  return container.querySelector('textarea')!;
}

describe('Composer — les mentions du salut (#16338)', () => {
  test('un champ vide reçoit les mentions, prend le focus, curseur en fin', async () => {
    const typed: string[] = [];
    const field = mount('', (text) => typed.push(text));
    await act(async () => composerInsertStore.request('@lea @zoe '));
    expect(field.value).toBe('@lea @zoe ');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe('@lea @zoe '.length);
    expect(typed).toEqual(['@lea @zoe ']);
  });

  test('un texte déjà écrit est gardé : les mentions viennent à sa suite', async () => {
    const field = mount('Bienvenue');
    await act(async () => composerInsertStore.request('@tom '));
    expect(field.value).toBe('Bienvenue @tom ');
  });

  test('démonté, le composeur ne reçoit plus rien', () => {
    mount('');
    act(() => root.unmount());
    expect(composerInsertStore.available()).toBe(false);
    root = createRoot(container);
  });
});
