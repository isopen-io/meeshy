import XCTest
@testable import MeeshySDK

/// **Un accusé 2xx dont la charge n'est pas une table de chaînes ne se lit plus
/// comme un échec** (#15996).
///
/// Chaque charge ci-dessous a été RELEVÉE sur le staging le 2026-11-04
/// (`gate.staging.meeshy.me`, compte de recette), telle que la passerelle la
/// sert. Elle passe par `MockAPIClient.stubWire`, donc par le décodeur
/// d'`APIClient`, dans le type que le SERVICE demande : un service qui décode
/// en `[String: String]` ou `[String: Bool]` jette sur la vraie charge, et
/// l'appelant lit une erreur sur un geste que le serveur a écrit.
final class WriteAcknowledgementWireTests: XCTestCase {

    private enum Wire {
        static let storyLike = #"{"success":true,"data":{"liked":true,"reactionSummary":{"🔥":1}}}"#
        static let statusLike = #"{"success":true,"data":{"liked":true,"reactionSummary":{"❤️":1}}}"#
        static let storyRepost = #"{"success":true,"data":{"id":"6aeb00fe31240d07248a0d69","authorId":"6ada27bf28983c39d9838be9","type":"POST","visibility":"PUBLIC","content":null,"originalLanguage":null,"detectedLanguage":null,"translations":null,"metadata":null,"geoPoint":null,"geoPrecision":null,"communityId":null,"repostOfId":"6aea9043674bc60d1d3ff682","originalRepostOfId":"6aea9043674bc60d1d3ff682","isQuote":false,"storyEffects":null,"allowSoundExtraction":false,"commentsDisabled":false,"moodEmoji":null,"audioUrl":null,"audioDuration":null,"expiresAt":null,"reactionSummary":null,"reactionCount":0,"likeCount":0,"commentCount":0,"repostCount":0,"viewCount":0,"impressionCount":0,"bookmarkCount":0,"shareCount":0,"postOpenCount":0,"anonymousViewCount":0,"anonymousImpressionCount":0,"uniqueViewCount":0,"anonymousUniqueViewCount":0,"openCountByOrigin":null,"viewCountByProvenance":null,"listingViewCountByOrigin":null,"qualifiedViewCount":0,"playCount":0,"downloadCount":0,"isPinned":false,"isEdited":false,"contentEditedAt":null,"deletedAt":null,"createdAt":"2026-11-04T09:55:10.287Z","updatedAt":"2026-11-04T09:55:10.287Z","author":{"id":"6ada27bf28983c39d9838be9","username":"recmod_m","displayName":"Recette Moderation","avatar":null,"profileDecor":{"avatarRing":{"pack":"cadres-illustres","item":"toile-araignee","origin":"builtin","contract":null}}},"media":[{"id":"6aeb00fe31240d07248a0d6a","fileName":"snapshot_52477fab-7d36-4738-aa05-c336b9d146ca.mp4","originalName":"snapshot_52477fab-7d36-4738-aa05-c336b9d146ca.mp4","mimeType":"video/mp4","fileSize":43320160,"fileUrl":"snapshots/snapshot_52477fab-7d36-4738-aa05-c336b9d146ca.mp4","width":1080,"height":2220,"thumbnailUrl":"snapshots/snapshot_730605d8-0448-4d71-90ab-c9a84cc08b8b.jpg","thumbHash":"lzcOGwRngDiIeXZ4h5BMBik=","imageVariants":null,"avifVariants":null,"renditions":null,"processingState":null,"lensSlug":null,"duration":60449,"order":0,"caption":null,"alt":null,"captionLanguage":null,"captionTranslations":null,"altLanguage":null,"altTranslations":null,"language":null,"variantOf":null,"transcription":null,"translations":null}],"comments":[],"repostOf":{"id":"6aea9043674bc60d1d3ff682","type":"STORY","content":null,"originalLanguage":"en","translations":null,"storyEffects":null,"audioUrl":null,"moodEmoji":null,"originalRepostOfId":null,"author":{"id":"6ada27bf28983c39d9838be9","username":"recmod_m","displayName":"Recette Moderation","avatar":null,"profileDecor":{"avatarRing":{"pack":"cadres-illustres","item":"toile-araignee","origin":"builtin","contract":null}}},"media":[{"id":"6aea9043674bc60d1d3ff67b","fileName":"demo-call_ed72ed46-429b-4e87-bdbf-6e2cfaa54b43.mp4","originalName":"demo-call.mp4","mimeType":"video/mp4","fileSize":43320160,"fileUrl":"2026/11/6ada27bf28983c39d9838be9/demo-call_ed72ed46-429b-4e87-bdbf-6e2cfaa54b43.mp4","width":1080,"height":2220,"thumbnailUrl":"2026/11/6ada27bf28983c39d9838be9/demo-call_ed72ed46-429b-4e87-bdbf-6e2cfaa54b43_thumb.jpg","thumbHash":"lzcOGwRngDiIeXZ4h5BMBik=","imageVariants":null,"avifVariants":null,"renditions":null,"processingState":"ready","lensSlug":null,"duration":60449,"order":0,"caption":null,"alt":null,"captionLanguage":null,"captionTranslations":null,"altLanguage":null,"altTranslations":null,"language":null,"variantOf":null,"transcription":null,"translations":null}],"createdAt":"2026-11-04T01:54:11.924Z","likeCount":1,"commentCount":0,"metadata":null,"viewCount":0,"repostCount":0,"shareCount":0,"bookmarkCount":0,"impressionCount":0,"mentions":[]},"mentions":[]}}"#
        static let translate = #"{"success":true,"data":{"requested":true,"targetLanguage":"en"}}"#
        static let participantRole = #"{"success":true,"data":{"message":"Rôle du participant mis à jour avec succès","userId":"6ae2d5ab554594eef6101397","participantId":"6ae47faf5d3b9f29502caf33","role":"moderator","participant":{"id":"6ae47faf5d3b9f29502caf33","participantId":"6ae47faf5d3b9f29502caf33","userId":"6ae2d5ab554594eef6101397","type":"user","username":"recette-beta","firstName":"Recette","lastName":"Beta","displayName":"Recette Beta","avatar":null,"role":"USER","conversationRole":"moderator","isOnline":false,"lastActiveAt":null,"systemLanguage":"fr","regionalLanguage":"en","customDestinationLanguage":"fr","isActive":true,"createdAt":"2026-10-29T05:12:11.336Z","updatedAt":"2026-10-31T19:33:01.098Z","joinedAt":"2026-10-30T11:29:51.638Z","isAnonymous":false,"permissions":{"canAccessAdmin":false,"canManageUsers":false,"canManageGroups":false,"canManageConversations":false,"canViewAnalytics":false,"canModerateContent":false,"canViewAuditLogs":false,"canManageNotifications":false,"canManageTranslations":false}}}}"#
        static let logout = #"{"success":true,"data":{"message":"Déconnexion réussie"}}"#
        static let trackingLinkToggle = #"{"success":true,"data":{"trackingLink":{"id":"6aeb08bc31240d07248a0d6e","token":"NOsQ8y","name":"recette 15996","campaign":null,"source":null,"medium":null,"originalUrl":"https://example.com/recette-15996","shortUrl":"/l/NOsQ8y","createdBy":"6ada27bf28983c39d9838be9","conversationId":null,"messageId":null,"totalClicks":0,"uniqueClicks":0,"isActive":false,"expiresAt":null,"lastClickedAt":null,"createdAt":"2026-11-04T10:28:12.328Z","updatedAt":"2026-11-04T10:28:12.838Z","fullUrl":"https://staging.meeshy.me/l/NOsQ8y"}},"message":"Lien mis à jour avec succès"}"#
        static let shareLinkToggle = #"{"success":true,"data":{"id":"6aeb08ee29e1dac99954a365","linkId":"mshy_qiEEn2oh","identifier":"mshy_recette-15996","conversationId":"6ae47faf5d3b9f29502caf31","name":"recette 15996","description":null,"createdBy":"6ada27bf28983c39d9838be9","isActive":false,"maxUses":null,"maxConcurrentUsers":null,"maxUniqueSessions":null,"expiresAt":null,"allowAnonymousMessages":true,"allowAnonymousFiles":false,"allowAnonymousImages":true,"allowViewHistory":false,"requireAccount":false,"requireNickname":true,"requireEmail":false,"requireBirthday":false,"allowedCountries":[],"allowedLanguages":[],"allowedIpRanges":[],"createdAt":"2026-11-04T10:29:02.425Z","updatedAt":"2026-11-04T10:29:08.374Z"},"message":"Lien mis à jour avec succès"}"#
        /// Formes du SCHÉMA de la passerelle, non relevées sur le staging : la
        /// première exige une 2FA active, les deux autres un visiteur anonyme
        /// entré par un lien (`participant-ban-core.ts`, `identifyTarget`).
        static let twoFactorDisable = #"{"success":true,"data":{"message":"Authentification à deux facteurs désactivée"}}"#
        static let guestBan = #"{"success":true,"data":{"participantId":"6ae47faf5d3b9f29502caf40","userId":null,"bannedAt":"2026-11-04T10:30:00.000Z","closedShareLinkId":null}}"#
        static let guestUnban = #"{"success":true,"data":{"participantId":"6ae47faf5d3b9f29502caf40","userId":null}}"#
    }

