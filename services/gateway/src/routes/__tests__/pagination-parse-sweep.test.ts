/**
 * Cliquet : les routes NON-admin décodent leur pagination par le SSOT
 * `validatePagination`, jamais par un `parseInt` inline.
 *
 * Voir `pagination-parse-sweep.ts` pour le motif du défaut (`take: NaN` /
 * négatif → HTTP 500 sur une entrée entièrement contrôlée par l'appelant) et la
 * raison ÉCRITE de l'exclusion `admin/`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { sweepRawPaginationParses, sweepNonAdminRoutes } from './pagination-parse-sweep';

/**
 * L'inventaire des parses de pagination bruts TOLÉRÉS hors `admin/`.
 *
 * Il est VIDE, et c'est un état à défendre : quand ce cliquet tombe, l'entrée en
 * trop est un site NEUF qui contourne le SSOT. La réparation est de router par
 * `validatePagination(offset, limit, { defaultLimit, maxLimit })`, jamais
 * d'ajouter une ligne ici.
 */
const FROZEN_RAW_PARSES: ReadonlyArray<{ file: string; sites: ReadonlyArray<string> }> = [];

describe('routes non-admin — aucun décodage de pagination hors du SSOT', () => {
  it('ne laisse entrer aucun site neuf', () => {
    expect(sweepNonAdminRoutes()).toEqual([...FROZEN_RAW_PARSES]);
  });

  // Le balayage doit pouvoir TOMBER, sinon il ne garde rien. Ces formes sont
  // exactement celles qui produisaient un `take: NaN`/négatif dans le dépôt.
  it('voit un parse de pagination brut', () => {
    expect(sweepRawPaginationParses(`const limit = Math.min(parseInt(request.query.limit || '30', 10), 100);`))
      .toEqual([`parseInt(request.query.limit || '30')`]);
    expect(sweepRawPaginationParses(`getMessages(id, parseInt(limit), parseInt(offset));`))
      .toEqual(['parseInt(limit)', 'parseInt(offset)']);
    expect(sweepRawPaginationParses(`const pageNum = Math.max(1, parseInt(page, 10));`))
      .toEqual(['parseInt(page)']);
    expect(sweepRawPaginationParses(`const n = Number(request.query.offset);`))
      .toEqual(['Number(request.query.offset)']);
  });

  it('ne rapporte pas un appel qui passe par le SSOT', () => {
    expect(
      sweepRawPaginationParses(
        `const { limit, offset } = validatePagination(request.query.offset, request.query.limit, { defaultLimit: 30, maxLimit: 100 });`
      )
    ).toEqual([]);
  });

  it('ne confond pas un parseInt SANS champ de pagination avec le défaut', () => {
    expect(sweepRawPaginationParses(`const year = parseInt(request.query.year, 10);`)).toEqual([]);
  });

  // Un parse écrit en COMMENTAIRE explique un défaut, il n'en est pas un —
  // c'est la discrimination que `stripComments` porte (règle des balayages frères).
  it('ne rapporte pas un parse cité en commentaire', () => {
    expect(sweepRawPaginationParses(`// jadis: parseInt(request.query.limit)\nconst x = 1;`)).toEqual([]);
  });
});
