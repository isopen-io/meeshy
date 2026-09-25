import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';
import { emphasisShortcutOf } from './composer-format-bar';

/**
 * GRAS, ITALIQUE, SOULIGNÉ, BARRÉ EN UN GESTE (#7849) — vu du lecteur : un
 * raccourci ou un bouton de la barre met la SÉLECTION en forme, la barre ne
 * paraît que sur une sélection, et ce qui part est le texte balisé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  const mounted = root;
  if (mounted !== null) {
    act(() => {
      mounted.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

async function mountComposer(): Promise<{ readonly el: HTMLDivElement; readonly sent: string[] }> {
  const sent: string[] = [];
  const el = document.createElement('div');
  document.body.appendChild(el);
  const mounted = createRoot(el);
  container = el;
  root = mounted;
  await act(async () => {
    mounted.render(<Composer onSend={(payload) => sent.push(payload.text)} />);
  });
  return { el, sent };
}

const fieldOf = (el: HTMLElement): HTMLTextAreaElement => {
  const field = el.querySelector('textarea');
  if (field === null) throw new Error('Aucun champ');
  return field;
};

function typeAndSelect(el: HTMLElement, value: string, start: number, end: number): void {
  const field = fieldOf(el);
  act(() => {
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    field.setSelectionRange(start, end);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('le raccourci clavier', () => {
  test('Ctrl+B / I / U et Ctrl+Maj+X nomment les quatre emphases, rien d’autre', () => {
    const base = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(emphasisShortcutOf({ ...base, key: 'b' })).toBe('bold');
    expect(emphasisShortcutOf({ ...base, key: 'i' })).toBe('italic');
    expect(emphasisShortcutOf({ ...base, key: 'u' })).toBe('underline');
    expect(emphasisShortcutOf({ ...base, key: 'X', shiftKey: true })).toBe('strikethrough');
    expect(emphasisShortcutOf({ ...base, ctrlKey: false, metaKey: true, key: 'b' })).toBe('bold');
    expect(emphasisShortcutOf({ ...base, key: 'c' })).toBeNull();
    expect(emphasisShortcutOf({ ...base, ctrlKey: false, key: 'b' })).toBeNull();
  });

  test('Ctrl+B met la sélection en gras dans le champ', async () => {
    const { el } = await mountComposer();
    typeAndSelect(el, 'un mot fort', 3, 6);
    act(() => {
      fieldOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await flush();
    expect(fieldOf(el).value).toBe('un **mot** fort');
  });
});

describe('la barre de format', () => {
  test('absente sans sélection, présente sur une sélection', async () => {
    const { el } = await mountComposer();
    typeAndSelect(el, 'un mot', 6, 6);
    expect(el.querySelector('[data-format-bar]')).toBeNull();
    typeAndSelect(el, 'un mot', 3, 6);
    expect(el.querySelector('[data-format-bar]')).not.toBeNull();
    expect(el.querySelectorAll('[data-format-bar] button').length).toBe(4);
  });

  test('toucher « S » barre la sélection, et le texte balisé est ce qui part', async () => {
    const { el, sent } = await mountComposer();
    typeAndSelect(el, 'rdv annulé', 4, 10);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-format="strikethrough"]')?.click();
    });
    await flush();
    expect(fieldOf(el).value).toBe('rdv ~~annulé~~');
    act(() => {
      fieldOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(sent).toEqual(['rdv ~~annulé~~']);
  });
});
