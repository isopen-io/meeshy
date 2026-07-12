/**
 * Transformation des traductions entre format JSON (MongoDB) et format array (API)
 *
 * Pour maintenir la rétrocompatibilité avec le frontend après migration
 * de MessageTranslation (collection séparée) vers Message.translations (JSON)
 */

import type { MessageTranslation } from '@meeshy/shared/types';

/**
 * Structure interne du champ Message.translations (JSON)
 * Correspond au schéma Prisma Message.translations
 */
export interface MessageTranslationJSON {
  text: string;
  translationModel: 'basic' | 'medium' | 'premium';
  confidenceScore?: number;
  isEncrypted?: boolean;
  encryptionKeyId?: string | null;
  encryptionIv?: string | null;
  encryptionAuthTag?: string | null;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Transforme Message.translations (JSON) vers format API (array)
 *
 * @param messageId - ID du message
 * @param translationsJson - Objet JSON des traductions depuis MongoDB
 * @param options.languages - Si fourni, ne sérialise que ces langues (filtrage
 *   bandwidth opt-in : un client ne demande que ses langues du Prisme au lieu de
 *   recevoir les N traductions). Comparaison insensible à la casse. Absent =
 *   toutes les langues (comportement historique).
 * @returns Array de MessageTranslation pour rétrocompatibilité frontend
 *
 * @example
 * // MongoDB: { "en": { text: "Hello", ... }, "es": { text: "Hola", ... } }
 * // API: [{ id: "msg-en", targetLanguage: "en", translatedContent: "Hello", ... }]
 */
export function transformTranslationsToArray(
  messageId: string,
  translationsJson: Record<string, MessageTranslationJSON> | null | undefined,
  options?: { languages?: readonly string[] }
): MessageTranslation[] {
  if (!translationsJson) return [];

  const langFilter = options?.languages && options.languages.length > 0
    ? new Set(options.languages.map((l) => l.toLowerCase()))
    : null;

  return Object.entries(translationsJson)
    .filter(([lang]) => !langFilter || langFilter.has(lang.toLowerCase()))
    .map(([lang, data]) => ({
      id: `${messageId}-${lang}`, // ID synthétique pour compatibilité
      messageId,
      targetLanguage: lang,
      translatedContent: data.text,
      translationModel: data.translationModel,
      confidenceScore: data.confidenceScore,
      isEncrypted: data.isEncrypted || false,
      encryptionKeyId: data.encryptionKeyId || undefined,
      encryptionIv: data.encryptionIv || undefined,
      encryptionAuthTag: data.encryptionAuthTag || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    }));
}

/**
 * Crée un objet de traduction JSON pour stockage dans Message.translations
 *
 * @param params - Paramètres de la traduction
 * @returns Objet JSON à stocker dans MongoDB
 *
 * @example
 * const json = createTranslationJSON({
 *   text: "Hello world",
 *   translationModel: "premium",
 *   confidenceScore: 0.95
 * });
 * // Résultat: { text: "Hello world", translationModel: "premium", ... }
 */
export function createTranslationJSON(params: {
  text: string;
  translationModel: 'basic' | 'medium' | 'premium';
  confidenceScore?: number;
  isEncrypted?: boolean;
  encryptionKeyId?: string | null;
  encryptionIv?: string | null;
  encryptionAuthTag?: string | null;
  preserveCreatedAt?: Date;
}): MessageTranslationJSON {
  const now = new Date();
  return {
    text: params.text,
    translationModel: params.translationModel,
    confidenceScore: params.confidenceScore,
    isEncrypted: params.isEncrypted || false,
    encryptionKeyId: params.encryptionKeyId || null,
    encryptionIv: params.encryptionIv || null,
    encryptionAuthTag: params.encryptionAuthTag || null,
    createdAt: params.preserveCreatedAt || now,
    updatedAt: now
  };
}

/**
 * Récupère une traduction spécifique depuis le JSON
 *
 * @param messageId - ID du message
 * @param translations - Objet JSON des traductions
 * @param targetLanguage - Langue cible. Recherche insensible à la casse,
 *   cohérente avec `transformTranslationsToArray` (une correspondance exacte
 *   est privilégiée avant le repli casse-insensible).
 * @returns MessageTranslation ou undefined si pas trouvée
 */
export function getTranslationFromJSON(
  messageId: string,
  translations: Record<string, MessageTranslationJSON> | null | undefined,
  targetLanguage: string
): MessageTranslation | undefined {
  if (!translations) {
    return undefined;
  }

  const target = targetLanguage.toLowerCase();
  const data =
    translations[targetLanguage] ??
    Object.entries(translations).find(([lang]) => lang.toLowerCase() === target)?.[1];

  if (!data) {
    return undefined;
  }

  return {
    id: `${messageId}-${targetLanguage}`,
    messageId,
    targetLanguage,
    translatedContent: data.text,
    translationModel: data.translationModel,
    confidenceScore: data.confidenceScore,
    isEncrypted: data.isEncrypted || false,
    encryptionKeyId: data.encryptionKeyId || undefined,
    encryptionIv: data.encryptionIv || undefined,
    encryptionAuthTag: data.encryptionAuthTag || undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}
