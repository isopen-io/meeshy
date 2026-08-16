import XCTest
@testable import Meeshy

/// M-046 — le portillon des deux drapeaux Lentille (`lentilleList`,
/// `readingModes`). Toute résolution passe par `isEnabled(defaults:environment:)`,
/// JAMAIS par les `static var isLentilleListEnabled`/`isReadingModesEnabled`
/// (qui lisent `UserDefaults.standard` + le vrai `ProcessInfo` — les appeler
/// ici laisserait un résidu visible au lancement suivant, leçon
/// `reference_outbox_db_path_and_test_residue`). Chaque test fabrique sa
/// propre suite `UserDefaults` UUID, jamais partagée, jamais nettoyée en
/// sortie de process car jamais écrite au vrai domaine.
///
/// I-075 (second amendement produit, 2026-08-16) — `readingModes` cascade
/// désormais vers `BetaFeaturesPreference` (défaut ON) quand sa PROPRE clé
/// n'a jamais été posée. Les tests « défaut » et « indépendance » de ce
/// fichier ont été réécrits en conséquence (une `defaults` fraîche ne veut
/// plus dire « readingModes OFF », elle veut dire « readingModes suit la
/// bêta ») — la cascade complète est prouvée à part, § « Cascade
/// readingModes → BetaFeaturesPreference » en fin de fichier.
final class LentilleFlagGateTests: XCTestCase {

    // MARK: - Fabriques

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "LentilleFlagGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut OFF (`lentilleList` — INCHANGÉ par l'amendement)

    func test_lentilleList_isEnabled_noUserDefaultsValueNoEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - UserDefaults seul

    func test_isEnabled_userDefaultsTrueNoEnvOverride_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// `readingModes` EXPLICITEMENT posée à `false` ⇒ `false`, MÊME avec la
    /// bêta ON par défaut sur cette `defaults` fraîche — la clé explicite est
    /// l'étage 2 de la cascade, avant la bêta (étage 3).
    func test_isEnabled_readingModesUserDefaultsExplicitlyFalse_noEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - La surcharge process prime

    func test_isEnabled_envOne_primesOverUserDefaultsFalse_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
        let environment = [LentilleFeatureFlag.lentilleList.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
    }

    func test_isEnabled_envZero_primesOverUserDefaultsTrue_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    /// `readingModes` : l'environnement prime même sur la cascade bêta —
    /// `env: "0"` force OFF alors que la clé readingModes n'a jamais été
    /// posée (qui, seule, résoudrait vers la bêta, ON par défaut).
    func test_isEnabled_readingModes_envZero_primesEvenWhenKeyNeverWrittenAndBetaDefaultsOn() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    // MARK: - Indépendance des deux drapeaux
    //
    // Réécrits pour l'amendement : `readingModes` posée EXPLICITEMENT des
    // deux côtés (jamais une `defaults` fraîche, qui résoudrait maintenant
    // vers la bêta) — la discrimination reste sur `lentilleList` seul.

    func test_isEnabled_lentilleListOnReadingModesExplicitlyOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_readingModesOnLentilleListOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
    }

    /// La bêta n'affecte JAMAIS `lentilleList` — hors périmètre bêta pour
    /// l'instant (docstring `LentilleFeatureFlag`, second amendement).
    func test_betaFeaturesOn_neverEnablesLentilleList() {
        let defaults = makeIsolatedDefaults()
        // `defaults` fraîche ⇒ BetaFeaturesPreference résout déjà à `true`
        // (défaut ON) sans rien poser explicitement.
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Décor : la bêta doit être ON pour que ce test soit discriminant.")

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - setForDebug

    func test_setForDebug_enabledTrue_isEnabledReturnsTrue() {
        let defaults = makeIsolatedDefaults()

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: true, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_setForDebug_enabledFalseAfterTrue_isEnabledReturnsFalse() {
        let defaults = makeIsolatedDefaults()
        LentilleFeatureFlag.setForDebug(.readingModes, enabled: true, defaults: defaults)

        LentilleFeatureFlag.setForDebug(.readingModes, enabled: false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_setForDebug_doesNotAffectTheOtherFlag() {
        let defaults = makeIsolatedDefaults()
        // readingModes posée explicitement à false pour que ce test reste
        // discriminant sous l'amendement (une `defaults` fraîche résoudrait
        // maintenant readingModes à `true` via la cascade bêta, masquant ce
        // que ce test veut prouver : `setForDebug(.lentilleList, …)` n'écrit
        // QUE la clé lentilleList).
        LentilleFeatureFlag.setForDebug(.readingModes, enabled: false, defaults: defaults)

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: true, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - Cascade readingModes → BetaFeaturesPreference (I-075, second amendement 2026-08-16)
    //
    // Trois étages : env (INCHANGÉ) → clé readingModes EXPLICITE → bêta
    // (défaut ON). `lentilleList` n'a QUE deux étages (env → defaults.bool,
    // INCHANGÉ) — jamais de troisième étage bêta, prouvé ci-dessus.

    /// LE test discriminant du second amendement : env absent, clé
    /// `reading_modes` JAMAIS posée, bêta JAMAIS posée (donc bêta à son
    /// propre défaut ON) ⇒ `readingModes.isEnabled` doit être `true` — à
    /// l'installation, le système de modes de lecture est actif par défaut.
    func test_readingModes_envAbsent_keyNeverWritten_betaNeverWritten_returnsTrue() {
        let defaults = makeIsolatedDefaults()

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Bêta explicitement OFF (clé `reading_modes` toujours absente) ⇒
    /// `readingModes.isEnabled` retombe à `false` — couper « Activer les
    /// bêta » rend tout le système inactif.
    func test_readingModes_keyNeverWritten_betaExplicitlyOff_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Clé `reading_modes` posée EXPLICITEMENT à `false` ⇒ `false`, MÊME si
    /// la bêta est ON (implicitement, `defaults` fraîche) — seul moyen de
    /// couper `reading_modes` seul sans toucher au reste du programme bêta.
    func test_readingModes_keyExplicitlyFalse_betaOn_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Décor : la bêta doit être ON (implicite) pour que ce test soit discriminant.")

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Clé `reading_modes` posée EXPLICITEMENT à `true` ⇒ `true`, MÊME si la
    /// bêta est OFF — l'étage 2 (clé explicite) gagne toujours sur l'étage 3
    /// (bêta), dans les deux sens.
    func test_readingModes_keyExplicitlyTrue_betaOff_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Round-trip complet des trois étages sur la MÊME `defaults` : bêta ON
    /// implicite (readingModes suit, `true`) → bêta coupée (readingModes suit,
    /// `false`) → clé readingModes EXPLICITE posée à `true` malgré la bêta
    /// coupée (readingModes gagne, `true`) — chaque transition isole l'étage
    /// qu'elle teste.
    func test_readingModes_cascadeRoundTrip_allThreeStages() {
        let defaults = makeIsolatedDefaults()
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 3 (bêta ON implicite).")

        BetaFeaturesPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 3 (bêta coupée).")

        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 2 (clé explicite) gagne sur l'étage 3 (bêta toujours coupée).")
    }
}
