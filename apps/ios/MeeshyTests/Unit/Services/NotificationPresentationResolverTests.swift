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

    // MARK: - Conversation OUVERTE : rien à annoncer, le fil est sous les yeux

    /// Une push de la conversation qu'on est en train de LIRE ne s'annonce
    /// pas — ni bannière ni son, même socket down (retour d'avant-plan : le
    /// socket met quelques secondes à revenir et les pushes en attente
    /// tombaient en bannières sur la conversation affichée).
    func test_pushForTheOpenConversation_neverBanners() {
        for socketConnected in [true, false] {
            let options = NotificationPresentationResolver.options(
                socketConnected: socketConnected,
                prefs: makePrefs(),
                rawType: "new_message",
                conversationType: "group",
                conversationId: "conv-open",
                activeConversationId: "conv-open"
            )
            XCTAssertEqual(options, [.badge], "socketConnected=\(socketConnected)")
        }
    }

    func test_pushForAnotherConversation_stillBanners_whenSocketDown() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs(),
            rawType: "new_message",
            conversationType: "group",
            conversationId: "conv-other",
            activeConversationId: "conv-open"
        )
        XCTAssertEqual(options, [.banner, .list, .sound, .badge])
    }

    func test_pushWithoutConversation_isNotClampedByAnOpenOne() {
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs(),
            rawType: "new_message",
            conversationType: "direct",
            conversationId: nil,
            activeConversationId: "conv-open"
        )
        XCTAssertEqual(options, [.banner, .list, .sound, .badge])
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

    func test_socketDown_dndWindowActive_suppressesBanner() throws {
        // `now` FIXE (midi local) : évalué à l'horloge réelle, ce test devenait
        // rouge chaque jour dans la minute 23:59 — la fenêtre est à fin
        // EXCLUSIVE, « 00:00 → 23:59 » ne couvre pas [23:59, minuit). C'est
        // arrivé en CI (run 32605462555, suite exécutée à 23:59 UTC).
        let noon = try XCTUnwrap(Calendar.current.date(
            from: DateComponents(year: 2026, month: 1, day: 15, hour: 12, minute: 0)
        ))
        let options = NotificationPresentationResolver.options(
            socketConnected: false,
            prefs: makePrefs {
                $0.dndEnabled = true
                $0.dndStartTime = "00:00"
                $0.dndEndTime = "23:59"
                $0.dndDays = []
            },
            rawType: "new_message", conversationType: "direct",
            now: noon
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
