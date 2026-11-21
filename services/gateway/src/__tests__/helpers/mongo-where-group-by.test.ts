/**
 * `groupByIn` — le double de `groupBy` ajouté par #20111, et son témoin.
 *
 * Il a d'abord été livré SANS témoin, et son unique consommateur vivait dans un
 * AUTRE paquet (`services/agent`). L'audit adversarial du lot l'a relevé, et la
 * raison tient en une phrase : **un instrument qui décide d'un témoin de
 * sécurité doit rougir chez lui.** Un double hébergé ici et exercé seulement
 * ailleurs se périme sans bruit — le paquet qui le porte ne saurait pas qu'il
 * l'a cassé.
 *
 * Ce qu'il garde, et chaque ligne a sa raison :
 *
 * - la sémantique « absent ≠ null » du `where`, héritée de `matchesMongoWhere`
 *   (c'est tout l'objet de ce fichier) ;
 * - le collapse d'une clé ABSENTE et d'un `null` dans le MÊME seau, qui est ce
 *   que `$group` de MongoDB fait d'un champ manquant ;
 * - le refus de ce qu'il ne sait pas faire. Un double qui invente un nombre est
 *   pire qu'un double absent : il rend un témoin vert sur une agrégation que la
 *   production n'obtiendrait jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { groupByIn } from './mongo-where';

const ligne = (over: Record<string, unknown>) => ({ conversationId: 'c1', isActive: true, ...over });

describe('groupByIn', () => {
  it('compte par clé `by`, après avoir ÉVALUÉ le `where`', async () => {
    const { groupBy } = groupByIn([
      ligne({ userId: 'a' }),
      ligne({ userId: 'b' }),
      ligne({ conversationId: 'c2', userId: 'c' }),
      ligne({ userId: 'd', isActive: false }),
    ]);

    const seaux = await groupBy({ by: ['conversationId'], where: { isActive: true }, _count: true });

    expect(seaux).toEqual([
      { conversationId: 'c1', _count: 2 },
      { conversationId: 'c2', _count: 1 },
    ]);
  });

  /**
   * LE TÉMOIN QUI COMPTE pour #20111 : une clé ABSENTE n'est pas une clé à
   * `null`, et seul `unsetOrNull` apparie les deux. Sous une égalité nue, la
   * ligne jamais bannie — celle de l'immense majorité — DISPARAÎT du compte.
   */
  it('n’apparie une clé ABSENTE que par la branche `isSet`, jamais par une égalité à `null`', async () => {
    const lignes = [ligne({ userId: 'jamais-banni' }), ligne({ userId: 'debanni', bannedAt: null })];

    const nue = await groupByIn(lignes).groupBy({ by: ['conversationId'], where: { bannedAt: null }, _count: true });
    const loi = await groupByIn(lignes).groupBy({
      by: ['conversationId'],
      where: { OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }] },
      _count: true,
    });

    expect(nue).toEqual([{ conversationId: 'c1', _count: 1 }]);
    expect(loi).toEqual([{ conversationId: 'c1', _count: 2 }]);
  });

  /**
   * **Les DEUX ORDRES, et c'est le témoin lui-même qui l'a exigé.** Écrit
   * d'abord avec la ligne `null` en premier, il ne pouvait PAS tomber : le seau
   * garde la valeur de la PREMIÈRE ligne qui le crée, donc la normalisation
   * `?? null` n'était jamais exercée. La mutation qui la retire laissait le
   * témoin vert.
   *
   * > Un témoin qui dépend de l'ORDRE de sa fixture teste l'ordre, pas la
   * > propriété. Quand la propriété est une normalisation, la fixture doit la
   * > solliciter depuis chaque côté.
   */
  it.each([
    ['la ligne `null` d’abord', [ligne({ userId: null }), ligne({})]],
    ['la ligne ABSENTE d’abord', [ligne({}), ligne({ userId: null })]],
  ])('range une clé `by` ABSENTE et une clé `null` dans le MÊME seau, comme `$group` — %s', async (_ordre, lignes) => {
    const { groupBy } = groupByIn(lignes as Record<string, unknown>[]);

    await expect(groupBy({ by: ['userId'], _count: true })).resolves.toEqual([{ userId: null, _count: 2 }]);
  });

  it('groupe sur plusieurs clés `by`', async () => {
    const { groupBy } = groupByIn([
      ligne({ userId: 'a', role: 'admin' }),
      ligne({ userId: 'b', role: 'admin' }),
      ligne({ userId: 'c', role: 'member' }),
    ]);

    await expect(groupBy({ by: ['conversationId', 'role'], _count: true })).resolves.toEqual([
      { conversationId: 'c1', role: 'admin', _count: 2 },
      { conversationId: 'c1', role: 'member', _count: 1 },
    ]);
  });

  it('REJETTE une agrégation qu’il ne sait pas servir plutôt que de rendre un nombre inventé', async () => {
    const { groupBy } = groupByIn([ligne({ userId: 'a' })]);

    await expect(groupBy({ by: ['conversationId'], _count: { _all: true } } as never)).rejects.toThrow(/_count: true/);
    await expect(groupBy({ by: ['conversationId'], _count: true, having: {} } as never)).rejects.toThrow(/non supporté/);
  });

  it('enregistre ses appels, pour les témoins qui assertent sur la REQUÊTE', async () => {
    const double = groupByIn([ligne({ userId: 'a' })]);

    await double.groupBy({ by: ['conversationId'], where: { isActive: true }, _count: true });

    expect(double.calls).toHaveLength(1);
    expect(double.calls[0].where).toEqual({ isActive: true });
  });
});
