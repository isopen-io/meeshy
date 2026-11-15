import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThreadError, ThreadRefused, ThreadSkeleton } from './thread-states';

describe('ThreadRefused — D-6, aucun titre ni membre (#5650)', () => {
  const html = renderToStaticMarkup(<ThreadRefused />);

  test('porte la phrase attendue et un lien de retour', () => {
    expect(html).toContain('Cette conversation n’est pas accessible');
    expect(html).toContain('Elle n’existe pas, ou vous n’en êtes pas membre.');
    expect(html).toContain('Retour aux conversations');
  });

  test('ne révèle AUCUN titre ni compte de membres', () => {
    expect(html).not.toContain('participants');
  });
});

describe('ThreadError', () => {
  test('« Impossible de charger le fil » et un bouton Réessayer', () => {
    const html = renderToStaticMarkup(<ThreadError onRetry={() => {}} />);
    expect(html).toContain('Impossible de charger le fil');
    expect(html).toContain('Réessayer');
  });
});

describe('ThreadSkeleton', () => {
  const html = renderToStaticMarkup(<ThreadSkeleton />);

  test('aria-busy et huit lignes', () => {
    expect(html).toContain('aria-busy="true"');
    // Chaque ligne porte un avatar rond (48 avatars/lignes ⇒ 8 occurrences).
    const rowCount = (html.match(/height:88px/g) ?? []).length;
    expect(rowCount).toBe(8);
  });

  test('un lien de retour reste présent pendant le chargement', () => {
    expect(html).toContain('Retour');
  });
});
