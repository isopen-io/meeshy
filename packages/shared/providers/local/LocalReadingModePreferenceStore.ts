/**
 * Substitut local du store de préférence de mode de lecture — M-047, LWS-2bis.
 *
 * Implémentation `ReadingModePreferenceStoring`
 * (`../ReadingModePreferenceStoring.ts`, gelé S1) : une `Map` en mémoire,
 * clé `(scope, conversationId)`, épaulée par un ADAPTATEUR DE PERSISTANCE
 * optionnel — `LocalReadingModePreferencePersisting` — que le client
 * web/iOS branche sur son propre stockage (`localStorage` côté web,
 * `UserDefaults` côté Swift). Sans adaptateur, le store reste purement en
 * mémoire (perdu à la prochaine session) — comportement valide, pas une
 * erreur : `get`/`set`/`onChange` fonctionnent identiquement.
 *
 * Défaut `'auto'` (contrat gelé) quand rien n'est mémorisé pour ce
 * `(scope, conversationId)`, ni en mémoire, ni chez l'adaptateur — rend la
 * main à l'orchestrateur, jamais un mode figé par défaut.
 *
 * Ce store n'est pas du travail jeté (voir docstring du protocole) : après
 * LWS-3, il devient le cache optimiste devant le canal serveur versionné
 * `UserConversationPreferences`, sans changer d'injection ni d'UI.
 *
 * GARDE SOURCE (contrat LWS-2bis) : aucun fichier de peau ne doit nommer
 * `LocalReadingModePreferenceStore` directement — seule la couche
 * d'injection choisit l'implémentation.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis, LWS-3
 * @see tasks/lentille-workshop-execution.md M-047
 */
import { ReadingModePreferenceSchema, type ReadingModePreference } from '../../types/reading-modes.js'
import type {
  ReadingModePreferenceScope,
  ReadingModePreferenceStoring,
} from '../ReadingModePreferenceStoring.js'

const DEFAULT_PREFERENCE: ReadingModePreference = 'auto'

/**
 * Adaptateur de persistance optionnel — clé/valeur STRING, agnostique de
 * tout mécanisme de stockage précis. Le web branche `localStorage.getItem`/
 * `setItem`, iOS branche `UserDefaults` côté Swift (au travers d'un pont,
 * hors périmètre TypeScript). Ce store ne monte lui-même AUCUN stockage.
 */
export interface LocalReadingModePreferencePersisting {
  read(key: string): string | null
  write(key: string, value: string): void
}

const keyFor = (scope: ReadingModePreferenceScope): string => scope.conversationId

const parsePreference = (raw: string | null): ReadingModePreference | null => {
  if (raw === null) return null
  const result = ReadingModePreferenceSchema.safeParse(raw)
  return result.success ? result.data : null
}

type ChangeListener = (scope: ReadingModePreferenceScope, value: ReadingModePreference) => void

export class LocalReadingModePreferenceStore implements ReadingModePreferenceStoring {
  private readonly values = new Map<string, ReadingModePreference>()
  private readonly listeners = new Set<ChangeListener>()

  constructor(private readonly persistence?: LocalReadingModePreferencePersisting) {}

  async get(scope: ReadingModePreferenceScope): Promise<ReadingModePreference> {
    const key = keyFor(scope)

    const cached = this.values.get(key)
    if (cached !== undefined) return cached

    const persisted = parsePreference(this.persistence?.read(key) ?? null)
    if (persisted !== null) {
      this.values.set(key, persisted)
      return persisted
    }

    return DEFAULT_PREFERENCE
  }

  async set(
    scope: ReadingModePreferenceScope,
    value: ReadingModePreference,
    _opts?: { optimistic?: boolean },
  ): Promise<void> {
    const key = keyFor(scope)
    this.values.set(key, value)
    this.persistence?.write(key, value)
    this.listeners.forEach((listener) => listener(scope, value))
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.listeners.delete(cb)
    }
  }
}
