import type { Prisma } from '@meeshy/shared/prisma/client';

import type { ContentTrackingLink, TrackingLinkService } from '../TrackingLinkService';
import { mergeTrackingLinksIntoMetadata } from '../messaging/messageLinks';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { isCanvasV3OrNewer } from './storyEffectsV3';
import { storyTextObjectText } from './storyContentComposition';

/**
 * La carte `metadata.trackingLinks` d'une publication (post, story, statut) ou
 * d'un commentaire (#9073).
 *
 * UNE carte couvre TOUS les textes que la publication affiche : son corps, les
 * textes posés sur sa scène, la légende de chacun de ses médias — et, pour un
 * commentaire, son corps et la légende de son média. Le relevé d'origine ne
 * scannait que `content ?? textes de scène` : une story LÉGENDÉE perdait les
 * URL de ses calques, aucune légende de média n'était lue, et une édition ne
 * recalculait rien.
 *
 * La forme servie ne change pas : REST `metadata.trackingLinks: [{url, token}]`,
 * socket hissé en `trackingLinks`.
 */

const log = enhancedLogger.child({ module: 'publicationTrackingLinks' });

type Collector = Pick<TrackingLinkService, 'collectContentTrackingLinks'>;

type TrackedMedia = { readonly caption?: string | null };

type TrackedRow = {
  readonly id: string;
  readonly content?: string | null;
  readonly metadata?: unknown;
  readonly media?: readonly TrackedMedia[] | null;
};

type TrackedPostRow = TrackedRow & { readonly storyEffects?: unknown };