    private let postId = "6aea9043674bc60d1d3ff682"

    // MARK: - Story

    func test_reactingToAStory_acceptsTheServedLikeAcknowledgement() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/posts/\(postId)/like", json: Wire.storyLike)

        try await StoryService(api: mock).react(storyId: postId, emoji: "🔥")

        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_repostingAStory_acceptsTheServedRepost() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/posts/\(postId)/repost", json: Wire.storyRepost)

        try await StoryService(api: mock).repost(storyId: postId)

        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Statut

    func test_reactingToAStatus_acceptsTheServedLikeAcknowledgement() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/posts/6aeb00fc31240d07248a0d5e/like", json: Wire.statusLike)

        try await StatusService(api: mock).react(statusId: "6aeb00fc31240d07248a0d5e", emoji: "❤️")

        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Post

    func test_requestingATranslation_acceptsTheServedAcknowledgement() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/posts/6aeaf1db31240d07248a0d54/translate", json: Wire.translate)

        try await PostService(api: mock).requestTranslation(postId: "6aeaf1db31240d07248a0d54", targetLanguage: "en")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["targetLanguage"] as? String, "en")
    }

    // MARK: - Conversation

    func test_changingAParticipantRole_acceptsTheServedParticipant() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/conversations/6ae47faf5d3b9f29502caf31/participants/6ae2d5ab554594eef6101397/role", json: Wire.participantRole)

        try await ConversationService(api: mock).updateParticipantRole(
            conversationId: "6ae47faf5d3b9f29502caf31", userId: "6ae2d5ab554594eef6101397", role: "MODERATOR"
        )

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["role"] as? String, "moderator")
    }

    // MARK: - Session

    /// La boucle de rejeu de la déconnexion (`AuthManager`) lisait chaque
    /// réussite comme un échec et retentait sur une session déjà fermée.
    func test_loggingOut_acceptsTheServedMessage() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/auth/logout", json: Wire.logout)

        try await AuthService(api: mock).logoutThrowing()

        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Liens

    /// La passerelle sert le lien sous `trackingLink`, jamais à la racine de
    /// `data` : chaque bascule jetait `keyNotFound("id")`.
    func test_togglingATrackingLink_acceptsTheServedWrapper() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/tracking-links/NOsQ8y", json: Wire.trackingLinkToggle)

        try await TrackingLinkService(api: mock).setActive(token: "NOsQ8y", isActive: false)

        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    /// Le schéma de réponse retire `currentUses`, que `MyShareLink` exigeait :
    /// chaque activation ou désactivation d'un lien de partage échouait.
    func test_togglingAShareLink_acceptsTheServedLinkWithoutItsUsageCount() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/links/mshy_qiEEn2oh", json: Wire.shareLinkToggle)

        try await ShareLinkService(api: mock).toggleLink(linkId: "mshy_qiEEn2oh", isActive: false)

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["isActive"] as? Bool, false)
    }

    // MARK: - Sécurité du compte

    func test_disablingTwoFactor_acceptsTheServedMessage() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/auth/2fa/disable", json: Wire.twoFactorDisable)

        try await TwoFactorService(api: mock).disable(code: "123456", password: "x")

        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Bannissement d'un visiteur sans compte

    func test_banningAGuest_acceptsItsNullUserId() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/conversations/c1/participants/6ae47faf5d3b9f29502caf40/ban", json: Wire.guestBan)

        try await ConversationService(api: mock).banParticipant(conversationId: "c1", key: "6ae47faf5d3b9f29502caf40")

        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    func test_unbanningAGuest_acceptsItsNullUserId() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/conversations/c1/participants/6ae47faf5d3b9f29502caf40/unban", json: Wire.guestUnban)

        try await ConversationService(api: mock).unbanParticipant(conversationId: "c1", key: "6ae47faf5d3b9f29502caf40")

        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - Le témoin du défaut

    func test_theOldTables_rejectedTheseSameAcknowledgements() {
        let strings = [Wire.storyLike, Wire.statusLike, Wire.storyRepost, Wire.translate, Wire.participantRole]
        for json in strings {
            XCTAssertThrowsError(try JSONDecoder().decode(APIResponse<[String: String]>.self, from: Data(json.utf8)),
                                 "le témoin ne mesure plus rien : \(json.prefix(60))")
        }
        XCTAssertThrowsError(try JSONDecoder().decode(APIResponse<[String: Bool]>.self, from: Data(Wire.logout.utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(APIResponse<[String: Bool]>.self, from: Data(Wire.twoFactorDisable.utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(APIResponse<TrackingLink>.self, from: Data(Wire.trackingLinkToggle.utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(APIResponse<MyShareLink>.self, from: Data(Wire.shareLinkToggle.utf8)))
    }
}
