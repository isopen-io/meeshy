import type { Prisma } from '@meeshy/shared/prisma/client';

import { isCanvasV3OrNewer } from './storyEffectsV3';

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

/**
 * **La même loi à la LECTURE** (#10498) : une republication est servie avec
 * `repostOf`, le canvas de sa source, et le sien propre. Les deux portent une
 * puce qui nomme un tiers ; ni l'une ni l'autre ne part si la source n'est pas
 * PUBLIC AUJOURD'HUI — ce qui couvre aussi une source repassée en audience
 * restreinte après la copie, et les lignes écrites avant la règle.
 *
 * Ne décide que sur une audience CHARGÉE (`visibility` présente, même nulle :
 * fail-closed). Absente, la publication a déjà été projetée — la projection
 * retire la colonne — et elle est rendue telle quelle : la projection est
 * idempotente. Une source disparue (`repostOf` nul) ne retire rien, la règle
 * ayant été appliquée à l'écriture.
 */
export function withServedRepostCredits<T extends object>(post: T): T {
  const source = (post as { repostOf?: unknown }).repostOf;
  if (!isRecord(source) || !('visibility' in source)) return post;
  if (repostCreditIsDue(source['visibility'] as string | null | undefined)) return post;
  const own = (post as { storyEffects?: unknown }).storyEffects;
  const ownServed = withoutRepostCredits(own);
  const cited = source['storyEffects'];
  const citedServed = withoutRepostCredits(cited);
  if (ownServed === own && citedServed === cited) return post;
  return {
    ...post,
    ...(ownServed !== own ? { storyEffects: ownServed } : {}),
    ...(citedServed !== cited ? { repostOf: { ...source, storyEffects: citedServed } } : {}),
  };
}

const flatTextLocks = (effects: unknown): boolean[] => {
  if (!isRecord(effects)) return [];
  if (isCanvasV3OrNewer(effects)) {
    return (Array.isArray(effects['scenes']) ? effects['scenes'] : []).flatMap((scene) => (
      isRecord(scene) && Array.isArray(scene['objects'])
        ? scene['objects'].filter((object) => isRecord(object) && object['kind'] === 'text').map(isLockedV3Text)
        : []
    ));
  }
  return Array.isArray(effects['textObjects']) ? effects['textObjects'].map(isLockedV1Text) : [];
};

/**
 * L'index PLAT d'un texte dans le canvas tel que `withServedRepostCredits` le
 * SERT (#10498) — l'index que les clients fusionnent. `null` : ce texte est une
 * puce que le lecteur ne reçoit pas, rien ne doit en partir.
 */
export function servedTextIndex(params: {
  readonly storyEffects: unknown;
  readonly sourceVisibility: string | null | undefined;
  readonly isRepost: boolean;
  readonly textIndex: number;
}): number | null {
  if (!params.isRepost || repostCreditIsDue(params.sourceVisibility)) return params.textIndex;
  const locks = flatTextLocks(params.storyEffects);
  if (locks[params.textIndex] === true) return null;
  return params.textIndex - locks.slice(0, params.textIndex).filter(Boolean).length;
}
