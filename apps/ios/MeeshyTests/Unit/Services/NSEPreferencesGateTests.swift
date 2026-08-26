import XCTest
import MeeshySDK
import UserNotifications

/// `NSEPreferencesGate` est compilé directement dans ce bundle (cf.
/// project.yml, même mécanisme que NSEDecryptor) : la NSE applique les
/// préférences de notification à la LIVRAISON, app tuée — sons, badge,
/// regroupement, et livraison passive pour push off / DND / type désactivé.
final class NSEPreferencesGateTests: XCTestCase {

    private func makeContent(userInfo: [AnyHashable: Any] = [:]) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = "Alice"
        content.body = "Salut"
        content.sound = .default
        content.badge = 5
        content.threadIdentifier = "conversation:c1"
        content.userInfo = userInfo
        return content
    }

    // MARK: - loadPreferences

    func test_loadPreferences_decodesTheAppGroupMirrorWrittenBySDKEncoder() throws {
        let suiteName = "group.test.meeshy.nse.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        var prefs = UserNotificationPreferences.defaults
        prefs.soundEnabled = false
        prefs.dndEnabled = true
        defaults.set(
            try JSONEncoder().encode(prefs),
            forKey: UserPreferencesManager.appGroupNotificationPrefsKey
        )

        let loaded = try XCTUnwrap(NSEPreferencesGate.loadPreferences(defaults: defaults))
        XCTAssertFalse(loaded.soundEnabled)
        XCTAssertTrue(loaded.dndEnabled)
    }

    func test_loadPreferences_missingMirror_returnsNil() throws {
        let suiteName = "group.test.meeshy.nse.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertNil(NSEPreferencesGate.loadPreferences(defaults: defaults))
    }

    // MARK: - apply

    func test_apply_defaults_leaveContentUntouched() {
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: .defaults, to: content, rawType: "new_message")

        XCTAssertNotNil(content.sound)
        XCTAssertEqual(content.badge, 5)
        XCTAssertEqual(content.threadIdentifier, "conversation:c1")
        XCTAssertNotEqual(content.interruptionLevel, .passive)
    }

    func test_apply_soundDisabled_stripsSoundOnly() {
        var prefs = UserNotificationPreferences.defaults
        prefs.soundEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "new_message")

        XCTAssertNil(content.sound)
        XCTAssertEqual(content.badge, 5)
        XCTAssertNotEqual(content.interruptionLevel, .passive)
    }

    func test_apply_badgesDisabled_zeroesBadge() {
        var prefs = UserNotificationPreferences.defaults
        prefs.notificationBadgeEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "new_message")

        XCTAssertEqual(content.badge, 0)
        XCTAssertNotNil(content.sound)
    }

    /// `applyThreading` (NSE) re-dérive le threadIdentifier depuis
    /// conversationId AVANT la porte : « Group notifications » off doit
    /// l'annuler, sinon le strip serveur est défait à la livraison.
    func test_apply_groupingDisabled_clearsThreadIdentifier() {
        var prefs = UserNotificationPreferences.defaults
        prefs.groupNotifications = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "new_message")

        XCTAssertEqual(content.threadIdentifier, "")
    }

    func test_apply_disabledType_downgradesToPassiveAndSilent() {
        var prefs = UserNotificationPreferences.defaults
        prefs.newMessageEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "new_message")

        XCTAssertEqual(content.interruptionLevel, .passive)
        XCTAssertNil(content.sound)
    }

    func test_apply_pushMasterDisabled_downgradesToPassive() {
        var prefs = UserNotificationPreferences.defaults
        prefs.pushEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "reaction")

        XCTAssertEqual(content.interruptionLevel, .passive)
    }

    func test_apply_dndWindowActive_downgradesToPassive() throws {
        var prefs = UserNotificationPreferences.defaults
        prefs.dndEnabled = true
        prefs.dndStartTime = "00:00"
        prefs.dndEndTime = "23:59"
        prefs.dndDays = []
        let content = makeContent()

        // `now` FIXE (midi local) : évalué à l'horloge réelle, ce test devenait
        // rouge chaque jour dans la minute 23:59 — la fenêtre est à fin
        // EXCLUSIVE, « 00:00 → 23:59 » ne couvre pas [23:59, minuit). C'est
        // arrivé en CI (run 32605462555, suite exécutée à 23:59 UTC).
        let noon = try XCTUnwrap(Calendar.current.date(
            from: DateComponents(year: 2026, month: 1, day: 15, hour: 12, minute: 0)
        ))
        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "new_message", now: noon)

        XCTAssertEqual(content.interruptionLevel, .passive)
        XCTAssertNil(content.sound)
    }

    /// Type inconnu → coercé `.system` (même règle que le décodage SDK et que
    /// NotificationPresentationResolver côté app).
    func test_apply_unknownType_isGatedBySystemToggle() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "some_future_type")

        XCTAssertEqual(content.interruptionLevel, .passive)
    }

    func test_apply_incomingCallAlert_isGatedByCallsEnabled() {
        var prefs = UserNotificationPreferences.defaults
        prefs.callsEnabled = false
        let content = makeContent()

        NSEPreferencesGate.apply(preferences: prefs, to: content, rawType: "incoming_call")

        XCTAssertEqual(content.interruptionLevel, .passive)
    }
}
