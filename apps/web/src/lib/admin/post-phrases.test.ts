import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminPostRow } from '@/lib/api/admin-posts';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { audiencePhrase, mediaKindOf, postExcerptOf, translationsPhrase } from './post-phrases';

beforeAll(async () => {
  await Promise.all((['fr', 'en'] as const).map((language) => loadAdminInterfaceCatalog(language)));
});

/**
 * LES PHRASES D'UNE PUBLICATION (#8876) — ce que la LISTE et la FICHE disent en
 * mots : l'extrait d'une ligne, la taille d'une audience choisie, le nombre de
 * langues traduites. Le pluriel vient de `Intl.PluralRules` : « 1 personne »,
 * jamais « 1 personnes ».
 */
const row = (overrides: Partial<AdminPostRow> = {}): AdminPostRow => ({
  id: '64f1c2a9e8b7d6c5b4a39282',
  type: 'POST',
  visibility: 'PUBLIC',
  restricted: false,
  excerpt: null,
  mediaCount: 0,
  moodEmoji: null,
  isPinned: false,
  deletedAt: null,
  expiresAt: null,
  likeCount: 0,
  commentCount: 0,
  viewCount: 0,
  createdAt: '2026-09-29T10:00:00.000Z',
  author: null,
  ...overrides,
});

describe('postExcerptOf — ce que la colonne « Extrait » dit', () => {
  test('le texte, quand il y en a un', () => {
    expect(postExcerptOf(row({ excerpt: 'Bonne fête !' }), 'fr')).toEqual({ kind: 'text', text: 'Bonne fête !' });
  });

  test('une audience restreinte se dit sans jamais lire le texte', () => {
    expect(postExcerptOf(row({ restricted: true, visibility: 'PRIVATE' }), 'fr')).toEqual({ kind: 'restricted', text: 'Contenu à audience restreinte' });
  });

  test('une story sans texte dit ses médias : « Story · 2 médias »', () => {
    expect(postExcerptOf(row({ type: 'STORY', mediaCount: 2 }), 'fr')).toEqual({ kind: 'media', text: 'Story · 2 médias' });
  });

  test('un seul média reste au singulier', () => {
    expect(postExcerptOf(row({ type: 'REEL', mediaCount: 1 }), 'fr').text).toBe('Reel · 1 média');
  });

  test('un statut sans texte montre son humeur', () => {
    expect(postExcerptOf(row({ type: 'STATUS', moodEmoji: '🎉' }), 'fr')).toEqual({ kind: 'mood', text: '🎉' });
  });

  test('rien du tout : « Sans texte »', () => {
    expect(postExcerptOf(row(), 'fr')).toEqual({ kind: 'none', text: 'Sans texte' });
  });
});

describe('audiencePhrase — la TAILLE de l’audience choisie, jamais ses membres', () => {
  test('ONLY : « Visible par N personnes choisies », au singulier pour une seule', () => {
    expect(audiencePhrase('ONLY', 3, 'fr')).toBe('Visible par 3 personnes choisies');
    expect(audiencePhrase('ONLY', 1, 'fr')).toBe('Visible par 1 personne choisie');
  });

  test('EXCEPT : « Masquée à N personnes »', () => {
    expect(audiencePhrase('EXCEPT', 2, 'fr')).toBe('Masquée à 2 personnes');
    expect(audiencePhrase('EXCEPT', 1, 'fr')).toBe('Masquée à 1 personne');
  });

  test('toute autre audience, ou une taille inconnue, n’a rien à dire', () => {
    expect(audiencePhrase('PUBLIC', 0, 'fr')).toBeNull();
    expect(audiencePhrase('PRIVATE', null, 'fr')).toBeNull();
    expect(audiencePhrase('ONLY', null, 'fr')).toBeNull();
  });

  test('l’anglais suit sa propre règle de pluriel', () => {
    expect(audiencePhrase('ONLY', 1, 'en')).toContain('1');
  });
});

describe('translationsPhrase — le nombre de langues où la publication existe', () => {
  test('zéro, une, plusieurs', () => {
    expect(translationsPhrase(0, 'fr')).toBe('Pas encore traduite');
    expect(translationsPhrase(1, 'fr')).toBe('Traduite en 1 langue');
    expect(translationsPhrase(4, 'fr')).toBe('Traduite en 4 langues');
  });
});

describe('mediaKindOf — le genre d’un média d’après son type MIME', () => {
  test('image, vidéo, audio, sinon fichier', () => {
    expect(mediaKindOf('image/jpeg')).toBe('image');
    expect(mediaKindOf('video/mp4')).toBe('video');
    expect(mediaKindOf('audio/mpeg')).toBe('audio');
    expect(mediaKindOf('application/pdf')).toBe('file');
    expect(mediaKindOf('')).toBe('file');
  });
});
