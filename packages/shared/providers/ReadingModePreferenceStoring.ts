/**
 * Protocole de la préférence de mode de lecture — LWS-2bis, gelé ici (S1).
 *
 * Un seul protocole, deux implémentations : le store local (substitut,
 * M-047 — `UserDefaults` iOS / store web, clé `(scope, conversationId)`,
 * mémorisé PAR APPAREIL, pas encore synchronisé) et, après LWS-3, le MÊME
 * store rétrogradé en cache optimiste devant `UserConversationPreferences`
 * (canal versionné, multi-appareils — E9, workshop A5). Le store local
 * n'est donc pas du travail jeté : il devient le cache optimiste quand le
 * canal serveur atterrit. La bascule change l'injection, jamais l'UI.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis, LWS-3
 * @see tasks/lentille-focal-workshop.md §4.2
 */
import type { ReadingModePreference } from '../types/reading-modes.js'

export type ReadingModePreferenceScope = {
  conversationId: string
}

export interface ReadingModePreferenceStoring {
  /**
   * Défaut `'auto'` quand rien n'est mémorisé pour ce `(scope,
   * conversationId)` — rend la main à l'orchestrateur, jamais un mode figé
   * par défaut.
   */
  get(scope: ReadingModePreferenceScope): Promise<ReadingModePreference>

  /**
   * `opts.optimistic` — écriture locale immédiate avant confirmation
   * réseau, la posture qui deviendra la règle une fois LWS-3 atterri (ce
   * store passe alors en cache optimiste devant le canal serveur
   * versionné, dont le `version: { increment: 1 }` atomique arbitre les
   * écritures concurrentes).
   */
  set(
    scope: ReadingModePreferenceScope,
    value: ReadingModePreference,
    opts?: { optimistic?: boolean },
  ): Promise<void>

  /**
   * S'abonne aux changements de préférence, tous scopes confondus.
   * Retourne une fonction de désabonnement idempotente : l'appeler
   * plusieurs fois ne doit ni lever ni notifier deux fois.
   */
  onChange(cb: (scope: ReadingModePreferenceScope, value: ReadingModePreference) => void): () => void
}
