import XCTest
@testable import Meeshy

/// I-075 (amendement produit 2026-08-16) — le portillon de
/// `BetaFeaturesPreference`. Même patron d'isolation que `LentilleFlagGateTests` :
/// toute résolution passe par `isEnabled(defaults:environment:)`, jamais par
/// `static var isEnabled` (qui lit `UserDefaults.standard` + le vrai
/// `ProcessInfo` — résidu inter-suites). Chaque test fabrique sa propre suite
/// `UserDefaults` UUID, jamais partagée, jamais nettoyée en sortie de process
/// car jamais écrite au vrai domaine.
///
/// L'AXE DISCRIMINANT de cette suite, absent de `LentilleFlagGateTests` : la
/// polarité de défaut est INVERSÉE. Chaque test « clé absente » ci-dessous a
/// pour pendant un test `LentilleFlagGateTests` qui affirme `False` sur le
/// même scénario — la paire est la preuve que les deux types ne partagent
/// PAS la même règle de repli.
final class BetaFeaturesPreferenceGateTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "BetaFeaturesPreferenceGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut ON (l'inverse de LentilleFeatureFlag)

    /// LE test discriminant : clé JAMAIS écrite, environnement vide ⇒ `true`.
    /// Pendant chez `LentilleFlagGateTests
    /// .test_isEnabled_noUserDefaultsValueNoEnvOverride_returnsFalse` — même
    /// décor, verdict opposé.
    func test_isEnabled_keyNeverWritten_noEnvOverride_defaultsToTrue() {
        let defaults = makeIsolatedDefaults()

        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - UserDefaults seul (écriture EXPLICITE peut désactiver)

    func test_isEnabled_userDefaultsExplicitlyFalse_noEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_userDefaultsExplicitlyTrue_noEnvOverride_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: BetaFeaturesPreference.userDefaultsKey)

        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - La surcharge process prime

    func test_isEnabled_envOne_primesOverUserDefaultsFalse_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)
        let environment = [BetaFeaturesPreference.environmentKey: "1"]

        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment))
    }

    func test_isEnabled_envZero_primesOverUserDefaultsTrue_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: BetaFeaturesPreference.userDefaultsKey)
        let environment = [BetaFeaturesPreference.environmentKey: "0"]

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment))
    }

    /// La surcharge process force OFF même quand la clé n'a jamais été
    /// écrite — sans quoi `env: "0"` serait un no-op sur un défaut ON.
    func test_isEnabled_envZero_primesEvenWhenKeyNeverWritten() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "0"]

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment))
    }

    /// Absente de l'environnement (ni "1" ni "0", ex. une valeur parasite ou
    /// vide) ⇒ repli `UserDefaults`, même règle que `LentilleFeatureFlag`.
    func test_isEnabled_envAbsent_fallsBackToUserDefaults() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_envUnrecognizedValue_fallsBackToUserDefaults() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)
        let environment = [BetaFeaturesPreference.environmentKey: "yes"]

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment))
    }

    // MARK: - setEnabled

    func test_setEnabled_false_isEnabledReturnsFalse() {
        let defaults = makeIsolatedDefaults()

        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Aller-retour complet : ON (défaut) → OFF (toggle réglages) → ON à
    /// nouveau (re-toggle) — la préférence de plein droit se manipule comme
    /// n'importe quel réglage, contrairement au forçage éphémère de
    /// `Router.pendingForcedReadingMode`.
    func test_setEnabled_roundTrip_trueThenFalseThenTrue() {
        let defaults = makeIsolatedDefaults()
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Départ : défaut ON.")

        BetaFeaturesPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))

        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_setEnabled_doesNotWriteToTheEnvironment() {
        // `setEnabled` n'a même pas de paramètre `environment` — garde de
        // signature plutôt que d'exécution : voir
        // BetaFeaturesPreferenceSourceGuardTests pour la preuve source
        // (« n'écrit QUE UserDefaults, jamais l'environnement process »).
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }
}
