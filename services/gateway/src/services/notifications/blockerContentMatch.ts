/**
 * #19220 — ce que le blocage retire chez le BLOQUÉ : les lignes qui portent le
 * CONTENU du bloqueur, que le bloqueur en soit l'acteur ou qu'un TIERS l'ait
 * fait voyager (réponse sous sa story, commentaire relayé, republication de sa
 * publication). Ces dernières nomment la publication du bloqueur par l'un des
 * chemins de `POST_NOTIFICATION_LINK_PATHS` ; son auteur se lit en base.
 *
 * Les publications candidates sont celles que la liste du bloqué nomme déjà
 * (`distinct`, bornée par sa liste), jamais toutes celles du bloqueur. Une
 * lecture qui échoue ne retire que les lignes de l'acteur lui-même : le
 * blocage, déjà écrit, ne doit pas échouer pour autant.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { POST_NOTIFICATION_LINK_PATHS } from '../posts/postNotificationLinkPaths';
import { ACTOR_CONTENT_TYPES } from './blocked-actor-content';

type RawDistinct = { values?: ReadonlyArray<unknown> };

const isObjectId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);

async function postsNamedByOthers(prisma: PrismaClient, userId: string, actorId: string, types: readonly string[]): Promise<string[]> {
  const run = (prisma as unknown as { $runCommandRaw: (cmd: Record<string, unknown>) => Promise<RawDistinct> }).$runCommandRaw;
  const perPath = await Promise.all(
    POST_NOTIFICATION_LINK_PATHS.map((path) =>
      run.call(prisma, {
        distinct: 'Notification',
        key: path,
        query: { userId: { $oid: userId }, type: { $in: types }, 'actor.id': { $ne: actorId }, [path]: { $exists: true } },
      })
    )
  );
  return [...new Set(perPath.flatMap((result) => (result?.values ?? []).filter(isObjectId)))];
}

async function postsAuthoredBy(prisma: PrismaClient, userId: string, actorId: string, types: readonly string[]): Promise<string[]> {
  try {
    const named = await postsNamedByOthers(prisma, userId, actorId, types);
    if (named.length === 0) return [];
    const owned = await prisma.post.findMany({ where: { id: { in: named }, authorId: actorId }, select: { id: true } });
    return owned.map((post) => post.id);
  } catch {
    return [];
  }
}

export async function blockerContentMatch(
  prisma: PrismaClient,
  params: { readonly userId: string; readonly actorId: string }
): Promise<Record<string, unknown>> {
  const types = [...ACTOR_CONTENT_TYPES];
  const owned = await postsAuthoredBy(prisma, params.userId, params.actorId, types);
  const byActor = { 'actor.id': params.actorId };
  if (owned.length === 0) return { ...byActor, type: { $in: types } };
  return {
    type: { $in: types },
    $or: [byActor, ...POST_NOTIFICATION_LINK_PATHS.map((path) => ({ [path]: { $in: owned } }))],
  };
}
