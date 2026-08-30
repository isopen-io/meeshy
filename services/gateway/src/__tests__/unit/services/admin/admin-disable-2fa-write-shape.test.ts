/**
 * Désarmer le second facteur depuis l'administration aboutit (#4206).
 *
 * `UserManagementService.disable2FA` écrivait `twoFactorBackupCodes: null` sur
 * un champ que le schéma déclare `String[] @default([])` — une liste scalaire
 * NON nullable. Prisma refusait l'écriture, le `catch` de la route la
 * convertissait en « Internal server error », et le geste de support qui existe
 * précisément pour l'utilisateur AYANT PERDU son appareil de second facteur
 * était indisponible — sans jamais écrire sa ligne d'audit.
 *
 * Le même geste est écrit DEUX fois dans le dépôt, et c'est la moitié
 * ADMINISTRATEUR qui était pauvre : `TwoFactorService.disable2FA` vide bien la
 * liste (`[]`) et efface en plus `twoFactorPendingSecret`. Le témoin porte donc
 * les DEUX affirmations — la forme que Prisma accepte, et la parité avec le
 * jumeau qui, lui, fonctionne.
 *
 * Pourquoi un double STRICT : un `jest.fn()` ordinaire accepte `null` sans
 * broncher et resterait vert sur le code fautif. Le double ci-dessous rejoue la
 * seule règle qui compte ici — une liste scalaire ne reçoit qu'un tableau —,
 * de sorte que le témoin tombe pour la raison RÉELLE, pas par ressemblance.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserManagementService } from '../../../../services/admin/user-management.service';

/** Les champs que `twoFactorEnabledAt` gouverne, tels que le chemin UTILISATEUR les efface. */
const CHAMPS_DU_SECOND_FACTEUR = [
  'twoFactorSecret',
  'twoFactorPendingSecret',
  'twoFactorBackupCodes',
  'twoFactorEnabledAt',
] as const;

/** Les colonnes que `schema.prisma` déclare `String[]` — elles n'acceptent jamais `null`. */
const LISTES_SCALAIRES = new Set(['twoFactorBackupCodes']);

function prismaStrict() {
  const update = jest.fn(async (args: { data: Record<string, unknown> }) => {
    for (const [champ, valeur] of Object.entries(args.data ?? {})) {
      if (LISTES_SCALAIRES.has(champ) && !Array.isArray(valeur)) {
        throw new Error(
          `Argument \`${champ}\`: Invalid value provided. Expected StringFieldUpdateOperationsInput or String[], provided ${valeur === null ? 'null' : typeof valeur}.`
        );
      }
    }
    return { id: '507f1f77bcf86cd799439011' };
  });

  return {
    prisma: { user: { update } } as unknown as PrismaClient,
    update,
  };
}

describe('UserManagementService.disable2FA — l’écriture que Prisma accepte', () => {
  it('aboutit au lieu de faire échouer la requête sur une liste scalaire', async () => {
    const { prisma, update } = prismaStrict();
    const svc = new UserManagementService(prisma);

    await expect(svc.disable2FA('507f1f77bcf86cd799439011', 'admin-1')).resolves.toBeDefined();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('VIDE la liste des codes de secours au lieu de l’annuler', async () => {
    const { prisma, update } = prismaStrict();
    const svc = new UserManagementService(prisma);

    await svc.disable2FA('507f1f77bcf86cd799439011', 'admin-1');

    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Array.isArray(data.twoFactorBackupCodes)).toBe(true);
    expect(data.twoFactorBackupCodes).toEqual([]);
    expect(data.twoFactorBackupCodes).not.toBeNull();
  });

  it('efface les mêmes champs que le désarmement fait par l’utilisateur lui-même', async () => {
    const { prisma, update } = prismaStrict();
    const svc = new UserManagementService(prisma);

    await svc.disable2FA('507f1f77bcf86cd799439011', 'admin-1');

    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    for (const champ of CHAMPS_DU_SECOND_FACTEUR) {
      expect(Object.hasOwn(data, champ)).toBe(true);
    }
    // Un secret d'installation EN COURS survivait au désarmement : la personne
    // pouvait reprendre l'appairage là où elle l'avait laissé.
    expect(data.twoFactorPendingSecret).toBeNull();
    expect(data.twoFactorSecret).toBeNull();
    expect(data.twoFactorEnabledAt).toBeNull();
  });
});
