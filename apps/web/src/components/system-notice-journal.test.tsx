import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { callJournalMemory } from '@/lib/calls/call-journal-memory';
import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SystemRow } from '@/lib/view/message-badges';

import { SystemNotice } from './system-notice';

/**
 * LE JOURNAL SOUS LA BULLE D'APPEL (#17878, A1.2, A1.4, A1.17) — la bulle est une CARTE qui range sa bascule
 * et son journal dans elle ; le journal entre et sort en fondu glissé (Web Animations, transformation et
 * opacité seules ; 150 ms et sans déplacement sous « Réduire les animations ») ; il reste déplié quand le fil
 * virtualisé démonte la rangée, et ne rejoue rien à son retour.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const row: SystemRow = { kind: 'call', callType: 'video', text: 'Appel vidéo · 12:40' };

const target: CallNoticeTarget = { conversationId: 'c-journal', callId: 'call-journal-1', media: 'video', live: false, transcript: true, recording: null };

const runs: { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number; readonly fill: string | undefined }[] = [];
const saved: { animate?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  runs.length = 0;
  callJournalMemory.reset();
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      runs.push({ target: this, frames, duration: Number(options.duration), fill: options.fill });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined };
    },
  });
});
afterEach(() => {
  const restore = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => (descriptor === undefined ? Reflect.deleteProperty(target, key) : Object.defineProperty(target, key, descriptor));
  restore(HTMLElement.prototype, 'animate', saved.animate);
  restore(window, 'matchMedia', saved.media);
  document.body.innerHTML = '';
});

const settle = (ms = 60) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

/** Le journal et son fondu arrivent avec leur chunk et le catalogue des contrôles d'appel, chargés au toucher. */
const unfolded = async (find: (selector: string) => HTMLElement | null) => {
  for (let attempt = 0; attempt < 100 && find('[data-call-journal-fold]') === null; attempt += 1) await settle(20);
  await settle();
};

const mount = (reducedMotion = false) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const roots: Root[] = [];
  const render = () => {
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<SystemNotice row={row} timeString="12:40" surface="bubble" callTarget={target} />));
  };
  render();
  return {
    host,
    find: (selector: string) => host.querySelector(selector) as HTMLElement | null,
    toggle: () => act(() => (host.querySelector('[data-call-transcript-toggle]') as HTMLElement).click()),
    leave: () => act(() => roots.pop()?.unmount()),
    render,
  };
};

describe('la bulle d’appel est une carte (A1.2)', () => {
  test('le glyphe est dans un disque, la bascule vit DANS la carte, « Rappeler » reste à côté, sans ligne de participants', () => {
    const view = mount();
    const card = view.find('[data-call-card]');
    expect(card).not.toBeNull();
    expect(card?.querySelector('[data-call-card-disc]')).not.toBeNull();
    expect(card?.textContent).toContain('Appel vidéo · 12:40');
    expect(card?.querySelector('[data-call-transcript-toggle]')?.textContent).toBe('Afficher la transcription');
    expect(card?.querySelector('[data-call-notice-action]')).toBeNull();
    expect(view.find('[data-call-notice-action="call-back"]')).not.toBeNull();
    expect(card?.querySelector('[data-call-participants]')).toBeNull();
  });
});

