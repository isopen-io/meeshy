/**
 * LES STORIES « À LA UNE » (#19394, décision #19393, chantier #18857).
 *
 * Un album range des stories de SON auteur sous un titre et un glyphe. La lecture ne passe
 * par aucune règle à elle : chaque story se lit sous la loi d'audience des listes
 * (`viewerPostAudience` — visibilité, personnes nommées, cercles, communautés, blocage dans
 * les deux sens), relue à chaque lecture, et l'anonyme ne lit que PUBLIC. L'échéance de
 * 20 h n'est PAS posée : mettre une story à la une la garde lisible, jamais à plus de monde.
 *
 * Ce qui part À CÔTÉ des stories est gardé de même : `storyIds` et `storyCount` ne nomment
 * que les stories servies, et un album vide pour ce lecteur n'existe pas pour lui (ni titre,
 * ni glyphe). Deux lectures en tout — les albums, puis leurs stories —, jamais une par album.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import {
  STORY_HIGHLIGHTS_MAX_PER_OWNER,
  storyHighlightCreateSchema,
  storyHighlightOrderSchema,
  storyHighlightUpdateSchema,
  type StoryHighlightServed,
} from '@meeshy/shared/types/story-highlight';

import type { CacheStore } from '../CacheStore';
import { hoistLocationDeep } from '../location/sharedPlace';
import { viewerPostAudience } from './feedVisibility';
import { postInclude, NOT_DELETED } from './postIncludes';
import { withMentions, type WireReader } from './postReferences';
import { withViewerPostState } from './viewerPostState';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

const HIGHLIGHT_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  glyph: true,
  storyIds: true,
  order: true,
  createdAt: true,
  updatedAt: true,
} as const;

type HighlightRow = {
  readonly id: string;
  readonly title: string;
  readonly glyph: string;
  readonly storyIds: readonly string[];
  readonly order: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type ServedStory = { readonly id: string };

export type HighlightRefusal = { readonly status: 400 | 404 | 409; readonly error: string; readonly code: string };
export type HighlightOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: HighlightRefusal };

const refuse = (status: HighlightRefusal['status'], error: string, code: string): HighlightOutcome<never> => ({
  ok: false,
  refusal: { status, error, code },
});

const INVALID_BODY = refuse(400, 'Corps de requête invalide', 'INVALID_BODY');
const NOT_FOUND = refuse(404, 'Album introuvable', 'HIGHLIGHT_NOT_FOUND');
const NOT_OWNED = refuse(400, 'Seules vos propres stories se mettent à la une', 'STORY_NOT_OWNED');

const ownerStoriesWhere = (ownerId: string, ids: readonly string[]) => ({
  id: { in: [...ids] },
  authorId: ownerId,
  type: PostType.STORY,
  deletedAt: NOT_DELETED,
});

const serve = (row: HighlightRow, stories: readonly ServedStory[]): StoryHighlightServed<ServedStory> => ({
  id: row.id,
  title: row.title,
  glyph: row.glyph,
  order: row.order,
  storyIds: stories.map((story) => story.id),
  storyCount: stories.length,
  stories,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

type ReadParams = {
  readonly ownerId: string;
  readonly viewerId: string | undefined;
  readonly keepEmpty: boolean;
  readonly cache?: CacheStore;
  readonly reader?: WireReader;
};

/** Les albums d'une personne tels que CE lecteur peut les lire, dans l'ordre choisi par l'auteur. */
export async function readStoryHighlights(prisma: PrismaClient, params: ReadParams): Promise<StoryHighlightServed<ServedStory>[]> {
  if (!OBJECT_ID.test(params.ownerId)) return [];
  const rows: HighlightRow[] = await prisma.storyHighlight.findMany({
    where: { ownerId: params.ownerId },
    select: HIGHLIGHT_SELECT,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    take: STORY_HIGHLIGHTS_MAX_PER_OWNER,
  });
  const wanted = [...new Set(rows.flatMap((row) => row.storyIds))];
  const stories = wanted.length === 0 ? [] : await readableStories(prisma, params, wanted);
  const byId = new Map(stories.map((story) => [story.id, story]));
  return rows
    .map((row) => serve(row, row.storyIds.flatMap((id) => byId.get(id) ?? [])))
    .filter((highlight) => params.keepEmpty || highlight.storyCount > 0);
}

