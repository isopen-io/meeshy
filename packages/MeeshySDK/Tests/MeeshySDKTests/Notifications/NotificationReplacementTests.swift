import XCTest
@testable import MeeshySDK

/// Le push d'une notification RÉÉCRITE (édition d'un message, d'un post, d'un
/// commentaire) nomme lui-même la bannière qu'il annule :
/// `userInfo.replacesNotificationId`. L'extension de notification, et
/// l'application au premier plan, retirent cette bannière AVANT d'afficher la
/// nouvelle version — l'annulation voyage avec le remplacement, elle ne peut ni
/// arriver après lui (ce que faisait la révocation silencieuse séparée, qui
/// effaçait alors la version d'après), ni se perdre sans lui (app tuée).
final class NotificationReplacementTests: XCTestCase {

    private let notificationId = "64d000000000000000000004"
    private let messageId = "507f1f77bcf86cd799439011"

    private func replacementUserInfo(
        replaces: Any? = "64d000000000000000000004",
        type: String = "new_message",
        messageId: String? = "507f1f77bcf86cd799439011"
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = ["notificationId": notificationId, "type": type, "reproduced": "true"]
        if let replaces { info[NotificationReplacement.userInfoKey] = replaces }
        if let messageId { info["messageId"] = messageId }
        return info
    }

    // MARK: - Parsing

    func test_userInfoKey_matchesTheGatewayContract() {
        XCTAssertEqual(NotificationReplacement.userInfoKey, "replacesNotificationId")
    }

    func test_init_withReplacesNotificationId_parsesTheReplacedId() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertEqual(replacement.replacedNotificationId, notificationId)
        XCTAssertEqual(replacement.messageId, messageId)
        XCTAssertEqual(replacement.type, "new_message")
    }

    func test_init_withoutReplacesNotificationId_isNil() {
        XCTAssertNil(NotificationReplacement(userInfo: replacementUserInfo(replaces: nil)))
    }

    func test_init_withEmptyOrBlankReplacesNotificationId_isNil() {
        XCTAssertNil(NotificationReplacement(userInfo: replacementUserInfo(replaces: "")))
        XCTAssertNil(NotificationReplacement(userInfo: replacementUserInfo(replaces: "   ")))
    }

    func test_init_withNonStringReplacesNotificationId_isNil() {
        XCTAssertNil(NotificationReplacement(userInfo: replacementUserInfo(replaces: 42)))
    }

    // MARK: - covers

    func test_covers_bannerWithTheReplacedNotificationId_isTrue() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertTrue(replacement.covers(["notificationId": notificationId, "type": "new_message"]))
    }

    /// Une bannière qui porte SON identité n'est jugée que sur elle : un autre
    /// id sur le même message (la réaction à ce message, une autre mention)
    /// n'est pas la bannière remplacée.
    func test_covers_bannerWithAnotherNotificationId_onTheSameMessage_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertFalse(replacement.covers([
            "notificationId": "64d0000000000000000000ff",
            "type": "new_message",
            "messageId": messageId,
        ]))
    }

    /// Repli pour une bannière d'ancien format, posée sans `notificationId` :
    /// même message ET même type — c'est la même notification.
    func test_covers_legacyBannerWithoutNotificationId_sameMessageAndType_isTrue() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertTrue(replacement.covers(["type": "new_message", "messageId": messageId]))
    }

    func test_covers_legacyBannerWithoutNotificationId_sameMessageOtherType_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertFalse(replacement.covers(["type": "message_reaction", "messageId": messageId]))
    }

    func test_covers_legacyBannerWithoutNotificationId_otherMessage_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertFalse(replacement.covers(["type": "new_message", "messageId": "507f1f77bcf86cd7994390ff"]))
    }

    /// Un remplacement sans message (post, commentaire) n'a pas de repli : rien
    /// ne se retire sur la foi d'un `messageId` absent des deux côtés.
    func test_covers_replacementWithoutMessageId_neverMatchesALegacyBanner() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo(type: "post_comment", messageId: nil)))
        XCTAssertFalse(replacement.covers(["type": "post_comment"]))
        XCTAssertFalse(replacement.covers(["type": "post_comment", "messageId": ""]))
    }

    // MARK: - identifiersToRemove

    func test_identifiersToRemove_selectsOnlyTheReplacedBanners() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        let delivered: [(id: String, userInfo: [AnyHashable: Any])] = [
            (id: "conv-c1", userInfo: ["notificationId": notificationId, "type": "new_message"]),
            (id: "other", userInfo: ["notificationId": "64d0000000000000000000ff", "type": "new_message"]),
            (id: "call", userInfo: ["type": "missed_call"]),
        ]
        XCTAssertEqual(replacement.identifiersToRemove(from: delivered, excluding: "incoming"), ["conv-c1"])
    }

    /// La requête entrante peut porter le même identifiant qu'une bannière
    /// livrée (même `apns-collapse-id`) : iOS la remplace nativement, et la
    /// retirer ici n'apporterait que le risque de toucher la nouvelle.
    func test_identifiersToRemove_neverSelectsTheIncomingRequestItself() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        let delivered: [(id: String, userInfo: [AnyHashable: Any])] = [
            (id: notificationId, userInfo: ["notificationId": notificationId, "type": "new_message"]),
            (id: "conv-c1", userInfo: ["notificationId": notificationId, "type": "new_message"]),
        ]
        XCTAssertEqual(replacement.identifiersToRemove(from: delivered, excluding: notificationId), ["conv-c1"])
    }

    func test_identifiersToRemove_withNothingDelivered_isEmpty() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: replacementUserInfo()))
        XCTAssertEqual(replacement.identifiersToRemove(from: [], excluding: "incoming"), [])
    }
}
