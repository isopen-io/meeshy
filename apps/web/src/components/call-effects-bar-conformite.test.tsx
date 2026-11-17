import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ROW_EDGE_FADE } from '@/lib/calls/call-row-keys';
import { setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallEffectsMode } from './call-effects-mode';

/**
 * LA BARRE D'EFFETS, CONFORMITÉ WEB (audit final #17329, issue #18221) — la rangée des genres défile et s'efface en
 * fondu à ses deux bords (P8.5), le panneau Réglages se nomme « Réglages de mon image » au lecteur d'écran sans
 * toucher à la légende « Réglages » de l'engrenage (P8b.1), son interrupteur est celui d'iOS, `IosSwitch` (P8b.9),
 * et « Effets appliqués » s'offre au lecteur d'écran tactile comme une action NOMMÉE de (+), sans appui long (C1.13).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('CallEffectsMode — la barre d’Effets, conformité web', () => {
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
    const press = async (selector: string) => {
      await act(async () => find(selector)?.click());
      await act(async () => {});
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
      videoEffectsStore.setState({ effects: NO_EFFECTS });
    };
    return { find, press, done };
  };

  test('P8.5 — la rangée Visage · Couleur défile à l’horizontale et s’efface en fondu à ses deux bords (recette unique ROW_EDGE_FADE)', () => {
    const view = mount();
    const row = view.find('[data-call-effects-categories]');
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).toContain('[scrollbar-width:none]');
    expect(row?.style.maskImage ?? row?.style.getPropertyValue('mask-image')).toBe(ROW_EDGE_FADE.maskImage);
    view.done();
  });

  test('P8.5 — les puces gardent leur centrage quand elles tiennent et leur ordre ; rien ne se perd au bord de début', () => {
    const view = mount();
    const row = view.find('[data-call-effects-categories]');
    expect(row?.className).not.toContain('justify-center');
    expect(row?.querySelector('.mx-auto')).not.toBeNull();
    expect([...(row?.querySelectorAll('[data-call-effects-category]') ?? [])].map((chip) => chip.textContent)).toEqual(['Visage', 'Couleur']);
    view.done();
  });

  test('P8b.1 — le panneau Réglages se nomme « Réglages de mon image » ; la légende de l’engrenage reste « Réglages »', async () => {
    const view = mount();
    await view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-effects-settings]')?.getAttribute('aria-label')).toBe('Réglages de mon image');
    expect(view.find('[data-call-effects-settings-toggle]')?.textContent).toBe('Réglages');
    view.done();
  });

  test('P8b.9 — le Flou du fond pose IosSwitch (51 × 31, pastille qui glisse de 2 à 22), dans un bouton « switch » de 44 px', async () => {
    const view = mount();
    await view.press('[data-call-effects-settings-toggle]');
    const button = view.find('[data-call-effects-blur]');
    expect(button?.getAttribute('role')).toBe('switch');
    expect(button?.getAttribute('aria-checked')).toBe('false');
    expect(button?.className).toContain('min-h-11');
    const track = button?.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect([track?.style.width, track?.style.height]).toEqual(['51px', '31px']);
    expect(track?.querySelector<HTMLElement>('span')?.style.insetInlineStart).toBe('2px');
    await view.press('[data-call-effects-blur]');
    expect(view.find('[data-call-effects-blur]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-effects-blur] [aria-hidden="true"] span')?.style.insetInlineStart).toBe('22px');
    view.done();
  });

  test('C1.13 — sans effet appliqué, aucune action « Effets appliqués » ; avec une couche, (+) l’offre nommée, sans appui long, et elle ouvre la liste', async () => {
    const empty = mount();
    expect(empty.find('[data-call-effects-applied-action]')).toBeNull();
    empty.done();
    const view = mount({ ...NO_EFFECTS, faceEffect: 'toad' });
    const action = view.find('[data-call-effects-applied-action]');
    expect(action?.tagName).toBe('BUTTON');
    expect(action?.getAttribute('aria-label')).toBe('Effets appliqués');
    expect(action?.className).toContain('sr-only');
    expect(action?.getAttribute('tabindex')).toBe('-1');
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    await view.press('[data-call-effects-applied-action]');
    expect(view.find('[data-call-effect-layers] [data-call-effect-layer="face"]')).not.toBeNull();
    view.done();
  });
});
