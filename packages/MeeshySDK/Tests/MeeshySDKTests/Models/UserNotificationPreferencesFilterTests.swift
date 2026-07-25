import XCTest
@testable import MeeshySDK

/// Vérifie que chaque type de notification est gaté par le TOGGLE que l'écran
/// Réglages annonce — alignement strict avec le mapping serveur
/// (`NotificationService.isTypeEnabled`, gateway). Avant ce correctif, les
/// variantes direct/group de `new_conversation`, les commentaires de story et
/// le contenu des amis passaient par le `default: return true`.
final class UserNotificationPreferencesFilterTests: XCTestCase {

    func test_isTypeEnabled_newConversationVariants_followConversationToggle() {
        var prefs = UserNotificationPreferences.defaults
        prefs.conversationEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.newConversation))
        XCTAssertFalse(prefs.isTypeEnabled(.newConversationDirect))
        XCTAssertFalse(prefs.isTypeEnabled(.newConversationGroup))

        prefs.conversationEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.newConversationDirect))
        XCTAssertTrue(prefs.isTypeEnabled(.newConversationGroup))
    }

    func test_isTypeEnabled_commentReaction_followsCommentLikeToggle() {
        var prefs = UserNotificationPreferences.defaults
        prefs.commentLikeEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.commentReaction))

        prefs.commentLikeEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.commentReaction))
    }

    func test_isTypeEnabled_storyCommentTypes_followPostCommentToggle() {
        var prefs = UserNotificationPreferences.defaults
        prefs.postCommentEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.storyNewComment))
        XCTAssertFalse(prefs.isTypeEnabled(.friendStoryComment))
        XCTAssertFalse(prefs.isTypeEnabled(.storyThreadReply))

        prefs.postCommentEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.storyNewComment))
    }

    func test_isTypeEnabled_friendContentTypes_followFriendContentToggle() {
        var prefs = UserNotificationPreferences.defaults
        prefs.friendContentEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.friendNewPost))
        XCTAssertFalse(prefs.isTypeEnabled(.friendNewStory))
        XCTAssertFalse(prefs.isTypeEnabled(.friendNewMood))

        prefs.friendContentEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.friendNewPost))
    }

    /// « Appels entrants » (`callsEnabled`, catégorie dédiée GW6) et « Appels
    /// manqués » (`missedCallEnabled`) sont deux toggles INDÉPENDANTS : couper
    /// la sonnerie ne doit pas couper les notifications d'appel manqué, et
    /// inversement.
    func test_isTypeEnabled_incomingCallTypes_followCallsToggle_independentlyOfMissedCalls() {
        var prefs = UserNotificationPreferences.defaults
        prefs.callsEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.incomingCall))
        XCTAssertFalse(prefs.isTypeEnabled(.incomingCallAlert))
        XCTAssertFalse(prefs.isTypeEnabled(.legacyCallIncoming))
        XCTAssertTrue(prefs.isTypeEnabled(.missedCall))

        prefs.callsEnabled = true
        prefs.missedCallEnabled = false
        XCTAssertTrue(prefs.isTypeEnabled(.incomingCall))
        XCTAssertFalse(prefs.isTypeEnabled(.missedCall))
        XCTAssertFalse(prefs.isTypeEnabled(.callEnded))
        XCTAssertFalse(prefs.isTypeEnabled(.callDeclined))
    }

    // MARK: - Nouveaux champs Codable

    func test_callsEnabled_defaultsTrue_andRoundTrips() throws {
        XCTAssertTrue(UserNotificationPreferences.defaults.callsEnabled)

        let empty = try JSONDecoder().decode(UserNotificationPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.callsEnabled)

        var prefs = UserNotificationPreferences.defaults
        prefs.callsEnabled = false
        let decoded = try JSONDecoder().decode(
            UserNotificationPreferences.self,
            from: JSONEncoder().encode(prefs)
        )
        XCTAssertFalse(decoded.callsEnabled)
    }


    func test_friendContentEnabled_defaultsTrue_andRoundTrips() throws {
        XCTAssertTrue(UserNotificationPreferences.defaults.friendContentEnabled)

        let empty = try JSONDecoder().decode(UserNotificationPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.friendContentEnabled)

        var prefs = UserNotificationPreferences.defaults
        prefs.friendContentEnabled = false
        let decoded = try JSONDecoder().decode(
            UserNotificationPreferences.self,
            from: JSONEncoder().encode(prefs)
        )
        XCTAssertFalse(decoded.friendContentEnabled)
    }

    /// Le DND serveur est tz-aware (`isWithinDnd`, packages/shared) : sans ce
    /// champ dans le PATCH iOS, la fenêtre 22:00–08:00 d'un utilisateur à
    /// Paris était évaluée en UTC côté gateway.
    func test_dndUtcOffsetMinutes_defaultsZero_andRoundTrips() throws {
        XCTAssertEqual(UserNotificationPreferences.defaults.dndUtcOffsetMinutes, 0)

        let empty = try JSONDecoder().decode(UserNotificationPreferences.self, from: Data("{}".utf8))
        XCTAssertEqual(empty.dndUtcOffsetMinutes, 0)

        var prefs = UserNotificationPreferences.defaults
        prefs.dndUtcOffsetMinutes = 120
        let decoded = try JSONDecoder().decode(
            UserNotificationPreferences.self,
            from: JSONEncoder().encode(prefs)
        )
        XCTAssertEqual(decoded.dndUtcOffsetMinutes, 120)
    }
}
