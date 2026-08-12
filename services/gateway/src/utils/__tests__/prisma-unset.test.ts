/**
 * `unsetOrNull` — le prédicat « pas encore » de MongoDB, sa source unique.
 *
 * Les témoins de comportement des appelants (accès conversation, révocation de
 * jetons) prouvent que la clause atteint ses lignes. Ce témoin-ci garde
 * l'INVARIANT lui-même : vider la fonction en `{}` ou n'y laisser qu'une des deux
 * branches ne fait rougir aucun test d'appelant qui n'aurait pas été écrit
 * exprès, alors que les deux branches sont indispensables et pour des raisons
 * différentes — `null` pour les lignes qu'un chemin a remises à zéro,
 * `isSet: false` pour celles qu'aucun créateur n'a écrites.
 */
import { describe, it, expect } from '@jest/globals';
import { unsetOrNull } from '../prisma-unset';
import { matchesMongoWhere } from '../../__tests__/helpers/mongo-where';

describe('unsetOrNull', () => {
  it('nomme exactement les deux états « pas encore », dans cet ordre', () => {
    expect(unsetOrNull('bannedAt')).toEqual({
      OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }],
    });
  });

  it("n'ajoute aucune autre clé au where de l'appelant", () => {
    expect(Object.keys(unsetOrNull('usedAt'))).toEqual(['OR']);
  });

  it('apparie une colonne ABSENTE — le cas qu\'un filtre `null` nu manque', () => {
    expect(matchesMongoWhere({ id: 'p1' }, unsetOrNull('bannedAt') as any)).toBe(true);
  });

  it('apparie une colonne explicitement nulle', () => {
    expect(matchesMongoWhere({ id: 'p1', bannedAt: null }, unsetOrNull('bannedAt') as any)).toBe(true);
  });

  it("n'apparie pas une colonne portant une date", () => {
    expect(
      matchesMongoWhere({ id: 'p1', bannedAt: new Date('2026-01-01') }, unsetOrNull('bannedAt') as any)
    ).toBe(false);
  });

  it('vaut pour tout champ nommé, sans liste fermée', () => {
    expect(matchesMongoWhere({ id: 't1' }, unsetOrNull('usedAt') as any)).toBe(true);
    expect(matchesMongoWhere({ id: 't1', usedAt: new Date() }, unsetOrNull('usedAt') as any)).toBe(false);
  });
});
