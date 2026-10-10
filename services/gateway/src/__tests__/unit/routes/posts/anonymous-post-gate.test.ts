/**
 * #9149 — CE QU'UN VISITEUR SANS COMPTE A LE DROIT DE LIRE.
 *
 * Une publication PUBLIQUE, vivante (ni supprimée ni expirée), d'un auteur
 * actif, et — si c'est une republication — dont l'ORIGINAL est lui-même
 * public et vivant. Tout le reste est refusé, et refusé de la même façon
 * qu'une publication inexistante.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  isServableToAnonymous,
  mayServePostToAnonymous,
  type AnonymousPostAclRow,
} from '../../../../routes/posts/anonymousPostGate';
import { postInclude } from '../../../../services/posts/postIncludes';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const POST_ID = '507f1f77bcf86cd799439022';

const row = (overrides: Partial<AnonymousPostAclRow> = {}): AnonymousPostAclRow => ({
  visibility: 'PUBLIC',
  deletedAt: null,
  expiresAt: null,
  repostOfId: null,
  author: { isActive: true, deletedAt: null, deactivatedAt: null },
  repostOf: null,
  ...overrides,
});

describe('isServableToAnonymous', () => {
  it('sert une publication publique, vivante, d’un auteur actif', () => {
    expect(isServableToAnonymous(row(), NOW)).toBe(true);
  });

  it.each(['FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'] as const)('refuse la visibilité %s', (visibility) => {
    expect(isServableToAnonymous(row({ visibility }), NOW)).toBe(false);
  });

  it('refuse une publication supprimée', () => {
    expect(isServableToAnonymous(row({ deletedAt: new Date('2026-10-01T00:00:00.000Z') }), NOW)).toBe(false);
  });

  it('refuse une story expirée, sert une story encore vivante', () => {
    expect(isServableToAnonymous(row({ expiresAt: new Date('2026-10-02T11:59:59.000Z') }), NOW)).toBe(false);
    expect(isServableToAnonymous(row({ expiresAt: new Date('2026-10-02T12:00:00.000Z') }), NOW)).toBe(false);
    expect(isServableToAnonymous(row({ expiresAt: new Date('2026-10-02T13:00:00.000Z') }), NOW)).toBe(true);
  });

  it('refuse l’auteur désactivé, supprimé ou absent', () => {
    expect(isServableToAnonymous(row({ author: { isActive: false, deletedAt: null, deactivatedAt: null } }), NOW)).toBe(false);
    expect(isServableToAnonymous(row({ author: { isActive: true, deletedAt: NOW, deactivatedAt: null } }), NOW)).toBe(false);
    expect(isServableToAnonymous(row({ author: { isActive: true, deletedAt: null, deactivatedAt: NOW } }), NOW)).toBe(false);
    expect(isServableToAnonymous(row({ author: null }), NOW)).toBe(false);
  });

  it('une republication publique d’un original réservé aux amis ne sert pas l’original', () => {
    const repost = row({
      repostOfId: '507f1f77bcf86cd799439033',
      repostOf: { visibility: 'FRIENDS', deletedAt: null, expiresAt: null },
    });
    expect(isServableToAnonymous(repost, NOW)).toBe(false);
  });

  it('une republication dont l’original a disparu est refusée', () => {
    expect(isServableToAnonymous(row({ repostOfId: '507f1f77bcf86cd799439033', repostOf: null }), NOW)).toBe(false);
  });

  it('une republication d’un original public et vivant est servie', () => {
    const repost = row({
      repostOfId: '507f1f77bcf86cd799439033',
      repostOf: { visibility: 'PUBLIC', deletedAt: null, expiresAt: null },
    });
    expect(isServableToAnonymous(repost, NOW)).toBe(true);
  });

  it('une republication d’un original expiré ou supprimé est refusée', () => {
    const expired = row({
      repostOfId: '507f1f77bcf86cd799439033',
      repostOf: { visibility: 'PUBLIC', deletedAt: null, expiresAt: new Date('2026-10-01T00:00:00.000Z') },
    });
    const deleted = row({
      repostOfId: '507f1f77bcf86cd799439033',
      repostOf: { visibility: 'PUBLIC', deletedAt: NOW, expiresAt: null },
    });
    expect(isServableToAnonymous(expired, NOW)).toBe(false);
    expect(isServableToAnonymous(deleted, NOW)).toBe(false);
  });
});

describe('mayServePostToAnonymous', () => {
  const prismaWith = (found: AnonymousPostAclRow | null) => {
    const findFirst = jest.fn<(arg: unknown) => Promise<AnonymousPostAclRow | null>>().mockResolvedValue(found);
    return { prisma: { post: { findFirst } }, findFirst };
  };

  it('lit la publication NON supprimée par son identifiant, et la juge', async () => {
    const { prisma, findFirst } = prismaWith(row());
    await expect(mayServePostToAnonymous(prisma, POST_ID, NOW)).resolves.toBe(true);
    const where = (findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ id: POST_ID, deletedAt: { isSet: false } });
  });

  it('refuse une publication introuvable', async () => {
    const { prisma } = prismaWith(null);
    await expect(mayServePostToAnonymous(prisma, POST_ID, NOW)).resolves.toBe(false);
  });

  it('refuse un identifiant malformé sans interroger la base', async () => {
    const { prisma, findFirst } = prismaWith(row());
    await expect(mayServePostToAnonymous(prisma, 'pas-un-id', NOW)).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('la forme servie d’une publication ne porte aucune présence', () => {
  const keysDeep = (value: unknown): string[] =>
    value === null || typeof value !== 'object'
      ? []
      : Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [key, ...keysDeep(child)]);

  it('ni isOnline ni lastActiveAt dans `postInclude`, à aucune profondeur', () => {
    const keys = keysDeep(postInclude);
    expect(keys).not.toContain('isOnline');
    expect(keys).not.toContain('lastActiveAt');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('phoneNumber');
  });
});
