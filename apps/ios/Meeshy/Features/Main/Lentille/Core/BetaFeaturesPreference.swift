import Foundation

/// I-075 — préférence utilisateur « Activer les bêta » (amendement produit
/// 2026-08-16, remplace le drapeau caché `LentilleFeatureFlag.focalDevPreview`
/// qu'une itération précédente de ce lot avait introduit). Gate la visibilité
/// de fonctionnalités bêta PUBLIQUES — aujourd'hui : l'item « Focal (bêta) »
/// du menu d'appui long de la liste de conversations (`ConversationListView`,
/// groupe « Plus d'options »).
///
/// **Type SÉPARÉ de `LentilleFeatureFlag`, pas un troisième `case`** :
/// `LentilleFeatureFlag.isEnabled(defaults:environment:)` retombe sur
/// `defaults.bool(forKey:)` quand l'environnement ne tranche pas — Foundation
/// rend `false` pour une clé absente, ce qui donne à CE type le défaut OFF
/// qu'il documente explicitement (« défaut OFF dans les deux cas »). Cette
/// préférence a la polarité INVERSE (défaut ON) ; la coder comme un troisième
/// `case` de `LentilleFeatureFlag` aurait exigé une branche spéciale dans
/// `isEnabled(defaults:environment:)` — une méthode PARTAGÉE par tous les cas
/// — pour une seule des trois polarités. Un type dédié, même discipline
/// injectable, est la forme la plus honnête.
///
/// **Défaut ON — la distinction qui compte** : `object(forKey:) == nil`
/// (jamais écrite) ⇒ `true`. `UserDefaults.bool(forKey:)` SEUL renverrait
/// `false` pour une clé absente (défaut Foundation), ce qui ferait naître
/// CETTE préférence à OFF pour tout utilisateur n'ayant jamais touché le
/// réglage — l'inverse de ce que « défaut ON » veut dire. D'où
/// `object(forKey:)` d'abord : seule une écriture EXPLICITE (le toggle des
/// réglages, ou un test) peut faire passer la préférence à `false`.
///
/// Résolution : `ProcessInfo.processInfo.environment[environmentKey]` PRIME
/// (`"1"` force ON, `"0"` force OFF, absente ⇒ repli `UserDefaults`) —
/// MÊME discipline injectable que `LentilleFeatureFlag` (les tests passent
/// leur propre `UserDefaults`/dictionnaire d'environnement, jamais
/// `.standard`/le vrai `ProcessInfo`, cf. `StoryVisibilityPreferenceStore`).
///
/// Écriture : `setEnabled(_:defaults:)`, appelée par l'écran de réglages
/// (`SettingsView`, section « Bêta ») à chaque bascule du toggle — CETTE
/// préférence-ci est écrite en plein droit (contrairement au forçage éphémère
/// `Router.pendingForcedReadingMode`, jamais persisté). Ce que la préférence
/// gate reste ÉPHÉMÈRE à l'ouverture : activer les bêta rend l'item « Focal
/// (bêta) » visible, l'item lui-même force Focal pour UNE SEULE ouverture
/// sans jamais toucher `reading_modes` ni la préférence collante de mode
/// (design imposé, inchangé par cet amendement — voir
/// `ReadingModeController.forcedMode`).
nonisolated enum BetaFeaturesPreference {

    static let userDefaultsKey = "meeshy.pref.beta_features_enabled"
    static let environmentKey = "MEESHY_FLAG_BETA_FEATURES"

    /// Injectable — voir la discipline de test de `LentilleFeatureFlag
    /// .isEnabled(defaults:environment:)`.
    static func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default:
            // Clé jamais écrite ⇒ TRUE (défaut ON). `bool(forKey:)` seul
            // rendrait `false` ici — voir la docstring du type.
            guard defaults.object(forKey: userDefaultsKey) != nil else { return true }
            return defaults.bool(forKey: userDefaultsKey)
        }
    }

    /// Lecture au vrai domaine (`UserDefaults.standard` + `ProcessInfo
    /// .processInfo`) — réservée au code de production, jamais aux tests
    /// (résidu inter-suites, même règle que `LentilleFeatureFlag
    /// .isLentilleListEnabled`).
    static var isEnabled: Bool {
        isEnabled(defaults: .standard, environment: ProcessInfo.processInfo.environment)
    }

    /// Écrit la préférence — toggle des réglages (`SettingsView`, section
    /// « Bêta »). N'écrit QUE `UserDefaults`, jamais l'environnement process.
    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: userDefaultsKey)
    }
}
