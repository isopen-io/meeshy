/**
 * **LES TRADUCTIONS D'UN TEXTE DE SCÈNE, FUSIONNÉES À LEUR INDEX** (#20287).
 *
 * `story:translation-updated` porte `{ postId, textObjectIndex, translations }`
 * — la carte `{ langue: texte }` d'UN objet texte des effets d'une story, que
 * le pipeline vient de produire. Elle arrive dans la room `feed:<moi>`, que le
 * web rejoint à l'authentification, et sur un contenu qu'il sait déjà rendre
 * (`resolveSceneText`) ; seul l'applicateur manquait, si bien qu'une story
 * ouverte pendant que sa traduction atterrissait restait dans la langue
 * d'origine jusqu'au prochain fetch — là où un POST, lui, basculait.
 *
 * **L'INDEX EST CELUI DE L'ÉNUMÉRATION PLATE DES OBJETS `text`, SANS AUCUN
 * FILTRE.** C'est le piège de ce lot, et il ne se voit pas : le serveur diffuse
 * `servedTextIndex` (`repostCreditChips.ts`), c'est-à-dire le rang dans
 * `storyTranslatableTexts` (`storyEffectsV3.ts`) — TOUS les objets `kind:
 * 'text'` des scènes, dans l'ordre, puce de crédit retirée — tandis que la
 * seule énumération que le web possédait, `sceneTextObjects`
 * (`language-availability.ts`), ÉCARTE les textes blancs. Les deux rendent le
 * même tableau sur une story ordinaire et divergent dès qu'un texte vide
 * traîne dans une scène : la traduction serait alors fusionnée dans le MAUVAIS
 * objet, en silence. Réutiliser l'énumération voisine aurait eu l'air d'une
 * économie.
 *
 * La loi ne fait que RANGER : ce que le lecteur voit est redescendu à chaque
 * peinture par `resolveSceneText` → `served()` → `resolvePrismTranslation`, qui
 * parcourt le prisme dans l'ordre et fait concourir la langue d'origine à SON
 * rang. Une traduction hors du prisme se range sans rien changer.
 */

const recordOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** Les seules entrées retenues d'une carte de traductions : `{ langue: texte }`, textes non vides. */
export function storyTextTranslationsOf(value: unknown): Record<string, string> | null {
  const record = recordOf(value);
  if (record === null) return null;
  const entries = Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0 && entry[0].length > 0,
  );
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

const mergedInto = (existing: unknown, incoming: Readonly<Record<string, string>>): Record<string, string> => ({
  ...(storyTextTranslationsOf(existing) ?? {}),
  ...incoming,
});

const sameTranslations = (existing: unknown, merged: Readonly<Record<string, string>>): boolean => {
  const before = storyTextTranslationsOf(existing) ?? {};
  const keys = Object.keys(merged);
  return keys.length === Object.keys(before).length && keys.every((key) => before[key] === merged[key]);
};

/**
 * Le blob d'effets, avec les traductions fusionnées dans l'objet texte de rang
 * `textObjectIndex`. `null` quand rien ne change — index hors du document,
 * document qui n'est pas un canvas de scènes, ou carte déjà à jour : l'appelant
 * laisse alors sa caisse INTACTE, pour que l'identité de la donnée ne bouge pas
 * et qu'aucun écran ne repeigne.
 */
export function withStoryTextObjectTranslations(params: {
  readonly storyEffects: unknown;
  readonly textObjectIndex: number;
  readonly translations: Readonly<Record<string, string>>;
}): unknown | null {
  const { storyEffects, textObjectIndex, translations } = params;
  const blob = recordOf(storyEffects);
  if (blob === null || !Number.isInteger(textObjectIndex) || textObjectIndex < 0) return null;

  const scenes = arrayOf(blob.scenes);
  if (scenes.length === 0) return null;

  let seen = 0;
  let touched = false;
  const nextScenes = scenes.map((scene) => {
    const sceneRecord = recordOf(scene);
    if (sceneRecord === null) return scene;
    const objects = arrayOf(sceneRecord.objects);
    if (objects.length === 0) return scene;

    const nextObjects = objects.map((object) => {
      const objectRecord = recordOf(object);
      if (objectRecord === null || objectRecord.kind !== 'text') return object;
      const rank = seen;
      seen += 1;
      if (rank !== textObjectIndex) return object;

      const payload = recordOf(objectRecord.payload) ?? {};
      const merged = mergedInto(payload.translations, translations);
      if (sameTranslations(payload.translations, merged)) return object;
      touched = true;
      return { ...objectRecord, payload: { ...payload, translations: merged } };
    });

    return nextObjects.some((object, at) => object !== objects[at]) ? { ...sceneRecord, objects: nextObjects } : scene;
  });

  return touched ? { ...blob, scenes: nextScenes } : null;
}
