/**
 * #20051 — le superset de participants borne sa lecture, et une TRONCATURE n'y
 * devient jamais une liste.
 *
 * `fetchParticipantSuperset` est le site unique du `select` que les quatre
 * transports de `message:new` partagent, et sa valeur voyage jusqu'à la **file
 * hors ligne** (`params.participants`) — la TROISIÈME porte de sortie d'un
 * message, et la seule DURABLE : un destinataire déconnecté n'apprend jamais
 * l'existence d'un message autrement que par le rejeu de
 * `_drainPendingMessages`.
 *
 * La fonction sépare déjà l'ignorance de l'affirmation, et son doc-comment dit
 * pourquoi : `undefined` ⇒ « je n'ai rien prouvé », et l'unité partagée refait
 * SA requête ; `[]` ⇒ « aucun participant », donc n'enfile pour PERSONNE
 * (règle du cycle 116). **Il manquait le troisième cas** : une liste
 * TRONQUÉE, que la borne rend possible, et qui priverait DÉFINITIVEMENT du
 * message les absents qu'elle ne nomme pas.
 *
 * C'est pourquoi une borne naïve est pire ici que l'absence de borne — la même
 * asymétrie que #20050, sur le contenu le plus cher du produit : le message
 * lui-même.
 *
 * Le double est `findManyIn`, qui honore le `where`, le `select` ET le `take` :
 * sans le `take`, aucun témoin de borne ne peut tomber.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { fetchParticipantSuperset } from '../participant-superset';
import { findManyIn, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const vivant = (suffixe: string, overrides: MongoDocument = {}): MongoDocument => ({
  id: `p-${suffixe}`,
  userId: `u-${suffixe}`,
  conversationId: CONV,
  isActive: true,
  bannedAt: null,
  joinedAt: new Date('2026-10-01T00:00:00Z'),
  // Les préférences du Prisme vivent sur la ligne `User`, pas sur le
  // participant — c'est la forme que `PREVIEW_PRISM_PARTICIPANT_SELECT`
  // demande, et le double la projette comme Prisma la projette.
  user: {
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    deviceLocale: 'fr-FR',
  },
  ...overrides,
});

const monde = (participants: readonly MongoDocument[]) => {
  const collection = findManyIn(participants);
  return {
    prisma: { participant: { findMany: collection.findMany } } as any,
    lectures: collection.calls,
  };
};

describe('#20051 — le superset de participants ne rend jamais une liste TRONQUÉE', () => {
  it('sous le plafond, il rend la liste — et sa lecture est bornée', async () => {
    const { prisma, lectures } = monde([vivant('a'), vivant('b')]);

    const rows = await fetchParticipantSuperset(prisma, CONV, 'socket', { cap: 10 });

    expect(rows?.map((row) => row.id)).toEqual(['p-a', 'p-b']);
    expect(lectures[0].take).toBe(11);
  });

  /**
   * Le fait du lot. Sans la garde, cette lecture rendrait DEUX participants sur
   * trois, et le troisième — absent de la liste remise à la file — ne recevrait
   * jamais le message : ni en direct (il est hors ligne), ni au rejeu (il n'a
   * pas d'entrée). `undefined` fait refaire à l'unité partagée sa propre
   * requête, qui ne demande que `{id, userId}` et n'est donc pas plafonnée par
   * la même projection.
   */
  it('au-delà du plafond, il rend `undefined` — jamais les lignes qu’il a lues', async () => {
    const { prisma } = monde([vivant('a'), vivant('b'), vivant('c')]);

    const rows = await fetchParticipantSuperset(prisma, CONV, 'rest-zmq', { cap: 2 });

    expect(rows).toBeUndefined();
  });

  it('une audience de la taille EXACTE du plafond est complète, et se rend', async () => {
    const { prisma } = monde([vivant('a'), vivant('b')]);

    const rows = await fetchParticipantSuperset(prisma, CONV, 'socket', { cap: 2 });

    expect(rows?.map((row) => row.id)).toEqual(['p-a', 'p-b']);
  });

  it('une lecture qui TOMBE rend `undefined`, comme avant le lot', async () => {
    const prisma = { participant: { findMany: async () => { throw new Error('mongo down'); } } } as any;

    const rows = await fetchParticipantSuperset(prisma, CONV, 'socket');

    expect(rows).toBeUndefined();
  });

  /**
   * La projection du superset est ce qui distingue cette lecture de celle de la
   * file : elle porte les préférences de langue du Prisme. Le double honore le
   * `select`, donc ce témoin tombe si la projection cesse de les demander — ce
   * que ni la borne ni un témoin de rang ne verraient.
   */
  it('la projection porte les préférences de langue du Prisme', async () => {
    const { prisma, lectures } = monde([vivant('a')]);

    const rows = await fetchParticipantSuperset(prisma, CONV, 'socket', { cap: 10 });

    expect(lectures[0].select).toEqual(expect.objectContaining({
      joinedAt: true,
      user: { select: expect.objectContaining({ systemLanguage: true, deviceLocale: true }) },
    }));
    expect(rows?.[0].user).toEqual(expect.objectContaining({ systemLanguage: 'fr' }));
  });
});
