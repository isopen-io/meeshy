import { MongoPersistence } from '../../memory/mongo-persistence';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Le vivier tel qu'il est EN PRODUCTION : des centaines de participants dont
 * `lastActiveAt` porte la MÊME valeur à la seconde près — la date du seed
 * (`Mar 11 2026 18:34:36`). Un `orderBy: { lastActiveAt: 'asc' }` n'a alors
 * aucun pouvoir discriminant : Mongo rend l'ordre naturel de la collection et
 * `take: limit` élit toujours les mêmes.
 *
 * Mesuré sur `68f2a81417a557e8ce4ddfbb` : 276 participants, 252 éligibles,
 * 5 rôles — le plafond. Les 247 autres n'ont jamais été atteints (#5663).
 */
function viviersExAequo(taille: number, memeDate = new Date('2026-03-11T18:34:36Z')) {
  return Array.from({ length: taille }, (_, i) => ({
    user: {
      id: `user-${i}`,
      displayName: `Dormeur ${i}`,
      username: `dormeur_${i}`,
      systemLanguage: 'fr',
      agentGlobalProfile: null,
      lastActiveAt: memeDate,
    },
  }));
}

describe('MongoPersistence.getPotentialControlledUsers() — le tirage ne fige pas le vivier', () => {
  const prismaAvecVivier = (taille: number) =>
    ({
      agentUserRole: { findMany: jest.fn().mockResolvedValue([]) },
      participant: { findMany: jest.fn().mockResolvedValue(viviersExAequo(taille)) },
    }) as never;

  it('ne rend pas systématiquement le même ensemble sur un vivier ex æquo', async () => {
    const tirages = new Set<string>();

    for (let essai = 0; essai < 12; essai += 1) {
      const persistence = new MongoPersistence(prismaAvecVivier(200));
      const elus = await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);
      tirages.add(elus.map((u) => u.id).sort().join(','));
    }

    // Douze tirages dans un vivier de 200 : un tirage figé n'en produirait qu'UN.
    expect(tirages.size).toBeGreaterThan(1);
  });

  it('respecte la limite demandée', async () => {
    const persistence = new MongoPersistence(prismaAvecVivier(200));
    const elus = await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);

    expect(elus).toHaveLength(3);
  });

  it('rend tout le vivier quand il est plus petit que la limite, sans doublon', async () => {
    const persistence = new MongoPersistence(prismaAvecVivier(2));
    const elus = await persistence.getPotentialControlledUsers('conv-1', 5, 72, [], []);

    expect(elus).toHaveLength(2);
    expect(new Set(elus.map((u) => u.id)).size).toBe(2);
  });

  it('atteint, sur un grand nombre de tirages, des personnes hors des premières places', async () => {
    const vus = new Set<string>();

    for (let essai = 0; essai < 25; essai += 1) {
      const persistence = new MongoPersistence(prismaAvecVivier(200));
      const elus = await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);
      elus.forEach((u) => vus.add(u.id));
    }

    // Le défaut de #5663 : seuls `user-0..user-2` sortaient, indéfiniment.
    const horsTete = [...vus].filter((id) => !['user-0', 'user-1', 'user-2'].includes(id));
    expect(horsTete.length).toBeGreaterThan(0);
  });
});

describe('MongoPersistence.evictStaleRoles() — une place ne se garde pas à vie', () => {
  const roleStale = (over: Partial<{ id: string; userId: string; conversationId: string; lastUsedAt: Date | null; createdAt: Date }> = {}) => ({
    id: over.id ?? 'r1',
    userId: over.userId ?? 'u1',
    conversationId: over.conversationId ?? 'conv-1',
    lastUsedAt: over.lastUsedAt === undefined ? new Date(Date.now() - 40 * DAY) : over.lastUsedAt,
    createdAt: over.createdAt ?? new Date(Date.now() - 60 * DAY),
  });

  const prismaAvec = (roles: ReturnType<typeof roleStale>[], manualUserIds: string[] = []) =>
    ({
      agentUserRole: {
        findMany: jest.fn().mockResolvedValue(roles),
        deleteMany: jest.fn().mockResolvedValue({ count: roles.length }),
      },
      agentConfig: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'conv-1', manualUserIds, roleMaxIdleDays: 14 },
        ]),
      },
    }) as never;

  it('libère un rôle auto qui n\'a pas servi depuis le délai configuré', async () => {
    const prisma = prismaAvec([roleStale({ id: 'r1', lastUsedAt: new Date(Date.now() - 40 * DAY) })]);
    const persistence = new MongoPersistence(prisma);

    expect(await persistence.evictStaleRoles()).toBe(1);
    expect((prisma as never as { agentUserRole: { deleteMany: jest.Mock } }).agentUserRole.deleteMany)
      .toHaveBeenCalledWith({ where: { id: { in: ['r1'] } } });
  });

  it('garde un rôle qui a servi récemment', async () => {
    const prisma = prismaAvec([roleStale({ id: 'r1', lastUsedAt: new Date(Date.now() - 2 * DAY) })]);
    const persistence = new MongoPersistence(prisma);

    expect(await persistence.evictStaleRoles()).toBe(0);
    expect((prisma as never as { agentUserRole: { deleteMany: jest.Mock } }).agentUserRole.deleteMany)
      .not.toHaveBeenCalled();
  });

  it('juge un rôle JAMAIS utilisé sur sa date de création', async () => {
    // Les 78 rôles déjà en base n'ont pas de `lastUsedAt` : sans repli sur
    // `createdAt`, ils seraient soit tous gardés, soit tous libérés.
    const prisma = prismaAvec([roleStale({ id: 'r1', lastUsedAt: null, createdAt: new Date(Date.now() - 60 * DAY) })]);
    const persistence = new MongoPersistence(prisma);

    expect(await persistence.evictStaleRoles()).toBe(1);
  });

  it('garde un rôle JAMAIS utilisé mais créé récemment', async () => {
    const prisma = prismaAvec([roleStale({ id: 'r1', lastUsedAt: null, createdAt: new Date(Date.now() - 1 * DAY) })]);
    const persistence = new MongoPersistence(prisma);

    expect(await persistence.evictStaleRoles()).toBe(0);
  });

  it('ne libère JAMAIS un utilisateur piloté manuellement', async () => {
    const prisma = prismaAvec([roleStale({ id: 'r1', userId: 'u1', lastUsedAt: new Date(Date.now() - 400 * DAY) })], ['u1']);
    const persistence = new MongoPersistence(prisma);

    expect(await persistence.evictStaleRoles()).toBe(0);
  });
});

describe('MongoPersistence.touchUserRoles() — servir marque la place', () => {
  it('horodate les rôles qui viennent de servir', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const persistence = new MongoPersistence({ agentUserRole: { updateMany } } as never);

    await persistence.touchUserRoles('conv-1', ['u1', 'u2']);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0] as { where: { conversationId: string; userId: { in: string[] } }; data: { lastUsedAt: Date } };
    expect(arg.where.conversationId).toBe('conv-1');
    expect(arg.where.userId.in).toEqual(['u1', 'u2']);
    expect(arg.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it('n\'écrit rien quand personne n\'a servi', async () => {
    const updateMany = jest.fn();
    const persistence = new MongoPersistence({ agentUserRole: { updateMany } } as never);

    await persistence.touchUserRoles('conv-1', []);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
