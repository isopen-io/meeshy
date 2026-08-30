/**
 * L'OpenAPI publié écrit les chemins comme le reste du dépôt : sans barre finale.
 *
 * ## Le défaut
 *
 * `@fastify/swagger` émet le chemin tel qu'il est DÉCLARÉ. Un module monté au
 * préfixe `/api/v1/me` qui déclare sa route en `'/'` produit donc
 * `/api/v1/me/` — avec la barre. Quinze chemins publiés sont dans ce cas,
 * dont `/api/v1/me/`, `/api/v1/me/preferences/` et `/api/v1/reports/`.
 *
 * Les deux autres descriptions de la même API n'ont, elles, AUCUNE barre
 * finale : le manifeste de routes (430 chemins) et le catalogue client partagé
 * (416 chemins, généré depuis ce manifeste). Deux sources sur trois écrivent
 * `/api/v1/me` ; c'est l'OpenAPI qui dévie.
 *
 * ## Pourquoi ça coûte
 *
 * Le serveur sert les deux formes (`ignoreTrailingSlash`), donc rien ne casse à
 * l'usage. Mais toute comparaison entre l'OpenAPI et l'une des deux autres
 * sources rend quinze faux négatifs — un lecteur conclut que des routes VIVANTES
 * manquent au contrat. C'est arrivé, et ça a produit une issue fermée comme
 * non-défaut avant que la vraie divergence ne soit vue.
 *
 * Un contrat publié est lu par des humains et par des générateurs. Qu'il écrive
 * une même route autrement que le reste du dépôt est un piège, pas un détail.
 *
 * ## La collision est un CONFLIT, jamais un écrasement silencieux
 *
 * Si la spec portait à la fois `/x` et `/x/`, les fusionner écraserait l'un des
 * deux. La fonction refuse de choisir : elle fusionne les VERBES quand ils sont
 * disjoints, et signale la collision quand un même verbe est déclaré des deux
 * côtés. Perdre une opération en normalisant serait pire que la barre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicaliserCheminsOpenApi,
  cheminsAvecBarreFinale,
} from '../../../utils/openapi-canonical-paths';

describe("L'OpenAPI publié n'écrit aucun chemin avec une barre finale (#4372)", () => {
  it('retire la barre finale', () => {
    const spec = { paths: { '/api/v1/me/': { get: { summary: 'moi' } } } };
    const { spec: rendu } = canonicaliserCheminsOpenApi(spec);

    expect(Object.keys(rendu.paths)).toEqual(['/api/v1/me']);
    expect(rendu.paths['/api/v1/me']).toEqual({ get: { summary: 'moi' } });
  });

  it('laisse intact un chemin déjà canonique', () => {
    const spec = { paths: { '/api/v1/me/preferences/categories/reorder': { post: {} } } };
    const { spec: rendu } = canonicaliserCheminsOpenApi(spec);

    expect(Object.keys(rendu.paths)).toEqual(['/api/v1/me/preferences/categories/reorder']);
  });

  /**
   * La racine seule reste `'/'` : la dépouiller donnerait la chaîne vide, qui
   * n'est pas un chemin.
   */
  it('ne touche pas à la racine', () => {
    const { spec: rendu } = canonicaliserCheminsOpenApi({ paths: { '/': { get: {} } } });
    expect(Object.keys(rendu.paths)).toEqual(['/']);
  });

  it('fusionne les verbes DISJOINTS des deux formes', () => {
    const spec = {
      paths: {
        '/api/v1/x': { get: { summary: 'lire' } },
        '/api/v1/x/': { post: { summary: 'ecrire' } },
      },
    };
    const { spec: rendu, collisions } = canonicaliserCheminsOpenApi(spec);

    expect(Object.keys(rendu.paths)).toEqual(['/api/v1/x']);
    expect(rendu.paths['/api/v1/x']).toEqual({
      get: { summary: 'lire' },
      post: { summary: 'ecrire' },
    });
    expect(collisions).toEqual([]);
  });

  /**
   * Le témoin qui compte : une normalisation qui PERD une opération est pire
   * que la barre qu'elle corrige. Ici le `get` est déclaré des deux côtés —
   * la fonction garde la forme canonique et SIGNALE, plutôt que d'écraser en
   * silence.
   */
  it("signale la collision quand un MÊME verbe est déclaré des deux côtés, et ne perd rien", () => {
    const spec = {
      paths: {
        '/api/v1/x': { get: { summary: 'canonique' } },
        '/api/v1/x/': { get: { summary: 'avec barre' }, post: { summary: 'ecrire' } },
      },
    };
    const { spec: rendu, collisions } = canonicaliserCheminsOpenApi(spec);

    expect(collisions).toEqual(['GET /api/v1/x']);
    // La forme canonique gagne, et le verbe non conflictuel est tout de même repris.
    expect(rendu.paths['/api/v1/x'].get).toEqual({ summary: 'canonique' });
    expect(rendu.paths['/api/v1/x'].post).toEqual({ summary: 'ecrire' });
  });

  it('ne modifie pas la spec reçue — le clone est à la charge de l\'appelant', () => {
    const spec = { paths: { '/api/v1/me/': { get: {} } } };
    canonicaliserCheminsOpenApi(spec);
    expect(Object.keys(spec.paths)).toEqual(['/api/v1/me/']);
  });

  it('supporte une spec sans `paths`', () => {
    expect(canonicaliserCheminsOpenApi({}).spec).toEqual({});
  });
});

describe('cheminsAvecBarreFinale — le détecteur qui sert de garde', () => {
  it('rend les chemins fautifs, la racine exclue', () => {
    expect(
      cheminsAvecBarreFinale({ paths: { '/': {}, '/a/': {}, '/b': {}, '/c/d/': {} } })
    ).toEqual(['/a/', '/c/d/']);
  });

  it('rend une liste vide sur une spec canonique', () => {
    expect(cheminsAvecBarreFinale({ paths: { '/a': {}, '/b/c': {} } })).toEqual([]);
  });
});
