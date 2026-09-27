/**
 * TOUTE ACTION QUI VIENT D'UN E-MAIL PROUVE L'ADRESSE ET ACTIVE LE COMPTE
 * (#8238, précision porteur 2026-09-27) — la fonction UNIQUE que chaque porte
 * appelle : lien magique et lien du résumé, réinitialisation de mot de passe,
 * code et lien de vérification.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  emailProofFields,
  proveEmailAddress,
  settleEmailAddressProof,
} from '../../../services/auth/email-address-proof';
import { ACTIVATION_GRACE_EPOCH, resolveAccountActivation } from '../../../services/auth/account-activation';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(ACTIVATION_GRACE_EPOCH.getTime() + 60 * DAY_MS);

type Row = { id: string; emailVerifiedAt: Date | null; createdAt: Date; phoneNumber: string | null };

const blockedAccount = (): Row => ({
  id: 'user-1',
  emailVerifiedAt: null,
  createdAt: new Date(ACTIVATION_GRACE_EPOCH.getTime() + DAY_MS),
  phoneNumber: null,
});

const harness = (row: Row | null) => {
  const findUnique = jest.fn(async () => row) as jest.Mock<any>;
  const updateMany = jest.fn(async () => ({ count: row && !row.emailVerifiedAt ? 1 : 0 })) as jest.Mock<any>;
  const watchUpdateMany = jest.fn(async () => ({ count: 1 })) as jest.Mock<any>;
  const del = jest.fn(async () => undefined) as jest.Mock<any>;
  const announce = jest.fn();
  const deps = {
    prisma: { user: { findUnique, updateMany }, emailVerificationWatch: { updateMany: watchUpdateMany } },
    cache: { del },
    announce,
  };
  return { deps, findUnique, updateMany, watchUpdateMany, del, announce };
};

describe("le fragment d'écriture — la seule règle qui date une adresse prouvée par e-mail", () => {
  it("pose `emailVerifiedAt` quand l'adresse ne l'était pas", () => {
    expect(emailProofFields({ emailVerifiedAt: null }, NOW)).toEqual({ emailVerifiedAt: NOW });
  });

  it("ne réécrit jamais une date déjà posée", () => {
    expect(emailProofFields({ emailVerifiedAt: new Date(0) }, NOW)).toEqual({});
  });
});

describe('proveEmailAddress', () => {
  it('un compte BLOQUÉ passe à `done` par la preuve', async () => {
    const row = blockedAccount();
    expect(resolveAccountActivation(row, NOW).phase).toBe('blocked');

    const { deps, updateMany } = harness(row);
    const outcome = await proveEmailAddress(deps as never, { userId: 'user-1', now: NOW });

    expect(outcome).toEqual({ newlyProven: true });
    const write = (updateMany.mock.calls[0] as [{ where: Record<string, unknown>; data: Record<string, unknown> }])[0];
    expect(write.where).toMatchObject({ id: 'user-1' });
    expect(write.data).toEqual({ emailVerifiedAt: NOW });
    expect(resolveAccountActivation({ ...row, emailVerifiedAt: NOW }, NOW).phase).toBe('done');
  });

  it("marque les attentes prouvées, vide le cache d'auth du compte et annonce l'arrivée", async () => {
    const { deps, watchUpdateMany, del, announce } = harness(blockedAccount());
    await proveEmailAddress(deps as never, { userId: 'user-1', now: NOW });

    expect(watchUpdateMany).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('auth:user:user-1');
    expect(announce).toHaveBeenCalledWith('user-1');
  });

  it("une adresse déjà prouvée n'est ni réécrite ni réannoncée", async () => {
    const { deps, updateMany, announce } = harness({ ...blockedAccount(), emailVerifiedAt: new Date(0) });
    const outcome = await proveEmailAddress(deps as never, { userId: 'user-1', now: NOW });

    expect(outcome).toEqual({ newlyProven: false });
    expect(updateMany).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("une panne de l'écriture ne coûte pas la connexion : la preuve est rendue non faite", async () => {
    const { deps, updateMany } = harness(blockedAccount());
    updateMany.mockRejectedValueOnce(new Error('mongo'));
    await expect(proveEmailAddress(deps as never, { userId: 'user-1', now: NOW })).resolves.toEqual({ newlyProven: false });
  });
});

describe('settleEmailAddressProof — ce qui suit une preuve écrite ailleurs (dans une transaction)', () => {
  it("n'annonce que ce qui vient d'être prouvé", async () => {
    const { deps, announce, del } = harness(null);
    await settleEmailAddressProof(deps as never, { userId: 'user-1', now: NOW, newlyProven: false });
    expect(announce).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('auth:user:user-1');
  });
});
