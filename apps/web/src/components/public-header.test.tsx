import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { PublicHeader } from './public-header';

/**
 * LA COQUE NE MONTRE PAS LE SÉLECTEUR DE LANGUE DU SITE (porteur, 2026-10-14).
 * Une coque installée suit la langue de l'appareil ; le sélecteur restait
 * seul en haut de la connexion Android, sans rien nommer.
 */
describe('PublicHeader — le sélecteur de langue d’interface', () => {
  test('le site le montre (défaut hors coque)', () => {
    expect(renderToStaticMarkup(<PublicHeader language="fr" brand={false} />)).toContain('data-interface-language');
  });

  test('la coque le tait — et un en-tête qui ne porterait plus rien n’est pas rendu', () => {
    expect(renderToStaticMarkup(<PublicHeader language="fr" brand={false} languageChoice={false} />)).toBe('');
  });

  test('la coque garde la marque et ce qui la précède', () => {
    const html = renderToStaticMarkup(<PublicHeader language="fr" leading={<button type="button">x</button>} languageChoice={false} />);
    expect(html).toContain('data-public-header');
    expect(html).toContain('data-public-home');
    expect(html).not.toContain('data-interface-language');
  });
});
