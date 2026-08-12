import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Sync thème — auparavant unidirectionnelle : `application.theme` était
/// poussé au backend (`SettingsView.syncThemeToPrefs`) mais jamais relu vers
/// `ThemeManager`, donc un changement de thème fait sur un autre appareil ne
/// se reflétait jamais localement. `ThemeManager.mapRemoteTheme` est le
/// coeur pur de la correction — extrait pour être testable sans dépendre du
/// singleton `ThemeManager.shared` ni de `UserPreferencesManager.shared`
/// (mêmes contraintes de singleton privé que `UserPreferencesManager`, cf.
/// `UserPreferencesManagerTests.test_shouldApplyRemote_*`).
final class ThemeManagerRemoteSyncTests: XCTestCase {

    func test_mapRemoteTheme_auto_mapsToSystem() {
        XCTAssertEqual(ThemeManager.mapRemoteTheme(.auto), .system)
    }

    func test_mapRemoteTheme_light_mapsToLight() {
        XCTAssertEqual(ThemeManager.mapRemoteTheme(.light), .light)
    }

    func test_mapRemoteTheme_dark_mapsToDark() {
        XCTAssertEqual(ThemeManager.mapRemoteTheme(.dark), .dark)
    }
}