describe('le journal s’ouvre et se ferme en fondu glissé (A1.4)', () => {
  test('il arrive en fondu et en glissement, transformation et opacité seules', async () => {
    const view = mount();
    view.toggle();
    await unfolded(view.find);
    expect(view.find('[data-call-journal-fold]')).not.toBeNull();
    const arrival = runs.find((run) => run.target === view.find('[data-call-journal-fold]'));
    expect(arrival?.duration).toBe(200);
    expect(arrival?.frames[0]).toMatchObject({ opacity: 0 });
    expect(Object.keys(arrival?.frames[0] ?? {}).sort()).toEqual(['opacity', 'transform']);
    expect(arrival?.frames[1]).toMatchObject({ opacity: 1 });
  });

  test('sous « Réduire les animations », un fondu court de 150 ms, sans déplacement', async () => {
    const view = mount(true);
    view.toggle();
    await unfolded(view.find);
    const arrival = runs.find((run) => run.target === view.find('[data-call-journal-fold]'));
    expect(arrival?.duration).toBe(150);
    expect(Object.keys(arrival?.frames[0] ?? {})).toEqual(['opacity']);
  });

  test('il repart par le même chemin, resté monté le temps de son départ', async () => {
    const view = mount();
    view.toggle();
    await unfolded(view.find);
    runs.length = 0;
    view.toggle();
    const fold = view.find('[data-call-journal-fold]');
    expect(fold).not.toBeNull();
    expect(runs[0]?.frames[0]).toMatchObject({ opacity: 1 });
    expect(runs[0]?.frames[1]).toMatchObject({ opacity: 0 });
    expect(runs[0]?.fill).toBe('forwards');
    await settle(260);
    expect(view.find('[data-call-journal-fold]')).toBeNull();
    expect(view.find('[data-call-transcript-toggle]')?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('le journal reste déplié au défilement du fil virtualisé (A1.17)', () => {
  test('la rangée démontée puis remontée retrouve son journal déplié, sans rejouer l’arrivée', async () => {
    const view = mount();
    view.toggle();
    await unfolded(view.find);
    view.leave();
    runs.length = 0;
    view.render();
    expect(view.find('[data-call-transcript-toggle]')?.getAttribute('aria-expanded')).toBe('true');
    await settle();
    expect(view.find('[data-call-journal-fold]')).not.toBeNull();
    expect(runs).toHaveLength(0);
  });

  test('un journal replié reste replié', async () => {
    const view = mount();
    view.toggle();
    await unfolded(view.find);
    view.toggle();
    await settle(260);
    view.leave();
    view.render();
    expect(view.find('[data-call-transcript-toggle]')?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('la carte reste légère, le journal et son fondu se chargent à la demande (A1.4, première peinture)', () => {
  const card = readFileSync(new URL('./call-notice-card.tsx', import.meta.url), 'utf8');
  const staticSources = [...card.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1]);

  test('la carte n’importe statiquement ni le fondu ni le journal : la table de préchargement du fil n’y gagne aucun chunk', () => {
    expect(staticSources.filter((source) => /use-journal-fold|use-rail-presence|call-pill-motion|call-transcript-panel|call-journal-fold/.test(source ?? ''))).toEqual([]);
  });

  test('le fondu du journal a son chunk, atteint par import() seulement, et le journal garde le sien (budget call_transcript_panel)', () => {
    const fold = readFileSync(new URL('./call-journal-fold.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/import\('\.\/call-journal-fold'\)/);
    expect(card).toMatch(/import\('\.\/call-transcript-panel'\)/);
    expect(fold).toMatch(/from '@\/lib\/calls\/use-journal-fold'/);
    expect(fold).toMatch(/import\('\.\/call-transcript-panel'\)/);
    expect(fold).not.toMatch(/^import[^;]*from '\.\/call-transcript-panel'/m);
  });

  test('l’heure du journal (00:04) vit avec le journal, jamais dans le magasin d’appel que charge la première peinture', () => {
    expect(readFileSync(new URL('../lib/calls/call-store.ts', import.meta.url), 'utf8')).not.toContain('formatCallJournalClock');
    expect(readFileSync(new URL('../lib/calls/call-journal-clock.ts', import.meta.url), 'utf8')).toContain('export function formatCallJournalClock');
  });

  test('« Original · … » ne tire pas les moteurs de la pilule dans le journal : l’écran d’appel ne s’en découpe pas un chunk de plus', () => {
    const exit = readFileSync(new URL('../lib/calls/call-pill-text-exit.ts', import.meta.url), 'utf8');
    expect(exit).not.toMatch(/from '\.\/use-pill-motion'/);
    expect(exit).toMatch(/export \{ LEAVING as PILL_TEXT_LEAVING \} from '\.\/call-pill-motion'/);
  });
});
