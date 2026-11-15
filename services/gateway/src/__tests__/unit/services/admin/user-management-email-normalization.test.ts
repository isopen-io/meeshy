/**
 * UserManagementService — l'adresse écrite par l'administration (#8215)
 * @jest-environment node
 *
 * Toutes les portes publiques passent l'adresse par `normalizeEmail` et
 * vérifient son unicité SANS casse ; l'administration écrivait l'adresse brute.
 * L'index `User_email_key` étant sensible à la casse, `Foo@x.com` et
 * `foo@x.com` pouvaient coexister, et la connexion (insensible) choisissait
 * alors l'une des deux au hasard.
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

import { AdminIdentifierTakenError } from '../../../../services/admin/admin-identifier-taken';
import { makeUser, makePrisma, makeService } from './user-management-mocks';

const createDto = (email: string) => ({
  username: 'alice', firstName: 'Alice', lastName: 'Smith',
  email, password: 'pw',
  displayName: null, bio: null, phoneNumber: null,
});

describe('UserManagementService.createUser — adresse normalisée et unique', () => {
  it('stores the address trimmed and lower-cased', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser(createDto('  Foo@X.com ') as never);

    expect(create.mock.calls[0][0].data.email).toBe('foo@x.com');
  });

  it('looks for another account carrying the address regardless of case', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ findFirst, create }));

    await svc.createUser(createDto('Foo@X.com') as never);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ email: { equals: 'foo@x.com', mode: 'insensitive' } }),
    }));
  });

  it('refuses an address already carried by another account, and writes nothing', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'someone-else' });
    const create = jest.fn();
    const svc = makeService(makePrisma({ findFirst, create }));

    const refus = svc.createUser(createDto('FOO@x.com') as never);

    await expect(refus).rejects.toBeInstanceOf(AdminIdentifierTakenError);
    await expect(refus).rejects.toMatchObject({ field: 'email' });
    expect(create).not.toHaveBeenCalled();
  });

  it('turns a unique-index race on the address into the same typed refusal', async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: 'User_email_key' },
    }));
    const svc = makeService(makePrisma({ create }));

    await expect(svc.createUser(createDto('foo@x.com') as never)).rejects.toMatchObject({ field: 'email' });
  });
});

describe('UserManagementService.updateUser — adresse normalisée et unique', () => {
  it('stores a changed address normalised', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@x.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@x.com' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { email: ' New@X.com' } as never);

    expect(update.mock.calls[0][0].data.email).toBe('new@x.com');
  });

  it('excludes the edited account itself from the uniqueness check', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@x.com' }));
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ findFirst, findUnique, update }));

    await svc.updateUser('user-id', { email: 'New@X.com' } as never);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        email: { equals: 'new@x.com', mode: 'insensitive' },
        id: { not: 'user-id' },
      },
    }));
  });

  it('refuses an address carried by another account at case-insensitive equality', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'someone-else' });
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@x.com' }));
    const update = jest.fn();
    const svc = makeService(makePrisma({ findFirst, findUnique, update }));

    await expect(svc.updateUser('user-id', { email: 'TAKEN@x.com' } as never))
      .rejects.toMatchObject({ field: 'email' });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not query uniqueness when the patch does not carry an address', async () => {
    const findFirst = jest.fn();
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ findFirst, update }));

    await svc.updateUser('user-id', { bio: 'hello' } as never);

    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('UserManagementService — `updateEmail` sans appelant a quitté le service', () => {
  it('no longer exposes a second, unguarded address writer', () => {
    const svc = makeService();
    expect((svc as unknown as Record<string, unknown>).updateEmail).toBeUndefined();
  });
});
