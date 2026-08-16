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
final class LentilleFlagGateTests: XCTestCase {

    // MARK: - Fabriques

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "LentilleFlagGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut OFF

    func test_isEnabled_noUserDefaultsValueNoEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - UserDefaults seul

    func test_isEnabled_userDefaultsTrueNoEnvOverride_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_userDefaultsFalseNoEnvOverride_returnsFalse() {
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

    // MARK: - Indépendance des deux drapeaux

    func test_isEnabled_lentilleListOnReadingModesOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_readingModesOnLentilleListOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
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

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: true, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }
}
