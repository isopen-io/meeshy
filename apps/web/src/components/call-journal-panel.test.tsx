import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallCaption } from '@/lib/calls/call-captions';
import type { CallJournalNote } from '@/lib/calls/call-journal-notes';
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

  const mount = (captions: readonly CallCaption[], options: { readonly listening?: boolean; readonly notes?: readonly CallJournalNote[]; readonly startedAt?: number | null } = {}) => {
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
            notes={options.notes ?? []}
            colorOf={(who) => (who.speakerName === '' ? '#fff' : '#f0a')}
            startedAt={options.startedAt === undefined ? -64_000 : options.startedAt}
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
    expect(first?.querySelector('[data-call-journal-original]')).toBeNull();
    expect(entries.at(-1)?.querySelector('[data-call-journal-text]')?.textContent).toBe('Ligne 299');
    view.done();
  });

  test('#17517 — l’heure dans l’appel est À DROITE de la ligne méta, le pseudo et l’étiquette de langue à gauche ; plus d’heure murale', () => {
    const view = mount([caption({ at: 1_000 })]);
    const entry = view.find('[data-call-journal-entry]') as HTMLElement;
    const who = entry.querySelector('[data-call-journal-who]') as HTMLElement;
    const clock = entry.querySelector('time') as HTMLElement;
    expect(who.textContent).toContain('Nadia');
    expect(who.textContent).toContain('EN → FR');
    expect(who.contains(clock)).toBe(false);
    expect(clock.textContent).toBe('1:05');
    expect(who.nextElementSibling).toBe(clock);
    expect(entry.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    view.done();
  });

  test('#17517 — sans début d’appel connu, aucune heure', () => {
    const view = mount([caption()], { startedAt: null, notes: [{ id: 'n1', kind: 'screenshot', userId: 'u', name: 'Karim', at: 1_500 }] });
    expect(view.all('time')).toHaveLength(0);
    view.done();
  });

  test('#17340 — l’original ne se déplie que sous la phrase TOUCHÉE, et se replie au second toucher', () => {
    const view = mount([caption({ id: 'a' }), caption({ id: 'b', original: 'See you', translated: 'À plus', at: 2_000 })]);
    expect(view.all('[data-call-journal-original]')).toHaveLength(0);
    const taps = view.all('[data-call-journal-entry] button') as HTMLButtonElement[];
    expect(taps.map((tap) => tap.getAttribute('aria-expanded'))).toEqual(['false', 'false']);
    act(() => taps[1]?.click());
    const open = view.all('[data-call-journal-original]');
    expect(open).toHaveLength(1);
    expect(open[0]?.textContent).toBe('Original · See you');
    expect(view.all('[data-call-journal-entry]')[1]?.contains(open[0] ?? null)).toBe(true);
    expect((view.all('[data-call-journal-entry] button')[1] as HTMLElement).getAttribute('aria-expanded')).toBe('true');
    act(() => taps[1]?.click());
    expect((view.all('[data-call-journal-entry] button')[1] as HTMLElement).getAttribute('aria-expanded')).toBe('false');
    view.done();
  });

  test('#17340 — une phrase sans traduction (la mienne comprise) n’a rien à déplier : pas de bouton', () => {
    const view = mount([caption({ id: 'raw', original: 'Same', translated: null, pair: null })]);
    expect(view.all('[data-call-journal-entry] button')).toHaveLength(0);
    view.done();
  });

  test('ma parole se lit telle que dite, signée « Moi » comme dans la bande (planche P6), sans original redoublé ; chaque ligne ne se peint que là où je regarde', () => {
    const view = mount([caption({ id: 'me', mine: true, speakerName: '', original: 'Salut', translated: null, pair: null })]);
    const entry = view.find('[data-call-journal-entry="mine"]') as HTMLElement;
    expect(entry.querySelector('strong')?.textContent).toBe('Moi');
    expect(entry.textContent).not.toContain('Vous');
    expect(entry.querySelector('[data-call-journal-original]')).toBeNull();
    expect(entry.style.contentVisibility).toBe('auto');
    view.done();
  });

  test('le nom porte la couleur de son auteur ; seule la phrase TRADUITE la prend, l’original et ma parole restent à l’encre de l’appel', () => {
    const view = mount([caption({ id: 'peer' }), caption({ id: 'raw', original: 'Same', translated: null, pair: null }), caption({ id: 'me', mine: true, speakerName: '', original: 'Salut', translated: null, pair: null })]);
    act(() => (view.find('[data-call-journal-line]') as HTMLElement).click());
    const [peer, raw] = view.all('[data-call-journal-entry="peer"]') as HTMLElement[];
    const mine = view.find('[data-call-journal-entry="mine"]') as HTMLElement;
    expect((peer?.querySelector('strong') as HTMLElement).style.color).toBe('#f0a');
    expect((peer?.querySelector('[data-call-journal-text]') as HTMLElement).style.color).toBe('#f0a');
    expect((peer?.querySelector('[data-call-journal-original]') as HTMLElement).style.color).not.toBe('#f0a');
    expect((raw?.querySelector('[data-call-journal-text]') as HTMLElement).style.color).toBe('var(--color-on-media)');
    expect((mine.querySelector('strong') as HTMLElement).style.color).toBe('#fff');
    expect((mine.querySelector('[data-call-journal-text]') as HTMLElement).style.color).toBe('var(--color-on-media)');
    view.done();
  });

  test('loi 7 — la bascule « Traduit / Original » de l’en-tête s’applique à tout l’appel', () => {
    const view = mount([caption({ id: 'a' }), caption({ id: 'b', original: 'See you', translated: 'À plus', at: 2_000 }), caption({ id: 'me', mine: true, speakerName: '', original: 'Salut', translated: null, pair: null, at: 3_000 })]);
    const options = view.all('[data-call-journal-view] button') as HTMLButtonElement[];
    expect(options.map((option) => option.textContent)).toEqual(['Traduit', 'Original']);
    expect(options.map((option) => option.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(view.find('[data-call-journal-view]')?.closest('[data-call-journal-panel] > div:first-child')).not.toBeNull();
    act(() => options[1]?.click());
    expect(view.all('[data-call-journal-text]').map((text) => text.textContent)).toEqual(['Hello everyone', 'See you', 'Salut']);
    expect(view.all('[data-call-journal-original]')).toHaveLength(0);
    expect(((view.all('[data-call-journal-text]')[0]) as HTMLElement).style.color).toBe('var(--color-on-media)');
    expect((view.all('[data-call-journal-view] button') as HTMLButtonElement[]).map((option) => option.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    act(() => (view.all('[data-call-journal-view] button')[0] as HTMLButtonElement).click());
    expect(view.all('[data-call-journal-text]').map((text) => text.textContent)).toEqual(['Bonjour à tous', 'À plus', 'Salut']);
    view.done();
  });

  test('loi 7 — rien de traduit, pas de bascule : il n’y a qu’une version à lire', () => {
    const view = mount([caption({ id: 'raw', original: 'Same', translated: null, pair: null })]);
    expect(view.find('[data-call-journal-view]')).toBeNull();
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

  test('#16665 — une capture entre à son heure : datée, pseudo à sa couleur, phrase en encre secondaire', () => {
    const notes: readonly CallJournalNote[] = [
      { id: 'n1', kind: 'screenshot', userId: 'u-karim', name: 'Karim', at: 1_500 },
      { id: 'n2', kind: 'call-recording-started', userId: 'u-awa', name: 'Awa', at: 2_500 },
    ];
    const view = mount([caption({ id: 'a', at: 1_000 }), caption({ id: 'b', at: 2_000 })], { notes });
    const order = view.all('[data-call-journal] > li').map((entry) => entry.getAttribute('data-call-journal-note') ?? entry.getAttribute('data-call-journal-entry'));
    expect(order).toEqual(['peer', 'screenshot', 'peer', 'call-recording-started']);
    const tie = mount([caption({ id: 'a', at: 1_000 })], { notes: [{ id: 'n0', kind: 'screenshot', userId: 'u-karim', name: 'Karim', at: 1_000 }] });
    expect(tie.all('[data-call-journal] > li').map((entry) => entry.getAttribute('data-call-journal-note') ?? entry.getAttribute('data-call-journal-entry'))).toEqual(['peer', 'screenshot']);
    tie.done();
    const capture = view.find('[data-call-journal-note="screenshot"]') as HTMLElement;
    expect(capture.querySelector('time')?.getAttribute('dateTime')).toBe(new Date(1_500).toISOString());
    expect(capture.querySelector('time')?.textContent).toBe('1:05');
    expect(capture.querySelector('[data-call-journal-note-text]')?.nextElementSibling).toBe(capture.querySelector('time'));
    const sentence = capture.querySelector('[data-call-journal-note-text]') as HTMLElement;
    expect(sentence.textContent).toBe('Karim a capturé l’écran');
    expect(sentence.style.color).toBe('var(--color-on-media-3)');
    expect((sentence.querySelector('[data-call-journal-note-name]') as HTMLElement).style.color).toBe('#f0a');
    expect(view.find('[data-call-journal-note="call-recording-started"] [data-call-journal-note-text]')?.textContent).toBe('L’enregistrement de l’appel a commencé');
    view.done();
  });

  test('#16665 — une capture seule suffit à remplir le journal', () => {
    const view = mount([], { notes: [{ id: 'n1', kind: 'recording', userId: 'u-karim', name: 'Karim', at: 1_000 }] });
    expect(view.find('[data-call-journal-empty]')).toBeNull();
    expect(view.find('[data-call-journal-note="recording"]')?.textContent).toContain('Karim enregistre l’écran');
    view.done();
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
