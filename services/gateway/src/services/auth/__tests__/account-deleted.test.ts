/**
 * #10264 — « supprimé » ne se dit que d'un compte dont la suppression est
 * IRRÉVERSIBLE : une demande `AccountDeletionRequest` au statut `COMPLETED`
 * (purge confirmée, aucune annulation possible). Un client qui l'apprend purge
 * des données locales uniques ; tout état encore réversible garde le refus
 * générique :
 *
 *  - fin de grâce (`GRACE_PERIOD_EXPIRED`) : l'annulation rend encore le compte ;
 *  - suppression de MODÉRATION (`UserManagementService.deleteUser`) : elle
 *    écrit `isActive: false` + `deletedAt` + `deletedBy`, et `restoreUser`
 *    l'annule ;
 *  - simple désactivation.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { accountIsDeleted } from '../account-deleted';

const DATE = new Date('2026-10-01T00:00:00Z');

type Ligne = Record<string, unknown> | null;

const lecteur = (ligne: Ligne, statutsDesDemandes: readonly string[]) => ({
  user: { findUnique: async () => ligne },
  accountDeletionRequest: {
    findFirst: async ({ where }: { where: { userId: string; status: string } }) =>
      statutsDesDemandes.includes(where.status) ? { id: 'req-1' } : null,
  },
});

const desactive = { isActive: false, deletedAt: null };
const basculeDeSuppression = { isActive: false, deletedAt: DATE };
const suppressionDeModeration = { isActive: false, deactivatedAt: DATE, deletedAt: DATE, deletedBy: 'admin-id' };

describe('accountIsDeleted — seule une suppression IRRÉVERSIBLE est dite', () => {
  it('purge confirmée (`COMPLETED`) : supprimé', async () => {
    expect(await accountIsDeleted(lecteur(basculeDeSuppression, ['COMPLETED']) as never, 'u1')).toBe(true);
  });

  it('suppression de MODÉRATION, annulable par `restoreUser` : jamais dite supprimée', async () => {
    expect(await accountIsDeleted(lecteur(suppressionDeModeration, []) as never, 'u1')).toBe(false);
  });

  it('grâce expirée (`GRACE_PERIOD_EXPIRED`), encore annulable : jamais dite supprimée', async () => {
    expect(await accountIsDeleted(lecteur(basculeDeSuppression, ['GRACE_PERIOD_EXPIRED']) as never, 'u1')).toBe(false);
  });

  it('simple désactivation : jamais dite supprimée', async () => {
    expect(await accountIsDeleted(lecteur(desactive, []) as never, 'u1')).toBe(false);
  });

  it('demande `COMPLETED` mais compte de nouveau ACTIF (restauré à la main) : jamais dit supprimé', async () => {
    expect(await accountIsDeleted(lecteur({ isActive: true, deletedAt: null }, ['COMPLETED']) as never, 'u1')).toBe(false);
  });

  it('une lecture qui lève ne prouve rien : refus générique', async () => {
    const enPanne = {
      user: { findUnique: async () => basculeDeSuppression },
      accountDeletionRequest: { findFirst: async () => { throw new Error('mongo down'); } },
    };
    expect(await accountIsDeleted(enPanne as never, 'u1')).toBe(false);
  });
});
