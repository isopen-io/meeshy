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

    // MARK: - Nouveaux champs Codable

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
