import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { REEL_STUDIO } from '@/lib/api/fixtures-reels';
import type { ReelPageMode } from '@/lib/reels/thread';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ReelPage } from './reel-page';

/**
 * LE RÉEL QUI ARRIVE SOUS LE DOIGT NE PORTE AUCUN BOUTON « LIRE » — un voisin
 * mis en pause par le lecteur (il sort du champ, ou l'écran le prépare) n'a
 * pas été arrêté par l'utilisateur. Le disque ▶ n'appartient qu'au réel
 * VISIBLE en pause : sur un voisin, il glissait dans le champ à chaque
 * balayage avant de disparaître au démarrage.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NOW = new Date('2026-09-14T09:00:00.000Z');

/* Chaque racine est DÉMONTÉE après son témoin : un lecteur laissé monté garde
   ses abonnements et se re-rend pendant les fichiers suivants de la suite. */
const mounted: { readonly root: Root; readonly container: HTMLElement }[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
});

async function mountPausedReel(mode: ReelPageMode): Promise<HTMLElement> {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <ReelPage
        model={resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW })}
        index={1}
        count={3}
        mode={mode}
        soundOn={false}
        language="fr"
        preferredLanguages={['fr']}
        onToggleSound={() => undefined}
        onGesture={() => undefined}
        onShare={() => undefined}
        onSoundBlocked={() => undefined}
      />,
    );
  });
  const video = container.querySelector('video')!;
  await act(async () => {
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('pause'));
  });
  return container;
}

const playDiscOf = (container: HTMLElement): Element | null => container.querySelector('[data-reel-surface] span');

describe('ReelPage — le disque « Lire » n’appartient qu’au réel visible', () => {
  test('un voisin en pause (N±1) ne montre aucun disque', async () => {
    const container = await mountPausedReel('near');
    expect(playDiscOf(container)).toBeNull();
  });

  test('le réel visible en pause montre le disque', async () => {
    const container = await mountPausedReel('active');
    expect(playDiscOf(container)).not.toBeNull();
  });
});
