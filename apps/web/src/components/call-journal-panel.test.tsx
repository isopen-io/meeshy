import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallCaption } from '@/lib/calls/call-captions';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallJournalPanel } from './call-journal-panel';

/**
 * LE JOURNAL DE L'APPEL (#8579) — tout ce qui a été dit, sans rien tronquer :
 * qui, quand, la phrase servie dans ma langue et son original dessous. Le
 * défilement est libre ; « Revenir au direct » ramène en bas.
 */

const caption = (overrides: Partial<CallCaption> = {}): CallCaption => ({
  id: 'w-1',
  speakerId: 'u-nadia',
  speakerName: 'Nadia',
  original: 'Hello everyone',
  translated: 'Bonjour à tous',
  pair: { from: 'en', to: 'fr' },
  isFinal: true,
  at: 1_000,
  mine: false,
  ...overrides,
});

const lines = (count: number): readonly CallCaption[] => Array.from({ length: count }, (_, n) => caption({ id: `w-${n}`, original: `Line ${n}`, translated: `Ligne ${n}`, at: 1_000 + n }));

describe('CallJournalPanel', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadCallControlsCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (captions: readonly CallCaption[], options: { readonly listening?: boolean } = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const events: string[] = [];
    const render = (next: readonly CallCaption[]) =>
      act(() =>
        root.render(
          <CallJournalPanel
            id="call-journal-panel"
            closeGlyph={null}
            language="fr"
            onClose={() => void events.push('close')}
            back={{ label: 'Retour', onPress: () => void events.push('back') }}
            captions={next}
            colorOf={(line) => (line.mine ? '#fff' : '#f0a')}
            listening={options.listening ?? true}
            onListen={() => void events.push('listen')}
          />,
        ),
      );
    render(captions);
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, render, events, done };
  };

  const scrollBox = (list: HTMLElement, box: { readonly top: number; readonly height: number; readonly client: number }) => {
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: box.height });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: box.client });
    list.scrollTop = box.top;
  };

  test('un panneau « Journal », avec ‹ Retour et Fermer', () => {
    const view = mount(lines(2));
    expect(view.find('[data-call-journal-panel] h2')?.textContent).toBe('Journal');
    expect(view.find('[data-panel-back]')?.getAttribute('aria-label')).toBe('Retour');
    expect(view.find('[data-call-journal]')?.getAttribute('aria-label')).toBe('Journal de l’appel');
    view.done();
  });

  test('TOUT l’appel, dans l’ordre : qui, quand, la phrase servie et son original dessous', () => {
    const view = mount(lines(300));
    const entries = view.all('[data-call-journal-entry]');
    expect(entries).toHaveLength(300);
    const first = entries[0];
    expect(first?.textContent).toContain('Nadia');
    expect(first?.querySelector('time')?.getAttribute('dateTime')).toBe(new Date(1_000).toISOString());
    expect(first?.querySelector('[data-call-journal-text]')?.textContent).toBe('Ligne 0');
    expect(first?.querySelector('[data-call-journal-original]')?.textContent).toBe('Original · Line 0');
    expect(entries.at(-1)?.querySelector('[data-call-journal-text]')?.textContent).toBe('Ligne 299');
    view.done();
  });

  test('ma parole se lit telle que dite, sans original redoublé ; chaque ligne ne se peint que là où je regarde', () => {
    const view = mount([caption({ id: 'me', mine: true, speakerName: '', original: 'Salut', translated: null, pair: null })]);
    const entry = view.find('[data-call-journal-entry="mine"]') as HTMLElement;
    expect(entry.textContent).toContain('Vous');
    expect(entry.querySelector('[data-call-journal-original]')).toBeNull();
    expect(entry.style.contentVisibility).toBe('auto');
    view.done();
  });

  test('en bas, une phrase nouvelle m’y garde', () => {
    const view = mount(lines(3));
    const list = view.find('[data-call-journal]') as HTMLElement;
    scrollBox(list, { top: 600, height: 1000, client: 400 });
    act(() => list.dispatchEvent(new Event('scroll')));
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1100 });
    view.render(lines(4));
    expect(list.scrollTop).toBe(1100);
    expect(view.find('[data-call-journal-live]')).toBeNull();
    view.done();
  });

  test('remonté relire, rien ne me déplace ; « Revenir au direct » me ramène en bas', () => {
    const view = mount(lines(3));
    const list = view.find('[data-call-journal]') as HTMLElement;
    scrollBox(list, { top: 100, height: 1000, client: 400 });
    act(() => list.dispatchEvent(new Event('scroll')));
    view.render(lines(5));
    expect(list.scrollTop).toBe(100);
    const live = view.find('[data-call-journal-live]') as HTMLElement;
    expect(live.textContent).toBe('Revenir au direct');
    act(() => live.click());
    expect(view.find('[data-call-journal-live]')).toBeNull();
    view.done();
  });

  test('rien encore dit : l’état vide le dit, et propose d’activer les sous-titres s’ils sont coupés', () => {
    const listening = mount([]);
    expect(listening.find('[data-call-journal-empty]')?.textContent).toContain('Rien n’est encore transcrit');
    expect(listening.find('[data-call-journal-listen]')).toBeNull();
    listening.done();
    const off = mount([], { listening: false });
    act(() => (off.find('[data-call-journal-listen]') as HTMLElement).click());
    expect(off.events).toEqual(['listen']);
    off.done();
  });

  test('Échap et Fermer ferment ; ‹ revient', () => {
    const view = mount(lines(1));
    act(() => view.find('[data-call-journal-panel]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => (view.find('[data-panel-back]') as HTMLElement).click());
    act(() => (view.find('[data-panel-close]') as HTMLElement).click());
    expect(view.events).toEqual(['close', 'back', 'close']);
    view.done();
  });
});
