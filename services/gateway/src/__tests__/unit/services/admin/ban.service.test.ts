import { BanService, estEnVigueur } from '../../../../services/admin/ban.service';
import type { UserManagementService } from '../../../../services/admin/user-management.service';

describe('estEnVigueur', () => {
  const maintenant = new Date('2026-09-07T00:00:00Z');

  it('un ban permanent, jamais levé, est en vigueur', () => {
    expect(estEnVigueur({ liftedAt: null, expiresAt: null }, maintenant)).toBe(true);
  });

  it('un ban à échéance future est en vigueur', () => {
    expect(estEnVigueur({ liftedAt: null, expiresAt: new Date('2026-09-08') }, maintenant)).toBe(true);
  });

  it('un ban à échéance passée n’est plus en vigueur', () => {
    expect(estEnVigueur({ liftedAt: null, expiresAt: new Date('2026-09-01') }, maintenant)).toBe(false);
  });

  it('un ban levé n’est plus en vigueur, même permanent', () => {
    expect(estEnVigueur({ liftedAt: new Date('2026-09-02'), expiresAt: null }, maintenant)).toBe(false);
  });
});

describe('BanService', () => {
  const prisma = {
    ban: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const ums: Pick<UserManagementService, 'updateStatus'> = {
    updateStatus: jest.fn(),
  };

  const service = new BanService(prisma as never, ums as UserManagementService);

  beforeEach(() => jest.clearAllMocks());

  describe('createBan', () => {
    it('écrit la ligne Ban et désactive le compte', async () => {
      const cree = { id: 'ban1', userId: 'u1', bannedById: 'admin1', reason: 'Spam', expiresAt: null, createdAt: new Date(), liftedAt: null, liftedById: null, liftReason: null };
      prisma.ban.create.mockResolvedValue(cree);

      const resultat = await service.createBan({ userId: 'u1', bannedById: 'admin1', reason: 'Spam' });

      expect(prisma.ban.create).toHaveBeenCalledWith({
        data: { userId: 'u1', bannedById: 'admin1', reason: 'Spam', expiresAt: null },
      });
      expect(ums.updateStatus).toHaveBeenCalledWith('u1', { isActive: false });
      expect(resultat).toBe(cree);
    });
  });

  describe('liftBan', () => {
    const banLeve = { id: 'ban1', userId: 'u1', bannedById: 'admin1', reason: 'Spam', expiresAt: null, createdAt: new Date(), liftedAt: new Date(), liftedById: 'admin2', liftReason: 'Erreur' };

    it('réactive le compte quand aucun autre ban n’est en vigueur', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue({ id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: null });
      prisma.ban.update.mockResolvedValue(banLeve);
      prisma.ban.findMany.mockResolvedValue([]); // listActiveBans exclut ban1, ne trouve rien d'autre

      const resultat = await service.liftBan({ banId: 'ban1', liftedById: 'admin2', liftReason: 'Erreur' });

      expect(prisma.ban.update).toHaveBeenCalledWith({
        where: { id: 'ban1' },
        data: { liftedAt: expect.any(Date), liftedById: 'admin2', liftReason: 'Erreur' },
      });
      expect(ums.updateStatus).toHaveBeenCalledWith('u1', { isActive: true });
      expect(resultat).toBe(banLeve);
    });

    it('ne réactive PAS le compte quand un autre ban reste en vigueur', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue({ id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: null });
      prisma.ban.update.mockResolvedValue(banLeve);
      // Un second ban permanent, non levé, toujours actif pour ce même utilisateur.
      prisma.ban.findMany.mockResolvedValue([{ id: 'ban2', userId: 'u1', liftedAt: null, expiresAt: null }]);

      await service.liftBan({ banId: 'ban1', liftedById: 'admin2' });

      expect(ums.updateStatus).not.toHaveBeenCalled();
    });

    it('exclut le ban qu’on lève lui-même de la vérification des bans restants', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue({ id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: null });
      prisma.ban.update.mockResolvedValue(banLeve);
      prisma.ban.findMany.mockResolvedValue([]);

      await service.liftBan({ banId: 'ban1', liftedById: 'admin2' });

      expect(prisma.ban.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', liftedAt: null, id: { not: 'ban1' } },
      });
    });
  });

  describe('listBans', () => {
    it('trie du plus récent au plus ancien', async () => {
      prisma.ban.findMany.mockResolvedValue([]);

      await service.listBans('u1');

      expect(prisma.ban.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } });
    });
  });

  describe('expireBan (#5527)', () => {
    const maintenant = new Date('2026-09-07T12:00:00Z');
    const echeance = new Date('2026-09-07T00:00:00Z'); // déjà passée
    const banEchu = { id: 'ban1', userId: 'u1', bannedById: 'admin1', reason: 'Spam', expiresAt: echeance, createdAt: new Date('2026-08-31'), liftedAt: null, liftedById: null, liftReason: null };

    it('lève le ban : liftedAt = expiresAt, liftedById = null, liftReason = expired', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue(banEchu);
      prisma.ban.update.mockResolvedValue({ ...banEchu, liftedAt: echeance, liftReason: 'expired' });
      prisma.ban.findMany.mockResolvedValue([]); // aucun autre ban en vigueur

      await service.expireBan('ban1', maintenant);

      expect(prisma.ban.update).toHaveBeenCalledWith({
        where: { id: 'ban1' },
        data: { liftedAt: echeance, liftedById: null, liftReason: 'expired' },
      });
    });

    it('réactive le compte quand aucun autre ban n’est en vigueur, et le rend', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue(banEchu);
      prisma.ban.update.mockResolvedValue({ ...banEchu, liftedAt: echeance, liftReason: 'expired' });
      prisma.ban.findMany.mockResolvedValue([]);

      const resultat = await service.expireBan('ban1', maintenant);

      expect(ums.updateStatus).toHaveBeenCalledWith('u1', { isActive: true });
      expect(resultat.reactivated).toBe(true);
    });

    it('ne réactive PAS le compte quand un autre ban reste en vigueur, et le dit', async () => {
      prisma.ban.findUniqueOrThrow.mockResolvedValue(banEchu);
      prisma.ban.update.mockResolvedValue({ ...banEchu, liftedAt: echeance, liftReason: 'expired' });
      prisma.ban.findMany.mockResolvedValue([{ id: 'ban2', userId: 'u1', liftedAt: null, expiresAt: null }]);

      const resultat = await service.expireBan('ban1', maintenant);

      expect(ums.updateStatus).not.toHaveBeenCalled();
      expect(resultat.reactivated).toBe(false);
    });

    it('sur un ban permanent (expiresAt null, cas limite), retombe sur `now` pour liftedAt', async () => {
      const banPermanent = { ...banEchu, expiresAt: null };
      prisma.ban.findUniqueOrThrow.mockResolvedValue(banPermanent);
      prisma.ban.update.mockResolvedValue({ ...banPermanent, liftedAt: maintenant, liftReason: 'expired' });
      prisma.ban.findMany.mockResolvedValue([]);

      await service.expireBan('ban1', maintenant);

      expect(prisma.ban.update).toHaveBeenCalledWith({
        where: { id: 'ban1' },
        data: { liftedAt: maintenant, liftedById: null, liftReason: 'expired' },
      });
    });
  });
});
