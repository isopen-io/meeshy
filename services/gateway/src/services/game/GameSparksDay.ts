/**
 * LES ÉTINCELLES GAGNÉES PAR JOUR (#20619, #17363) — le seau que lit `GET /admin/analytics/game`. Écrit au CRÉDIT d'un
 * gain (`EngagementGameHooks.onPointsGained`), jamais recalculé : un document par jour UTC (`GameSparksDay`), qui
 * porte la somme des gains et le nombre de joueurs qui en ont gagné — aucune ligne par compte.
 *
 * Le joueur se compte au PREMIER gain de son jour : `User.sparksEarnedDay` (le jour UTC du dernier gain) passe au jour
 * courant par une écriture CONDITIONNELLE, qui ne touche le compte qu'une fois par jour. Le marqueur absent (compte
 * d'avant le seau) se lit « autre jour » : sur MongoDB, `NOT: { f: v }` ne matche pas un champ absent, d'où l'`isSet`.
 *
 * Brut : une reprise de contenu retiré (#9584) ne baisse pas le seau. Aucun rattrapage : il commence au déploiement.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export class GameSparksDayRecorder {
  constructor(private readonly prisma: PrismaClient) {}

  /** Un gain de `points` étincelles : le seau du jour UTC monte d'autant, et d'un joueur au premier gain du jour. */
  async record(userId: string, points: number, now: Date = new Date()): Promise<void> {
    if (!Number.isInteger(points) || points <= 0) return;
    const day = utcDay(now);
    const marked = await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ sparksEarnedDay: { isSet: false } }, { NOT: { sparksEarnedDay: day } }] },
      data: { sparksEarnedDay: day },
    });
    const earners = marked.count > 0 ? 1 : 0;
    const write = () =>
      this.prisma.gameSparksDay.upsert({
        where: { day },
        create: { day, sparks: points, earners },
        update: { sparks: { increment: points }, earners: { increment: earners } },
        select: { id: true },
      });
    try {
      await write();
    } catch (err) {
      // Deux premiers gains concurrents du jour : l'upsert qui perd la création lève P2002 au lieu de basculer sur la
      // mise à jour (MongoDB). Le rejouer trouve le document et incrémente.
      if (!isP2002(err)) throw err;
      await write();
    }
  }
}
