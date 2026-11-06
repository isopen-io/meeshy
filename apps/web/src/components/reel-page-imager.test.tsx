import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { REEL_SCENE_LOOP, REEL_STUDIO } from '@/lib/api/fixtures-reels';
import { resolveFeedCardModel, type FeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { ReelPage, type ReelPageProps } from './reel-page';

/**
 * #16333 — SUR LE RAIL DU RÉEL, LA BAGUETTE IMAGE LE RÉEL : le même « Imager »
 * que le menu « … », offert là où le menu l'offre (un réel à SCÈNE), et rien
 * d'autre (loi 4).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NOW = new Date('2026-09-14T09:00:00.000Z');
const SCENE_MODEL = resolveFeedCardModel(REEL_SCENE_LOOP, { preferredLanguages: ['fr'], now: NOW });
const VIDEO_MODEL = resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW });

const mounted: { readonly root: Root; readonly container: HTMLElement }[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
});

async function mount(model: FeedCardModel, onImager?: ReelPageProps['onImager']): Promise<HTMLElement> {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <ReelPage
        model={model}
        index={0}
        count={1}
        mode="warm"
        soundOn={false}
        language="fr"
        preferredLanguages={['fr']}
        onToggleSound={() => undefined}
        onGesture={() => undefined}
        onShare={() => undefined}
        onSoundBlocked={() => undefined}
        {...(onImager === undefined ? {} : { onImager })}
      />,
    );
  });
  return container;
}

const traceOf = (body: string): string | undefined => /d="([^"]+)"/.exec(body)?.[1];
const wandOf = (container: HTMLElement): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('[data-reel-gesture="imager"]');

describe('ReelPage — la baguette du rail image le réel (#16333)', () => {
  test('un réel à scène porte la baguette « Imager », après Partager ; le toucher image CE réel', async () => {
    const imaged: string[] = [];
    const container = await mount(SCENE_MODEL, (model) => imaged.push(model.id));
    const wand = wandOf(container);
    expect(wand?.getAttribute('aria-label')).toBe('Imager');
    expect(wand?.querySelector('svg path')?.getAttribute('d')).toBe(traceOf(THREAD_MENU_GLYPHS.magicWand.body));
    const gestures = Array.from(container.querySelectorAll('[data-reel-gesture]')).map((el) => el.getAttribute('data-reel-gesture'));
    expect(gestures.indexOf('imager')).toBe(gestures.indexOf('share') + 1);
    act(() => wand?.click());
    expect(imaged).toEqual([SCENE_MODEL.id]);
  });

  test('un réel SIMPLE (sa vidéo, sans scène) porte aussi la baguette, qui l’image (#16166)', async () => {
    const imaged: string[] = [];
    const container = await mount(VIDEO_MODEL, (model) => imaged.push(model.id));
    act(() => wandOf(container)?.click());
    expect(imaged).toEqual([VIDEO_MODEL.id]);
  });

  test('un réel protégé n’a rien à imager : aucune baguette', async () => {
    const container = await mount({ ...VIDEO_MODEL, protection: { isViewOnce: true } }, () => undefined);
    expect(wandOf(container)).toBeNull();
  });

  test('un écran qui ne sait pas imager ne pose aucune baguette', async () => {
    const container = await mount(SCENE_MODEL);
    expect(wandOf(container)).toBeNull();
  });
});
