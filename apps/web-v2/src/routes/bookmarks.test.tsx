import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BOOKMARK_FILTERS, effectiveBookmarkFilter, visibleBookmarks, type BookmarkFilter } from '@/lib/feed/bookmark-filter';
import type { FeedPost } from '@/lib/api/feed-pages';

import { BookmarksEmpty, BookmarksError, BookmarksFilterPicker, BookmarksHeader } from './bookmarks';

/**
 * **LES QUATRE ÉTATS DE L'ÉCRAN DES PUBLICATIONS ENREGISTRÉES** (#7286) —
 * miroir `BookmarksView.swift`, état par état.
 *
 * Chacun est un composant PUR (primitives en props), rendu sans TanStack Query
 * ni routeur — même méthode que `feed.test.tsx` : un écran blanc n'est pas un
 * état, et c'est précisément ce qu'aucune capture heureuse ne montre.
 *
 * L'état VIDE est celui que la majorité des lecteurs verra au premier passage,
 * et l'issue le dit : il doit APPRENDRE le geste, pas constater une absence.
 * D'où un témoin qui exige le mot du geste et sa porte, pas seulement un titre.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const post = (id: string, type: 'POST' | 'REEL'): FeedPost => ({ id, type, createdAt: '2026-09-21T10:00:00.000Z' });

describe('l’en-tête', () => {
  test('porte le titre d’iOS et un retour NOMMÉ vers les réglages, cible 44', () => {
    const html = renderToStaticMarkup(<BookmarksHeader />);
    expect(html).toContain('Publications enregistrées');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('aria-label="Retour aux réglages"');
    expect(html).toContain('size-11');
  });
});

describe('l’état VIDE apprend le geste — c’est celui que la majorité verra', () => {
  const html = () => renderToStaticMarkup(<BookmarksEmpty />);

  test('il NOMME le corpus absent', () => {
    expect(html()).toContain('Aucune publication enregistrée');
  });

  test('il DIT comment on enregistre — un vide muet serait le défaut, pas l’état', () => {
    expect(html()).toContain('signet');
  });

  test('il OUVRE la porte du geste : le Flux, à une cible de 44', () => {
    const rendu = html();
    expect(rendu).toContain('href="/feed"');
    expect(rendu).toContain('min-height:44px');
  });

  test('ce n’est PAS une alerte — un corpus vide n’est pas une panne', () => {
    expect(html()).not.toContain('role="alert"');
  });
});

describe('l’état ERREUR distingue la panne du hors-ligne, et garde la reprise', () => {
  test('en ligne : le motif, et « Réessayer » à 44 px', () => {
    const html = renderToStaticMarkup(<BookmarksError online onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible de charger vos enregistrements');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  test('hors ligne : un motif DIFFÉRENT, qui promet le retour du réseau', () => {
    const html = renderToStaticMarkup(<BookmarksError online={false} onRetry={() => undefined} />);
    expect(html).toContain('Hors ligne');
    expect(html).not.toContain('Impossible de charger vos enregistrements');
    expect(html).toContain('Réessayer');
  });
});

/**
 * `BookmarksView.swift` : « Le sélecteur ne s'affiche que si la liste contient
 * bien les deux natures : proposer « Réels » sur une liste sans réel n'offre
 * qu'un moyen de vider l'écran. » La règle vit dans une fonction PURE plutôt
 * que dans le JSX — c'est elle qu'on exerce, et l'écran la lit.
 */
describe('le sélecteur de nature — la règle d’iOS, pas une variante', () => {
  test('les trois facettes, dans l’ordre d’iOS', () => {
    expect(BOOKMARK_FILTERS).toEqual(['all', 'posts', 'reels']);
  });

  test('« Tout » ne retire rien', () => {
    const corpus = [post('a', 'POST'), post('b', 'REEL')];
    expect(visibleBookmarks(corpus, 'all').map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('« Postes » et « Réels » partagent le corpus sans le perdre', () => {
    const corpus = [post('a', 'POST'), post('b', 'REEL'), post('c', 'POST')];
    expect(visibleBookmarks(corpus, 'posts').map((p) => p.id)).toEqual(['a', 'c']);
    expect(visibleBookmarks(corpus, 'reels').map((p) => p.id)).toEqual(['b']);
  });

  /**
   * On est sur « Réels », on retire le DERNIER réel : le corpus n'a plus
   * qu'une nature, le sélecteur disparaît (règle d'iOS)… et la facette
   * restait sur « Réels ». L'écran se vidait sans aucun moyen d'en sortir —
   * les postes toujours enregistrés, invisibles.
   */
  test('sans sélecteur, la facette retombe sur « Tout » — jamais un écran vide sans issue', () => {
    const plusQueDesPostes = [post('a', 'POST'), post('c', 'POST')];
    expect(effectiveBookmarkFilter(plusQueDesPostes, 'reels')).toBe('all');
    expect(visibleBookmarks(plusQueDesPostes, effectiveBookmarkFilter(plusQueDesPostes, 'reels')).map((p) => p.id)).toEqual([
      'a',
      'c',
    ]);
  });

  test('avec sélecteur, la facette choisie est tenue', () => {
    const mixte = [post('a', 'POST'), post('b', 'REEL')];
    expect(effectiveBookmarkFilter(mixte, 'reels')).toBe('reels');
  });

  test('le sélecteur est RENDU nommé, chaque facette annoncée par son état', () => {
    const html = renderToStaticMarkup(
      <BookmarksFilterPicker value="all" onChange={() => undefined} />,
    );
    expect(html).toContain('aria-label="Filtrer les enregistrements"');
    expect(html).toContain('Tout');
    expect(html).toContain('Postes');
    expect(html).toContain('Réels');
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/min-height:44px/g)?.length).toBe(BOOKMARK_FILTERS.length);
  });

  test('une facette sélectionnée AUTRE que « Tout » est celle qui s’annonce — le témoin de RANG', () => {
    const html = renderToStaticMarkup(
      <BookmarksFilterPicker value={'reels' satisfies BookmarkFilter} onChange={() => undefined} />,
    );
    const presse = html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)</)?.[1];
    expect(presse).toBe('Réels');
  });
});
