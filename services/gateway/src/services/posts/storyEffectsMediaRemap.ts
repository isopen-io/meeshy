import type { Prisma } from '@meeshy/shared/prisma/client';
import { isCanvasV3OrNewer, remapCanvasV3MediaIds } from './storyEffectsV3';

/**
 * Structural shape covering both `StoryMediaObjectSchema` and
 * `StoryAudioObjectSchema` (services/gateway/src/routes/posts/types.ts),
 * narrowed to the two fields this module cares about. `id` is the composer's
 * client-side UI element id (unrelated to the database `PostMedia.id`) — it
 * is never rewritten, only `postMediaId` is.
 */
interface StoryMediaRefRaw {
  id?: string;
  postMediaId?: string;
  [key: string]: unknown;
}

interface StoryEffectsRaw {
  mediaObjects?: StoryMediaRefRaw[];
  audioPlayerObjects?: StoryMediaRefRaw[];
  [key: string]: unknown;
}

export interface RemapStoryEffectsMediaIdsResult {
  effects: Prisma.InputJsonValue | undefined;
  changed: boolean;
}

function remapRefs(
  items: StoryMediaRefRaw[] | undefined,
  idMap: Record<string, string>,
): { items: StoryMediaRefRaw[] | undefined; changed: boolean } {
  if (!Array.isArray(items)) return { items, changed: false };
  let changed = false;
  const next = items.map((item) => {
    const mapped = item.postMediaId !== undefined ? idMap[item.postMediaId] : undefined;
    if (mapped === undefined || mapped === item.postMediaId) return item;
    changed = true;
    return { ...item, postMediaId: mapped };
  });
  return { items: next, changed };
}

/**
 * Rewrites `postMediaId` references inside a story's `storyEffects` blob
 * using `idMap` (old PostMedia id → new PostMedia id). Used by
 * `PostService.repostPost()` right after it duplicates a reposted story's
 * media, so the repost's own `storyEffects` always points at its own media —
 * never at an ancestor's — no matter how many reposts deep the chain goes.
 *
 * A v3+ blob (`{ v: 3, scenes: [...] }`) has no `mediaObjects[]` /
 * `audioPlayerObjects[]` — its media references live under
 * `scenes[].objects[].payload` instead (#4883), so it is delegated to
 * `remapCanvasV3MediaIds`, the sole reader of that shape. Only a blob
 * `remapCanvasV3MediaIds` rejects (not v3-native) falls through to the
 * legacy `mediaObjects[]` / `audioPlayerObjects[]` walk below.
 *
 * A `postMediaId` not covered by `idMap` (unknown/legacy data) is left
 * untouched rather than nulled out, matching the fail-soft passthrough
 * policy already documented on `StoryEffectsSchema`.
 */
export function remapStoryEffectsMediaIds(
  effects: Prisma.InputJsonValue | undefined,
  idMap: Record<string, string>,
): RemapStoryEffectsMediaIdsResult {
  if (effects === undefined || effects === null || typeof effects !== 'object' || Array.isArray(effects)) {
    return { effects, changed: false };
  }

  const v3 = remapCanvasV3MediaIds(effects, idMap);
  if (v3 !== null) {
    return v3.changed
      ? { effects: v3.blob as Prisma.InputJsonValue, changed: true }
      : { effects, changed: false };
  }

  const raw = effects as StoryEffectsRaw;

  const mediaObjects = remapRefs(raw.mediaObjects, idMap);
  const audioPlayerObjects = remapRefs(raw.audioPlayerObjects, idMap);

  if (!mediaObjects.changed && !audioPlayerObjects.changed) {
    return { effects, changed: false };
  }

  return {
    effects: {
      ...raw,
      ...(raw.mediaObjects !== undefined ? { mediaObjects: mediaObjects.items } : {}),
      ...(raw.audioPlayerObjects !== undefined ? { audioPlayerObjects: audioPlayerObjects.items } : {}),
    } as Prisma.InputJsonValue,
    changed: true,
  };
}

