import XCTest
@testable import MeeshySDK

final class NotificationModelsTests: XCTestCase {

    // MARK: - MeeshyNotificationType

    func testNotificationTypeRawValues() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.rawValue, "new_message")
        XCTAssertEqual(MeeshyNotificationType.contactRequest.rawValue, "contact_request")
        XCTAssertEqual(MeeshyNotificationType.postLike.rawValue, "post_like")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.rawValue, "friend_request")
        XCTAssertEqual(MeeshyNotificationType.missedCall.rawValue, "missed_call")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.rawValue, "security_alert")
        XCTAssertEqual(MeeshyNotificationType.system.rawValue, "system")
    }

    func testNotificationTypeLegacyRawValues() {
        XCTAssertEqual(MeeshyNotificationType.legacyNewMessage.rawValue, "NEW_MESSAGE")
        XCTAssertEqual(MeeshyNotificationType.legacyFriendRequest.rawValue, "FRIEND_REQUEST")
        XCTAssertEqual(MeeshyNotificationType.legacyPostLike.rawValue, "POST_LIKE")
    }

    func testNotificationTypeSystemIcon() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.systemIcon, "bubble.left.fill")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.systemIcon, "person.badge.plus")
        XCTAssertEqual(MeeshyNotificationType.postLike.systemIcon, "hand.thumbsup.fill")
        XCTAssertEqual(MeeshyNotificationType.missedCall.systemIcon, "phone.arrow.down.left")
        XCTAssertEqual(MeeshyNotificationType.achievementUnlocked.systemIcon, "trophy.fill")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.systemIcon, "exclamationmark.triangle.fill")
        XCTAssertEqual(MeeshyNotificationType.system.systemIcon, "bell.fill")
    }

    func testNotificationTypeAccentHex() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.accentHex, "3498DB")
        XCTAssertEqual(MeeshyNotificationType.messageReaction.accentHex, "FF6B6B")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.accentHex, "4ECDC4")
        XCTAssertEqual(MeeshyNotificationType.missedCall.accentHex, "E91E63")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.accentHex, "EF4444")
        XCTAssertEqual(MeeshyNotificationType.system.accentHex, "6366F1")
    }

    // MARK: - NotificationActor

    func testNotificationActorDecoding() throws {
        let json = """
        {"id":"abc123","username":"alice","displayName":"Alice W","avatar":"https://img.test/a.png"}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.id, "abc123")
        XCTAssertEqual(actor.username, "alice")
        XCTAssertEqual(actor.displayName, "Alice W")
        XCTAssertEqual(actor.avatar, "https://img.test/a.png")
    }

    func testNotificationActorDisplayedNameUsesDisplayName() throws {
        let json = """
        {"id":"1","username":"bob","displayName":"Bobby"}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.displayedName, "Bobby")
    }

    func testNotificationActorDisplayedNameFallsBackToUsername() throws {
        let json = """
        {"id":"1","username":"bob","displayName":null}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.displayedName, "bob")
    }

    // MARK: - NotificationContext

    func testNotificationContextDecoding() throws {
        let json = """
        {"conversationId":"conv1","messageId":"msg1","postId":"post1","friendRequestId":null}
        """.data(using: .utf8)!

        let context = try JSONDecoder().decode(NotificationContext.self, from: json)
        XCTAssertEqual(context.conversationId, "conv1")
        XCTAssertEqual(context.messageId, "msg1")
        XCTAssertEqual(context.postId, "post1")
        XCTAssertNil(context.friendRequestId)
        XCTAssertNil(context.callSessionId)
    }

    // MARK: - NotificationState

    func testNotificationStateDecoding() throws {
        let json = """
        {"isRead":true,"readAt":"2026-01-15T10:30:00.000Z","createdAt":"2026-01-15T09:00:00.000Z","expiresAt":null}
        """.data(using: .utf8)!

        let state = try JSONDecoder().decode(NotificationState.self, from: json)
        XCTAssertTrue(state.isRead)
        XCTAssertEqual(state.readAt, "2026-01-15T10:30:00.000Z")
        XCTAssertEqual(state.createdAt, "2026-01-15T09:00:00.000Z")
        XCTAssertNil(state.expiresAt)
    }

    // MARK: - APINotification

    func testAPINotificationDecodingFromFullJSON() throws {
        let json = """
        {
            "id": "notif1",
            "userId": "user1",
            "type": "new_message",
            "priority": "high",
            "content": "Hello!",
            "actor": {"id":"sender1","username":"alice","displayName":"Alice","avatar":null},
            "context": {"conversationId":"conv1","messageId":"msg1"},
            "metadata": {"messagePreview":"Hello!"},
            "state": {"isRead":false,"readAt":null,"createdAt":"2026-01-15T10:30:00.000Z","expiresAt":null},
            "delivery": {"emailSent":false,"pushSent":true}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.id, "notif1")
        XCTAssertEqual(notification.userId, "user1")
        XCTAssertEqual(notification.type, "new_message")
        XCTAssertEqual(notification.priority, "high")
        XCTAssertEqual(notification.content, "Hello!")
        XCTAssertEqual(notification.actor?.username, "alice")
        XCTAssertEqual(notification.context?.conversationId, "conv1")
        XCTAssertFalse(notification.state.isRead)
    }

    func testAPINotificationComputedProperties() throws {
        let json = """
        {
            "id": "notif2",
            "userId": "user1",
            "type": "friend_request",
            "content": null,
            "actor": {"id":"s1","username":"bob","displayName":"Bob"},
            "state": {"isRead":true,"readAt":"2026-01-15T10:30:00.000Z","createdAt":"2026-01-15T09:00:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.notificationType, .friendRequest)
        XCTAssertTrue(notification.isRead)
        XCTAssertEqual(notification.senderId, "s1")
        XCTAssertEqual(notification.senderName, "Bob")
    }

    func testAPINotificationUnknownTypeFallsBackToSystem() throws {
        let json = """
        {
            "id": "notif3",
            "userId": "user1",
            "type": "unknown_type_xyz",
            "state": {"isRead":false,"createdAt":"2026-01-15T10:30:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.notificationType, .system)
    }

    // MARK: - RegisterDeviceTokenRequest

    func testRegisterDeviceTokenRequestEncoding() throws {
        let request = RegisterDeviceTokenRequest(token: "abc123")
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["token"] as? String, "abc123")
        XCTAssertEqual(dict["platform"] as? String, "ios")
        XCTAssertEqual(dict["type"] as? String, "apns")
    }

    // MARK: - NotificationMetadata (Login Device Fields)

    func testNotificationMetadataDecodesLoginDeviceFields() throws {
        let json = """
        {
            "action": "view_details",
            "deviceName": "Apple iPhone",
            "deviceVendor": "Apple",
            "deviceOS": "iOS 17.5",
            "deviceOSVersion": "17.5",
            "deviceType": "mobile",
            "ipAddress": "82.123.45.67",
            "country": "FR",
            "countryName": "France",
            "city": "Paris",
            "location": "Paris, France"
        }
        """.data(using: .utf8)!

        let metadata = try JSONDecoder().decode(NotificationMetadata.self, from: json)
        XCTAssertEqual(metadata.action, "view_details")
        XCTAssertEqual(metadata.deviceName, "Apple iPhone")
        XCTAssertEqual(metadata.deviceVendor, "Apple")
        XCTAssertEqual(metadata.deviceOS, "iOS 17.5")
        XCTAssertEqual(metadata.deviceOSVersion, "17.5")
        XCTAssertEqual(metadata.deviceType, "mobile")
        XCTAssertEqual(metadata.ipAddress, "82.123.45.67")
        XCTAssertEqual(metadata.country, "FR")
        XCTAssertEqual(metadata.countryName, "France")
        XCTAssertEqual(metadata.city, "Paris")
        XCTAssertEqual(metadata.location, "Paris, France")
    }

    func testNotificationMetadataDecodesPostThumbnailAndMediaType() throws {
        let json = """
        {
            "action": "view_post",
            "postId": "post1",
            "emoji": "❤️",
            "postType": "STORY",
            "mediaType": "image",
            "postThumbnailUrl": "https://cdn.meeshy.me/story-thumb.jpg"
        }
        """.data(using: .utf8)!

        let metadata = try JSONDecoder().decode(NotificationMetadata.self, from: json)
        XCTAssertEqual(metadata.mediaType, "image")
        XCTAssertEqual(metadata.postThumbnailUrl, "https://cdn.meeshy.me/story-thumb.jpg")
    }

    func test_storyReaction_mediaOnly_exposesThumbnailAndContextLabel() throws {
        // Story photo réagie sans texte : pas de body (la vignette porte le
        // visuel) ; la vignette est exposée et la ligne de contexte décrit
        // l'entité (« Votre story · 📷 Photo », sous-titre serveur).
        let json = """
        {
            "id": "notif-story-react",
            "userId": "user1",
            "type": "story_reaction",
            "subtitle": "Votre story · 📷 Photo",
            "content": "a réagi ❤️ à votre story",
            "actor": {"id":"s1","username":"windie","displayName":"Windie Nh"},
            "context": {"postId":"post1"},
            "metadata": {"action":"view_post","postId":"post1","emoji":"❤️","postType":"STORY","mediaType":"image","postThumbnailUrl":"https://cdn.meeshy.me/t.jpg"},
            "state": {"isRead":false,"readAt":null,"createdAt":"2026-06-25T10:30:00.000Z","expiresAt":null},
            "delivery": {"emailSent":false,"pushSent":true}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertNil(notification.formattedBody)
        XCTAssertEqual(notification.postThumbnailURLString, "https://cdn.meeshy.me/t.jpg")
        XCTAssertEqual(notification.formattedContext, "Votre story · 📷 Photo")
    }

    func test_postLike_withTextPreview_bodyKeepsTextOverMediaSummary() throws {
        let json = """
        {
            "id": "notif-post-like",
            "userId": "user1",
            "type": "post_like",
            "content": "a réagi 😍 à votre publication",
            "actor": {"id":"s1","username":"windie","displayName":"Windie Nh"},
            "context": {"postId":"post1"},
            "metadata": {"action":"view_post","postId":"post1","emoji":"😍","postType":"POST","postPreview":"Mon plus beau voyage","mediaType":"image"},
            "state": {"isRead":false,"readAt":null,"createdAt":"2026-06-25T10:30:00.000Z","expiresAt":null},
            "delivery": {"emailSent":false,"pushSent":true}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.formattedBody, "Mon plus beau voyage")
    }

    func test_postThumbnailURLString_isNilWhenAbsentOrEmpty() throws {
        let json = """
        {
            "id": "n", "userId": "u", "type": "post_like", "content": "x",
            "actor": {"id":"s1","username":"w"},
            "context": {"postId":"p"},
            "metadata": {"action":"view_post","postId":"p","emoji":"❤️","postThumbnailUrl":""},
            "state": {"isRead":false,"readAt":null,"createdAt":"2026-06-25T10:30:00.000Z","expiresAt":null},
            "delivery": {"emailSent":false,"pushSent":true}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertNil(notification.postThumbnailURLString)
    }

    func testNotificationMetadataDecodesWithoutLoginFields() throws {
        let json = """
        {"messagePreview":"Hello!","action":"view_message"}
        """.data(using: .utf8)!

        let metadata = try JSONDecoder().decode(NotificationMetadata.self, from: json)
        XCTAssertEqual(metadata.messagePreview, "Hello!")
        XCTAssertNil(metadata.deviceName)
        XCTAssertNil(metadata.ipAddress)
        XCTAssertNil(metadata.location)
    }

    func testLoginNewDeviceNotificationFormattedTitle() throws {
        let json = """
        {
            "id": "notif-login",
            "userId": "user1",
            "type": "login_new_device",
            "content": "",
            "metadata": {
                "action": "view_details",
                "deviceName": "Apple iPhone",
                "deviceOS": "iOS 17.5",
                "ipAddress": "82.123.45.67",
                "location": "Paris, France"
            },
            "state": {"isRead":false,"createdAt":"2026-04-09T10:00:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.notificationType, .loginNewDevice)
        XCTAssertTrue(notification.formattedTitle.contains("Apple iPhone"))
        XCTAssertNotNil(notification.formattedBody)
        XCTAssertTrue(notification.formattedBody?.contains("Paris, France") ?? false)
        XCTAssertTrue(notification.formattedBody?.contains("82.123.45.67") ?? false)
    }

    func testLoginNewDeviceNotificationFallbackTitle() throws {
        let json = """
        {
            "id": "notif-login2",
            "userId": "user1",
            "type": "login_new_device",
            "content": "",
            "metadata": {"action": "view_details"},
            "state": {"isRead":false,"createdAt":"2026-04-09T10:00:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertTrue(notification.formattedTitle.contains("appareil inconnu"))
        XCTAssertNil(notification.formattedBody)
    }

    // MARK: - NotificationPagination

    func testNotificationPaginationDecoding() throws {
        let json = """
        {"total":42,"offset":10,"limit":20,"hasMore":true}
        """.data(using: .utf8)!

        let pagination = try JSONDecoder().decode(NotificationPagination.self, from: json)
        XCTAssertEqual(pagination.total, 42)
        XCTAssertEqual(pagination.offset, 10)
        XCTAssertEqual(pagination.limit, 20)
        XCTAssertTrue(pagination.hasMore)
    }

    // MARK: - New story/comment reaction notification types

    func test_notificationType_commentReaction_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "comment_reaction"), .commentReaction)
        XCTAssertEqual(MeeshyNotificationType.commentReaction.rawValue, "comment_reaction")
        XCTAssertEqual(MeeshyNotificationType.commentReaction.systemIcon, "heart.fill")
        XCTAssertEqual(MeeshyNotificationType.commentReaction.accentHex, "FF6B6B")
    }

    func test_notificationType_storyNewComment_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "story_new_comment"), .storyNewComment)
        XCTAssertEqual(MeeshyNotificationType.storyNewComment.rawValue, "story_new_comment")
        XCTAssertEqual(MeeshyNotificationType.storyNewComment.systemIcon, "text.bubble.fill")
        XCTAssertEqual(MeeshyNotificationType.storyNewComment.accentHex, "3498DB")
    }

    func test_notificationType_friendStoryComment_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_story_comment"), .friendStoryComment)
        XCTAssertEqual(MeeshyNotificationType.friendStoryComment.rawValue, "friend_story_comment")
        XCTAssertEqual(MeeshyNotificationType.friendStoryComment.systemIcon, "text.bubble.fill")
        XCTAssertEqual(MeeshyNotificationType.friendStoryComment.accentHex, "3498DB")
    }

    func test_notificationType_storyThreadReply_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "story_thread_reply"), .storyThreadReply)
        XCTAssertEqual(MeeshyNotificationType.storyThreadReply.rawValue, "story_thread_reply")
        XCTAssertEqual(MeeshyNotificationType.storyThreadReply.systemIcon, "text.bubble.fill")
        XCTAssertEqual(MeeshyNotificationType.storyThreadReply.accentHex, "3498DB")
    }

    // MARK: - Phase 4F friend content notification types

    func test_notificationType_friendNewStory_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_new_story"), .friendNewStory)
        XCTAssertEqual(MeeshyNotificationType.friendNewStory.rawValue, "friend_new_story")
        XCTAssertEqual(MeeshyNotificationType.friendNewStory.systemIcon, "camera.fill")
        XCTAssertEqual(MeeshyNotificationType.friendNewStory.accentHex, "6366F1")
    }

    func test_notificationType_friendNewPost_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_new_post"), .friendNewPost)
        XCTAssertEqual(MeeshyNotificationType.friendNewPost.rawValue, "friend_new_post")
        XCTAssertEqual(MeeshyNotificationType.friendNewPost.systemIcon, "square.text.square.fill")
        XCTAssertEqual(MeeshyNotificationType.friendNewPost.accentHex, "6366F1")
    }

    func test_notificationType_friendNewMood_decodesCorrectly() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_new_mood"), .friendNewMood)
        XCTAssertEqual(MeeshyNotificationType.friendNewMood.rawValue, "friend_new_mood")
        XCTAssertEqual(MeeshyNotificationType.friendNewMood.systemIcon, "face.smiling.fill")
        XCTAssertEqual(MeeshyNotificationType.friendNewMood.accentHex, "6366F1")
    }

    // MARK: - Rich context: body, entity context & lifecycle

    private func decodeNotification(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: json.data(using: .utf8)!)
    }

    func test_postComment_formattedBody_isCommentText() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"post_comment","content":"Trop belle cette photo !",
         "actor":{"id":"a","username":"marie","displayName":"Marie"},
         "context":{"postId":"p1"},
         "metadata":{"commentPreview":"Trop belle cette photo !","postType":"STORY","postPreview":"Coucher de soleil"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "Trop belle cette photo !")
        XCTAssertEqual(n.formattedContext, "Story · « Coucher de soleil »")
    }

    func test_commentReply_formattedContext_referencesParentComment() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"comment_reply","content":"Carrément d'accord",
         "actor":{"id":"a","username":"jo"},
         "context":{"postId":"p1"},
         "metadata":{"commentPreview":"Carrément d'accord","parentCommentPreview":"Le meilleur épisode"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "Carrément d'accord")
        XCTAssertEqual(n.formattedContext, "En réponse à « Le meilleur épisode »")
    }

    func test_reaction_formattedBody_showsReactedEntityPreview() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"story_reaction","content":"a réagi 😍 à votre story",
         "actor":{"id":"a","username":"lea"},
         "context":{"postId":"p1"},
         "metadata":{"emoji":"😍","postType":"STORY","postPreview":"Ma rando du dimanche"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "Ma rando du dimanche")
        XCTAssertEqual(n.formattedContext, "Story · « Ma rando du dimanche »")
    }

    func test_friendNewStory_REEL_kindLabelIsReel() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"friend_new_post","content":"Regarde ça",
         "actor":{"id":"a","username":"sam"},
         "context":{"postId":"p1"},
         "metadata":{"contentType":"REEL","excerpt":"Regarde ça"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "Regarde ça")
        XCTAssertEqual(n.socialKindLabel, "Réel")
    }

    func test_friendNewStory_mediaOnly_usesMediaSummary() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"friend_new_story","content":"a publié une nouvelle story",
         "actor":{"id":"a","username":"sam"},
         "context":{"postId":"p1"},
         "metadata":{"contentType":"STORY","mediaType":"image"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "📷 Photo")
        XCTAssertEqual(n.socialKindLabel, "Story")
    }

    func test_expiredStory_context_marksExpiredAndShowsPublication() throws {
        // Story published well in the past with an expiry already elapsed.
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"friend_new_story","content":"a publié une nouvelle story",
         "actor":{"id":"a","username":"sam"},
         "context":{"postId":"p1","postCreatedAt":"2020-01-01T10:00:00.000Z","postExpiresAt":"2020-01-02T10:00:00.000Z"},
         "metadata":{"contentType":"STORY","mediaType":"image"},
         "state":{"isRead":false,"createdAt":"2020-01-01T10:00:00.000Z"}}
        """)
        XCTAssertTrue(n.isLinkedContentExpired)
        let context = try XCTUnwrap(n.formattedContext)
        XCTAssertTrue(context.contains("Story"))
        XCTAssertTrue(context.contains("expirée"), "expired story must be flagged: \(context)")
    }

    func test_storyComment_onExpiredStory_contextFlagsExpiry() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"story_new_comment","content":"Magnifique",
         "actor":{"id":"a","username":"ines"},
         "context":{"postId":"p1","postExpiresAt":"2020-01-02T10:00:00.000Z"},
         "metadata":{"commentPreview":"Magnifique","postType":"STORY"},
         "state":{"isRead":false,"createdAt":"2020-01-01T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedBody, "Magnifique")
        let context = try XCTUnwrap(n.formattedContext)
        XCTAssertTrue(context.contains("expirée"), "expired story comment must flag expiry: \(context)")
    }

    func test_nonExpiredStory_context_doesNotFlagExpiry() throws {
        let future = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"story_reaction","content":"a réagi",
         "actor":{"id":"a","username":"ines"},
         "context":{"postId":"p1","postExpiresAt":"\(future)"},
         "metadata":{"emoji":"👍","postType":"STORY","postPreview":"Soleil"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertFalse(n.isLinkedContentExpired)
        XCTAssertEqual(n.formattedContext, "Story · « Soleil »")
    }

    // MARK: - Server-built title/subtitle (single source) + content date

    func test_formattedTitle_prefersServerTitle() throws {
        // Le titre serveur (localisé, conscient de l'entité) prime sur le repli client.
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"comment_reply","title":"Belva Tano a répondu à votre commentaire",
         "content":"Mon premier combat",
         "actor":{"id":"a","username":"belva","displayName":"Belva Tano"},
         "context":{"postId":"p1"},
         "metadata":{"commentPreview":"Mon premier combat","postType":"STORY"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedTitle, "Belva Tano a répondu à votre commentaire")
    }

    func test_formattedTitle_fallsBackWhenNoServerTitle() throws {
        // Anciennes notifs sans `title` serveur → repli client (commentReply corrigé).
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"comment_reply","content":"ok",
         "actor":{"id":"a","username":"jo","displayName":"Jo"},
         "context":{"postId":"p1"},
         "metadata":{"commentPreview":"ok"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedTitle, "Jo a repondu a votre commentaire")
    }

    func test_formattedContext_prefersServerSubtitle() throws {
        // Le sous-titre serveur (entité localisée) devient la base de la ligne contexte.
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"comment_reply","title":"Belva a répondu à votre commentaire",
         "subtitle":"Story","content":"ok",
         "actor":{"id":"a","username":"belva"},
         "context":{"postId":"p1"},
         "metadata":{"commentPreview":"ok","postType":"STORY"},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.formattedContext, "Story")
    }

    func test_formattedContext_appendsContentPublishedDate() throws {
        // Complaint #3 : « a commenté une story du JJ/MM/AAAA HH:MM » — la date de
        // publication du contenu (postCreatedAt, ancienne) est ajoutée au sous-titre.
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"friend_story_comment","title":"Belva a commenté une story",
         "subtitle":"Story","content":"Magnifique",
         "actor":{"id":"a","username":"belva"},
         "context":{"postId":"p1","postCreatedAt":"2020-01-01T09:00:00.000Z"},
         "metadata":{"commentPreview":"Magnifique","postType":"STORY"},
         "state":{"isRead":false,"createdAt":"2020-01-02T10:00:00.000Z"}}
        """)
        let context = try XCTUnwrap(n.formattedContext)
        XCTAssertTrue(context.hasPrefix("Story · "), "entity base then date: \(context)")
        XCTAssertTrue(context.contains("2020"), "absolute content date expected: \(context)")
    }

    func test_message_attachmentDetails_decoded() throws {
        let n = try decodeNotification("""
        {"id":"n","userId":"u","type":"new_message","content":"🎵 Audio · 0:34",
         "actor":{"id":"a","username":"tom"},
         "context":{"conversationId":"c1","messageId":"m1"},
         "metadata":{"messagePreview":"🎵 Audio","attachments":{"count":1,"firstType":"audio","firstFilename":"vocal.m4a","firstDurationMs":34000,"firstFileSize":1200000}},
         "state":{"isRead":false,"createdAt":"2026-06-23T10:00:00.000Z"}}
        """)
        XCTAssertEqual(n.metadata?.attachments?.firstType, "audio")
        XCTAssertEqual(n.metadata?.attachments?.firstDurationMs, 34000)
        XCTAssertEqual(n.metadata?.attachments?.firstFileSize, 1200000)
        XCTAssertEqual(n.formattedBody, "🎵 Audio · 0:34")
    }
}
