import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

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

const mounted: { readonly root: Root; readonly el: HTMLDivElement }[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, el }) => {
    act(() => {
      root.unmount();
    });
    el.remove();
  });
});

const enter = (over: { readonly isComposing?: boolean; readonly keyCode?: number } = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: over.isComposing ?? false });
  Object.defineProperty(event, 'keyCode', { value: over.keyCode ?? 13 });
  return event;
};

async function composing(text: string): Promise<{ readonly field: HTMLTextAreaElement; readonly sent: string[] }> {
  const sent: string[] = [];
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  await act(async () => {
    root.render(<Composer onSend={(payload) => sent.push(payload.text)} />);
  });
  const field = el.querySelector('textarea');
  if (field === null) throw new Error('Aucun champ');
  act(() => {
    field.focus();
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return { field, sent };
}

describe('Composer — Entrée et méthode de saisie (#20752)', () => {
  test('l’Entrée qui confirme un candidat de conversion n’envoie pas le message', async () => {
    const { field, sent } = await composing('こんにち');
    act(() => void field.dispatchEvent(enter({ isComposing: true, keyCode: 229 })));
    expect(sent).toEqual([]);
    expect(field.value).toBe('こんにち');
  });

  test('Safari : composition déjà close, touche encore à 229 — le message ne part pas', async () => {
    const { field, sent } = await composing('こんにち');
    act(() => void field.dispatchEvent(enter({ isComposing: false, keyCode: 229 })));
    expect(sent).toEqual([]);
  });

  test('l’Entrée ordinaire envoie toujours, une fois', async () => {
    const { field, sent } = await composing('こんにちは');
    act(() => void field.dispatchEvent(enter()));
    expect(sent).toEqual(['こんにちは']);
  });
});
