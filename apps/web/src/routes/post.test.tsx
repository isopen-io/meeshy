import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PostDetailError, PostDetailHeader, PostDetailRefused } from './post';

/**
 * LES ÉTATS DESSINÉS DU DÉTAIL D'UNE PUBLICATION (#6278) — composants PURS,
 * même méthode que `feed.test.tsx` : un écran blanc n'est pas un état.
 */
describe('le détail d’une publication dessine ses états', () => {
  test('l’en-tête ramène au FIL par un retour NOMMÉ, cible 44', () => {
    const html = renderToStaticMarkup(<PostDetailHeader />);
    expect(html).toContain('aria-label="Retour au fil"');
    expect(html).toContain('href="/feed"');
    expect(html).toContain('size-11');
  });

  /** D-6 : 403 et 404 confondus — « elle n'existe pas, ou vous n'y avez pas
   * accès », jamais l'un ou l'autre distingué, et rien de la publication. */
  test('refusé : une seule phrase pour « absente » et « hors audience », et le chemin du retour', () => {
    const html = renderToStaticMarkup(<PostDetailRefused />);
    expect(html).toContain('Cette publication n’est pas accessible');
    expect(html).toContain('Elle n’existe pas, ou vous n’y avez pas accès.');
    expect(html).toContain('href="/feed"');
    expect(html).toContain('min-height:44px');
  });

  test('erreur : distingue le hors-ligne et offre « Réessayer »', () => {
    const online = renderToStaticMarkup(<PostDetailError online onRetry={() => undefined} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain('Impossible de charger la publication');
    expect(online).toContain('Réessayer');

    const offline = renderToStaticMarkup(<PostDetailError online={false} onRetry={() => undefined} />);
    expect(offline).toContain('Hors ligne');
    expect(offline).not.toContain('Impossible de charger la publication');
  });
});
