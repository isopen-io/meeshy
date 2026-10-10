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

    // MARK: - Réactions : même acteur, même sujet, même type

    private let reactorId = "64a000000000000000000002"

    private func reactionUserInfo(
        type: String = "message_reaction",
        senderId: String = "64a000000000000000000002",
        messageId: String = "",
        postId: String = "",
        commentId: String = "",
        flagged: Bool = true
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "notificationId": "64d0000000000000000000aa",
            "type": type,
            "senderId": senderId,
            "messageId": messageId,
            "postId": postId,
            "commentId": commentId,
        ]
        if flagged { info[NotificationReplacement.actorSubjectUserInfoKey] = "true" }
        return info
    }

    func test_actorSubjectUserInfoKey_matchesTheGatewayContract() {
        XCTAssertEqual(NotificationReplacement.actorSubjectUserInfoKey, "replacesActorSubject")
    }

    func test_init_reactionWithoutTheFlag_isNil() {
        XCTAssertNil(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId, flagged: false)))
    }

    func test_init_reactionFlaggedWithoutSenderOrSubject_isNil() {
        XCTAssertNil(NotificationReplacement(userInfo: reactionUserInfo(senderId: "", messageId: messageId)))
        XCTAssertNil(NotificationReplacement(userInfo: reactionUserInfo()))
    }

    /// ❤️ puis 😂 sur le même message : la bannière d'avant (autre identité,
    /// même acteur, même message, même type) est remplacée.
    func test_covers_previousReactionOfTheSameActorOnTheSameMessage_isTrue() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId)))
        XCTAssertTrue(replacement.covers([
            "notificationId": "64d0000000000000000000bb",
            "type": "message_reaction",
            "senderId": reactorId,
            "messageId": messageId,
        ]))
    }

    func test_covers_reactionOfAnotherActorOnTheSameMessage_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId)))
        XCTAssertFalse(replacement.covers([
            "notificationId": "64d0000000000000000000bb",
            "type": "message_reaction",
            "senderId": "64a0000000000000000000ff",
            "messageId": messageId,
        ]))
    }

    func test_covers_reactionOfTheSameActorOnAnotherMessage_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId)))
        XCTAssertFalse(replacement.covers([
            "type": "message_reaction",
            "senderId": reactorId,
            "messageId": "507f1f77bcf86cd7994390ff",
        ]))
    }

    /// Le même auteur qui RÉPOND au message n'est pas une réaction : seul le
    /// même type est remplacé.
    func test_covers_otherTypeOfTheSameActorOnTheSameMessage_isFalse() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId)))
        XCTAssertFalse(replacement.covers([
            "type": "message_reply",
            "senderId": reactorId,
            "messageId": messageId,
        ]))
    }

    /// Réagir à un COMMENTAIRE ne remplace ni la réaction à un autre
    /// commentaire, ni celle au POST qui le porte : le sujet est le
    /// commentaire d'abord, le post seulement à défaut.
    func test_covers_commentReaction_isJudgedOnTheComment() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(
            type: "comment_like", postId: "64b000000000000000000001", commentId: "64c000000000000000000001"
        )))
        XCTAssertTrue(replacement.covers([
            "type": "comment_like", "senderId": reactorId,
            "postId": "64b000000000000000000001", "commentId": "64c000000000000000000001",
        ]))
        XCTAssertFalse(replacement.covers([
            "type": "comment_like", "senderId": reactorId,
            "postId": "64b000000000000000000001", "commentId": "64c0000000000000000000ff",
        ]))
        XCTAssertFalse(replacement.covers([
            "type": "post_like", "senderId": reactorId, "postId": "64b000000000000000000001",
        ]))
    }

    func test_covers_storyReactionOfTheSameActorOnTheSameStory_isTrue() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(
            type: "story_reaction", postId: "64b000000000000000000001"
        )))
        XCTAssertTrue(replacement.covers([
            "type": "story_reaction", "senderId": reactorId, "postId": "64b000000000000000000001", "commentId": "",
        ]))
    }

    func test_identifiersToRemove_reaction_selectsOnlyThePreviousReactionOfThatActor() throws {
        let replacement = try XCTUnwrap(NotificationReplacement(userInfo: reactionUserInfo(messageId: messageId)))
        let delivered: [(id: String, userInfo: [AnyHashable: Any])] = [
            (id: "old-heart", userInfo: ["type": "message_reaction", "senderId": reactorId, "messageId": messageId]),
            (id: "other-actor", userInfo: ["type": "message_reaction", "senderId": "64a0000000000000000000ff", "messageId": messageId]),
            (id: "the-message", userInfo: ["type": "new_message", "senderId": reactorId, "messageId": messageId]),
        ]
        XCTAssertEqual(replacement.identifiersToRemove(from: delivered, excluding: "incoming"), ["old-heart"])
    }
}
