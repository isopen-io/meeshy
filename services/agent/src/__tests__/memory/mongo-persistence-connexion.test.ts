import { MongoPersistence } from '../../memory/mongo-persistence';

const HOUR = 60 * 60 * 1000;

/**
 * Mesuré en production le 2026-09-08 sur `68f2a81417a557e8ce4ddfbb` (#5702) :
 *
 * | utilisateur   | `lastActiveAt` | dernière CONNEXION |
 * |---------------|----------------|--------------------|
 * | `clyf_tone`   | 36 min         | **71 jours**       |
 * | `La_mignonne` | 117 min        | **92 jours**       |
 * | `graceeeee`   | 259 min        | **39 jours**       |
 *
 * `User.lastActiveAt` bouge sur toute activité de fond — socket rouverte,
 * requête d'une appli en arrière-plan — et ne dit RIEN de la présence réelle.
 * L'agent, qui sélectionnait dessus, écartait donc exactement les personnes
 * qu'il devait prendre.
 *
 * La trace de connexion existe : `UserSession.createdAt`, 2445 lignes en
 * production. C'est elle qui doit gouverner.
 */
describe('getPotentialControlledUsers() — la CONNEXION décide, pas l\'activité', () => {
  const capturerWhere = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const persistence = new MongoPersistence({
      agentUserRole: { findMany: jest.fn().mockResolvedValue([]) },
      participant: { findMany },
    } as never);
    return { persistence, findMany };
  };

  it('exige qu\'AUCUNE session n\'ait été ouverte depuis le seuil', async () => {
    const { persistence, findMany } = capturerWhere();

    await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);

    const where = findMany.mock.calls[0][0].where as {
      user: { sessions?: { none?: { lastActivityAt?: { gte?: Date } } } };
    };
    expect(where.user.sessions?.none?.lastActivityAt?.gte).toBeInstanceOf(Date);
  });

  it('borne ce seuil sur la durée CONFIGURÉE, pas sur une constante', async () => {
    const { persistence, findMany } = capturerWhere();
    const avant = Date.now();

    await persistence.getPotentialControlledUsers('conv-1', 3, 100, [], []);

    const gte = (findMany.mock.calls[0][0].where as { user: { sessions: { none: { lastActivityAt: { gte: Date } } } } })
      .user.sessions.none.lastActivityAt.gte;
    const ecart = avant - gte.getTime();
    expect(ecart).toBeGreaterThanOrEqual(100 * HOUR - 5_000);
    expect(ecart).toBeLessThanOrEqual(100 * HOUR + 5_000);
  });

  it('ne pilote JAMAIS quelqu\'un actuellement en ligne', async () => {
    const { persistence, findMany } = capturerWhere();

    await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);

    const where = findMany.mock.calls[0][0].where as { user: { isOnline?: boolean } };
    expect(where.user.isOnline).toBe(false);
  });

  it('n\'écarte plus sur `lastActiveAt`, qui ne mesure pas la présence', async () => {
    const { persistence, findMany } = capturerWhere();

    await persistence.getPotentialControlledUsers('conv-1', 3, 72, [], []);

    const where = findMany.mock.calls[0][0].where as { user: Record<string, unknown> };
    expect(where.user.lastActiveAt).toBeUndefined();
  });

  it('conserve les exclusions de rôle et d\'identifiants', async () => {
    const { persistence, findMany } = capturerWhere();

    await persistence.getPotentialControlledUsers('conv-1', 3, 72, ['ADMIN'], ['u-exclu']);

    const where = findMany.mock.calls[0][0].where as {
      user: { role?: { notIn?: string[] } };
      userId?: { notIn?: string[] };
    };
    expect(where.user.role?.notIn).toEqual(['ADMIN']);
    expect(where.userId?.notIn).toContain('u-exclu');
  });
});

describe('getLeastActiveParticipants() — même loi sur le chemin de secours', () => {
  it('exige aussi l\'absence de session récente', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const persistence = new MongoPersistence({ participant: { findMany } } as never);

    await persistence.getLeastActiveParticipants('conv-1', 3, [], [], 72);

    const where = findMany.mock.calls[0][0].where as {
      user: { sessions?: { none?: { lastActivityAt?: { gte?: Date } } }; isOnline?: boolean };
    };
    expect(where.user.sessions?.none?.lastActivityAt?.gte).toBeInstanceOf(Date);
    expect(where.user.isOnline).toBe(false);
  });
});
