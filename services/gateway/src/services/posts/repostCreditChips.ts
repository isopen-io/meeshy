import type { Prisma } from '@meeshy/shared/prisma/client';
import { isCanvasV3OrNewer } from './storyEffectsV3';

/**
 * **La puce de crédit d'une republication ne survit que si l'original était
 * PUBLIC** (porteur, 2026-09-01 puis 2026-10-10, #9953).
 *
 * La puce « Reposté de @auteur » est un texte VERROUILLÉ posé sur le canvas
 * (`isLocked: true` — v1 `textObjects[]`, v3 `scenes[].objects[kind=text]
 * .payload`). iOS ne la pose que sur un original public
 * (`StoryRepostCredit.isDue`) et retire toujours les puces héritées avant
 * d'en décider. La republication DIRECTE (`repostPost`, un tap depuis le
 * lecteur) ne passe pas par le composer : elle recopie `storyEffects` tel
 * quel, puces héritées comprises. Sans cette règle, republier une
 * republication FRIENDS gardait la signature d'un tiers devant une audience
 * que son original n'avait pas.
 *
 * Fail-closed : une audience inconnue n'autorise pas la puce. La loi
 * d'audience interdisant d'élargir, un original PUBLIC garantit que toute la
 * chaîne l'était.
 */
export function repostCreditIsDue(originalVisibility: string | null | undefined): boolean {
  return typeof originalVisibility === 'string' && originalVisibility.toUpperCase() === 'PUBLIC';
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLockedV1Text(value: unknown): boolean {
  return isRecord(value) && value['isLocked'] === true;
}

function isLockedV3Text(value: unknown): boolean {
  if (!isRecord(value) || value['kind'] !== 'text') return false;
  const payload = value['payload'];
  return isRecord(payload) && payload['isLocked'] === true;
}

export interface WithoutRepostCreditsResult {
  effects: unknown;
  changed: boolean;
}

/** Les effets d'une story débarrassés de toute puce de crédit (textes verrouillés). */
export function withoutRepostCredits(effects: unknown): WithoutRepostCreditsResult {
  if (!isRecord(effects)) return { effects, changed: false };

  if (isCanvasV3OrNewer(effects)) {
    const scenes: unknown = (effects as JsonRecord)['scenes'];
    if (!Array.isArray(scenes)) return { effects, changed: false };
    let changed = false;
    const nextScenes = scenes.map((scene: unknown) => {
      if (!isRecord(scene) || !Array.isArray(scene['objects'])) return scene;
      const objects = scene['objects'] as unknown[];
      const kept = objects.filter((object) => !isLockedV3Text(object));
      if (kept.length === objects.length) return scene;
      changed = true;
      return { ...scene, objects: kept };
    });
    return changed ? { effects: { ...effects, scenes: nextScenes }, changed: true } : { effects, changed: false };
  }

  const texts: unknown = effects['textObjects'];
  if (!Array.isArray(texts)) return { effects, changed: false };
  const kept = texts.filter((text: unknown) => !isLockedV1Text(text));
  if (kept.length === texts.length) return { effects, changed: false };
  return { effects: { ...effects, textObjects: kept }, changed: true };
}

/** Les effets que la copie d'une republication emporte. */
export function repostSnapshotStoryEffects(
  effects: Prisma.InputJsonValue | undefined,
  originalVisibility: string | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (effects === undefined || repostCreditIsDue(originalVisibility)) return effects;
  return withoutRepostCredits(effects).effects as Prisma.InputJsonValue;
}
