import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StoryRailProps } from '@/components/story-rail';

import { FeedEmpty, FeedError, FeedHeader } from './feed';

/**
 * LES ÉTATS DU FIL DANS LA LANGUE D'INTERFACE (#6488) — `FeedError`,
 * `FeedEmpty` et l'en-tête (retour, « Lancer les Réels ») étaient écrits en
 * dur en français. Miroir `feed-post-card-i18n.test.tsx`.
 */

const RAIL_VIDE = { groups: [], loading: false, language: 'fr' } as const satisfies StoryRailProps;

describe('les états du fil suivent la langue d’interface', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('en');
  });

  afterAll(async () => {
    document.documentElement.lang = 'fr';
    await releaseHappyDomIfRegistered();
  });

  test('en : erreur EN LIGNE, dans les deux moitiés — titre ET corps', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<FeedError online onRetry={() => undefined} />);
    expect(html).toContain('Couldn’t load the feed');
    expect(html).toContain('Try again in a moment.');
    expect(html).toContain('>Try again<');
    expect(html).not.toContain('Impossible de charger le fil');
  });

  test('en : erreur HORS LIGNE, un texte DIFFÉRENT', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<FeedError online={false} onRetry={() => undefined} />);
    expect(html).toContain('Offline');
    expect(html).toContain('The feed will show up once you’re back online.');
    expect(html).not.toContain('Hors ligne');
  });

  test('en : le fil vide le dit en anglais', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<FeedEmpty />);
    expect(html).toContain('No posts yet');
    expect(html).toContain('Posts from your contacts will show up here.');
    expect(html).not.toContain('Aucune publication');
  });

  test('en : l’en-tête annonce le retour et les Réels en anglais — la MARQUE « Meeshy Feed » reste inchangée', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_VIDE} />);
    expect(html).toContain('aria-label="Back to conversations"');
    expect(html).toContain('aria-label="Play Reels"');
    expect(html).toContain('Meeshy Feed');
    expect(html).not.toContain('Revenir aux conversations');
    expect(html).not.toContain('Lancer les Réels');
  });

  test('fr : les mêmes surfaces restent en français une fois la langue reposée', () => {
    document.documentElement.lang = 'fr';
    const html = renderToStaticMarkup(<FeedEmpty />);
    expect(html).toContain('Aucune publication');
    expect(html).not.toContain('No posts yet');
  });
});
