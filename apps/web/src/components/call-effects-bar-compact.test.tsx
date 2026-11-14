import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallEffectsMode } from './call-effects-mode';

/**
 * LA BARRE GARDE SA HAUTEUR À HAUTEUR COMPACTE (#17927 ; Android #18474) — la mise en page réelle se mesure dans
 * Chromium (`check-calls-effects.mjs`, § 7 ter : 568 × 320, 640 × 260, 568 × 200). Ici, la STRUCTURE qui la rend
 * possible, que happy-dom sait lire : chaque boîte entre l'écran et la barre peut rétrécir, ce qui est posé sur la
 * barre défile à hauteur compacte, la barre ne rétrécit jamais, et la liste des effets appliqués se borne à la place
 * qui lui reste.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('CallEffectsMode — la barre garde sa hauteur à hauteur compacte', () => {
  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    await loadCallControlsCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (effects: VideoEffects = NO_EFFECTS) => {
    setEffectLayers([]);
    videoEffectsStore.setState({ effects });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsMode
          language="fr"
          colorAvailable
          blurAvailable
          preview={<video data-testid="self-preview" />}
          selfVideo={() => host.querySelector<HTMLVideoElement>('[data-testid="self-preview"]')}
          onExit={() => undefined}
          audio={() => []}
          apply={(patch) => videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }))}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const done = () => {
      act(() => root.unmount());
      host.remove();
      videoEffectsStore.setState({ effects: NO_EFFECTS });
    };
    return { find, done };
  };

  test('chaque boîte entre l’écran et la barre peut rétrécir (min-h-0), jusqu’au dessus qui défile', () => {
    const view = mount();
    expect(view.find('[data-call-mode="effects"]')?.className).toContain('min-h-0');
    expect(view.find('[data-call-mode="effects"] > .relative')?.className).toContain('min-h-0');
    expect(view.find('[data-call-mode-rider]')?.className).toContain('min-h-0');
    view.done();
  });

  test('ce qui est posé sur la barre défile sous 480 px de haut, sans barre de défilement ; la barre ne rétrécit pas', () => {
    const view = mount();
    const rider = view.find('[data-call-mode-rider]')?.className ?? '';
    expect(rider).toContain('[@media(max-height:480px)]:overflow-y-auto');
    expect(rider).toContain('[@media(max-height:480px)]:[scrollbar-width:none]');
    expect(rider).toContain('overscroll-y-contain');
    expect(view.find('[data-call-mode-bar]')?.parentElement?.className).toContain('shrink-0');
    view.done();
  });

  test('la liste des effets appliqués se borne à la place sous le haut de la fenêtre (88 px au moins) et défile au-delà', async () => {
    const view = mount({ ...NO_EFFECTS, faceEffect: 'toad' });
    await act(async () => view.find('[data-call-effects-applied-action]')?.click());
    await act(async () => {});
    const list = view.find('[data-call-effect-layers]');
    expect(list?.className).toContain('overflow-y-auto');
    expect(list?.style.maxHeight).toBe('88px');
    view.done();
  });
});
