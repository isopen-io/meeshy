import XCTest
@testable import Meeshy

/// Les réglages par personne (écoute, talkie, Bring, position) du jalon 2 (#13938) :
/// désactivés tant qu'il n'est pas livré, et l'interface le dit. Le drapeau est LOCAL,
/// fermé par défaut ; jamais `.standard` dans un test.
final class MeeshyFeatureFlagsCirclesTests: XCTestCase {

    private func isolatedDefaults() -> UserDefaults {
        let suite = "MeeshyFeatureFlagsCirclesTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func test_personSettings_areClosedByDefault() {
        XCTAssertFalse(MeeshyFeatureFlags.arePersonSettingsEnabled(defaults: isolatedDefaults(), environment: [:]))
    }

    func test_personSettings_openWithTheEnvironmentFlag() {
        XCTAssertTrue(MeeshyFeatureFlags.arePersonSettingsEnabled(
            defaults: isolatedDefaults(), environment: ["MEESHY_FLAG_CIRCLE_PERSON_SETTINGS": "1"]))
    }

    func test_personSettings_openWithTheStoredFlag_andTheEnvironmentWins() {
        let defaults = isolatedDefaults()
        defaults.set(true, forKey: "meeshy.flag.circle_person_settings")
        XCTAssertTrue(MeeshyFeatureFlags.arePersonSettingsEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(MeeshyFeatureFlags.arePersonSettingsEnabled(
            defaults: defaults, environment: ["MEESHY_FLAG_CIRCLE_PERSON_SETTINGS": "0"]))
    }
}
