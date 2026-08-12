import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Persistance des préférences de partage de position. Les statiques
/// `load`/`save` prennent un `UserDefaults` injectable : tester le singleton
/// écrirait dans les defaults réels du simulateur et polluerait les autres
/// suites.
@MainActor
final class LocationSharingPreferencesStoreTests: XCTestCase {

    /// Suite dédiée, purgée à chaque appel — pas d'état partagé entre tests.
    private func makeDefaults(_ name: String = #function) -> UserDefaults {
        let suite = "LocationSharingPreferencesStoreTests.\(name)"
        UserDefaults().removePersistentDomain(forName: suite)
        return UserDefaults(suiteName: suite)!
    }

    func test_load_defaultsVides_rendLesDefauts() {
        let defaults = makeDefaults()

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
        XCTAssertEqual(loaded.precision, .exact)
        XCTAssertEqual(loaded.mapStyle, .standard)
    }

    func test_saveEtLoad_restituentLaValeur() {
        let defaults = makeDefaults()
        let prefs = LocationSharingPreferences(precision: .city, mapStyle: .imagery)

        LocationSharingPreferencesStore.save(prefs, userDefaults: defaults)
        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, prefs)
    }

    func test_load_jsonCorrompu_retombeSurLesDefautsSansCrash() {
        let defaults = makeDefaults()
        defaults.set(Data("pas du json".utf8),
                     forKey: LocationSharingPreferencesStore.storageKey)

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
    }

    func test_load_niveauDePrecisionInconnu_retombeSurLesDefauts() {
        let defaults = makeDefaults()
        defaults.set(Data(#"{"precision":"galaxie","mapStyle":"standard"}"#.utf8),
                     forKey: LocationSharingPreferencesStore.storageKey)

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
    }
}
