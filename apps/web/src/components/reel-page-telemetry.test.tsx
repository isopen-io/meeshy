import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { REEL_STUDIO } from '@/lib/api/fixtures-reels';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ReelPage } from './reel-page';

/**
 * **UN TAP SUR L'AUTEUR D'UN RÉEL DIT DEPUIS QUEL RÉEL ET QUEL ÉCRAN** (#10502)
 * — le même écouteur que la carte du fil, posé sur la page du réel.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const NOW = new Date('2026-09-14T09:00:00.000Z');
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
const keepHere = (event: Event) => event.preventDefault();
let mounted: { readonly root: Root; readonly container: HTMLElement } | null = null;

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
  v2 = [];
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  window.addEventListener('click', keepHere, true);
});
afterEach(() => {
  window.removeEventListener('click', keepHere, true);
  readingTelemetry.recordV2 = original;
  if (mounted !== null) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

async function mountReel(): Promise<HTMLElement> {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(
      <ReelPage
        model={resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW })}
        index={0}
        count={1}
        mode="active"
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
  return container;
}

describe('ReelPage — les taps d’identité', () => {
  test('toucher l’auteur émet profile_tap sur le réel, depuis l’écran des réels', async () => {
    const host = await mountReel();
    const author = host.querySelector<HTMLElement>(`a[href="/u/${REEL_STUDIO.author?.username ?? ''}"]`);
    expect(author).not.toBeNull();
    await act(async () => author?.click());
    expect(v2.filter((event) => event.type === 'interaction')).toHaveLength(1);
    expect(v2.find((event) => event.type === 'interaction')).toMatchObject({
      type: 'interaction',
      action: 'profile_tap',
      target: { kind: 'reel', id: REEL_STUDIO.id },
      surface: 'reels',
    });
  });
});
