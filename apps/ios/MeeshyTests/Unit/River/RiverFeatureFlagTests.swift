import XCTest
@testable import Meeshy

/// R-133 — le troisième drapeau (`LentilleFeatureFlag.riviereMode`). Même
/// discipline que `LentilleFlagGateTests` : `UserDefaults` isolée par test,
/// jamais `.standard`, jamais le vrai `ProcessInfo`.
///
/// **Sortie de bêta (directive porteur du 2026-09-14, #6482)** : la Rivière est
/// active par défaut et a son interrupteur dans les Réglages. Elle reste un
/// MODE DE LECTURE : elle ne s'ouvre que là où la loi l'autorise (≥ 5
/// participants actifs, jamais en `direct`) et seulement si les modes de
/// lecture sont actifs — voir `ReadingModesFlagIntegrationTests`.
final class RiverFeatureFlagTests: XCTestCase {

    private func makeIsolatedDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "RiverFeatureFlagTests-\(UUID().uuidString)"))
    }

    // MARK: - Défaut ON

    func test_riviereMode_isEnabled_noUserDefaultsValueNoEnvOverride_returnsTrue() throws {
        let defaults = try makeIsolatedDefaults()
        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_riviereMode_isEnabled_ownKeyExplicitlyFalse_returnsFalse() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey)

        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - La surcharge process prime

    func test_riviereMode_envOne_primesOverUserDefaultsFalse_returnsTrue() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey)
        let environment = [LentilleFeatureFlag.riviereMode.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: environment))
    }

    func test_riviereMode_envZero_primesOverUserDefaultsTrue_returnsFalse() throws {
        let defaults = try makeIsolatedDefaults()
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

    func test_setEnabled_riviereModeOff_doesNotAffectTheOtherTwoFlags() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.setEnabled(.riviereMode, enabled: false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - `setEnabled` round-trip

    func test_setEnabled_riviereMode_roundTrip() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.setEnabled(.riviereMode, enabled: false, defaults: defaults)
        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))

        LentilleFeatureFlag.setEnabled(.riviereMode, enabled: true, defaults: defaults)
        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - `static var isRiviereModeEnabled` — lit bien `.riviereMode`

    /// Ne peut pas isoler `UserDefaults.standard` — ce témoin prouve seulement
    /// que le raccourci délègue au bon cas, sans affirmer de valeur.
    func test_isRiviereModeEnabled_delegatesToRiviereModeCase() {
        XCTAssertEqual(LentilleFeatureFlag.isRiviereModeEnabled, LentilleFeatureFlag.riviereMode.isEnabled())
    }
}
