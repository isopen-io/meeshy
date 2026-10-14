import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { act } from 'react';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { screenWaitArtSource } from '@/lib/mee/screen-wait-art-source';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ScreenWait } from './screen-wait';
import { SCREEN_WAIT_ART } from './screen-wait-art';

/**
 * L'ATTENTE D'UN ÉCRAN DÉCOUPÉ (#10635) — Mee et Meo qui dansent, nommés dans
 * la langue de l'interface, et rien avant un court délai.
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

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('ScreenWait', () => {
  test("le dessin est celui du sticker « On danse » du catalogue, rendu par le moteur Mee — rouge ⇒ bun run scripts/generate-screen-wait-art.ts", () => {
    expect(SCREEN_WAIT_ART).toBe(screenWaitArtSource());
    expect(SCREEN_WAIT_ART).toContain('mee-s-screen-wait');
    expect(SCREEN_WAIT_ART).toContain('@media (prefers-reduced-motion:no-preference)');
  });

  test('le dessin est décoratif : le libellé vit sur le conteneur, jamais en français codé dans le SVG', () => {
    expect(SCREEN_WAIT_ART).toContain('aria-hidden="true"');
    expect(SCREEN_WAIT_ART).not.toContain('aria-label');
    expect(SCREEN_WAIT_ART).not.toContain('role="img"');
  });

  test("le module d'attente ne charge ni le catalogue de stickers ni le moteur de rendu, et son dessin hors de la première peinture", () => {
    const source = readFileSync(fileURLToPath(new URL('./screen-wait.tsx', import.meta.url)), 'utf8');
    const art = readFileSync(fileURLToPath(new URL('./screen-wait-art.ts', import.meta.url)), 'utf8');
    for (const text of [source, art]) expect(text).not.toMatch(/from '@\/lib\/mee\//);
    expect(source).not.toMatch(/from '\.\/screen-wait-art'/);
  });

  test("le conteneur annonce l'attente dans la langue de l'interface, et le dessin n'apparaît qu'après le délai", async () => {
    const container = await mounter.mount(<ScreenWait />);
    const status = container.querySelector('[aria-busy="true"]');
    expect(status?.getAttribute('aria-label')).toBe(translate('fr', 'pending.screen'));
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent ?? '').not.toContain('L’écran arrive');

    await act(async () => pause(220));
    expect(container.querySelector('svg.mee-s-screen-wait')).not.toBeNull();
  });

  test('chaque langue nomme l’attente', async () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      await loadInterfaceCatalog(language);
      expect(translate(language, 'pending.screen').trim()).not.toBe('');
    }
    expect(translate('en', 'pending.screen')).not.toBe(translate('fr', 'pending.screen'));
  });
});
