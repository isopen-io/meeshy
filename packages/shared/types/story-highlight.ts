/**
 * LES STORIES « À LA UNE » D'UNE PERSONNE (#19394, chantier #18857, décision #19393).
 *
 * Un album nommé (« Lisbonne »), glyphé (un nom d'icône du jeu de la planche, `map-pin`),
 * qui range des stories de son AUTEUR dans l'ordre choisi. Mettre une story à la une
 * n'élargit jamais son audience : chaque story ne se sert qu'au lecteur que SA visibilité
 * admet, y compris après son échéance de 20 h ; un album vide pour un lecteur n'existe pas
 * pour lui.
 *
 * Écritures (propriétaire) : `POST /users/me/highlights` (create), `PATCH
 * /users/me/highlights/:id` (update), `PUT /users/me/highlights/order` (order).
 * Lectures : `GET /users/me/highlights` (tout, albums vides compris) et
 * `GET /users/:id/highlights` (sous l'audience de chaque story).
 */
import { z } from 'zod';

export const STORY_HIGHLIGHT_TITLE_MAX_LENGTH = 40;
export const STORY_HIGHLIGHT_GLYPH_MAX_LENGTH = 40;
export const STORY_HIGHLIGHT_MAX_STORIES = 100;
export const STORY_HIGHLIGHTS_MAX_PER_OWNER = 50;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);

const distinct = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

const title = z.string().trim().min(1).max(STORY_HIGHLIGHT_TITLE_MAX_LENGTH);
const glyph = z
  .string()
  .max(STORY_HIGHLIGHT_GLYPH_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const storyIds = z.array(objectId).max(STORY_HIGHLIGHT_MAX_STORIES).refine(distinct, 'storyIds must be distinct');

export const storyHighlightCreateSchema = z.object({ title, glyph, storyIds });

export type StoryHighlightCreateInput = z.infer<typeof storyHighlightCreateSchema>;

export const storyHighlightUpdateSchema = z
  .object({ title: title.optional(), glyph: glyph.optional(), storyIds: storyIds.optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'at least one field');

export type StoryHighlightUpdateInput = z.infer<typeof storyHighlightUpdateSchema>;

export const storyHighlightOrderSchema = z.object({
  ids: z.array(objectId).min(1).max(STORY_HIGHLIGHTS_MAX_PER_OWNER).refine(distinct, 'ids must be distinct'),
});

export type StoryHighlightOrderInput = z.infer<typeof storyHighlightOrderSchema>;

/**
 * Un album SERVI. `storyIds` et `storyCount` ne comptent que les stories que CE lecteur peut
 * lire, dans l'ordre de l'album : jamais l'identifiant ni le nombre d'une story qui lui est
 * fermée. `stories` porte leur charge, la même forme qu'une publication de la fiche.
 */
export type StoryHighlightServed<Story = unknown> = {
  readonly id: string;
  readonly title: string;
  readonly glyph: string;
  readonly order: number;
  readonly storyIds: readonly string[];
  readonly storyCount: number;
  readonly stories: readonly Story[];
  readonly createdAt: string;
  readonly updatedAt: string;
};