async function readableStories(prisma: PrismaClient, params: ReadParams, ids: readonly string[]): Promise<ServedStory[]> {
  const audience = params.viewerId
    ? await viewerPostAudience(prisma, params.viewerId, params.cache)
    : { visibility: PostVisibility.PUBLIC };
  const posts = await prisma.post.findMany({
    where: { ...ownerStoriesWhere(params.ownerId, ids), AND: [audience] },
    select: postInclude,
  });
  const withState = await withViewerPostState(prisma, params.viewerId, posts);
  return withState.map((post) => withMentions(hoistLocationDeep(post), params.reader));
}

async function ownsEveryStory(prisma: PrismaClient, ownerId: string, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return (await prisma.post.count({ where: ownerStoriesWhere(ownerId, ids) })) === ids.length;
}

async function servedOne(prisma: PrismaClient, ownerId: string, row: HighlightRow, reader?: WireReader): Promise<StoryHighlightServed<ServedStory>> {
  const stories = row.storyIds.length === 0 ? [] : await readableStories(prisma, { ownerId, viewerId: ownerId, keepEmpty: true, reader }, row.storyIds);
  const byId = new Map(stories.map((story) => [story.id, story]));
  return serve(row, row.storyIds.flatMap((id) => byId.get(id) ?? []));
}

const findOwn = (prisma: PrismaClient, ownerId: string, id: string) =>
  OBJECT_ID.test(id) ? prisma.storyHighlight.findFirst({ where: { id, ownerId }, select: HIGHLIGHT_SELECT }) : Promise.resolve(null);

export async function createStoryHighlight(prisma: PrismaClient, ownerId: string, body: unknown, reader?: WireReader): Promise<HighlightOutcome<StoryHighlightServed<ServedStory>>> {
  const parsed = storyHighlightCreateSchema.safeParse(body);
  if (!parsed.success) return INVALID_BODY;
  const existing = await prisma.storyHighlight.count({ where: { ownerId } });
  if (existing >= STORY_HIGHLIGHTS_MAX_PER_OWNER) return refuse(409, 'Trop d’albums à la une', 'HIGHLIGHT_LIMIT');
  if (!(await ownsEveryStory(prisma, ownerId, parsed.data.storyIds))) return NOT_OWNED;
  const row = await prisma.storyHighlight.create({
    data: { ownerId, ...parsed.data, order: existing },
    select: HIGHLIGHT_SELECT,
  });
  return { ok: true, value: await servedOne(prisma, ownerId, row, reader) };
}

export async function updateStoryHighlight(prisma: PrismaClient, ownerId: string, id: string, body: unknown, reader?: WireReader): Promise<HighlightOutcome<StoryHighlightServed<ServedStory>>> {
  const parsed = storyHighlightUpdateSchema.safeParse(body);
  if (!parsed.success) return INVALID_BODY;
  if (!(await findOwn(prisma, ownerId, id))) return NOT_FOUND;
  if (parsed.data.storyIds && !(await ownsEveryStory(prisma, ownerId, parsed.data.storyIds))) return NOT_OWNED;
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
  const row = await prisma.storyHighlight.update({ where: { id }, data, select: HIGHLIGHT_SELECT });
  return { ok: true, value: await servedOne(prisma, ownerId, row, reader) };
}

export async function deleteStoryHighlight(prisma: PrismaClient, ownerId: string, id: string): Promise<HighlightOutcome<true>> {
  if (!OBJECT_ID.test(id)) return NOT_FOUND;
  const { count } = await prisma.storyHighlight.deleteMany({ where: { id, ownerId } });
  return count === 0 ? NOT_FOUND : { ok: true, value: true };
}

export async function reorderStoryHighlights(prisma: PrismaClient, ownerId: string, body: unknown, reader?: WireReader): Promise<HighlightOutcome<StoryHighlightServed<ServedStory>[]>> {
  const parsed = storyHighlightOrderSchema.safeParse(body);
  if (!parsed.success) return INVALID_BODY;
  const mine: Array<{ id: string }> = await prisma.storyHighlight.findMany({ where: { ownerId }, select: { id: true } });
  const asked = new Set(parsed.data.ids);
  if (mine.length !== asked.size || mine.some((row) => !asked.has(row.id))) {
    return refuse(400, 'L’ordre doit nommer chaque album une seule fois', 'INVALID_ORDER');
  }
  await Promise.all(parsed.data.ids.map((id, order) => prisma.storyHighlight.updateMany({ where: { id, ownerId }, data: { order } })));
  return { ok: true, value: await readStoryHighlights(prisma, { ownerId, viewerId: ownerId, keepEmpty: true, reader }) };
}
