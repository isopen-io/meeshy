import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { StatusMoodPost } from '@/lib/api/stories';

import { moodPageView } from './page-view';

/**
 * **CE QUE LA PAGE D'UNE HUMEUR MONTRE** (#10813) — l'auteur, son emoji et son
 * mot dans la langue du lecteur. Le corpus des humeurs DÉJÀ servi peint la
 * page sans attendre (Cache-First) ; le détail de la publication, quand il
 * arrive, fait foi.
 */

const detail = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'st-1',
  type: 'STATUS',
  createdAt: '2026-10-16T08:00:00.000Z',
  content: 'On fête ça ce soir',
  originalLanguage: 'fr',
  translations: { en: { text: 'Celebrating tonight' } },
  moodEmoji: '🎉',
  author: { id: 'u-nour', username: 'nour', displayName: 'Nour', avatar: '/a/nour.jpg' },
  ...overrides,
});

const corpus: StatusMoodPost = {
  id: 'st-1',
  authorId: 'u-nour',
  moodEmoji: '🎉',
  content: 'On fête ça ce soir',
  originalLanguage: 'fr',
  author: { id: 'u-nour', username: 'nour', displayName: 'Nour' },
};

describe('moodPageView', () => {
  test('le mot descend le Prisme du lecteur — sur un rang AUTRE que le premier', () => {
    const view = moodPageView({ postId: 'st-1', post: detail(), corpus: undefined, languages: ['de', 'en'] });
    expect(view).toMatchObject({ authorId: 'u-nour', authorName: 'Nour', handle: 'nour', avatar: '/a/nour.jpg', emoji: '🎉', isMood: true });
    expect(view?.text).toBe('Celebrating tonight');
    expect(view?.language).toBe('en');
  });

  test('le corpus des humeurs peint la page avant le détail — aucune attente sur un cache non vide', () => {
    const view = moodPageView({ postId: 'st-1', post: undefined, corpus, languages: ['fr'] });
    expect(view).toMatchObject({ authorId: 'u-nour', authorName: 'Nour', emoji: '🎉', text: 'On fête ça ce soir', isMood: true });
  });

  test('rien de connu : aucune vue inventée', () => {
    expect(moodPageView({ postId: 'st-1', post: undefined, corpus: undefined, languages: ['fr'] })).toBeNull();
  });

  test('une humeur sans mot montre son emoji seul', () => {
    expect(moodPageView({ postId: 'st-1', post: detail({ content: null }), corpus: undefined, languages: ['fr'] })?.text).toBe('');
  });

  test('une publication qui n’est pas une humeur le dit, pour que la page rende la main au détail', () => {
    expect(moodPageView({ postId: 'p-1', post: detail({ id: 'p-1', type: 'POST' }), corpus: undefined, languages: ['fr'] })?.isMood).toBe(false);
  });

  test('le corpus sans nom d’affichage nomme l’auteur par son prénom et son nom', () => {
    const view = moodPageView({
      postId: 'st-1',
      post: undefined,
      corpus: { ...corpus, author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' } },
      languages: ['fr'],
    });
    expect(view?.authorName).toBe('Inès Baraka');
  });

  test('sans nom d’affichage, le pseudo nomme l’auteur', () => {
    const view = moodPageView({ postId: 'st-1', post: detail({ author: { id: 'u-nour', username: 'nour', displayName: null } }), corpus: undefined, languages: ['fr'] });
    expect(view?.authorName).toBe('nour');
  });
});
