/**
 * #14924 — désactiver ou supprimer un compte éteint les partages du rituel du Sang
 * qu'il avait consentis ET ceux qu'on lui avait consentis : un compte parti ne garde
 * aucun partage, et un compte réactivé ne retrouve pas un consentement périmé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { ritualSharesStore, SHARES_OFF, SHARES_ON } from '../../../helpers/ritual-shares-store';
import { makePrisma, makeUser } from './user-management-mocks';

const PARTI = '507f1f77bcf86cd799439011';
const AMI = '507f1f77bcf86cd799439022';
const TIERS = '507f1f77bcf86cd799439033';

const service = () => {
  const reglages = ritualSharesStore([
    { ownerId: PARTI, otherId: AMI, ...SHARES_ON },
    { ownerId: AMI, otherId: PARTI, ...SHARES_ON },
    { ownerId: AMI, otherId: TIERS, ...SHARES_ON },
  ]);
  const compte = { deactivatedAt: null as Date | null, deletedAt: null as Date | null };
  const update = jest.fn(async (args: { data: Partial<typeof compte> }) => {
    Object.assign(compte, { deactivatedAt: args.data.deactivatedAt ?? null, deletedAt: args.data.deletedAt ?? null });
    return makeUser(compte);
  });
  const findUnique = jest.fn(async () => ({ ...compte }));
  const prisma = makePrisma({ update: update as never, findUnique: findUnique as never });
  Object.assign(prisma, { relationFeatureSetting: reglages.relationFeatureSetting });
  return { svc: new UserManagementService(prisma), reglages };
};

const de = (rows: Array<Record<string, unknown>>, ownerId: string, otherId: string) =>
  rows.find((row) => row.ownerId === ownerId && row.otherId === otherId);

describe('#14924 — un compte qui part ne garde aucun partage du rituel', () => {
  it('la désactivation éteint les partages dans les deux sens, et laisse ceux des tiers', async () => {
    const { svc, reglages } = service();

    await svc.updateStatus(PARTI, { isActive: false });

    const rows = reglages.rows();
    expect(de(rows, PARTI, AMI)).toMatchObject(SHARES_OFF);
    expect(de(rows, AMI, PARTI)).toMatchObject(SHARES_OFF);
    expect(de(rows, AMI, TIERS)).toMatchObject(SHARES_ON);
  });

  it('la suppression (soft delete) fait de même', async () => {
    const { svc, reglages } = service();

    await svc.deleteUser(PARTI, AMI);

    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_OFF);
    expect(de(reglages.rows(), AMI, PARTI)).toMatchObject(SHARES_OFF);
  });

  it('la réactivation ne rallume rien', async () => {
    const { svc, reglages } = service();
    await svc.updateStatus(PARTI, { isActive: false });

    await svc.updateStatus(PARTI, { isActive: true });

    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_OFF);
  });

  it('un retrait échoué à la désactivation se solde à la réactivation : le compte revient sans partage allumé', async () => {
    const { svc, reglages } = service();
    reglages.relationFeatureSetting.updateMany.mockRejectedValueOnce(new Error('mongo down'));
    await svc.updateStatus(PARTI, { isActive: false });
    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_ON);

    await svc.updateStatus(PARTI, { isActive: true });

    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_OFF);
    expect(de(reglages.rows(), AMI, PARTI)).toMatchObject(SHARES_OFF);
    expect(de(reglages.rows(), AMI, TIERS)).toMatchObject(SHARES_ON);
  });

  it('la restauration d’un compte supprimé solde de même un retrait échoué', async () => {
    const { svc, reglages } = service();
    reglages.relationFeatureSetting.updateMany.mockRejectedValueOnce(new Error('mongo down'));
    await svc.deleteUser(PARTI, AMI);

    await svc.restoreUser(PARTI);

    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_OFF);
    expect(de(reglages.rows(), AMI, PARTI)).toMatchObject(SHARES_OFF);
  });

  it('un retrait encore en panne à la réactivation la refuse : le compte ne revient pas avec un partage allumé', async () => {
    const { svc, reglages } = service();
    reglages.relationFeatureSetting.updateMany.mockRejectedValueOnce(new Error('mongo down'));
    await svc.updateStatus(PARTI, { isActive: false });
    reglages.relationFeatureSetting.updateMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(svc.updateStatus(PARTI, { isActive: true })).rejects.toThrow('mongo down');
    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_ON);
  });

  it('activer un compte déjà actif ne touche à aucun partage', async () => {
    const { svc, reglages } = service();

    await svc.updateStatus(PARTI, { isActive: true });

    expect(de(reglages.rows(), PARTI, AMI)).toMatchObject(SHARES_ON);
    expect(reglages.relationFeatureSetting.updateMany).not.toHaveBeenCalled();
  });

  it('un retrait qui échoue ne fait pas échouer la désactivation', async () => {
    const { svc, reglages } = service();
    reglages.relationFeatureSetting.updateMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(svc.updateStatus(PARTI, { isActive: false })).resolves.toBeDefined();
  });
});
