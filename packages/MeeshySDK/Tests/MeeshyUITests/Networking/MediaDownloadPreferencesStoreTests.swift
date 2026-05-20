import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class MediaDownloadPreferencesStoreTests: XCTestCase {

    private func makeIsolatedDefaults(suite: String = UUID().uuidString) -> UserDefaults {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func test_loadOrMigrate_emptyDefaults_returnsDefaults() {
        let defaults = makeIsolatedDefaults()
        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs, .defaults)
    }

    func test_save_then_load_roundtrip() {
        let defaults = makeIsolatedDefaults()
        let custom = MediaDownloadPreferences(
            image: .always, audio: .never, audioTranslation: .wifiAndGoodCellular, video: .wifiOnly
        )
        MediaDownloadPreferencesStore.save(custom, userDefaults: defaults)
        let loaded = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(loaded, custom)
    }

    func test_loadOrMigrate_legacyAllOn_migratesTo_always() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":true,"audioOnWifi":true,"audioOnCellular":true,"videoOnWifi":true,"videoOnCellular":true}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs.image, .always)
        XCTAssertEqual(prefs.audio, .always)
        XCTAssertEqual(prefs.video, .always)
        XCTAssertEqual(prefs.audioTranslation, .wifiOnly)
    }

    func test_loadOrMigrate_legacyWifiOnly_migratesTo_wifiOnly() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":false,"audioOnWifi":true,"audioOnCellular":false,"videoOnWifi":true,"videoOnCellular":false}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs.image, .wifiOnly)
        XCTAssertEqual(prefs.audio, .wifiOnly)
        XCTAssertEqual(prefs.video, .wifiOnly)
    }

    func test_loadOrMigrate_clearsLegacyKey_afterMigration() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":false,"audioOnWifi":true,"audioOnCellular":false,"videoOnWifi":true,"videoOnCellular":false}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        _ = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertNil(
            defaults.data(forKey: MediaDownloadPreferencesStore.legacyStorageKey),
            "legacy key doit être supprimée après migration"
        )
    }
}
