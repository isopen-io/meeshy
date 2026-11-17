/**
 * Un jeton push vit et meurt avec la SESSION qui l'a enregistré (#17142 pour PushToTalk,
 * généralisé à tous les types par #9616 / #18910) : il réveille l'appareil pour UN compte, et
 * resté après la fin de la session il réveillerait l'appareil de l'intrus ou du voleur —
 * aperçu, nom, avatar et vignette sur l'écran verrouillé. Quatre portes le tiennent, ce
 * module est leur site UNIQUE :
 *
 * 1. l'enregistrement le rattache à la session appelante (`PushToken.sessionId`, `routes/push-tokens`,
 *    `routes/talkie`) et le détache de tout autre compte — jamais deux comptes sur un jeton ;
 * 2. la fermeture d'une session le retire (déconnexion, révocation unitaire, « partout »,
 *    réinitialisation du mot de passe, fin de session par l'admin) — `retirePushTokensAfterSessionEnd` ;
 * 3. l'envoi ne compte qu'un jeton dont la session est encore valide (`keepTokensOfLiveSessions`,
 *    `PushNotificationService.sendToUser`) : un retrait manqué ne laisse rien partir ;
 * 4. la porte du réveil PushToTalk retire au passage ceux dont la session a expiré (`talkieWakeChannel`).
 *
 * RÉTROCOMPATIBLE, aucune migration : une ligne sans `sessionId` (enregistrée avant le lien, ou par un
 * client qui n'envoie aucun `sid`) reste servie. Elle ne se retire que lorsqu'aucune session valide ne
 * reste au compte (révocation totale, réinitialisation du mot de passe) : une déconnexion d'UN appareil
 * ne coupe pas les autres. Un jeton PushToTalk, lui, est toujours né d'une session : sans elle, il part.
 *
 * Un PushToTalk se SUPPRIME (c'est un jeton de réveil sans autre usage) ; les autres types sont
 * DÉSACTIVÉS (`isActive: false`) : le client les réinscrit à chaque lancement, ce qui les réactive.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { SessionEndScope } from './e2ee/device-retirement';

export type PushTokenSessionPrisma = Pick<PrismaClient, 'pushToken' | 'userSession'>;

const PTT = 'pushtotalk';

type TokenRow = { readonly id: string; readonly type: string; readonly sessionId: string | null; readonly isActive: boolean };

const sessionIdsOf = (rows: readonly { readonly sessionId?: string | null }[]): string[] =>
  [...new Set(rows.map((row) => row.sessionId).filter((id): id is string => typeof id === 'string'))];

async function liveSessionIds(prisma: PushTokenSessionPrisma, userId: string, ids: readonly string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const live = await prisma.userSession.findMany({
    where: { id: { in: [...ids] }, userId, isValid: true, expiresAt: { gt: now } },
    select: { id: true },
  });
  return new Set(live.map((session) => session.id));
}

async function hasLiveSession(prisma: PushTokenSessionPrisma, userId: string, now: Date): Promise<boolean> {
  const live = await prisma.userSession.findMany({ where: { userId, isValid: true, expiresAt: { gt: now } }, select: { id: true }, take: 1 });
  return live.length > 0;
}

type RetiredRow = Pick<TokenRow, 'id' | 'type' | 'sessionId'>;

const UNBOUND: Prisma.PushTokenWhereInput[] = [{ sessionId: null }, { sessionId: { isSet: false } }];

/**
 * Compare-and-set sur le lien lu : un appareil qui se reconnecte ENTRE la lecture et l'écriture réinscrit son
 * jeton sous sa nouvelle session (`routes/push-tokens`) ; la ligne a changé de `sessionId` et n'est plus visée.
 */
const asRead = (rows: readonly RetiredRow[]): Prisma.PushTokenWhereInput[] =>
  rows.map((row) => (row.sessionId ? { id: row.id, sessionId: row.sessionId } : { id: row.id, OR: UNBOUND }));

