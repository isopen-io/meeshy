/**
 * Dépouille la carte des traductions d'un message
 * (`{ language|targetLanguage, content|translatedContent }[]`) en
 * `Record<langue → texte>` keyé par la langue STOCKÉE — la forme qu'attend
 * {@link resolvePrismTranslation} (`packages/shared/utils/conversation-helpers`).
 *
 * SSOT UNIQUE de cet adaptateur côté web : `messages-display.tsx` (corps du
 * message) ET `use-message-display.ts` (corps + aperçu de réponse) le consomment.
 * La clé rendue est comparée plus tard par une normalisation (sameLanguage /
 * normalizeLanguageForDedup), donc la langue verbatim suffit ici.
 */
export const buildTranslationRecord = (translations: unknown): Record<string, string> => {
  const record: Record<string, string> = {};
  if (!Array.isArray(translations)) return record;
  for (const entry of translations as ReadonlyArray<{
    language?: string;
    targetLanguage?: string;
    content?: string;
    translatedContent?: string;
  }>) {
    const key = entry?.language || entry?.targetLanguage;
    const text = entry?.content ?? entry?.translatedContent;
    if (typeof key === 'string' && key.trim() !== '' && typeof text === 'string' && text.trim() !== '') {
      record[key] = text;
    }
  }
  return record;
};
