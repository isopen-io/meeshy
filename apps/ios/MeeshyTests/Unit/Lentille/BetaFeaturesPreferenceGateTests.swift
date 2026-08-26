import XCTest
@testable import Meeshy

/// Le portillon de `BetaFeaturesPreference` (« Activer les bêta », Réglages).
/// Même patron d'isolation que `LentilleFlagGateTests` : toute résolution passe
/// par `isEnabled(defaults:environment:)`, jamais par `static var isEnabled`
/// (qui lit `UserDefaults.standard` + le vrai `ProcessInfo` — résidu
/// inter-suites). Chaque test fabrique sa propre suite `UserDefaults` UUID,
/// jamais partagée, jamais nettoyée en sortie de process car jamais écrite au
/// vrai domaine.
///
/// **Défaut OFF (décision produit du 2026-08-22).** Le programme bêta naît
/// éteint : une installation qui n'a rien demandé n'a AUCUNE fonctionnalité
/// bêta, et le toggle des Réglages affiche ce qu'il applique. L'ancien défaut
/// ON (I-075, 2026-08-16) affichait un toggle ON qui n'allumait rien — la
/// cascade des drapeaux n'honorait qu'une bêta EXPRIMÉE (retrait du
/// 2026-08-18), et une clé jamais écrite ne l'est pas. Avec un défaut OFF,
/// « absence » et « éteint » sont la même chose : le prédicat `isExplicitlySet`
/// n'a plus de question à poser et disparaît.
///
/// `enabledFeatures` est la lecture faite AU LANCEMENT : OFF ⇒ rien ; ON ⇒
/// les drapeaux couverts par le programme (tout-ou-rien aujourd'hui), un
/// drapeau coupé par sa clé propre restant hors de la liste.
final class BetaFeaturesPreferenceGateTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "BetaFeaturesPreferenceGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut OFF (décision produit du 2026-08-22)

    /// LE test discriminant : clé JAMAIS écrite, environnement vide ⇒ `false`.
    /// Une installation neuve n'a aucune fonctionnalité bêta, et le toggle des
    /// Réglages naît éteint — ce qu'il affiche est ce qu'il applique.
    func test_isEnabled_keyNeverWritten_noEnvOverride_defaultsToFalse() {
        let defaults = makeIsolatedDefaults()

        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
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

    /// Aller-retour complet : OFF (défaut) → ON (toggle réglages) → OFF à
    /// nouveau (re-toggle) — la préférence de plein droit se manipule comme
    /// n'importe quel réglage, contrairement au forçage éphémère de
    /// `Router.pendingForcedReadingMode`.
    func test_setEnabled_roundTrip_falseThenTrueThenFalse() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Départ : défaut OFF.")

        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))

        BetaFeaturesPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - enabledFeatures — la lecture faite au lancement

    /// Programme OFF (clé absente) ⇒ aucune fonctionnalité, quelles que soient
    /// les clés propres des drapeaux : l'option est LA condition.
    func test_enabledFeatures_programmeOff_returnsNothing() {
        let defaults = makeIsolatedDefaults()

        XCTAssertEqual(BetaFeaturesPreference.enabledFeatures(defaults: defaults, environment: [:]), [])
    }

    /// Programme ON sans autre choix ⇒ tout-ou-rien : les trois drapeaux que
    /// le programme couvre (`LentilleFeatureFlag.isCoveredByBetaProgramme`).
    func test_enabledFeatures_programmeOn_noOwnKeys_returnsEveryCoveredFlag() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)

        XCTAssertEqual(
            BetaFeaturesPreference.enabledFeatures(defaults: defaults, environment: [:]),
            [.lentilleList, .readingModes, .riviereMode]
        )
    }

    /// Un drapeau coupé par sa clé PROPRE (étage 2 de la cascade) reste hors
    /// de la liste même programme ON — c'est la porte « une par une » de
    /// demain, déjà honorée par la lecture.
    func test_enabledFeatures_programmeOn_ownKeyFalse_excludesThatFlag() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        LentilleFeatureFlag.setForDebug(.riviereMode, enabled: false, defaults: defaults)

        XCTAssertEqual(
            BetaFeaturesPreference.enabledFeatures(defaults: defaults, environment: [:]),
            [.lentilleList, .readingModes]
        )
    }

    /// Surcharge process `"1"` ⇒ programme ON même sans clé écrite (outil de
    /// développement, même discipline que `isEnabled`).
    func test_enabledFeatures_envOne_keyNeverWritten_returnsEveryCoveredFlag() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "1"]

        XCTAssertEqual(
            BetaFeaturesPreference.enabledFeatures(defaults: defaults, environment: environment),
            [.lentilleList, .readingModes, .riviereMode]
        )
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
