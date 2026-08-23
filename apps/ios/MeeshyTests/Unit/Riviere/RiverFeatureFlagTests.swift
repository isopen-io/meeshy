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

    /// **Recalibré EN CONSCIENCE le 2026-08-21.** Ce témoin affirmait que
    /// `riviereMode` ne cascade JAMAIS vers `BetaFeaturesPreference` — vrai
    /// tant que la Rivière n'avait pas d'écran monté, intenable ensuite :
    /// la bascule « Activer les bêta » est le seul interrupteur offert à
    /// l'utilisateur, et sans elle la Rivière n'était joignable que par une
    /// variable d'environnement de processus. Ce que le témoin d'origine
    /// protégeait — « une installation qui n'a RIEN demandé n'ouvre pas la
    /// Rivière » — reste vérifié, par le premier test de cette suite
    /// (absence de tout choix ⇒ `false`, retrait I-075 du 2026-08-18).
    func test_riviereMode_followsTheBetaSwitch() {
        let notExpressed = makeIsolatedDefaults()
        XCTAssertFalse(
            BetaFeaturesPreference.isEnabled(defaults: notExpressed, environment: [:]),
            "Décor : la préférence bêta naît OFF (décision produit 2026-08-22)."
        )
        XCTAssertFalse(
            LentilleFeatureFlag.riviereMode.isEnabled(defaults: notExpressed, environment: [:]),
            "Une bêta jamais TOUCHÉE ne vaut pas opt-in : absence ⇒ OFF."
        )

        let expressed = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: expressed)
        XCTAssertTrue(
            LentilleFeatureFlag.riviereMode.isEnabled(defaults: expressed, environment: [:]),
            "Bêta explicitement ON ⇒ la Rivière devient sélectionnable — sous réserve de la LOI " +
            "(≥ 5 participants actifs, jamais en `direct`), qui reste la seule porte."
        )

        let refused = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(false, defaults: refused)
        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: refused, environment: [:]))
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
