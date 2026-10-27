import XCTest
import MeeshyCore
@testable import MeeshySDK

/// L'extension de notification lit le miroir des préférences de notification
/// dans le groupe d'apps SANS lier `UserPreferencesManager` (#13137) : les deux
/// noms doivent désigner la même suite et la même clé, sinon la NSE lirait une
/// case vide et sonnerait pour une catégorie coupée.
final class AppGroupPreferencesTests: XCTestCase {

    func test_suiteName_isTheSharedAppGroup() {
        XCTAssertEqual(AppGroupPreferences.suiteName, "group.me.meeshy.apps")
    }

    func test_notificationPreferencesKey_isTheMirrorTheAppWrites() {
        XCTAssertEqual(AppGroupPreferences.notificationPreferencesKey, "meeshy_prefs_notification")
    }

    func test_userPreferencesManager_forwardsTheSameNames() {
        XCTAssertEqual(UserPreferencesManager.appGroupSuiteName, AppGroupPreferences.suiteName)
        XCTAssertEqual(UserPreferencesManager.appGroupNotificationPrefsKey, AppGroupPreferences.notificationPreferencesKey)
    }

    func test_mirroredPreferences_decodeFromTheCoreKey() throws {
        let suite = "test.app-group-preferences.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        var prefs = UserNotificationPreferences()
        prefs.mentionEnabled = false
        defaults.set(try JSONEncoder().encode(prefs), forKey: AppGroupPreferences.notificationPreferencesKey)

        let data = try XCTUnwrap(defaults.data(forKey: UserPreferencesManager.appGroupNotificationPrefsKey))
        let decoded = try JSONDecoder().decode(UserNotificationPreferences.self, from: data)

        XCTAssertFalse(decoded.mentionEnabled)
    }
}
