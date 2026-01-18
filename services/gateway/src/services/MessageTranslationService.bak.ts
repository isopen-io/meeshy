/**
 * LEGACY COMPATIBILITY LAYER
 *
 * Ce fichier maintient la compatibilité avec le code existant qui importe
 * depuis './services/MessageTranslationService'
 *
 * La logique a été refactorisée dans './services/message-translation/'
 *
 * @deprecated Import depuis './services/message-translation' à la place
 */

export {
  MessageTranslationService,
  TranslationCache,
  LanguageCache,
  TranslationStats,
  EncryptionHelper
} from './message-translation';

export type {
  MessageData,
  TranslationServiceStats,
  TranslationEncryptionData
} from './message-translation';
