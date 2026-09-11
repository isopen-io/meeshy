import { describe, expect, test } from 'bun:test';

import {
  institutionalRoutes,
  normalizePattern,
  screenRoutes,
  v31Routes,
} from '../../scripts/lib/v31-routes.mjs';
import { ROUTES } from './route-table';

/**
 * LA JUMELLE DE L'INVENTAIRE — `scripts/lib/v31-routes.mjs` analyse le TEXTE de
 * `route-table.tsx` parce qu'un script Node ne peut pas charger un module qui
 * importe `@/lib/router` et du JSX. Une analyse textuelle a le défaut de sa
 * nature : elle peut se désaccorder de ce que le module déclare vraiment, et
 * son désaccord est SILENCIEUX — l'inventaire rend un nombre plus petit, ce qui
 * ressemble à un inventaire.
 *
 * Ce témoin est le seul endroit du dépôt où les deux lectures se rencontrent :
 * il IMPORTE `ROUTES` (bun sait le faire) et REJOUE l'extraction, puis les
 * compare. Il ne recopie aucune adresse — une liste écrite ici serait une
 * troisième lecture, et la plus dangereuse, puisqu'elle prétendrait garder la
 * divergence des deux autres.
 *
 * Ce qui le fait rougir, et c'est le critère de fin de #5669 : une route
 * ajoutée à `ROUTES` que l'extraction ne voit pas.
 */

describe('l’inventaire de parité voit ce que le routeur déclare', () => {
  test('chaque pattern de ROUTES est dans l’extraction, et rien de plus', () => {
    const declares = Object.values(ROUTES).map((r) => normalizePattern(r.pattern));
    expect([...screenRoutes()].sort()).toEqual([...declares].sort());
  });

  test('une route ajoutée à ROUTES sans que l’extraction la voie fait rougir', () => {
    // On n'édite pas le fichier : on donne à l'extracteur une source où une
    // route de PLUS est déclarée, et on vérifie qu'il la rapporte. Un
    // extracteur qui ignorerait la nouvelle ligne rendrait ici la liste
    // d'aujourd'hui, et le premier témoin passerait quand même — c'est
    // exactement l'angle mort qu'il faut fermer.
    const avecUneDeMieux = [
      'export const ROUTES = {',
      "  list: { pattern: '/', screen: () => import('@/routes/conversations') },",
      "  settings: { pattern: '/settings/$section', screen: () => import('@/routes/settings') },",
      '} as const;',
    ].join('\n');

    expect(screenRoutes(avecUneDeMieux)).toEqual(['/', '/settings/:section']);
  });

  test('une table que l’extraction ne reconnaît plus JETTE, au lieu de rendre zéro', () => {
    expect(() => screenRoutes('export const ROUTES = new Map();')).toThrow(/route-table\.tsx/);
  });

  test('les cinq documents pré-rendus comptent, eux que ROUTES ne porte pas', () => {
    const inventaire = v31Routes();
    for (const url of institutionalRoutes()) {
      expect(inventaire).toContainEqual({ url, kind: 'document' });
    }
    expect(inventaire.filter((r) => r.kind === 'document')).toHaveLength(5);
  });

  test('les motifs du routeur maison sont rendus dans la forme du legacy', () => {
    // `$x` ici, `:x` chez Next.js. Sans la normalisation, `/c/$conversation` et
    // `/c/:conversation` seraient deux adresses distinctes de l'union — et la
    // comparaison qui est la raison d'être de l'inventaire ne rapprocherait
    // jamais rien.
    expect(normalizePattern('/c/$conversation')).toBe('/c/:conversation');
    expect(normalizePattern('/a/$x/b/$y')).toBe('/a/:x/b/:y');
    expect(normalizePattern('/login')).toBe('/login');
  });
});
