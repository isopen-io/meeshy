/**
 * `utils/keyset-cursor.ts` — le curseur keyset partagé par toutes les listes
 * antichronologiques (fils de posts, commentaires, favoris de posts et de
 * messages, notifications).
 *
 * Le curseur est un paramètre de requête ATTAQUABLE. Tout ce que `decodeCursor`
 * rend part tel quel dans un `where` Prisma (`keysetBeforeClause`), sur une
 * colonne `id` déclarée `@db.ObjectId` : un `id` qui n'est pas un ObjectId y
 * fait lever P2023 « Malformed ObjectID », donc un 500 sur une entrée
 * contrôlée par l'appelant. Le témoin est posé ICI, sur le décodeur : un faux
 * Prisma accepte n'importe quel `id`, un témoin de route ne pourrait pas y
 * rougir.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { decodeCursor, encodeCursor } from '../../../utils/keyset-cursor';

const forge = (payload: unknown): string => Buffer.from(JSON.stringify(payload)).toString('base64url');

describe('decodeCursor — un curseur forgé est refusé, jamais remis à Prisma', () => {
  it('rend le curseur que encodeCursor a produit', () => {
    const cursor = encodeCursor(new Date('2026-09-21T00:00:00.000Z'), '68c000000000000000000001');

    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-09-21T00:00:00.000Z', id: '68c000000000000000000001' });
  });

  it.each([
    ['un id arbitraire', 'x'],
    ['un id de 23 caractères', '68c00000000000000000000'],
    ['un id de 25 caractères', '68c0000000000000000000011'],
    ['un id hexadécimal invalide', '68c00000000000000000000z'],
    ['un id vide', ''],
  ])('refuse %s', (_label, id) => {
    expect(decodeCursor(forge({ createdAt: '2026-09-21T00:00:00.000Z', id }))).toBeNull();
  });

  it('refuse une date illisible, même avec un id valide', () => {
    expect(decodeCursor(forge({ createdAt: 'hier', id: '68c000000000000000000001' }))).toBeNull();
  });
});
