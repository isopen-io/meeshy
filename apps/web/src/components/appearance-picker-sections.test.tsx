import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_APPEARANCE } from '@meeshy/shared/types/conversation-appearance';

import { WALLPAPER_PACKS } from '@/lib/appearance/wallpaper-catalog';
import { loadAppearanceCatalog } from '@/lib/i18n-appearance-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { BACKDROP_DARK_END, BACKDROP_DARK_START } from '@/lib/view/thread-backdrop';

import { BackgroundSection } from './appearance-picker-sections';

/**
 * UN FOND ANIMÉ S'ANIME DÈS SA VIGNETTE (#10815) — la vignette d'un modèle qui
 * déclare une couche `lottie` la monte au-dessus de son dessin ; un modèle
 * statique garde sa seule vignette, sans nœud de plus.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadAppearanceCatalog('fr');
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => mounter.unmountAll());
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('les vignettes des fonds du sélecteur', () => {
  test('la vignette d’un modèle animé porte sa couche Lottie ; celle d’un modèle statique non', async () => {
    const animated = WALLPAPER_PACKS.find((pack) => pack.designs.some((design) => design.lottie !== undefined));
    expect(animated).toBeDefined();
    const host = await mounter.mount(
      <BackgroundSection appearance={DEFAULT_APPEARANCE} language="fr" rtl={false} scheme="dark" accent="#6366F1" packs={[animated!]} names={null} onChoose={() => undefined} />,
    );
    const layers = host.querySelectorAll('[data-lottie-layer]');
    const animatedCount = animated!.designs.filter((design) => design.lottie !== undefined).length;
    expect(layers).toHaveLength(animatedCount);
    expect(host.querySelectorAll('[data-appearance-thumb]')).toHaveLength(animated!.designs.length);
  });
});

/**
 * LA VIGNETTE « SIGNATURE » EST UN APERÇU DU FOND RÉEL, PAS UNE JUMELLE (75w).
 * Elle se peignait d'un dégradé recopié en ligne (`#0F0C29`/`#24243E`, teinte
 * d'accent à 30 %, deux arrêts, texte `#fff`, aucune variante claire) — une
 * divergence du vrai fond Signature (`.thread-backdrop` : mêmes cotes, 12 %,
 * trois arrêts, scheme-aware). Elle DÉRIVE désormais des mêmes variables
 * canoniques (`lib/view/thread-backdrop.ts`), sans aucune couleur en dur.
 */
describe('la vignette « Signature » du sélecteur', () => {
  test('est alimentée par les variables canoniques du fond, sans dégradé en dur', async () => {
    const host = await mounter.mount(
      <BackgroundSection appearance={DEFAULT_APPEARANCE} language="fr" rtl={false} scheme="dark" accent="#6366F1" packs={[]} names={null} onChoose={() => undefined} />,
    );
    const thumb = host.querySelector('[data-appearance-signature-thumb]') as HTMLElement | null;
    expect(thumb).not.toBeNull();
    expect(thumb!.style.getPropertyValue('--backdrop-dark-start')).toBe(`#${BACKDROP_DARK_START}`);
    expect(thumb!.style.getPropertyValue('--backdrop-dark-end')).toBe(`#${BACKDROP_DARK_END}`);
    expect(thumb!.style.getPropertyValue('--accent')).toBe('#6366F1');
    expect(thumb!.style.background).toBe('');
    expect(thumb!.className).toContain('appearance-signature-thumb');
  });
});
