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

  describe('liftBan — lever automatique (#5527)', () => {
    it('accepte liftedById: null et un liftedAt personnalisé', async () => {
      const echeance = new Date('2026-09-01T00:00:00Z');
      const banLeve = { id: 'ban1', userId: 'u1', bannedById: 'admin1', reason: 'Spam', expiresAt: echeance, createdAt: new Date(), liftedAt: echeance, liftedById: null, liftReason: 'expired' };
      prisma.ban.findUniqueOrThrow.mockResolvedValue({ id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: echeance });
      prisma.ban.update.mockResolvedValue(banLeve);
      prisma.ban.findMany.mockResolvedValue([]);

      const resultat = await service.liftBan({ banId: 'ban1', liftedById: null, liftReason: 'expired', liftedAt: echeance });

      expect(prisma.ban.update).toHaveBeenCalledWith({
        where: { id: 'ban1' },
        data: { liftedAt: echeance, liftedById: null, liftReason: 'expired' },
      });
      expect(resultat).toBe(banLeve);
    });
  });

  describe('sweepExpiredBans', () => {
    it('ne lève rien quand aucun ban n’a expiré', async () => {
      prisma.ban.findMany.mockResolvedValue([]);

      const resultat = await service.sweepExpiredBans(new Date('2026-09-07T00:00:00Z'));

      expect(resultat).toEqual([]);
      expect(prisma.ban.update).not.toHaveBeenCalled();
      expect(ums.updateStatus).not.toHaveBeenCalled();
    });

    it('interroge les bans non levés dont l’échéance est passée ou égale à `now`', async () => {
      const maintenant = new Date('2026-09-07T00:00:00Z');
      prisma.ban.findMany.mockResolvedValue([]);

      await service.sweepExpiredBans(maintenant);

      expect(prisma.ban.findMany).toHaveBeenCalledWith({
        where: { liftedAt: null, expiresAt: { not: null, lte: maintenant } },
      });
    });

    it('lève un ban expiré : liftedAt = expiresAt, liftedById = null, liftReason = expired, et réactive le compte', async () => {
      const echeance = new Date('2026-09-01T00:00:00Z');
      const expire = { id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: echeance };
      const banLeve = { ...expire, bannedById: 'admin1', reason: 'Spam', createdAt: new Date(), liftedAt: echeance, liftedById: null, liftReason: 'expired' };

      prisma.ban.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve('id' in (where ?? {}) ? [] : [expire])
      );
      prisma.ban.findUniqueOrThrow.mockResolvedValue(expire);
      prisma.ban.update.mockResolvedValue(banLeve);

      const resultat = await service.sweepExpiredBans();

      expect(prisma.ban.update).toHaveBeenCalledWith({
        where: { id: 'ban1' },
        data: { liftedAt: echeance, liftedById: null, liftReason: 'expired' },
      });
      expect(ums.updateStatus).toHaveBeenCalledWith('u1', { isActive: true });
      expect(resultat).toEqual([banLeve]);
    });

    it('ne réactive PAS le compte quand un autre ban reste en vigueur', async () => {
      const echeance = new Date('2026-09-01T00:00:00Z');
      const expire = { id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: echeance };
      const banLeve = { ...expire, liftedAt: echeance, liftedById: null, liftReason: 'expired' };

      prisma.ban.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve('id' in (where ?? {}) ? [{ id: 'ban2', userId: 'u1', liftedAt: null, expiresAt: null }] : [expire])
      );
      prisma.ban.findUniqueOrThrow.mockResolvedValue(expire);
      prisma.ban.update.mockResolvedValue(banLeve);

      await service.sweepExpiredBans();

      expect(ums.updateStatus).not.toHaveBeenCalled();
    });

    it('lève chaque ban expiré indépendamment, pour des utilisateurs distincts', async () => {
      const expire1 = { id: 'ban1', userId: 'u1', liftedAt: null, expiresAt: new Date('2026-09-01T00:00:00Z') };
      const expire2 = { id: 'ban2', userId: 'u2', liftedAt: null, expiresAt: new Date('2026-09-02T00:00:00Z') };

      prisma.ban.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve('id' in (where ?? {}) ? [] : [expire1, expire2])
      );
      prisma.ban.findUniqueOrThrow.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'ban1' ? expire1 : expire2)
      );
      prisma.ban.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, userId: where.id === 'ban1' ? 'u1' : 'u2', ...data })
      );

      const resultat = await service.sweepExpiredBans();

      expect(resultat).toHaveLength(2);
      expect(ums.updateStatus).toHaveBeenCalledWith('u1', { isActive: true });
      expect(ums.updateStatus).toHaveBeenCalledWith('u2', { isActive: true });
    });
  });
});
