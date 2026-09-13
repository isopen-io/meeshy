import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LensTime } from './lens-time';

describe("l'heure de la rangée", () => {
  test('rend un <time data-time dateTime=ISO> au texte relatif', () => {
    const at = new Date(Date.now() - 9 * 60_000);
    const html = renderToStaticMarkup(<LensTime at={at} />);
    expect(html).toContain('data-time');
    expect(html).toContain(`dateTime="${at.toISOString()}"`);
    expect(html).toContain('9 min');
  });

  test('la couleur est TOUJOURS tertiaire — le composant ne prend même pas de prop `unread`', () => {
    const at = new Date(Date.now() - 5 * 60_000);
    const html = renderToStaticMarkup(<LensTime at={at} />);
    expect(html).toContain('color:var(--color-ios-ink-3)');
    // Aucune trace d'une couleur d'accent conditionnelle.
    expect(html).not.toContain('var(--accent)');
  });

  test('accepte une chaîne ISO comme un objet Date', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    const html = renderToStaticMarkup(<LensTime at={iso} />);
    expect(html).toContain('data-time');
  });
});
