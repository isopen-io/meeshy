import XCTest
import MeeshySDK
@testable import Meeshy

/// `willPresent` doit dériver ses options de présentation des préférences de
/// notification — avant ce résolveur, une catégorie désactivée (ou DND, ou
/// « Sons » off) affichait quand même bannière + son dès que le socket était
/// down.
final class NotificationPresentationResolverTests: XCTestCase {

    private func makePrefs(_ mutate: (inout UserNotificationPreferences) -> Void = { _ in }) -> UserNotificationPreferences {
        var prefs = UserNotificationPreferences.defaults
        mutate(&prefs)
        return prefs
    }

    // MARK: - Socket vivant : le toast in-app prend le relais

    func test_socketConnected_returnsBadgeOnly() {
        let options = NotificationPresentationResolver.options(
            socketConnected: true, prefs: makePrefs(), rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.badge])
    }

    func test_socketConnected_badgesDisabled_returnsEmpty() {
        let options = NotificationPresentationResolver.options(
            socketConnected: true,
            prefs: makePrefs { $0.notificationBadgeEnabled = false },
            rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [])
    }

    // MARK: - Socket down : bannière gatée par les préférences

    func test_socketDown_allowedType_returnsFullBanner() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false, prefs: makePrefs(), rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.banner, .list, .sound, .badge])
    }

    func test_socketDown_soundDisabled_omitsSound() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs { $0.soundEnabled = false },
            rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.banner, .list, .badge])
    }

    func test_socketDown_disabledCategory_suppressesBannerAndSound() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs { $0.newMessageEnabled = false },
            rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.badge])
    }

    func test_socketDown_pushMasterDisabled_suppressesBanner() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs { $0.pushEnabled = false },
            rawType: "reaction", conversationType: "group"
        )
        XCTAssertEqual(options, [.badge])
    }

    func test_socketDown_dndWindowActive_suppressesBanner() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs {
                $0.dndEnabled = true
                $0.dndStartTime = "00:00"
                $0.dndEndTime = "23:59"
                $0.dndDays = []
            },
            rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.badge])
    }

    /// Type inconnu → coercé `.system` (même règle que le décodage SDK), donc
    /// gaté par le toggle « Système ».
    func test_socketDown_unknownType_isGatedBySystemToggle() {
        let allowed = NotificationPresentationResolver.options(
            socketConnected: false, prefs: makePrefs(), rawType: "some_future_type", conversationType: nil
        )
        XCTAssertTrue(allowed.contains(.banner))

        let blocked = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs { $0.systemEnabled = false },
            rawType: "some_future_type", conversationType: nil
        )
        XCTAssertEqual(blocked, [.badge])
    }

    func test_socketDown_badgesDisabled_bannerWithoutBadge() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs { $0.notificationBadgeEnabled = false },
            rawType: "new_message", conversationType: "direct"
        )
        XCTAssertEqual(options, [.banner, .list, .sound])
    }
}
