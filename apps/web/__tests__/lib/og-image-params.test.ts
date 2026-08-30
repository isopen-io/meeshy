/**
 * `lib/og-image-params` — ce qu'une URL publique a le droit de demander à
 * l'image sociale (#4338).
 *
 * La règle vit dans une fonction PURE, séparée du rendu, pour une raison de
 * mesure : `ImageResponse` compose une image via Satori et un rasteriseur
 * wasm — l'exercer sous jest atteste le rendu, pas la règle. Ce qui doit être
 * gardé ici est ce que la route ACCEPTE et ce qu'elle BORNE, et c'est
 * exactement ce qu'un module pur peut prouver.
 */

import {
  OG_LIMITES,
  OG_TYPES,
  parseOgImageParams,
} from '@/lib/og-image-params';

const params = (init: Record<string, string>): URLSearchParams =>
  new URLSearchParams(init);

describe('parseOgImageParams — les quatre gabarits que le dépôt compose', () => {
  it.each(OG_TYPES)('accepte le type « %s », que quatre pages composent déjà', (type) => {
    expect(parseOgImageParams(params({ type, title: 'Titre' })).type).toBe(type);
  });

  it('garde le titre, le sous-titre, le nom et le message', () => {
    const lu = parseOgImageParams(
      params({
        type: 'invitation',
        title: 'Réunion produit',
        subtitle: 'Groupe • 4 participants',
        userName: 'Amina',
        message: 'On se retrouve à 14 h',
      })
    );
    expect(lu).toMatchObject({
      type: 'invitation',
      title: 'Réunion produit',
      subtitle: 'Groupe • 4 participants',
      userName: 'Amina',
      message: 'On se retrouve à 14 h',
    });
  });
});

describe("parseOgImageParams — le SENS de la panne d'une image d'aperçu", () => {
  /**
   * Une image sociale est lue par des robots tiers qu'on ne contrôle pas. Un
   * refus leur rend une vignette VIDE, c'est-à-dire exactement le symptôme
   * que #4338 corrige. Cette surface échoue donc OUVERT — vers un gabarit
   * neutre — là où une surface de données échouerait fermé.
   */
  it('retombe sur un gabarit neutre plutôt que de refuser un type inconnu', () => {
    expect(parseOgImageParams(params({ type: 'inconnu', title: 'x' })).type).toBe('conversation');
  });

  it("compose une image même sans AUCUN paramètre", () => {
    const lu = parseOgImageParams(params({}));
    expect(lu.type).toBe('conversation');
    expect(typeof lu.title).toBe('string');
  });
});

describe('parseOgImageParams — les bornes, parce que cette URL est PUBLIQUE et non authentifiée', () => {
  it.each([
    ['title', OG_LIMITES.title],
    ['subtitle', OG_LIMITES.subtitle],
    ['userName', OG_LIMITES.userName],
    ['message', OG_LIMITES.message],
  ] as const)('tronque « %s » à %i caractères', (champ, limite) => {
    const lu = parseOgImageParams(params({ type: 'profile', [champ]: 'a'.repeat(limite + 500) }));
    expect(lu[champ]).toHaveLength(limite);
  });

  it('normalise les blancs plutôt que de rendre une ligne qui casse la mise en page', () => {
    const lu = parseOgImageParams(params({ type: 'profile', title: '  Ada\n\nLovelace\t ' }));
    expect(lu.title).toBe('Ada Lovelace');
  });
});
