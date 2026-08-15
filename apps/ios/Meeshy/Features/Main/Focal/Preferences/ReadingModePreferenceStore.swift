import Foundation

/// Miroir Swift du mode RENDU, réutilisé tel quel plutôt que redéclaré.
///
/// RE-PREUVE (F-080) : le contrat §3.1 décrit un `ConversationReadingMode`
/// top-level (`Focal/Core/ConversationReadingMode.swift`, propriété WS-0).
/// Ce fichier n'existe pas dans le Core gelé (M-042/043/044 n'ont livré que
/// `ReadingModeOrchestrator`, `FocalFocusCurve`, `ScrollTimePillLaw`) — le
/// SEUL type qui joue ce rôle aujourd'hui est
/// `ReadingModeOrchestrator.ConversationReadingMode` (nichée), dont les
/// `rawValue` (`"focal"/"script"/"summary"/"river"/"bubbles"`) coïncident
/// EXACTEMENT avec ceux du contrat (`.livingSummary = "summary"`,
/// `.bubbleLegacy = "bubbles"` — seuls les noms de cas diffèrent, jamais les
/// valeurs persistées). Réutiliser ce type (Single Source of Truth,
/// `CLAUDE.md` racine) plutôt que d'en déclarer un second est le même choix
/// que `Lentille/Core/LentilleProviders.swift` a fait pour
/// `ReadingModePreference` — voir son commentaire "Collision de nom".
/// Écart à corriger quand WS-0 livrera le fichier Core décrit par le
/// contrat : ce typealias disparaît alors au profit du type réel.
typealias ConversationReadingMode = ReadingModeOrchestrator.ConversationReadingMode

/// Stockage local, scopé par lecteur, du choix de mode de lecture — contrat
/// `focal-implementation-contract.md` §3.5/§WS-1.
///
/// **Collision de nom évitée, PAS arbitrée** (F-080) : le contrat nomme ce
/// protocole `ReadingModePreferenceStoring`, comme
/// `Lentille/Core/LentilleProviders.swift` (M-048, LWS-2bis GELÉ, propriété
/// Lentille — hors périmètre Focal, lecture seule). Les deux protocoles
/// vivraient dans le MÊME module `Meeshy` : une redéclaration stricte du nom
/// romprait la compilation, quelle que soit leur forme (l'un `Sendable`
/// asynchrone clé `conversationId` seul, mirror LWS-2bis pour la bascule
/// d'injection réseau ; l'autre — celui-ci — synchrone, `AnyObject`, clé
/// `(conversationId, scope)` + `lastOpenedAt`/`noteOpened` pour la branche
/// d'absence de l'orchestrateur). `LentilleProviders.swift` documentait déjà
/// ce risque et renvoyait l'arbitrage du NOM à l'intégration V3. Ce fichier
/// tranche du côté qui ne touche pas un fichier gelé propriété d'un autre
/// workstream : `FocalReadingModePreferenceStoring` ici,
/// `ReadingModePreferenceStoring` intact côté Lentille. Signalé en tête de
/// rapport F-080 pour arbitrage ultérieur si un nom unique est souhaité.
/// `nonisolated` : cible `Meeshy` isolée `@MainActor` par défaut
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION` — même contrainte documentée par
/// `Focal/Core/ScrollTimePillLaw.swift` et les protocoles LWS-2bis de
/// `Lentille/Core/LentilleProviders.swift`). Un stockage `UserDefaults`
/// (thread-safe par construction Apple) n'a aucune raison d'exiger le
/// `MainActor` — sans cette sortie explicite, les tests synchrones
/// (`ReadingModePreferenceStoreTests`) ne pourraient pas appeler ce
/// protocole hors d'un contexte `@MainActor`.
nonisolated protocol FocalReadingModePreferenceStoring: AnyObject {
    /// `nil` = rien de mémorisé pour cette conversation ⇒ l'orchestrateur
    /// reprend la main (mode `.auto`, jamais un mode figé par défaut).
    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode?

    /// `nil` ⇒ « revenir en mode auto » (efface la clé).
    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope)

    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date?
    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date)
}

/// Implémentation `UserDefaults`, clés `meeshy_readmode_<scopeKey>_<conversationId>`
/// et `meeshy_lastopen_<scopeKey>_<conversationId>` (contrat §WS-1, patron
/// `DraftStore` : préfixage par identité OBLIGATOIRE — fuite privacy
/// multi-comptes du 2026-05-26). JAMAIS `.standard` dans les tests — même
/// convention que `LocalReadingModePreferenceStore`/`StoryVisibilityPreferenceStore` :
/// `MeeshyTests` est hébergé dans `Meeshy.app`, un test qui écrirait le vrai
/// domaine laisserait un résidu visible au lancement suivant.
nonisolated final class ReadingModePreferenceStore: FocalReadingModePreferenceStoring {

    private static let modePrefix = "meeshy_readmode_"
    private static let lastOpenedPrefix = "meeshy_lastopen_"

    private static func modeKey(scope: ReadingModePreferenceScope, conversationId: String) -> String {
        "\(modePrefix)\(scope.storageKey)_\(conversationId)"
    }

    private static func lastOpenedKey(scope: ReadingModePreferenceScope, conversationId: String) -> String {
        "\(lastOpenedPrefix)\(scope.storageKey)_\(conversationId)"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode? {
        guard let raw = defaults.string(forKey: Self.modeKey(scope: scope, conversationId: conversationId)) else {
            return nil
        }
        return ConversationReadingMode(rawValue: raw)
    }

    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope) {
        let key = Self.modeKey(scope: scope, conversationId: conversationId)
        guard let mode else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(mode.rawValue, forKey: key)
    }

    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date? {
        let key = Self.lastOpenedKey(scope: scope, conversationId: conversationId)
        // `object(forKey:)` distingue « jamais écrit » de « écrit à l'epoch »
        // — `double(forKey:)` seul renverrait 0.0 dans les deux cas.
        guard defaults.object(forKey: key) != nil else { return nil }
        return Date(timeIntervalSince1970: defaults.double(forKey: key))
    }

    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date) {
        let key = Self.lastOpenedKey(scope: scope, conversationId: conversationId)
        defaults.set(date.timeIntervalSince1970, forKey: key)
    }
}
