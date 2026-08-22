import Foundation
import os

/// Préférence utilisateur « Activer les bêta » (Réglages, section « Bêta »).
///
/// **Défaut OFF (décision produit du 2026-08-22).** Le programme bêta naît
/// éteint : une installation qui n'a rien demandé n'a AUCUNE fonctionnalité
/// bêta, et le toggle des Réglages affiche exactement ce qu'il applique.
/// L'ancien défaut ON (I-075, 2026-08-16) produisait un toggle affiché ON qui
/// n'allumait rien : la cascade des drapeaux n'honorait qu'une bêta
/// EXPRIMÉE (retrait du 2026-08-18), et une clé jamais écrite ne l'est pas.
/// Avec un défaut OFF, « absence » et « éteint » sont la même chose — le
/// prédicat `isExplicitlySet` n'a plus de question à poser et a disparu.
///
/// **Ce que la préférence gouverne** : les drapeaux couverts par le programme
/// (`LentilleFeatureFlag.isCoveredByBetaProgramme` — modes de lecture, liste
/// Lentille, Rivière) lorsqu'ils n'ont pas de clé propre. Aujourd'hui c'est
/// tout-ou-rien ; demain la section « Bêta » des Réglages proposera les
/// fonctionnalités une par une, et leur clé propre (étage 2 de la cascade)
/// est déjà honorée par `enabledFeatures`. La section ne montre ses
/// fonctionnalités QUE si l'option est validée.
///
/// **Type SÉPARÉ de `LentilleFeatureFlag`** : il gouverne plusieurs drapeaux,
/// il n'en est pas un.
///
/// Résolution : `environment[environmentKey]` PRIME (`"1"` force ON, `"0"`
/// force OFF, absente ⇒ repli `UserDefaults`) — MÊME discipline injectable
/// que `LentilleFeatureFlag` (les tests passent leur propre `UserDefaults` et
/// leur propre dictionnaire d'environnement, jamais `.standard`).
///
/// Écriture : `setEnabled(_:defaults:)`, appelée par `SettingsView` à chaque
/// bascule du toggle — préférence de plein droit, contrairement au forçage
/// éphémère `Router.pendingForcedReadingMode`, jamais persisté.
nonisolated enum BetaFeaturesPreference {

    static let userDefaultsKey = "meeshy.pref.beta_features_enabled"
    static let environmentKey = "MEESHY_FLAG_BETA_FEATURES"

    /// Injectable — voir la discipline de test de `LentilleFeatureFlag
    /// .isEnabled(defaults:environment:)`. Clé absente ⇒ `false` (défaut
    /// Foundation de `bool(forKey:)`, qui EST le défaut OFF voulu).
    static func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default: return defaults.bool(forKey: userDefaultsKey)
        }
    }

    /// Les fonctionnalités bêta effectivement actives — la lecture faite au
    /// lancement de l'application (`resolveAtLaunch`) et par la section
    /// « Bêta » des Réglages.
    ///
    /// Programme OFF ⇒ vide, quelles que soient les clés propres : l'option est
    /// LA condition. Programme ON ⇒ les drapeaux couverts, dans l'ordre de
    /// déclaration, chacun résolu par sa cascade (env > clé propre > programme)
    /// — un drapeau coupé par sa clé propre reste hors de la liste.
    static func enabledFeatures(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> [LentilleFeatureFlag] {
        guard isEnabled(defaults: defaults, environment: environment) else { return [] }
        return LentilleFeatureFlag.allCases
            .filter(\.isCoveredByBetaProgramme)
            .filter { $0.isEnabled(defaults: defaults, environment: environment) }
    }

    /// Lecture au lancement (`MeeshyApp.init`) : si le programme est activé,
    /// lit `UserDefaults` pour savoir quelles fonctionnalités bêta le sont, et
    /// l'inscrit au journal (`me.meeshy.app:beta`). Les consommateurs lisent
    /// ensuite leur drapeau à la demande — même source, même cascade.
    @discardableResult
    static func resolveAtLaunch(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> [LentilleFeatureFlag] {
        let enabled = isEnabled(defaults: defaults, environment: environment)
        let features = enabledFeatures(defaults: defaults, environment: environment)
        let names = features.map(\.userDefaultsKey).joined(separator: ",")
        launchLogger.info("beta programme enabled=\(enabled, privacy: .public) features=[\(names, privacy: .public)]")
        return features
    }

    private static let launchLogger = Logger(subsystem: "me.meeshy.app", category: "beta")

    /// Lecture au vrai domaine (`UserDefaults.standard` + `ProcessInfo
    /// .processInfo`) — réservée au code de production, jamais aux tests
    /// (résidu inter-suites, même règle que `LentilleFeatureFlag
    /// .isLentilleListEnabled`).
    static var isEnabled: Bool {
        isEnabled(defaults: .standard, environment: ProcessEnvironmentSnapshot.current)
    }

    /// Écrit la préférence — toggle des réglages (`SettingsView`, section
    /// « Bêta »). N'écrit QUE `UserDefaults`, jamais l'environnement process.
    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: userDefaultsKey)
    }
}