/**
 * Does this `storyEffects` blob have a shape `remapStoryEffectsMediaIds`
 * actually knows how to read? True for v3-native (any version, read
 * optimistically like the rest of this file — #4774) and for the legacy
 * shape carrying either media-bearing array key, even empty.
 *
 * Exists so a caller with media to remap (`idMap` non-empty) can tell "there
 * was nothing to change here" apart from "I didn't recognize this shape at
 * all" (#4883 criterion 3) — a no-op result alone conflates the two, and a
 * genuinely unrecognized shape means a repost's media silently stays
 * unreferenced by its own `storyEffects` rather than failing loudly.
 */
export function isRecognizedStoryEffectsShape(effects: unknown): boolean {
  if (effects === undefined || effects === null || typeof effects !== 'object' || Array.isArray(effects)) {
    return false;
  }
  if (isCanvasV3OrNewer(effects)) return true;
  const raw = effects as StoryEffectsRaw;
  return 'mediaObjects' in raw || 'audioPlayerObjects' in raw;
}

/**
 * The full media-id correction step `PostService.repostPost()` runs right
 * after duplicating a reposted story's media: build the old→new id map from
 * position, remap, persist on change, and log rather than silently no-op
 * when the shape isn't recognized (#4883). Extracted out of `PostService.ts`
 * — already far over this repo's file-size budget — so the fix doesn't add
 * to a file the budget forbids adding to; a bug fix belongs at its call
 * site, and this call site now costs one line there.
 *
 * `originalMediaIds` and `repost.media` are matched by POSITION, matching
 * `PostService`'s own snapshot: the same order duplicates one `PostMedia`
 * per source id.
 */
export async function correctRepostStoryEffectsMediaIds<
  TRepost extends { readonly id: string; readonly storyEffects: unknown; readonly media?: readonly { readonly id: string }[] | null }
>(params: {
  readonly prisma: {
    readonly post: {
      update(args: { where: { id: string }; data: { storyEffects: Prisma.InputJsonValue } }): Promise<unknown>;
    };
  };
  readonly log: { warn(message: string, meta?: Record<string, unknown>): void };
  readonly repost: TRepost;
  readonly originalMediaIds: readonly string[];
  readonly snapshotStoryEffects: Prisma.InputJsonValue | undefined;
}): Promise<TRepost> {
  const { prisma, log, repost, originalMediaIds, snapshotStoryEffects } = params;
  if (snapshotStoryEffects === undefined) return repost;

  const repostMedia = repost.media ?? [];
  const idMap: Record<string, string> = {};
  originalMediaIds.forEach((oldId, idx) => {
    const newMedia = repostMedia[idx];
    if (newMedia) idMap[oldId] = newMedia.id;
  });

  const remapped = remapStoryEffectsMediaIds(snapshotStoryEffects, idMap);
  if (remapped.changed) {
    try {
      await prisma.post.update({
        where: { id: repost.id },
        data: { storyEffects: remapped.effects as Prisma.InputJsonValue },
      });
      // Cast: `remapped.effects` is `Prisma.InputJsonValue` (write-side JSON
      // type); `repost.storyEffects` is Prisma's read-side JSON output type.
      // They're structurally the same data, but Prisma generates them as
      // separate, not-mutually-assignable aliases — this cast bridges that
      // without widening to `any`.
      return { ...repost, storyEffects: remapped.effects as TRepost['storyEffects'] };
    } catch (err) {
      log.warn('repostPost: failed to correct storyEffects media ids', { repostId: repost.id, err });
    }
  } else if (Object.keys(idMap).length > 0 && !isRecognizedStoryEffectsShape(snapshotStoryEffects)) {
    // There IS media to remap (idMap non-empty) and neither the v3 nor the
    // legacy reader recognized this blob's shape — silently doing nothing
    // here means the repost's own media stays unreferenced by its own
    // storyEffects (#4883 criterion 3: a fail-soft no-op must stay
    // distinguishable from "nothing to do").
    log.warn('repostPost: storyEffects shape not recognized while remapping media ids', {
      repostId: repost.id,
    });
  }
  return repost;
}
