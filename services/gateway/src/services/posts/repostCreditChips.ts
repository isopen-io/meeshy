import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * **La puce « Reposté de @auteur » ne survit à une republication directe que
 * si l'original était PUBLIC** (porteur 2026-09-01, #9953, #10365).
 *
 * La puce est un texte VERROUILLÉ du canvas (`isLocked: true`) : v1
 * `textObjects[]`, v3 `scenes[].objects[kind=text].payload`. Elle NOMME un
 * auteur devant tous ceux qui verront la republication — sur un original
 * d'amis, privé ou communautaire, elle le nommerait auprès d'un public que son
 * original n'avait pas. iOS applique la règle dans le composer
 * (`StoryRepostCredit.isDue` / `stripped`, qui tient les textes verrouillés
 * pour exclusivement des crédits) ; `repostPost` ne passe pas par le composer
 * et recopiait `storyEffects` tel quel.
 *
 * Fail-closed : une audience absente ou inconnue n'accorde pas la puce. La loi
 * d'audience interdisant d'élargir, un original PUBLIC garantit que toute la
 * chaîne l'était.
 */
export function repostCreditIsDue(originalVisibility: string | null | undefined): boolean {
  return originalVisibility === 'PUBLIC';
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLockedV1Text = (value: unknown): boolean => isRecord(value) && value['isLocked'] === true;

const isLockedV3Text = (value: unknown): boolean =>
  isRecord(value)
  && value['kind'] === 'text'
  && isRecord(value['payload'])
  && value['payload']['isLocked'] === true;

const withoutLocked = (items: unknown, isCredit: (item: unknown) => boolean): unknown[] | null => {
  if (!Array.isArray(items)) return null;
  const kept = items.filter((item) => !isCredit(item));
  return kept.length === items.length ? null : kept;
};

const scenesWithoutCredits = (scenes: unknown): unknown[] | null => {
  if (!Array.isArray(scenes)) return null;
  const next = scenes.map((scene) => {
    if (!isRecord(scene)) return scene;
    const objects = withoutLocked(scene['objects'], isLockedV3Text);
    return objects ? { ...scene, objects } : scene;
  });
  return next.some((scene, index) => scene !== scenes[index]) ? next : null;
};

/**
 * Les effets d'une story débarrassés de toute puce de crédit, sous les DEUX
 * formes de canvas à la fois : un document v3 peut traîner un `textObjects`
 * hérité que des clients anciens lisent encore. Rend le blob reçu, à
 * l'identique, quand il ne porte aucune puce.
 */
export function withoutRepostCredits(effects: unknown): unknown {
  if (!isRecord(effects)) return effects;
  const textObjects = withoutLocked(effects['textObjects'], isLockedV1Text);
  const scenes = scenesWithoutCredits(effects['scenes']);
  if (!textObjects && !scenes) return effects;
  return {
    ...effects,
    ...(textObjects ? { textObjects } : {}),
    ...(scenes ? { scenes } : {}),
  };
}

/** Les effets que la copie d'une republication directe emporte. */
export function repostSnapshotStoryEffects(
  effects: Prisma.InputJsonValue | undefined,
  originalVisibility: string | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (effects === undefined || repostCreditIsDue(originalVisibility)) return effects;
  return withoutRepostCredits(effects) as Prisma.InputJsonValue;
}
