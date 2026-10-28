import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { claimableMediaWhere } from './mediaOwnership';

const log = enhancedLogger.child({ module: 'storyBackgroundMediaUrl' });

const OBJECT_ID = /^[a-f0-9]{24}$/;

type MediaObject = { isBackground?: unknown; postMediaId?: unknown; mediaURL?: unknown; [key: string]: unknown };

const mediaObjectsOf = (effects: unknown): MediaObject[] | null => {
  if (typeof effects !== 'object' || effects === null || Array.isArray(effects)) return null;
  const list = (effects as { mediaObjects?: unknown }).mediaObjects;
  return Array.isArray(list) ? (list as MediaObject[]) : null;
};

const isBackgroundWithoutUrl = (object: unknown): object is MediaObject & { postMediaId: string } => {
  if (typeof object !== 'object' || object === null) return false;
  const { isBackground, postMediaId, mediaURL } = object as MediaObject;
  const hasUrl = typeof mediaURL === 'string' && mediaURL.length > 0;
  return isBackground === true && !hasUrl && typeof postMediaId === 'string' && OBJECT_ID.test(postMediaId);
};

export function backgroundMediaIdsMissingUrl(effects: unknown): string[] {
  const ids = (mediaObjectsOf(effects) ?? []).filter(isBackgroundWithoutUrl).map((object) => object.postMediaId);
  return [...new Set(ids)];
}

/**
 * #13607 — un fond publié avec `postMediaId` et sans `mediaURL` (file hors ligne
 * Android) est lu par un client ANTÉRIEUR à la résolution par pièce comme « le
 * premier média de la story ». On complète donc l'adresse avec celle de la pièce
 * désignée, à condition que `urlByMediaId` ne contienne que des pièces de la
 * story. Un fond déjà adressé, ou dont la pièce n'est pas fournie, reste intact
 * (même référence rendue).
 */
export function fillBackgroundMediaUrls<T>(effects: T, urlByMediaId: ReadonlyMap<string, string>): T {
  const objects = mediaObjectsOf(effects);
  if (objects === null) return effects;
  let changed = false;
  const next = objects.map((object) => {
    if (!isBackgroundWithoutUrl(object)) return object;
    const url = urlByMediaId.get(object.postMediaId);
    if (!url) return object;
    changed = true;
    return { ...object, mediaURL: url };
  });
  return changed ? ({ ...(effects as object), mediaObjects: next } as T) : effects;
}

/**
 * Lit les adresses des seules pièces que la story possède (`within` : celles qu'elle
 * réclame ou porte déjà, jamais une pièce libre qu'elle n'attache pas) : déjà liées au post
 * (`postId`, à l'édition) ou réclamables par l'auteur (`claimableMediaWhere`,
 * comme le rattachement qui suit). Un identifiant étranger n'est jamais lu.
 * Fail-soft : publier ne dépend pas de cette complétude.
 */
export async function withBackgroundMediaUrls<T>(
  prisma: PrismaClient,
  effects: T,
  scope: { ownerId: string; postId?: string; within: readonly string[] }
): Promise<T> {
  const ids = backgroundMediaIdsMissingUrl(effects).filter((id) => scope.within.includes(id));
  if (ids.length === 0) return effects;
  try {
    const owned = [
      ...(scope.postId ? [{ postId: scope.postId }] : []),
      { ...claimableMediaWhere(scope.ownerId) },
    ];
    const rows = await prisma.postMedia.findMany({
      where: { id: { in: ids }, OR: owned },
      select: { id: true, fileUrl: true },
    });
    const urls = new Map(
      rows.flatMap((row) => (row.fileUrl ? [[row.id, row.fileUrl] as const] : []))
    );
    return fillBackgroundMediaUrls(effects, urls);
  } catch (error: unknown) {
    log.warn('background mediaURL completion skipped', { error });
    return effects;
  }
}
