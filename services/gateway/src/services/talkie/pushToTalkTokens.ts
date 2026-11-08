/**
 * Le jeton PushToTalk vit et meurt avec la SESSION qui l'a enregistré (#17142, revue de
 * sécurité du lot iOS) : il réveille l'appareil pour UN compte, et resté après une
 * déconnexion il le réveillerait pour le compte précédent. Trois portes le tiennent :
 *
 * 1. l'enregistrement le rattache à la session appelante (`PushToken.sessionId`) et le
 *    détache de tout autre compte — jamais deux comptes sur un jeton (`routes/talkie`) ;
 * 2. la fermeture d'une session le retire (déconnexion, révocation, « partout »,
 *    suppression du compte) — `SessionService`, à côté du retrait des appareils chiffrés ;
 * 3. la porte du réveil ne compte qu'un jeton dont la session est encore valide, et
 *    retire au passage ceux dont la session a expiré (`talkieWakeChannel`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SessionEndScope } from '../e2ee/device-retirement';

export type PushToTalkPrisma = Pick<PrismaClient, 'pushToken' | 'userSession'>;

const PTT = 'pushtotalk';

/** Les jetons PushToTalk du compte dont la session n'est plus valide (ou inconnue) : les retirer. */
export async function retireOrphanPushToTalkTokens(prisma: PushToTalkPrisma, userId: string, now: Date): Promise<number> {
  const tokens = await prisma.pushToken.findMany({ where: { userId, type: PTT }, select: { id: true, sessionId: true } });
  if (tokens.length === 0) return 0;
  const sessionIds = tokens.map((token) => token.sessionId).filter((id): id is string => typeof id === 'string');
  const alive = sessionIds.length === 0
    ? []
    : await prisma.userSession.findMany({ where: { id: { in: sessionIds }, userId, isValid: true, expiresAt: { gt: now } }, select: { id: true } });
  const aliveIds = new Set(alive.map((session) => session.id));
  const orphans = tokens.filter((token) => !token.sessionId || !aliveIds.has(token.sessionId)).map((token) => token.id);
  if (orphans.length === 0) return 0;
  const { count } = await prisma.pushToken.deleteMany({ where: { id: { in: orphans }, userId, type: PTT } });
  return count;
}

/** Une session vient de se fermer : ses jetons PushToTalk partent avec elle. Ne fait jamais échouer la fermeture. */
export async function retirePushToTalkTokensAfterSessionEnd(
  prisma: PushToTalkPrisma,
  scope: SessionEndScope,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    if ('userId' in scope) {
      await retireOrphanPushToTalkTokens(prisma, scope.userId, new Date());
      return;
    }
    const sessions = await prisma.userSession.findMany({
      where: 'sessionId' in scope ? { id: scope.sessionId } : { sessionToken: scope.sessionToken },
      select: { id: true, userId: true },
    });
    if (sessions.length === 0) return;
    await prisma.pushToken.deleteMany({
      where: { userId: { in: sessions.map((s) => s.userId) }, type: PTT, sessionId: { in: sessions.map((s) => s.id) } },
    });
  } catch (error) {
    onError(error);
  }
}
