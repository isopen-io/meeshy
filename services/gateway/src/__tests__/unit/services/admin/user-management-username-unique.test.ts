/**
 * UserManagementService.createUser — un pseudonyme déjà porté se refuse (#8217)
 * @jest-environment node
 *
 * La création d'un compte par l'administration tombait en 500 sur un
 * pseudonyme pris (violation de l'index `User_username_key`), et passait sur
 * un pseudonyme pris À LA CASSE PRÈS — que l'inscription publique refuse
 * (`registration-identity.ts`, `mode: 'insensitive'`).
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
}));

import { makeUser, makePrisma, makeService } from './user-management-mocks';

const createDto = (username: string) => ({
  username, firstName: 'Alice', lastName: 'Smith',
  email: 'alice@example.com', password: 'pw',
  displayName: null, bio: null, phoneNumber: null,
});

describe('UserManagementService.createUser — pseudonyme unique à la casse près', () => {
  it('refuses a username carried by another account regardless of case, and writes nothing', async () => {
    const findFirst = jest.fn(async (args: { where: Record<string, unknown> }) =>
      'username' in args.where ? { id: 'someone-else' } : null);
    const create = jest.fn();
    const svc = makeService(makePrisma({ findFirst, create }));

    await expect(svc.createUser(createDto('Alice') as never)).rejects.toMatchObject({ field: 'username' });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { username: { equals: 'Alice', mode: 'insensitive' } },
    }));
    expect(create).not.toHaveBeenCalled();
  });

  it('turns a unique-index race on the username into the same typed refusal', async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: 'User_username_key' },
    }));
    const svc = makeService(makePrisma({ create }));

    await expect(svc.createUser(createDto('alice') as never)).rejects.toMatchObject({ field: 'username' });
  });

  it('creates the account when neither the address nor the username is taken', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser(createDto('alice') as never);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
