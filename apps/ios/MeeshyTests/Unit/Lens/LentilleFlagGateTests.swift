import XCTest
@testable import Meeshy

/// Le portillon des trois drapeaux de la Lentille (`lentilleList`,
/// `readingModes`, `riviereMode`). Toute résolution passe par
/// `isEnabled(defaults:environment:)`, JAMAIS par les accesseurs statiques
/// `isLentilleListEnabled`/`isReadingModesEnabled`/`isRiviereModeEnabled`
/// (qui lisent `UserDefaults.standard` + le vrai `ProcessInfo` — les appeler
/// ici laisserait un résidu visible au lancement suivant). Chaque test fabrique
/// sa propre suite `UserDefaults` UUID, jamais partagée.
///
/// **Sortie de bêta (directive porteur du 2026-09-14, #6482).** Les trois
/// fonctionnalités sont actives par défaut et ont chacune leur interrupteur
/// dans les Réglages. La cascade n'a plus que trois étages : surcharge process
/// (`"1"`/`"0"`), clé propre si elle a été écrite (dans les deux sens), défaut
/// ON. L'ancienne préférence « Activer les bêta » ne gouverne plus rien et sa
/// clé est retirée au lancement — les témoins de fin de fichier le verrouillent.
final class LentilleFlagGateTests: XCTestCase {

    // MARK: - Fabriques

    private func makeIsolatedDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "LentilleFlagGateTests-\(UUID().uuidString)"))
    }

    private static let retiredBetaKey = "meeshy.pref.beta_features_enabled"

    // MARK: - Défaut ON (sortie de bêta, 2026-09-14)

    func test_allCases_areTheThreeFeaturesThatLeftBeta() {
        XCTAssertEqual(
            LentilleFeatureFlag.allCases, [.lentilleList, .readingModes, .riviereMode],
            "Les boucles de ce fichier parcourent `allCases` : une liste vide les rendrait vertes par omission."
        )
    }

    func test_isEnabled_nothingEverWritten_noEnvOverride_returnsTrueForEveryFlag() throws {
        let defaults = try makeIsolatedDefaults()

        for flag in LentilleFeatureFlag.allCases {
            XCTAssertTrue(
                flag.isEnabled(defaults: defaults, environment: [:]),
                "\(flag.userDefaultsKey) : une installation qui n'a rien choisi reçoit la fonctionnalité (directive 2026-09-14, #6482)."
            )
        }
    }

    // MARK: - La clé propre gouverne, dans les deux sens

    func test_isEnabled_ownKeyExplicitlyFalse_beatsTheDefault_forEveryFlag() throws {
        for flag in LentilleFeatureFlag.allCases {
            let defaults = try makeIsolatedDefaults()
            defaults.set(false, forKey: flag.userDefaultsKey)

            XCTAssertFalse(
                flag.isEnabled(defaults: defaults, environment: [:]),
                "\(flag.userDefaultsKey) coupé dans les Réglages ⇒ OFF, malgré le défaut ON."
            )
        }
    }

    // MARK: - La surcharge process prime

    func test_isEnabled_envOne_primesOverOwnKeyFalse_returnsTrue() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
        let environment = [LentilleFeatureFlag.lentilleList.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
    }

    func test_isEnabled_envZero_primesOverOwnKeyTrue_returnsFalse() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    func test_isEnabled_envZero_primesOverTheDefault_whenOwnKeyNeverWritten() throws {
        let defaults = try makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.riviereMode.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: environment))
    }

    /// Une valeur d'environnement PARASITE n'exprime rien : la résolution
    /// retombe sur la clé propre, puis sur le défaut.
    func test_isEnabled_envUnrecognized_fallsBackToOwnKeyThenDefault() throws {
        let defaults = try makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "yes"]

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))

        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    // MARK: - setEnabled — l'écrivain des Réglages

    func test_setEnabled_roundTrip_offThenOn() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))

        LentilleFeatureFlag.setEnabled(.readingModes, enabled: true, defaults: defaults)
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertEqual(
            defaults.object(forKey: LentilleFeatureFlag.readingModes.userDefaultsKey) as? Bool, true,
            "Rallumer ÉCRIT le choix : il survit à un futur changement de défaut."
        )
    }

    func test_setEnabled_writesOnlyItsOwnFlag() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertNil(defaults.object(forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey))
        XCTAssertNil(defaults.object(forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey))
    }

    func test_setForDebug_writesTheSameKeyAsSetEnabled() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - L'ancienne préférence bêta ne gouverne plus rien

    func test_retiredBetaPreferenceKey_isTheKeyTheBetaSwitchUsedToWrite() {
        XCTAssertEqual(LentilleFeatureFlag.retiredBetaPreferenceKey, Self.retiredBetaKey)
    }

    /// Discriminant vis-à-vis de l'ancienne cascade, où « Activer les bêta »
    /// coupé éteignait les trois drapeaux sans clé propre.
    func test_isEnabled_retiredBetaPreferenceOff_noLongerDisablesAnyFlag() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(false, forKey: Self.retiredBetaKey)

        for flag in LentilleFeatureFlag.allCases {
            XCTAssertTrue(flag.isEnabled(defaults: defaults, environment: [:]), flag.userDefaultsKey)
        }
    }

    func test_isEnabled_retiredBetaEnvironmentOverride_noLongerGovernsAnyFlag() throws {
        let defaults = try makeIsolatedDefaults()
        let environment = ["MEESHY_FLAG_BETA_FEATURES": "0"]

        for flag in LentilleFeatureFlag.allCases {
            XCTAssertTrue(flag.isEnabled(defaults: defaults, environment: environment), flag.userDefaultsKey)
        }
    }

    func test_removeRetiredBetaPreference_deletesTheDeadKey() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(true, forKey: Self.retiredBetaKey)

        LentilleFeatureFlag.removeRetiredBetaPreference(defaults: defaults)

        XCTAssertNil(defaults.object(forKey: Self.retiredBetaKey))
    }

    func test_removeRetiredBetaPreference_keepsTheFlagsOwnChoices() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(false, forKey: Self.retiredBetaKey)
        LentilleFeatureFlag.setEnabled(.riviereMode, enabled: false, defaults: defaults)

        LentilleFeatureFlag.removeRetiredBetaPreference(defaults: defaults)

        XCTAssertEqual(defaults.object(forKey: LentilleFeatureFlag.riviereMode.userDefaultsKey) as? Bool, false)
        XCTAssertFalse(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_removeRetiredBetaPreference_keyAbsent_isANoOp() throws {
        let defaults = try makeIsolatedDefaults()

        LentilleFeatureFlag.removeRetiredBetaPreference(defaults: defaults)

        XCTAssertNil(defaults.object(forKey: Self.retiredBetaKey))
        for flag in LentilleFeatureFlag.allCases {
            XCTAssertTrue(flag.isEnabled(defaults: defaults, environment: [:]), flag.userDefaultsKey)
        }
    }
}
