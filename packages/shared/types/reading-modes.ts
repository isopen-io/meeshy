/**
 * Modes de lecture des conversations — La Lentille.
 *
 * Contrat gelé, définitions reprises mot pour mot.
 * @see tasks/lentille-implementation-contract.md §3.1
 */
import { z } from 'zod'

/**
 * export type ConversationReadingMode =
 *   | 'focal'    // rangée plate + perspective — défaut sous drapeau
 *   | 'script'   // même rangée plate, densité uniforme, aucune perspective
 *   | 'summary'  // Résumé Vivant — l'état d'abord, la preuve à un tap
 *   | 'river'    // en sursis : présent au catalogue, jamais sélectionnable
 *   | 'bubbles'; // rendu bulle historique — uniquement drapeau éteint
 */
export const ConversationReadingModeSchema = z.enum([
  'focal',
  'script',
  'summary',
  'river',
  'bubbles',
])
export type ConversationReadingMode = z.infer<typeof ConversationReadingModeSchema>

/** Ce que l'utilisateur a choisi. `auto` rend la main à l'orchestrateur. */
export const ReadingModePreferenceSchema = z.enum([
  'auto',
  'focal',
  'script',
  'resume',
  'riviere',
])
export type ReadingModePreference = z.infer<typeof ReadingModePreferenceSchema>