type MetadataWriter = {
  update(args: { where: { id: string }; data: { metadata: Prisma.InputJsonValue | null } }): Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/**
 * Ce que chaque kind d'objet de scène AFFICHE comme texte traçable. Un kind
 * absent de la table n'affiche rien qu'on suive. Un objet lien (#9076) s'y
 * ajoute en une entrée.
 */
const SCENE_OBJECT_TEXT: Readonly<Record<string, (payload: Record<string, unknown>) => unknown>> = {
  text: (payload) => payload.text,
};

/** Les textes que la scène d'une story affiche — v3+ (`scenes[].objects[]`) ou v1 (`textObjects`). */
export function sceneTrackableTexts(storyEffects: unknown): string[] {
  if (isCanvasV3OrNewer(storyEffects)) {
    return asRecords((storyEffects as { scenes?: unknown }).scenes)
      .flatMap((scene) => asRecords(scene.objects))
      .map((object) => {
        const read = typeof object.kind === 'string' ? SCENE_OBJECT_TEXT[object.kind] : undefined;
        return read ? read(isRecord(object.payload) ? object.payload : {}) : undefined;
      })
      .filter((text): text is string => typeof text === 'string');
  }
  if (!isRecord(storyEffects)) return [];
  return asRecords(storyEffects.textObjects)
    .map((object) => storyTextObjectText(object))
    .filter((text): text is string => typeof text === 'string');
}

/** Tous les textes affichés par une publication, trimés, non vides, dédoublonnés. */
export function publicationTrackableTexts(params: {
  readonly content?: string | null;
  readonly storyEffects?: unknown;
  readonly mediaCaptions?: readonly (string | null | undefined)[];
}): string[] {
  const all = [params.content, ...sceneTrackableTexts(params.storyEffects), ...(params.mediaCaptions ?? [])];
  const trimmed = all
    .map((text) => (typeof text === 'string' ? text.trim() : ''))
    .filter((text) => text.length > 0);
  return [...new Set(trimmed)];
}

/**
 * La carte après une collecte.
 *
 * - une URL déjà suivie et toujours affichée garde son jeton STOCKÉ (le lien
 *   `/l/<token>` déjà servi aux lecteurs reste valable) ;
 * - une URL nouvellement collectée entre ;
 * - une entrée stockée dont l'URL apparaît encore dans un texte survit même si
 *   la collecte ne l'a pas rendue — `collectContentTrackingLinks` avale ses
 *   erreurs et rend `[]`, et une panne ne doit jamais effacer un jeton vivant ;
 * - une URL que l'édition a retirée de tous les textes sort.
 */
export function reconcileTrackingLinks(params: {
  readonly stored: readonly ContentTrackingLink[];
  readonly collected: readonly ContentTrackingLink[];
  readonly texts: readonly string[];
}): ContentTrackingLink[] {
  const storedByUrl = new Map(params.stored.map((link) => [link.url, link]));
  const stillShown = (url: string) => params.texts.some((text) => text.includes(url));
  const candidates = [
    ...params.collected.map((link) => storedByUrl.get(link.url) ?? link),
    ...params.stored.filter((link) => stillShown(link.url)),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .map((link) => ({ url: link.url, token: link.token }));
}

function storedTrackingLinks(metadata: unknown): ContentTrackingLink[] {
  if (!isRecord(metadata)) return [];
  return asRecords(metadata.trackingLinks)
    .filter((link): link is ContentTrackingLink => typeof link.url === 'string' && typeof link.token === 'string')
    .map((link) => ({ url: link.url, token: link.token }));
}

const sameLinks = (a: readonly ContentTrackingLink[], b: readonly ContentTrackingLink[]) =>
  a.length === b.length && a.every((link, i) => link.url === b[i].url && link.token === b[i].token);

/**
 * Recalcule et réécrit la carte d'une ligne. Rend la NOUVELLE metadata (`null`
 * si plus rien n'y vit), ou `undefined` si la carte n'a pas changé — ou si
 * quoi que ce soit a échoué : ne jette jamais, une publication déjà écrite ne
 * devient pas un 500 pour un lien.
 */
async function syncTrackingLinks(params: {
  readonly writer: MetadataWriter;
  readonly linkService: Collector;
  readonly row: TrackedRow;
  readonly texts: readonly string[];
  readonly collectScope: { readonly createdBy?: string; readonly postId?: string };
}): Promise<Prisma.InputJsonValue | null | undefined> {
  const { writer, linkService, row, texts, collectScope } = params;
  try {
    const stored = storedTrackingLinks(row.metadata);
    if (texts.length === 0 && stored.length === 0) return undefined;
    const collected = texts.length > 0
      ? await linkService.collectContentTrackingLinks({ content: texts.join('\n'), ...collectScope })
      : [];
    const next = reconcileTrackingLinks({ stored, collected, texts });
    if (sameLinks(stored, next)) return undefined;
    const metadata = mergeTrackingLinksIntoMetadata(row.metadata, next);
    await writer.update({ where: { id: row.id }, data: { metadata } });
    return metadata;
  } catch (error) {
    log.warn('tracking link sync failed', { id: row.id, error });
    return undefined;
  }
}

const captionsOf = (row: TrackedRow) => (row.media ?? []).map((media) => media.caption);

/** Post, story ou statut : corps + textes de scène + légende de chaque média. */
export function syncPostTrackingLinks(params: {
  readonly prisma: { readonly post: MetadataWriter };
  readonly linkService: Collector;
  readonly post: TrackedPostRow;
  readonly createdBy?: string;
}): Promise<Prisma.InputJsonValue | null | undefined> {
  const { prisma, linkService, post, createdBy } = params;
  return syncTrackingLinks({
    writer: prisma.post,
    linkService,
    row: post,
    texts: publicationTrackableTexts({ content: post.content, storyEffects: post.storyEffects, mediaCaptions: captionsOf(post) }),
    collectScope: { createdBy, postId: post.id },
  });
}

/** Commentaire : corps + légende de son média. */
export function syncCommentTrackingLinks(params: {
  readonly prisma: { readonly postComment: MetadataWriter };
  readonly linkService: Collector;
  readonly comment: TrackedRow;
  readonly createdBy?: string;
}): Promise<Prisma.InputJsonValue | null | undefined> {
  const { prisma, linkService, comment, createdBy } = params;
  return syncTrackingLinks({
    writer: prisma.postComment,
    linkService,
    row: comment,
    texts: publicationTrackableTexts({ content: comment.content, mediaCaptions: captionsOf(comment) }),
    collectScope: { createdBy },
  });
}
