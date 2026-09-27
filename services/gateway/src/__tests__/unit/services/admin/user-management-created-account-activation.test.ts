/**
 * UserManagementService.createUser — un compte créé par l'administration peut
 * naître ACTIF (#8217)
 * @jest-environment node
 *
 * Depuis #8055, un compte SANS numéro n'est actif qu'une fois son adresse
 * prouvée : sa première connexion rend `verification-required` et envoie un
 * code à l'adresse. Un administrateur qui ATTESTE l'adresse en créant le
 * compte (`emailVerified: true`) le rend connectable sur-le-champ — c'est le
 * même geste que `PATCH /admin/users/:id/verifications`, posé à la naissance.
 * Sans attestation, la règle #8055 s'applique telle quelle.
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
}));

import { makeUser, makePrisma, makeService } from './user-management-mocks';

const dto = (extra: Record<string, unknown> = {}) => ({
  username: 'alice', firstName: 'Alice', lastName: 'Smith',
  email: 'alice@example.com', password: 'pw',
  displayName: null, bio: null, phoneNumber: null,
  ...extra,
});

describe('UserManagementService.createUser — attestation de l’adresse', () => {
  it('pose emailVerifiedAt quand l’administrateur atteste l’adresse', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser(dto({ emailVerified: true }) as never);

    expect(create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('n’atteste rien par défaut : la preuve par code (#8055) reste due', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser(dto() as never);

    expect(create.mock.calls[0][0].data).not.toHaveProperty('emailVerifiedAt');
  });
});
