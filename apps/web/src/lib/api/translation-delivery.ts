import type { PostTranslationUpdatedEventData } from '@meeshy/shared/types/post';

/**
 * **UNE TRADUCTION LIVRÉE EN DIRECT, ET SA FUSION PAR LANGUE — SITE UNIQUE**
 * des événements `…:translation-updated` que web-v2 écoute : le texte d'une
 * publication et la légende d'un média (`feed-realtime.ts`, #7383, #7382), le
 * texte d'un commentaire (`publication-comments.ts`, #7394).
 *
 * Le pipeline NLLB livre UNE traduction d'UN contenu, jamais le contenu
 * entier, et les trois charges partagent la même paire `language` +
 * `translation { text, translationModel, confidenceScore?, createdAt }`
 * (`PostTranslationUpdatedEventData`, `MediaCaptionTranslationUpdatedEventData`,
 * `CommentTranslationUpdatedEventData`, `packages/shared/types/post.ts`). Ce
 * qui les distingue — l'adresse du contenu (`postId`, `mediaId`, `commentId`)
 * — reste chez chaque appelant.
 *
 * Ce module vit À PART pour une raison de POIDS : `feed-realtime.ts` est tiré
 * STATIQUEMENT par le chunk `realtime`, `publication-comments.ts` par un
 * `import()` (D-98). Chacun importe ces quelques lignes sans emporter l'autre.
 *
 * **LA LOI NE FAIT QUE RANGER, ELLE N'ÉLIT RIEN.** La traduction entre dans la
 * carte de SON contenu, à sa langue ; ce que le lecteur voit est redescendu à
 * chaque peinture par le résolveur (`served()` → `resolvePrismTranslation`),
 * qui parcourt le prisme dans l'ordre et fait concourir la langue d'origine à
 * SON rang. Aucune « dernière reçue » ne détrône un rang supérieur, et aucun
 * repli sur `translations[0]`.
 */
export type TranslationEntry = PostTranslationUpdatedEventData['translation'];

export type TranslationDelivery = { readonly language: string; readonly translation: TranslationEntry };

const objectOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

export const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

const translationOf = (value: unknown): TranslationEntry | null => {
  const t = objectOf(value);
  if (t === null || typeof t.text !== 'string' || typeof t.translationModel !== 'string' || typeof t.createdAt !== 'string') return null;
  const confidence = t.confidenceScore;
  return confidence === undefined || (typeof confidence === 'number' && Number.isFinite(confidence)) ? (t as TranslationEntry) : null;
};

/** La langue et la traduction d'une charge, vérifiées — `null` dès que l'une
 * manque ou n'a pas sa forme : un événement d'une version voisine ne casse pas
 * l'écran. */
export function translationDeliveryOf(payload: unknown): TranslationDelivery | null {
  const p = objectOf(payload);
  const translation = translationOf(p?.translation);
  if (translation === null || !nonEmpty(p?.language)) return null;
  return { language: p.language, translation };
}

/**
 * LA FUSION PAR LANGUE — l'appelant remet LA carte du contenu visé
 * (`Post.translations`, `PostMedia.captionTranslations` ou
 * `PostComment.translations` ; jamais `alt`, dont la traduction a sa propre
 * carte). Une langue déjà tenue est REMPLACÉE, jamais doublée.
 *
 * `null` quand cette langue porte déjà ce texte : rien de ce que le lecteur
 * verrait ne change (une rediffusion à la reconnexion), la carte reste la
 * MÊME référence, et aucune caisse n'est réécrite — réécrire une donnée égale
 * rendrait FRAÎCHE une caisse périmée (`card-caches.ts`, `unlessSame`).
 */
export function mergedTranslations(held: unknown, { language, translation }: TranslationDelivery): Record<string, unknown> | null {
  const record = Array.isArray(held) ? {} : (objectOf(held) ?? {});
  return objectOf(record[language])?.text === translation.text ? null : { ...record, [language]: translation };
}
