import { z } from 'zod';

/**
 * Les BORNES que la passerelle impose à ce que `StoryEffectsSchema` laisse passer en `passthrough` (#13586).
 *
 * Le chemin v3 NON strict (sans `CANVAS_V3_WRITE_STRICT`, éteint en production) ne valide aucune scène : un
 * document `v:3` n'était borné que par les 256 KB globaux, et pouvait imposer aux lecteurs une durée de 1e308
 * ou des keyframes à ±1e308. Ces schémas bornent les GRANDEURS NUMÉRIQUES (finies, dans les plages que les
 * composeurs écrivent) et le nombre de scènes (10, plafond des trois composeurs).
 *
 * L'échelle n'a pas de plafond (#14298) : un objet s'agrandit sans limite chez les trois composeurs, et la passerelle
 * n'en exige qu'un nombre fini, positif ou nul.
 *
 * Ils ne bornent NI le nombre d'objets par scène, NI la longueur des textes et de leurs traductions, NI le
 * nombre de keyframes : le composeur iOS en production n'en plafonne aucun (stickers, longueur de texte,
 * `AddKeyframeCommand`), et les traductions sont écrites par le serveur lui-même, puis renvoyées par le client
 * à l'édition. Un plafond plus bas que ce que publie un client installé refuserait sa publication entière
 * (400 `VALIDATION_ERROR`) — et rendrait inéditable une story déjà stockée. Le volume reste borné par les
 * 256 KB de `StoryEffectsSchema`. Tout le reste voyage (`passthrough`).
 */

export const STORY_SCENES_MAX = 10;
const STORY_SECONDS_MAX = 86400;

export const StoryTimelineDurationSchema = z.number().finite().min(0).max(STORY_SECONDS_MAX).nullish();

export const StoryKeyframeBoundsSchema = z.object({
  time: z.number().finite().min(0).max(STORY_SECONDS_MAX),
  x: z.number().finite().min(-10).max(10).nullish(),
  y: z.number().finite().min(-10).max(10).nullish(),
  scale: z.number().finite().min(0).nullish(),
  opacity: z.number().finite().min(0).max(1).nullish(),
  volume: z.number().finite().min(0).max(2).nullish(),
}).passthrough();

export const StoryKeyframesBoundsSchema = z.array(StoryKeyframeBoundsSchema).nullish();

const ObjectBoundsSchema = z.object({
  timing: z.object({ keyframes: StoryKeyframesBoundsSchema }).passthrough().nullish(),
}).passthrough();

const SceneBoundsSchema = z.object({
  objects: z.array(ObjectBoundsSchema).optional(),
  timelineDuration: StoryTimelineDurationSchema,
}).passthrough();

export const StoryScenesBoundsSchema = z.array(SceneBoundsSchema).max(STORY_SCENES_MAX).optional();
