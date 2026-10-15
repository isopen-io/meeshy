import { isCanvasV3OrNewer } from './storyEffectsV3';

/**
 * **Aucune puce « Reposté de @auteur » ne voyage** (porteur 2026-10-13,
 * #10524) : le crédit d'une republication vit dans l'EN-TÊTE, après la date,
 * sur les deux clients. La règle d'audience de #10365, #10497 et #10498, qui
 * gardait la puce d'un original PUBLIC, est retirée.
 *
 * La puce est un texte VERROUILLÉ du canvas (`isLocked: true`) : v1
 * `textObjects[]`, v3 `scenes[].objects[kind=text].payload`. Le verrou n'existe
 * que sur elle (`StorySceneObjectPredicates.isLocked`, SDK) : tout texte
 * verrouillé est une puce, et se retire sans condition, à l'écriture comme à
 * la lecture — ce qui couvre les lignes écrites avant la règle, sans
 * migration.
 */
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

/** Les effets qu'une écriture enregistre : jamais de puce de crédit. */
export function storyEffectsWithoutCredits<T>(effects: T): T {
  return withoutRepostCredits(effects) as T;
}

/**
 * **La même loi à la LECTURE** : une publication est servie avec son canvas
 * et, pour une republication, celui de sa source (`repostOf`). Ni l'un ni
 * l'autre ne garde de puce, quelle que soit l'audience de la source, chargée
 * ou non, et même quand la source a disparu. Idempotente.
 */
export function withServedRepostCredits<T extends object>(post: T): T {
  const source = (post as { repostOf?: unknown }).repostOf;
  const own = (post as { storyEffects?: unknown }).storyEffects;
  const ownServed = withoutRepostCredits(own);
  const cited = isRecord(source) ? source['storyEffects'] : undefined;
  const citedServed = withoutRepostCredits(cited);
  if (ownServed === own && citedServed === cited) return post;
  return {
    ...post,
    ...(ownServed !== own ? { storyEffects: ownServed } : {}),
    ...(citedServed !== cited && isRecord(source) ? { repostOf: { ...source, storyEffects: citedServed } } : {}),
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
 * Les textes du canvas moins ses puces — `texts` suit l'énumération PLATE des
 * textes (`storyTranslatableTexts`), celle des verrous.
 */
export function textsWithoutCredits<T>(storyEffects: unknown, texts: readonly T[]): T[] {
  const locks = flatTextLocks(storyEffects);
  return texts.filter((_, index) => locks[index] !== true);
}

/**
 * L'index PLAT d'un texte dans le canvas tel que `withServedRepostCredits` le
 * SERT (#10498) — l'index que les clients fusionnent. `null` : ce texte est une
 * puce que le lecteur ne reçoit pas, rien ne doit en partir.
 */
export function servedTextIndex(params: {
  readonly storyEffects: unknown;
  readonly textIndex: number;
}): number | null {
  const locks = flatTextLocks(params.storyEffects);
  if (locks[params.textIndex] === true) return null;
  return params.textIndex - locks.slice(0, params.textIndex).filter(Boolean).length;
}
