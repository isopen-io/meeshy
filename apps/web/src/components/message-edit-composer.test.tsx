import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import type { MessageEditState } from '@/lib/view/use-message-edit';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageEditDock } from './message-edit-composer';

/**
 * #10581 — LE COMPOSEUR EN MODE ÉDITION. Le bandeau « Modification » et son
 * champ prennent la place du composeur, qui reste MONTÉ : le brouillon en
 * cours est mis de côté, puis rendu tel quel à l'annulation. Échap annule,
 * Entrée envoie, et le bouton d'envoi n'existe que s'il y a quelque chose à
 * envoyer.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
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

function Draft() {
  const [text, setText] = useState('');
  return <textarea data-draft value={text} onInput={(e) => setText(e.currentTarget.value)} />;
}

function mount(editing: MessageEditState['editing']) {
  const calls: string[] = [];
  const stateOf = (current: MessageEditState['editing']): MessageEditState => ({
    editing: current,
    begin: () => calls.push('begin'),
    cancel: () => calls.push('cancel'),
    submit: (text) => calls.push(`submit:${text}`),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const render = (current: MessageEditState['editing']) =>
    act(() =>
      root.render(
        <MessageEditDock edit={stateOf(current)}>
          <Draft />
        </MessageEditDock>,
      ),
    );
  render(editing);
  return { calls, render };
}

const field = (): HTMLTextAreaElement => {
  const el = container.querySelector<HTMLTextAreaElement>('[data-composer-edit-field]');
  if (el === null) throw new Error('champ d’édition absent');
  return el;
};

const type = (el: HTMLTextAreaElement, value: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const press = (el: HTMLElement, key: string, shiftKey = false) => {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  });
};

const EDITING = { messageId: 'm-1', original: 'bonjour à tous' } as const;

describe('MessageEditDock — hors édition, le composeur seul', () => {
  test('aucun bandeau, et le composeur est visible', () => {
    mount(null);
    expect(container.querySelector('[data-composer-edit]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-composer-aside]')?.style.display).toBe('contents');
  });
});

describe('MessageEditDock — en édition', () => {
  test('le bandeau dit « Modification », le champ porte le texte d’origine et prend le focus', () => {
    mount(EDITING);
    expect(container.querySelector('[data-composer-edit]')?.textContent).toContain('Modification');
    expect(field().value).toBe('bonjour à tous');
    expect(document.activeElement).toBe(field());
  });

  test('le brouillon en cours est mis de côté, puis rendu à l’annulation', () => {
    const { render } = mount(null);
    const draft = container.querySelector<HTMLTextAreaElement>('[data-draft]');
    if (draft === null) throw new Error('brouillon absent');
    type(draft, 'un brouillon en cours');
    render(EDITING);
    expect(container.querySelector<HTMLElement>('[data-composer-aside]')?.style.display).toBe('none');
    expect(container.querySelector('[data-draft]')).toBe(draft);
    render(null);
    expect(container.querySelector<HTMLTextAreaElement>('[data-draft]')?.value).toBe('un brouillon en cours');
    expect(container.querySelector<HTMLElement>('[data-composer-aside]')?.style.display).toBe('contents');
    expect(document.activeElement).toBe(container.querySelector('[data-draft]'));
  });

  test('Échap annule', () => {
    const { calls } = mount(EDITING);
    press(field(), 'Escape');
    expect(calls).toEqual(['cancel']);
  });

  test('le bouton du bandeau annule, et porte un nom accessible', () => {
    const { calls } = mount(EDITING);
    const cancel = container.querySelector<HTMLButtonElement>('[data-composer-edit-cancel]');
    expect(cancel?.getAttribute('aria-label')).toBe('Annuler la modification');
    act(() => cancel?.click());
    expect(calls).toEqual(['cancel']);
  });

  test('Entrée envoie le texte du champ ; Maj+Entrée n’envoie pas', () => {
    const { calls } = mount(EDITING);
    type(field(), 'bonsoir à tous');
    press(field(), 'Enter', true);
    expect(calls).toEqual([]);
    press(field(), 'Enter');
    expect(calls).toEqual(['submit:bonsoir à tous']);
  });

  test('le bouton d’envoi n’existe que si le texte a changé et n’est pas vide', () => {
    mount(EDITING);
    expect(container.querySelector('[data-composer-edit-submit]')).toBeNull();
    type(field(), '   ');
    expect(container.querySelector('[data-composer-edit-submit]')).toBeNull();
    type(field(), 'bonsoir');
    expect(container.querySelector('[data-composer-edit-submit]')?.getAttribute('aria-label')).toBe('Enregistrer la modification');
  });

  test('changer de message édité repart du texte du nouveau message', () => {
    const { render } = mount(EDITING);
    type(field(), 'un texte en cours');
    render({ messageId: 'm-2', original: 'autre message' });
    expect(field().value).toBe('autre message');
  });
});
