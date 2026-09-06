import type { Prisma } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { isCanvasV3OrNewer, remapCanvasV3MediaIds } from './storyEffectsV3';

const log = enhancedLogger.child({ module: 'storyEffectsMediaRemap' });

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
 * Rewrites `postMediaId`/`mediaId` references inside a story's
 * `storyEffects` blob using `idMap` (old PostMedia id → new PostMedia id).
 * Used by `PostService.repostPost()` right after it duplicates a reposted
 * story's media, so the repost's own `storyEffects` always points at its own
 * media — never at an ancestor's — no matter how many reposts deep the chain
 * goes, and regardless of whether the blob is legacy (`mediaObjects[]` /
 * `audioPlayerObjects[]` at the root) or v3 (`{ v: 3, scenes: [...] }`,
 * references under `scenes[].objects[].payload`).
 *
 * A reference not covered by `idMap` (unknown/legacy data) is left untouched
 * rather than nulled out, matching the fail-soft passthrough policy already
 * documented on `StoryEffectsSchema`.
 *
 * A blob this function does not recognize (versioned — carries a `v` key —
 * but not v3-or-newer) is passed through too, but DISTINGUISHABLY: it is
 * logged rather than silently reported as "nothing to change" (#4883). An
 * unversioned object (no `v` key) is the historical v1 shape — a bag of
 * optional fields — and legitimately has nothing to remap when it carries
 * neither `mediaObjects` nor `audioPlayerObjects`.
 */
export function remapStoryEffectsMediaIds(
  effects: Prisma.InputJsonValue | undefined,
  idMap: Record<string, string>,
): RemapStoryEffectsMediaIdsResult {
  if (effects === undefined || effects === null || typeof effects !== 'object' || Array.isArray(effects)) {
    return { effects, changed: false };
  }

  if (isCanvasV3OrNewer(effects)) {
    const { blob, changed } = remapCanvasV3MediaIds(effects, idMap);
    return { effects: (changed ? blob : effects) as Prisma.InputJsonValue, changed };
  }

  const raw = effects as StoryEffectsRaw;

  const mediaObjects = remapRefs(raw.mediaObjects, idMap);
  const audioPlayerObjects = remapRefs(raw.audioPlayerObjects, idMap);

  if (!mediaObjects.changed && !audioPlayerObjects.changed) {
    if (Object.prototype.hasOwnProperty.call(raw, 'v')) {
      log.warn('remapStoryEffectsMediaIds: versioned storyEffects not recognized as v3-or-newer — passthrough without remap', {
        versionMarker: (raw as { v?: unknown }).v,
      });
    }
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
