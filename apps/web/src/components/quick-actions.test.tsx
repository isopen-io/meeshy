import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { HERO_THRESHOLD, QuickActions, showsHeroes, type QuickAction } from './quick-actions';

const action = (partial: Partial<QuickAction> = {}): QuickAction => ({
  key: 'inviter',
  label: 'Inviter des amis',
  hint: 'Partagez votre lien.',
  glyph: 'linkSimple',
  run: () => null,
  ...partial,
});

const rendu = (actions: readonly QuickAction[], conversationCount: number) =>
  renderToStaticMarkup(
    <QuickActions title="Et maintenant ?" subtitle="Sous-titre" actions={actions} conversationCount={conversationCount} />,
  );

/**
 * Le seuil vient de la directive porteur du 2026-09-01, portée d'iOS :
 * « les trois lignes doivent toujours s'afficher tant qu'on n'a pas plus de 10
 * conversations ». Ce n'est pas le VIDE qui appelle de l'aide, c'est le
 * DÉMARRAGE — une liste d'UNE conversation en a autant besoin que zéro.
 */
describe('showsHeroes — le seuil de démarrage', () => {
  test('le seuil est INCLUSIF : dix gardent les héros, la onzième les range', () => {
    expect(HERO_THRESHOLD).toBe(10);
    expect(showsHeroes(0)).toBe(true);
    expect(showsHeroes(1)).toBe(true);
    expect(showsHeroes(10)).toBe(true);
    expect(showsHeroes(11)).toBe(false);
  });
});

describe('QuickActions', () => {
  test('rien à proposer ⇒ rien ne se peint, titre compris', () => {
    expect(rendu([], 0)).toBe('');
  });

  test('au démarrage, un héros est un GROS bouton pleine largeur', () => {
    const html = rendu([action({ hero: true })], 1);
    expect(html).toContain('Inviter des amis');
    expect(html).toContain('min-height:52px');
    // Pas de grille de tuiles : le héros est hors grille tant qu'on démarre.
    expect(html).not.toContain('grid-cols-3');
  });

  /**
   * Le témoin qui distingue le seuil d'un simple `hero: true` toujours vrai :
   * au RANG 11, le même héros doit redevenir une tuile. Sans lui, un `hero`
   * codé en dur passerait pour un seuil qui fonctionne.
   */
  test('passé le seuil, le MÊME héros redevient une tuile', () => {
    const html = rendu([action({ hero: true })], HERO_THRESHOLD + 1);
    expect(html).toContain('Inviter des amis');
    expect(html).toContain('grid-cols-3');
    expect(html).not.toContain('min-height:52px');
  });

  test('une action ordinaire est une tuile, même au démarrage', () => {
    const html = rendu([action({ key: 'post', label: 'Publier', hero: false })], 0);
    expect(html).toContain('grid-cols-3');
  });

  test('le retour d’un geste invisible a sa zone annoncée', () => {
    expect(rendu([action({ hero: true })], 0)).toContain('aria-live="polite"');
  });
});
