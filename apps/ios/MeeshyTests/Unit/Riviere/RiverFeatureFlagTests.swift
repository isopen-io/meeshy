import XCTest
@testable import Meeshy

/// R-133 — le troisième drapeau (`LentilleFeatureFlag.riviereMode`). Même
/// discipline que `LentilleFlagGateTests` (dont ce fichier est le prolongement
/// pour le nouveau cas, dans un fichier séparé pour ne pas toucher une suite
/// dont ce lot n'est pas propriétaire) : `UserDefaults` isolée par test,
/// jamais `.standard`, jamais le vrai `ProcessInfo`.
final class RiverFeatureFlagTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "RiverFeatureFlagTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut OFF — DEUX étages seulement, comme `lentilleList`

    func test_riviereMode_isEnabled_noUserDefaultsValueNoEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Contrairement à `readingModes`, `riviereMode` ne cascade JAMAIS vers
    /// `BetaFeaturesPreference` — activer le programme bêta n'ouvre pas la
    /// Rivière tout seul, c'est un choix séparé (docstring de tête).
    func test_riviereMode_betaOn_stillDefaultsToFalse() {
        let defaults = makeIsolatedDefaults()
        XCTAssertTrue(
            BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]),
            "Décor : la bêta doit être ON (défaut) pour que ce test soit discriminant."
        )

        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - UserDefaults seul

    func test_riviereMode_isEnabled_userDefaultsTrueNoEnvOverride_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - La surcharge process prime

    func test_riviereMode_envOne_primesOverUserDefaultsFalse_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey)
        let environment = [LentilleFeatureFlag.riviereMode.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: environment))
    }

    func test_riviereMode_envZero_primesOverUserDefaultsTrue_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey)
        let environment = [LentilleFeatureFlag.riviereMode.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: environment))
    }

    // MARK: - Clés et indépendance des TROIS drapeaux

    func test_riviereMode_hasItsOwnKeys_distinctFromTheOtherTwoFlags() {
        XCTAssertEqual(LentilleFeatureFlag.riviereMode.userDefaultsKey, "meeshy.flag.riviere_mode")
        XCTAssertEqual(LentilleFeatureFlag.riviereMode.environmentKey, "MEESHY_FLAG_RIVIERE_MODE")
        XCTAssertNotEqual(LentilleFeatureFlag.riviereMode.userDefaultsKey, LentilleFeatureFlag.lentilleList.userDefaultsKey)
        XCTAssertNotEqual(LentilleFeatureFlag.riviereMode.userDefaultsKey, LentilleFeatureFlag.readingModes.userDefaultsKey)
    }

    func test_riviereMode_settingItDoesNotAffectTheOtherTwoFlags() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        LentilleFeatureFlag.setForDebug(.riviereMode, enabled: true, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - `setForDebug` round-trip

    func test_setForDebug_riviereMode_roundTrip() {
        let defaults = makeIsolatedDefaults()

        LentilleFeatureFlag.setForDebug(.riviereMode, enabled: true, defaults: defaults)
        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))

        LentilleFeatureFlag.setForDebug(.riviereMode, enabled: false, defaults: defaults)
        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - `static var isRiviereModeEnabled` — lit bien `.riviereMode`

    /// Ne peut pas isoler `UserDefaults.standard` (comme
    /// `LentilleFlagGateTests` le documente déjà pour ses jumelles) — ce
    /// témoin prouve seulement que le raccourci délègue au bon cas, sans
    /// affirmer de valeur (l'état réel de `.standard` est hors contrôle du
    /// test).
    func test_isRiviereModeEnabled_delegatesToRiviereModeCase() {
        XCTAssertEqual(LentilleFeatureFlag.isRiviereModeEnabled, LentilleFeatureFlag.riviereMode.isEnabled())
    }
}
