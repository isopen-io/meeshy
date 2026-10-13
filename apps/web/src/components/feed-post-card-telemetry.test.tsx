import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';

/**
 * **UN TAP DANS UNE CARTE DIT DEPUIS QUEL CONTENU, QUEL ÉCRAN ET APRÈS
 * COMBIEN DE LECTURE** (#10502) — l'auteur, un hashtag, une mention, « voir
 * plus », la bascule du Prisme. La cible est la PUBLICATION, jamais le nom du
 * hashtag ni le handle : aucun texte saisi ne voyage.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const POST = '6512bd43d9caa6e02c990b0b';
const LONG_ES = 'Hola @lina mira #viaje uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho veinte';
const LONG_EN = 'Hello @lina look #viaje one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen twenty';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
const keepHere = (event: Event) => event.preventDefault();

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
beforeEach(() => {
  v2 = [];
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  window.addEventListener('click', keepHere, true);
});
afterEach(async () => {
  window.removeEventListener('click', keepHere, true);
  readingTelemetry.recordV2 = original;
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const mount = async (): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const model = resolveFeedCardModel(
    {
      id: POST,
      type: 'POST',
      createdAt: '2026-09-18T11:55:00.000Z',
      author: { id: 'u-nour', displayName: 'Nour', username: 'nour' },
      content: LONG_ES,
      originalLanguage: 'es',
      translations: { en: { text: LONG_EN } },
    } as FeedPost,
    { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-18T12:00:00.000Z') },
  );
  await act(async () => root?.render(<FeedPostCard model={model} impressionSurface="feed" listing={{ position: 3, rankingSource: 'following' }} />));
  return container;
};

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => (node as HTMLElement).click());
};

const located = (action: string) => ({
  type: 'interaction',
  action,
  target: { kind: 'post', id: POST },
  surface: 'feed',
  listing: { position: 3 },
});

describe('FeedPostCard — les taps dans la carte', () => {
  test('le nom de l’auteur émet profile_tap, situé, avec la lecture écoulée', async () => {
    const host = await mount();
    await click(host.querySelector('a[aria-label][href="/u/nour"]:not(.avatar-profile-link)'));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject(located('profile_tap'));
    expect(typeof (v2[0] as { dwellBeforeMs?: number }).dwellBeforeMs).toBe('number');
  });

  test('l’avatar émet profile_tap', async () => {
    const host = await mount();
    await click(host.querySelector('a.avatar-profile-link'));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject(located('profile_tap'));
  });

  test('un hashtag du texte émet hashtag_tap — sans le nom du hashtag', async () => {
    const host = await mount();
    await click(host.querySelector('[data-feed-text] a[href^="/hashtag/"]'));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject(located('hashtag_tap'));
    expect(JSON.stringify(v2)).not.toContain('viaje');
  });

  test('une mention du texte émet mention_tap — sans le handle', async () => {
    const host = await mount();
    await click(host.querySelector('[data-feed-text] a[href="/u/lina"]'));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject(located('mention_tap'));
    expect(JSON.stringify(v2)).not.toContain('lina');
  });

  test('« voir plus » émet caption_expand ; « voir moins » ne dit rien', async () => {
    const host = await mount();
    const toggle = () => [...host.querySelectorAll('button')].find((b) => /voir (plus|moins)/i.test(b.textContent ?? ''));
    await click(toggle());
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject(located('caption_expand'));
    await click(toggle());
    expect(v2).toHaveLength(1);
  });

  test('la pastille du Prisme : vers l’original ⇒ original_view, retour ⇒ translation_toggle', async () => {
    const host = await mount();
    await click(host.querySelector('[data-prism-toggle]'));
    await click(host.querySelector('[data-prism-toggle]'));
    expect(v2.map((event) => event.action)).toEqual(['original_view', 'translation_toggle']);
    expect(v2[0]).toMatchObject({ ...located('original_view'), prism: { translated: true } });
  });

  test('un clic hors de tout lien d’identité ne dit rien', async () => {
    const host = await mount();
    await click(host.querySelector('[data-feed-post-open="heure"]'));
    expect(v2).toEqual([]);
  });
});
