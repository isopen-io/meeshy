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
///
/// **I-075 RETIRÉ le 2026-08-18 (décision produit) — ce que ce fichier NE
/// change PAS.** Le retrait vise le client `reading_modes`, pas ce type : la
/// polarité de défaut ON reste INTACTE ici, et TOUS les témoins ci-dessus
/// sont inchangés, à commencer par le discriminant
/// `test_isEnabled_keyNeverWritten_noEnvOverride_defaultsToTrue`. C'est
/// délibéré : l'autre client de cette préférence — la visibilité de l'item
/// « Focal (bêta) » du menu d'appui long — n'est pas visé par la décision, et
/// basculer ce défaut à OFF l'aurait fait disparaître de toute installation
/// neuve. Ce que le retrait AJOUTE ici : `isExplicitlySet`, § dédié en fin de
/// fichier, qui permet à la cascade `readingModes` de distinguer « bêta
/// activée » de « bêta jamais touchée » — distinction que `isEnabled`, seul,
/// ne peut pas exprimer.
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

    // MARK: - isExplicitlySet (retrait I-075 du 2026-08-18)
    //
    // Prédicat NOUVEAU, introduit par le retrait : « la préférence a-t-elle
    // été EXPRIMÉE ? », question à laquelle `isEnabled` ne peut pas répondre
    // (son défaut ON confond « activé » et « jamais touché »). Consommé par
    // `LentilleFeatureFlag.readingModes` pour n'honorer QUE l'opt-in
    // volontaire — voir `LentilleFlagGateTests`, § cascade.
    //
    // L'AXE DISCRIMINANT de cette sous-suite : chaque cas ci-dessous est
    // apparié à la valeur que rend `isEnabled` sur le MÊME décor. Les deux
    // premiers tests sont la paire qui porte tout le retrait — `isEnabled`
    // rend `true` dans les deux, `isExplicitlySet` les sépare.

    /// Clé jamais écrite, environnement vide ⇒ `false` : rien n'a été
    /// exprimé. Pendant : `test_isEnabled_keyNeverWritten_…_defaultsToTrue`
    /// ci-dessus rend `true` sur ce décor EXACT.
    func test_isExplicitlySet_keyNeverWritten_noEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()

        XCTAssertFalse(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: [:]))
        XCTAssertTrue(
            BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]),
            "Paire discriminante : isEnabled rend TRUE ici (défaut ON) — seul isExplicitlySet distingue « jamais touché » de « activé »."
        )
    }

    /// Clé écrite à `true` ⇒ exprimée. Même verdict `isEnabled` que le test
    /// précédent (`true`), verdict `isExplicitlySet` OPPOSÉ : c'est
    /// exactement la distinction dont dépend le retrait du 2026-08-18.
    func test_isExplicitlySet_userDefaultsExplicitlyTrue_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: BetaFeaturesPreference.userDefaultsKey)

        XCTAssertTrue(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: [:]))
    }

    /// Exprimée ne veut pas dire activée : clé écrite à `false` ⇒ `true`.
    func test_isExplicitlySet_userDefaultsExplicitlyFalse_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)

        XCTAssertTrue(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: [:]))
        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isExplicitlySet_envOne_keyNeverWritten_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "1"]

        XCTAssertTrue(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: environment))
    }

    func test_isExplicitlySet_envZero_keyNeverWritten_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "0"]

        XCTAssertTrue(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: environment))
    }

    /// Valeur parasite ⇒ n'exprime RIEN, exactement comme `isEnabled` la
    /// traite comme absente (repli `UserDefaults`). Referme l'échappatoire
    /// d'une implémentation qui testerait `environment[key] != nil`.
    func test_isExplicitlySet_envUnrecognizedValue_keyNeverWritten_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "yes"]

        XCTAssertFalse(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: environment))
    }

    /// Valeur parasite MAIS clé écrite ⇒ exprimée par la clé — les deux
    /// sources sont bien en OU, pas en ET.
    func test_isExplicitlySet_envUnrecognizedValue_keyWritten_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: BetaFeaturesPreference.userDefaultsKey)
        let environment = [BetaFeaturesPreference.environmentKey: "yes"]

        XCTAssertTrue(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: environment))
    }

    /// `setEnabled` rend la préférence exprimée, quelle que soit la valeur —
    /// le toggle des réglages est donc bien un opt-in/opt-out de plein droit
    /// aux yeux du retrait.
    func test_setEnabled_makesPreferenceExplicitlySet_bothValues() {
        for value in [true, false] {
            let defaults = makeIsolatedDefaults()
            XCTAssertFalse(BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: [:]), "Départ : rien d'exprimé.")

            BetaFeaturesPreference.setEnabled(value, defaults: defaults)

            XCTAssertTrue(
                BetaFeaturesPreference.isExplicitlySet(defaults: defaults, environment: [:]),
                "Basculer le toggle à \(value) doit EXPRIMER la préférence."
            )
        }
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
