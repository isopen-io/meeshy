import { beforeAll, describe, expect, test } from 'bun:test';

import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';

import { listeningBandOf } from './listening-band';

/**
 * LE BANDEAU DE L'ÉCOUTE (#16729) — le détail dépend du CERCLE, c'est-à-dire de ce
 * que le serveur a servi : un Proche voit la nature de l'activité, un Sang son
 * titre et son origine. Le bandeau ne fabrique rien que la charge ne porte.
 */

const entry = (overrides: Readonly<Record<string, unknown>> = {}) => ({ category: 'music' as const, updatedAt: '2026-11-07T10:00:00.000Z', deadline: 1, ...overrides });

beforeAll(async () => {
  await loadCirclesCatalog('fr');
  await loadCirclesCatalog('en');
});

describe('le texte du bandeau', () => {
  test('un Proche : la catégorie seule', () => {
    expect(listeningBandOf(entry(), 'fr')).toEqual({ glyph: '🎵', text: 'Écoute de la musique', spoken: 'En ce moment : Écoute de la musique' });
  });

  test('une vidéo et la navigation ont leur libellé et leur glyphe', () => {
    expect(listeningBandOf(entry({ category: 'video' }), 'en')).toMatchObject({ glyph: '🎬', text: 'Watching a video' });
    expect(listeningBandOf(entry({ category: 'browsing' }), 'en')).toMatchObject({ glyph: '🧭', text: 'Browsing' });
  });

  test('un Sang : le titre et l’origine, que la catégorie ne remplace pas', () => {
    expect(listeningBandOf(entry({ title: 'Clair de lune', source: 'Spotify' }), 'fr')).toEqual({ glyph: '🎵', text: 'Clair de lune · Spotify', spoken: 'En ce moment : Clair de lune · Spotify' });
  });

  test('un titre sans origine se montre seul', () => {
    expect(listeningBandOf(entry({ title: 'Clair de lune' }), 'fr')?.text).toBe('Clair de lune');
  });

  test('aucune écoute : aucun bandeau', () => {
    expect(listeningBandOf(null, 'fr')).toBeNull();
  });
});
