import XCTest
@testable import MeeshySDK

/// L'activité d'un proche relayée à son entourage (#14068 à #14072) et la Connaissance née toute
/// seule (#13932) : cinq types que la passerelle émet et que l'iPhone décodait en `.system`. Ils
/// suivaient la préférence « système », portaient la cloche du système, et leur toucher rouvrait la
/// liste des notifications au lieu de la publication ou du profil (#14235, ios-notifs-5).
final class RelayedActivityNotificationTests: XCTestCase {

    private let relayedTypes: [MeeshyNotificationType] = [
        .friendContentReaction, .friendContentShare, .friendContentRepost, .friendContentQuote,
    ]

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    /// La charge que `activity-relay.ts` écrit : `context.postId`, `metadata.postType`, l'acteur.
    /// Son nom d'affichage imite un compte du système, comme le piège de l'audit de #14068.
    private func relayedJSON(type: String, title: String? = "Meeshy Support a partagé une publication de Lina") -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"\#(type)","priority":"low",\#(titleField)
         "content":"",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-17T08:00:00.000Z"},
         "context":{"postId":"p1"},
         "metadata":{"action":"view_post","activity":"share","postId":"p1","postType":"POST","contentAuthorName":"Lina"},
         "actor":{"id":"a7","username":"support","displayName":"Meeshy Support","avatar":null}}
        """#
    }

    private func acquaintanceJSON(title: String? = "Marie est maintenant une Connaissance") -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        return #"""
        {"id":"n2","userId":"me","type":"relation_acquaintance","priority":"low",\#(titleField)
         "content":"Vous échangez assez pour vous connaître : c'est un début 👋",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-17T08:00:00.000Z"},
         "context":{},
         "metadata":{"action":"view_profile","userId":"x42","relationLevel":"ACQUAINTANCE"},
         "actor":{"id":"x42","username":"marie","displayName":"Marie","avatar":null}}
        """#
    }

    // MARK: - Type

    func test_rawValues_areTheServerTypes() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_content_reaction"), .friendContentReaction)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_content_share"), .friendContentShare)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_content_repost"), .friendContentRepost)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_content_quote"), .friendContentQuote)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "relation_acquaintance"), .relationAcquaintance)
    }

    func test_decoding_aRelayedShare_isSocial_evenUnderAnActorNamedLikeTheSystem() throws {
        let notification = try decode(relayedJSON(type: "friend_content_share"))

        XCTAssertEqual(notification.notificationType, .friendContentShare)
        XCTAssertEqual(notification.senderId, "a7")
        XCTAssertEqual(notification.senderName, "Meeshy Support")
        XCTAssertEqual(notification.context?.postId, "p1", "le toucher ouvre la publication relayée")
    }

    func test_decoding_aNewAcquaintance_keepsTheOtherPersonAsActor() throws {
        let notification = try decode(acquaintanceJSON())

        XCTAssertEqual(notification.notificationType, .relationAcquaintance)
        XCTAssertEqual(notification.senderId, "x42", "le toucher ouvre le profil de l'autre personne")
    }

    // MARK: - Présentation

    func test_presentation_aRelayedActivityWearsTheFriendContentColour_notTheSystemBell() {
        for type in relayedTypes {
            XCTAssertEqual(type.accentHex, MeeshyNotificationType.friendNewPost.accentHex, type.rawValue)
            XCTAssertNotEqual(type.systemIcon, MeeshyNotificationType.system.systemIcon, type.rawValue)
        }
    }

    func test_presentation_aNewAcquaintanceIsAPersonInTheContactsFamily() {
        XCTAssertEqual(MeeshyNotificationType.relationAcquaintance.systemIcon, "person.crop.circle.badge.checkmark")
        XCTAssertEqual(MeeshyNotificationType.relationAcquaintance.accentHex, MeeshyNotificationType.contactRecentlyActive.accentHex)
    }

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        XCTAssertEqual(try decode(relayedJSON(type: "friend_content_share")).formattedTitle,
                       "Meeshy Support a partagé une publication de Lina")
        XCTAssertEqual(try decode(acquaintanceJSON()).formattedTitle, "Marie est maintenant une Connaissance")
    }

    func test_formattedTitle_withoutServerTitle_fallsBackToTheActorSentence() throws {
        XCTAssertEqual(try decode(relayedJSON(type: "friend_content_reaction", title: nil)).formattedTitle,
                       "Meeshy Support a réagi à une publication")
        XCTAssertEqual(try decode(relayedJSON(type: "friend_content_share", title: nil)).formattedTitle,
                       "Meeshy Support a partagé une publication")
        XCTAssertEqual(try decode(relayedJSON(type: "friend_content_repost", title: nil)).formattedTitle,
                       "Meeshy Support a republié une publication")
        XCTAssertEqual(try decode(relayedJSON(type: "friend_content_quote", title: nil)).formattedTitle,
                       "Meeshy Support a cité une publication")
        XCTAssertEqual(try decode(acquaintanceJSON(title: nil)).formattedTitle, "Marie est maintenant une Connaissance")
    }

    func test_formattedContext_aRelayedActivityNamesTheContentItPointsAt() throws {
        XCTAssertNotNil(try decode(relayedJSON(type: "friend_content_repost")).formattedContext,
                        "une notification système n'a pas de ligne de contexte ; une activité relayée nomme sa publication")
    }

    // MARK: - Préférence de réception — la même que côté passerelle (`type-preference.ts`)

    func test_preference_aRelayedActivityFollowsFriendContent_notSystem() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = false
        prefs.friendContentEnabled = true
        for type in relayedTypes {
            XCTAssertTrue(prefs.isTypeEnabled(type), type.rawValue)
        }

        prefs.systemEnabled = true
        prefs.friendContentEnabled = false
        for type in relayedTypes {
            XCTAssertFalse(prefs.isTypeEnabled(type), type.rawValue)
        }
    }

    func test_preference_aNewAcquaintanceFollowsContactRequests_notSystem() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = false
        prefs.contactRequestEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.relationAcquaintance))

        prefs.systemEnabled = true
        prefs.contactRequestEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.relationAcquaintance))
    }
}
