/**
 * UserManagementService — l'administration n'écrit que de vraies adresses (#16492)
 * @jest-environment node
 *
 * La garde de domaine (#16491) couvrait l'inscription, l'adresse inconnue
 * devenue compte et le changement d'e-mail ; la création et la modification
 * par un administrateur écrivaient l'adresse saisie sans la consulter.
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../services/auth/email-domain-escape', () => ({ RESERVED_EMAIL_DOMAINS_ALLOWED: false }));

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

import { EmailDomainRefusedError } from '../../../../services/auth/email-domain-guard';
import { makeUser, makePrisma, makeService } from './user-management-mocks';

const createDto = (email: string) => ({
  username: 'alice', firstName: 'Alice', lastName: 'Smith',
  email, password: 'pw',
  displayName: null, bio: null, phoneNumber: null,
});

describe('UserManagementService.createUser — domaine de l’adresse', () => {
  it.each(['alice@example.com', 'alice@mailinator.com'])('refuses %s and writes nothing', async (email) => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await expect(svc.createUser(createDto(email) as never)).rejects.toBeInstanceOf(EmailDomainRefusedError);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts a real address', async () => {
    const create = jest.fn().mockResolvedValue(makeUser({ email: 'alice@gmail.com' }));
    const svc = makeService(makePrisma({ create }));

    await svc.createUser(createDto('alice@gmail.com') as never);

    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('UserManagementService.updateUser — domaine de l’adresse', () => {
  it('refuses a changed address on a disposable domain and writes nothing', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@gmail.com' }));
    const update = jest.fn();
    const svc = makeService(makePrisma({ findUnique, update }));

    await expect(svc.updateUser('user-id', { email: 'new@mailinator.com' } as never))
      .rejects.toBeInstanceOf(EmailDomainRefusedError);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a changed real address', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@gmail.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@gmail.com' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { email: 'new@gmail.com' } as never);

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps editing an existing account whose unchanged address sits on a reserved domain', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'seed@example.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'seed@example.com' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { email: 'Seed@Example.com', bio: 'hello' } as never);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
