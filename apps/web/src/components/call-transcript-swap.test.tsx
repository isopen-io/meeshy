import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { PILL_TEXT_EXIT } from '@/lib/calls/call-pill-text-exit';
import type { TranscriptLine } from '@/lib/calls/call-transcript';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallTranscriptLines } from './call-transcript-panel';

/**
 * LE CHANGEMENT D'ÉTAT SE FAIT EN FONDU (#17897, loi 17 : rien n'apparaît ni ne disparaît
 * d'un coup) — la bascule « Voir l'original » refond les deux lignes de chaque phrase
 * traduite, le temps d'`PILL_TEXT_EXIT`, par l'OPACITÉ seule : aucun déplacement, donc
 * rien à retirer sous « Réduire les animations ». La première peinture ne fond pas.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const line = (id: string, overrides: Partial<TranscriptLine> = {}): TranscriptLine => ({
  id,
  speakerId: 'u-awa',
  speakerName: 'Awa',
  mine: false,
  offsetMs: 4_000,
  original: 'Can you hear me?',
  originalLanguage: 'en',
  text: 'Tu m’entends ?',
  language: 'fr',
  translated: true,
  ...overrides,
});

type Fade = { readonly target: string; readonly keyframes: readonly Record<string, unknown>[]; readonly duration: unknown };

describe('la bascule fond les deux lignes, par l’opacité seule', () => {
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

  const mount = (lines: readonly TranscriptLine[]) => {
    const fades: Fade[] = [];
    const proto = Element.prototype as unknown as { animate?: (keyframes: Record<string, unknown>[], options: { duration?: unknown }) => unknown };
    const previous = proto.animate;
    proto.animate = function (this: Element, keyframes, options) {
      fades.push({ target: this.getAttribute('data-call-transcript-swap') ?? this.tagName, keyframes, duration: options.duration });
      return { cancel: () => undefined };
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (original: boolean) => act(() => root.render(<CallTranscriptLines lines={lines} language="fr" original={original} onToggleOriginal={() => undefined} />));
    const done = () => {
      act(() => root.unmount());
      host.remove();
      proto.animate = previous as typeof proto.animate;
    };
    return { host, fades, render, done };
  };

  test('la première peinture ne fond pas', () => {
    const view = mount([line('s-1')]);
    view.render(false);
    expect(view.fades).toHaveLength(0);
    view.done();
  });

  test('basculer fond les DEUX lignes de la phrase traduite, durée de PILL_TEXT_EXIT, opacité seule', () => {
    const view = mount([line('s-1')]);
    view.render(false);
    view.render(true);
    expect(view.fades.map((fade) => fade.target).sort()).toEqual(['primary', 'secondary']);
    for (const fade of view.fades) {
      expect(fade.duration).toBe(PILL_TEXT_EXIT.exitMs);
      expect(fade.keyframes.every((frame) => Object.keys(frame).every((key) => key === 'opacity' || key === 'offset' || key === 'easing'))).toBe(true);
    }
    view.done();
  });

  test('une phrase sans traduction reste seule : elle ne fond pas', () => {
    const view = mount([line('s-2', { translated: false, text: 'Hello', original: 'Hello', language: 'en' })]);
    view.render(false);
    view.render(true);
    expect(view.fades).toHaveLength(0);
    view.done();
  });

  test('le texte change à la bascule, l’ordre des deux lignes s’inverse', () => {
    const view = mount([line('s-1')]);
    view.render(false);
    const texts = () => [...view.host.querySelectorAll('[data-call-transcript-swap]')].map((node) => node.textContent);
    expect(texts()).toEqual(['Tu m’entends ?', 'Original · Can you hear me?']);
    view.render(true);
    expect(texts()).toEqual(['Can you hear me?', 'Traduit · Tu m’entends ?']);
    view.render(false);
    expect(texts()).toEqual(['Tu m’entends ?', 'Original · Can you hear me?']);
    view.done();
  });

  test('le pied porte aria-pressed, qui suit l’état', () => {
    const view = mount([line('s-1')]);
    view.render(false);
    const foot = () => view.host.querySelector('[data-call-transcript-original]');
    expect(foot()?.getAttribute('aria-pressed')).toBe('false');
    view.render(true);
    expect(foot()?.getAttribute('aria-pressed')).toBe('true');
    expect(foot()?.textContent).toBe('Voir la traduction');
    view.done();
  });
});
