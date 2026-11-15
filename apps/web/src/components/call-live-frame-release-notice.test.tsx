import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { callLiveFrameStore, NO_LIVE_FRAME } from '@/lib/calls/call-live-frame-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallControlFeedback } from './call-control-overlays';

/**
 * #18367 — quand l'autre relâche le cadre que nous partageons, le lecteur d'écran le dit, poliment :
 * « Awa a retiré le cadre » (« Votre correspondant… » sans prénom partagé), dans les sept langues, comme
 * VoiceOver sur iOS (#18415). Rien ne se voit : la région est muette à l'œil, comme l'annonce d'iOS.
 * Elle est posée AVANT le retrait — une région qui naît avec son texte n'est pas lue par tous les
 * lecteurs d'écran.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const LANGUAGES: readonly InterfaceLanguage[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];

beforeAll(async () => {
  await Promise.all(LANGUAGES.map((language) => loadCallControlsCatalog(language)));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  callLiveFrameStore.setState(NO_LIVE_FRAME, true);
});

const mount = (language: InterfaceLanguage = 'fr', live = true) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallControlFeedback language={language} nameOf={() => null} live={live} />));
  const region = () => host.querySelector<HTMLElement>('[data-call-live-frame-released]');
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, region, done };
};

describe('le retrait du cadre partagé se dit au lecteur d’écran (#18367)', () => {
  test('la région polie est là avant le retrait, vide et invisible', () => {
    const view = mount();
    const region = view.region();
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.className.split(' ')).toContain('sr-only');
    expect(region?.textContent).toBe('');
    view.done();
  });

  test('Awa relâche : « Awa a retiré le cadre », dans la même région', () => {
    const view = mount();
    const region = view.region();
    act(() => callLiveFrameStore.setState({ peerReleased: { from: 'Awa' } }));
    expect(view.region()).toBe(region);
    expect(region?.textContent).toBe('Awa a retiré le cadre');
    view.done();
  });

  test('sans prénom partagé : « Votre correspondant a retiré le cadre »', () => {
    const view = mount();
    act(() => callLiveFrameStore.setState({ peerReleased: { from: null } }));
    expect(view.region()?.textContent).toBe('Votre correspondant a retiré le cadre');
    view.done();
  });

  test('l’annonce effacée, la région se tait', () => {
    const view = mount();
    act(() => callLiveFrameStore.setState({ peerReleased: { from: 'Awa' } }));
    act(() => callLiveFrameStore.setState({ peerReleased: null }));
    expect(view.region()?.textContent).toBe('');
    view.done();
  });

  test('dans les sept langues, avec et sans prénom (mêmes textes qu’iOS)', () => {
    const expected: Readonly<Record<InterfaceLanguage, readonly [string, string]>> = {
      fr: ['Awa a retiré le cadre', 'Votre correspondant a retiré le cadre'],
      en: ['Awa removed the frame', 'The other person removed the frame'],
      es: ['Awa quitó el marco', 'La otra persona quitó el marco'],
      pt: ['Awa removeu a moldura', 'A outra pessoa removeu a moldura'],
      de: ['Awa hat den Rahmen entfernt', 'Dein Gegenüber hat den Rahmen entfernt'],
      it: ['Awa ha tolto la cornice', "L'altra persona ha tolto la cornice"],
      ar: ['أزال Awa الإطار', 'أزال الطرف الآخر الإطار'],
    };
    for (const language of LANGUAGES) {
      const view = mount(language);
      act(() => callLiveFrameStore.setState({ peerReleased: { from: 'Awa' } }));
      expect(view.region()?.textContent).toBe(expected[language][0]);
      act(() => callLiveFrameStore.setState({ peerReleased: { from: null } }));
      expect(view.region()?.textContent).toBe(expected[language][1]);
      act(() => callLiveFrameStore.setState({ peerReleased: null }));
      view.done();
    }
  });

  test('hors d’un appel vivant, aucune région', () => {
    const view = mount('fr', false);
    expect(view.region()).toBeNull();
    view.done();
  });
});