/** Retire les lignes, telles qu'elles ont été lues : PushToTalk supprimé, autres types désactivés. */
async function retireRows(prisma: PushTokenSessionPrisma, userId: string, rows: readonly RetiredRow[]): Promise<number> {
  const ptt = rows.filter((row) => row.type === PTT);
  const others = rows.filter((row) => row.type !== PTT);
  const [deleted, deactivated] = await Promise.all([
    ptt.length === 0 ? { count: 0 } : prisma.pushToken.deleteMany({ where: { userId, type: PTT, OR: asRead(ptt) } }),
    others.length === 0 ? { count: 0 } : prisma.pushToken.updateMany({ where: { userId, type: { not: PTT }, isActive: true, OR: asRead(others) }, data: { isActive: false } }),
  ]);
  return deleted.count + deactivated.count;
}

/**
 * Les jetons du compte dont la session n'est plus valide (ou inconnue) : les retirer. `onlyPushToTalk`
 * restreint la passe aux jetons de réveil (la porte du réveil ne regarde rien d'autre).
 */
export async function retireOrphanPushTokens(
  prisma: PushTokenSessionPrisma,
  userId: string,
  now: Date,
  options: { readonly onlyPushToTalk?: boolean } = {},
): Promise<number> {
  const found: TokenRow[] = await prisma.pushToken.findMany({ where: { userId }, select: { id: true, type: true, sessionId: true, isActive: true } });
  const tokens = found.filter((token) => (options.onlyPushToTalk ? token.type === PTT : token.type === PTT || token.isActive));
  if (tokens.length === 0) return 0;
  const alive = await liveSessionIds(prisma, userId, sessionIdsOf(tokens), now);
  const unattached = tokens.filter((token) => !token.sessionId && token.type !== PTT);
  const legacyOrphaned = unattached.length > 0 && alive.size === 0 && !(await hasLiveSession(prisma, userId, now));
  const orphans = tokens.filter((token) => (token.sessionId ? !alive.has(token.sessionId) : token.type === PTT || legacyOrphaned));
  return orphans.length === 0 ? 0 : retireRows(prisma, userId, orphans);
}

/** Les jetons PushToTalk du compte dont la session n'est plus valide : la porte du réveil les retire. */
export const retireOrphanPushToTalkTokens = (prisma: PushTokenSessionPrisma, userId: string, now: Date): Promise<number> =>
  retireOrphanPushTokens(prisma, userId, now, { onlyPushToTalk: true });

/** Une session vient de se fermer : ses jetons push partent avec elle. Ne fait jamais échouer la fermeture. */
export async function retirePushTokensAfterSessionEnd(
  prisma: PushTokenSessionPrisma,
  scope: SessionEndScope,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    if ('userId' in scope) {
      await retireOrphanPushTokens(prisma, scope.userId, new Date());
      return;
    }
    const sessions = await prisma.userSession.findMany({
      where: 'sessionId' in scope ? { id: scope.sessionId } : { sessionToken: scope.sessionToken },
      select: { id: true, userId: true },
    });
    await Promise.all(sessions.map(async (session) => {
      const tokens: TokenRow[] = await prisma.pushToken.findMany({
        where: { userId: session.userId, sessionId: session.id },
        select: { id: true, type: true, sessionId: true, isActive: true },
      });
      await retireRows(prisma, session.userId, tokens);
    }));
  } catch (error) {
    onError(error);
  }
}

/**
 * Défense en profondeur de l'envoi : ne garde que les jetons dont la session vit (valide, non échue), plus ceux
 * qui n'en portent pas (héritage, rétrocompatibilité). Une lecture groupée, et aucune quand rien n'est lié.
 * Une panne de la lecture PROPAGE : un contenu ne part jamais faute d'avoir pu vérifier qu'il en avait le droit.
 */
export async function keepTokensOfLiveSessions<T extends { readonly sessionId?: string | null }>(
  prisma: PushTokenSessionPrisma,
  userId: string,
  tokens: readonly T[],
  now: Date = new Date(),
): Promise<T[]> {
  const bound = sessionIdsOf(tokens);
  if (bound.length === 0) return [...tokens];
  const alive = await liveSessionIds(prisma, userId, bound, now);
  return tokens.filter((token) => !token.sessionId || alive.has(token.sessionId));
}
