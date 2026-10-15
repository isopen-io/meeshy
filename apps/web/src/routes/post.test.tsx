import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PostDetailError, PostDetailHeader, postDetailBodyOf } from './post';

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

/**
 * **UN LIEN DE PUBLICATION QU'ON NE PEUT PAS VOIR** (#10314) — comme un réel
 * refusé : pour un visiteur sans compte, le fond sombre neutre et l'invitation
 * par-dessus, jamais un écran vide. Un membre connecté garde le refus dessiné
 * (D-6) ; une panne garde « Réessayer », jamais confondue avec un refus.
 */
describe('ce que le détail montre, selon le verdict de la passerelle', () => {
  const verdict = (over: Partial<Parameters<typeof postDetailBodyOf>[0]> = {}) =>
    postDetailBodyOf({ served: false, visitor: false, refused: false, failed: false, ...over });

  test('servie : la carte, pour un membre comme pour un visiteur', () => {
    expect(verdict({ served: true })).toBe('card');
    expect(verdict({ served: true, visitor: true })).toBe('card');
  });

  test('refusée à un visiteur : le fond sombre neutre sous l’invitation', () => {
    expect(verdict({ visitor: true, refused: true, failed: true })).toBe('visitor-refused');
  });

  test('refusée à un membre : la notice du réel refusé', () => {
    expect(verdict({ refused: true, failed: true })).toBe('refused');
  });

  test('une panne n’est jamais un refus : « Réessayer », visiteur compris', () => {
    expect(verdict({ failed: true })).toBe('error');
    expect(verdict({ visitor: true, failed: true })).toBe('error');
  });

  test('en lecture : le squelette', () => {
    expect(verdict()).toBe('loading');
    expect(verdict({ visitor: true })).toBe('loading');
  });
});
