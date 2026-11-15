/**
 * #14080 — le relais d'un commentaire passe le seuil de l'AUTEUR ET celui du
 * COMMENTATEUR. Les suites qui éprouvent la FORME de l'éventail donnent leurs
 * amitiés du point de vue de l'auteur ; ce double les sert AUSSI au commentateur
 * (l'auteur remplacé par lui), pour que leurs amis passent les deux seuils.
 * Une requête dont le sujet n'est pas le commentateur reçoit les lignes telles quelles.
 */
import type { jest } from '@jest/globals';

type FriendRow = { readonly senderId: string; readonly receiverId: string } & Record<string, unknown>;
type SubjectQuery = { where?: { OR?: ReadonlyArray<{ senderId?: string }> } } | undefined;

const swap = (id: string, authorId: string, commenterId: string): string => (id === authorId ? commenterId : id);

export const sharedFriendships =
  (findMany: jest.Mock | ((...args: never[]) => unknown), authorId: string, commenterId: string) =>
  (rows: ReadonlyArray<FriendRow>): void => {
    (findMany as unknown as jest.Mock<(args?: SubjectQuery) => Promise<FriendRow[]>>).mockImplementation(async (args) => {
      if (args?.where?.OR?.[0]?.senderId !== commenterId) return [...rows];
      return rows
        .filter((row) => row.senderId !== commenterId && row.receiverId !== commenterId)
        .map((row) => ({
          ...row,
          senderId: swap(row.senderId, authorId, commenterId),
          receiverId: swap(row.receiverId, authorId, commenterId),
        }));
    });
  };
