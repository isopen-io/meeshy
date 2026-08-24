import XCTest
@testable import Meeshy

/// Unit tests for the pure helpers used by the notification service extension
/// to repair fields iOS Communication Notifications drop / can't carry through
/// the E2EE push path.
///
/// These cover the two bugs identified empirically on iOS 18:
///   - Bug A: `try content.updating(from: INSendMessageIntent)` wipes the
///     APN-native `subtitle` (conversation name for groups / Meeshy Global).
///   - Bug B: An audio-only E2EE message arrives with an empty plaintext body
///     after decryption (gateway encrypts only the optional caption, which is
///     empty for a voice memo) and the rich push shows no audio context.
///
/// The helpers themselves live in `MeeshyNotificationExtension/NotificationPayloadHelpers.swift`
/// and are compiled into BOTH the NSE target and the `MeeshyTests` target via
/// `project.pbxproj` so we can exercise them without bringing the full
/// `UNNotificationServiceExtension` runtime into the test process.
final class NotificationPayloadHelpersTests: XCTestCase {

    // MARK: - Factories

    private func makeUserInfo(
        conversationType: String? = nil,
        conversationTitle: String? = nil,
        attachmentMimeType: String? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let conversationType { info["conversationType"] = conversationType }
        if let conversationTitle { info["conversationTitle"] = conversationTitle }
        if let attachmentMimeType { info["attachmentMimeType"] = attachmentMimeType }
        return info
    }

    // MARK: - Bug A — subtitle preservation

    func test_preservedSubtitle_groupWithEmptySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "👥 Mon groupe")
    }

    func test_preservedSubtitle_globalWithEmptySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "global",
            conversationTitle: "Meeshy Global"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "📢 Meeshy Global")
    }

    func test_preservedSubtitle_whitespaceOnlySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Equipe Dev"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "   ",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "👥 Equipe Dev")
    }

    func test_preservedSubtitle_directConversation_returnsNil() {
        // Direct messages never carry a subtitle — restoring one would invent
        // a "group name" where there is none.
        let userInfo = makeUserInfo(
            conversationType: "direct",
            conversationTitle: "Alice"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_subtitleAlreadySet_returnsNil() {
        // iOS sometimes preserves the subtitle (e.g. when no intent donation
        // happened) — we must not stomp it with a re-resolved value.
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "Mon groupe",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_missingConversationTitle_returnsNil() {
        let userInfo = makeUserInfo(conversationType: "group")

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_emptyConversationTitle_returnsNil() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: ""
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_missingConversationType_returnsNil() {
        let userInfo = makeUserInfo(conversationTitle: "Mon groupe")

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    // MARK: - Bug A bis — original (gateway) subtitle restoration

    func test_preservedSubtitle_originalSocialSubtitle_isRestoredVerbatim() {
        // Les notifications sociales (story / post / mood / réponse à un
        // commentaire) portent leur contexte dans le subtitle APN d'origine
        // ("Votre story", "En réponse à « … »"). `updating(from: intent)` le
        // détruit — il doit être restauré tel quel, sans dépendre de
        // conversationTitle (absent pour les pushes sociaux).
        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "Votre story",
            currentSubtitle: "",
            userInfo: makeUserInfo()
        )

        XCTAssertEqual(result, "Votre story")
    }

    func test_preservedSubtitle_groupConversation_composesConversationSubtitle() {
        // Une notif DE CONVERSATION (conversationType présent) est recomposée
        // côté client : icône + titre. Le subtitle d'origine n'est pertinent que
        // pour les notifs SOCIALES (sans conversationType).
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "titre brut ignoré",
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "👥 Mon groupe")
    }

    func test_preservedSubtitle_groupConversation_prefersLocalCustomName() {
        // Local-First : le renommage LOCAL de l'utilisateur (résolu App Group)
        // est préféré au titre canonique fourni par le gateway.
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "",
            currentSubtitle: "",
            userInfo: userInfo,
            customName: "Ma team 💪"
        )

        XCTAssertEqual(result, "👥 Ma team 💪")
    }

    func test_preservedSubtitle_originalSubtitlePreservedByiOS_returnsNil() {
        // iOS a gardé le subtitle — ne pas le réécrire.
        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "Votre story",
            currentSubtitle: "Votre story",
            userInfo: makeUserInfo()
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_whitespaceOriginalSubtitle_fallsBackToConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Equipe Dev"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            originalSubtitle: "  ",
            currentSubtitle: "",
            userInfo: userInfo
        )

        // Le chemin fallback préfixe l'icône de type (cohérence avec le gateway).
        XCTAssertEqual(result, "👥 Equipe Dev")
    }

    // MARK: - Icône de type de conversation

    func test_conversationTypeIcon_distinguishesGroupTypes() {
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon("group"), "👥")
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon("public"), "🌐")
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon("global"), "📢")
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon("broadcast"), "📢")
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon("direct"), "")
        XCTAssertEqual(NotificationPayloadHelpers.conversationTypeIcon(""), "")
    }

    func test_conversationTypeIcon_neverLock() {
        // Le cadenas évoque le chiffrement — jamais utilisé pour le type.
        for type in ["group", "public", "global", "broadcast"] {
            XCTAssertNotEqual(NotificationPayloadHelpers.conversationTypeIcon(type), "🔒")
        }
    }

    func test_composedSubtitle_usesCustomNameWhenPresent() {
        // Renommage local de l'utilisateur prioritaire sur le titre canonique.
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Équipe Dev",
            customName: "Ma team 💪"
        )
        XCTAssertEqual(result, "👥 Ma team 💪")
    }

    func test_composedSubtitle_fallsBackToCanonicalTitle_whenNoCustomName() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "public",
            conversationTitle: "Annonces",
            customName: nil
        )
        XCTAssertEqual(result, "🌐 Annonces")
    }

    func test_composedSubtitle_blankCustomName_fallsBackToCanonical() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "global",
            conversationTitle: "Meeshy Global",
            customName: "   "
        )
        XCTAssertEqual(result, "📢 Meeshy Global")
    }

    func test_composedSubtitle_directOrEmpty_returnsNil() {
        XCTAssertNil(NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "direct", conversationTitle: "Alice", customName: nil))
        XCTAssertNil(NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group", conversationTitle: nil, customName: nil))
    }

    // MARK: - Format complet (favori + type + nom + (catégorie) + mute/lock)

    func test_composedSubtitle_fullFormat_matchesUserExample() {
        // 😴 👥 Cours de mathématique classe CME1 (cours élémentaire) 🔒
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Cours de mathématique classe CME1",
            customName: nil,
            favoriteEmoji: "😴",
            categoryName: "cours élémentaire",
            isMuted: false,
            isLocked: true
        )
        XCTAssertEqual(result, "😴 👥 Cours de mathématique classe CME1 (cours élémentaire) 🔒")
    }

    func test_composedSubtitle_favoriteFirst_thenTypeIcon() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "public",
            conversationTitle: "Annonces",
            customName: nil,
            favoriteEmoji: "⭐️"
        )
        XCTAssertEqual(result, "⭐️ 🌐 Annonces")
    }

    func test_composedSubtitle_mutedBadge_afterTitle() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Famille",
            customName: nil,
            isMuted: true
        )
        XCTAssertEqual(result, "👥 Famille 🔇")
    }

    func test_composedSubtitle_muteAndLock_bothAfterTitle() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Projet",
            customName: nil,
            isMuted: true,
            isLocked: true
        )
        XCTAssertEqual(result, "👥 Projet 🔇 🔒")
    }

    func test_composedSubtitle_noCategory_noParentheses() {
        // categoryName nil (catégorie induite/prédéfinie ou aucune) → pas de ().
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Équipe",
            customName: nil,
            categoryName: nil
        )
        XCTAssertEqual(result, "👥 Équipe")
    }

    func test_composedSubtitle_customNamePreferred_withFavoriteAndCategory() {
        let result = NotificationPayloadHelpers.composedConversationSubtitle(
            conversationType: "group",
            conversationTitle: "Titre canonique",
            customName: "Mon renommage",
            favoriteEmoji: "🔥",
            categoryName: "Boulot"
        )
        XCTAssertEqual(result, "🔥 👥 Mon renommage (Boulot)")
    }

    // MARK: - Bug B — audio body fallback

    func test_audioBodyFallback_emptyBodyWithAudioMime_returnsLocalizedFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_whitespaceBodyWithAudioMime_returnsFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "audio/mp4")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "   \n",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_caseInsensitiveMime_returnsFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "AUDIO/M4A")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_bodyAlreadyFormatted_returnsNil() {
        // The non-E2EE path arrives with `"🎵 Audio · 0:34"` already formatted
        // by the gateway — never overwrite it.
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "🎵 Audio · 0:34",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_decryptedCaptionPresent_returnsNil() {
        // E2EE message with a non-empty caption (e.g. "Listen to this!") has
        // a meaningful body after decryption and must not be replaced.
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "Listen to this!",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_imageAttachment_returnsNil() {
        let userInfo = makeUserInfo(attachmentMimeType: "image/jpeg")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_noMimeType_returnsNil() {
        let userInfo = makeUserInfo()

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    // MARK: - mediaMessageTypes (N4 — typed pre-persisted bubble)

    func test_mediaMessageTypes_audioMime_returnsAudio() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: "audio/m4a"
        )
        XCTAssertEqual(result.messageType, "audio")
        XCTAssertEqual(result.contentType, "audio")
    }

    func test_mediaMessageTypes_videoMp4Mime_returnsVideo() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: "video/mp4"
        )
        XCTAssertEqual(result.messageType, "video")
        XCTAssertEqual(result.contentType, "video")
    }

    func test_mediaMessageTypes_imageMime_returnsImage() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: "image/jpeg"
        )
        XCTAssertEqual(result.messageType, "image")
        XCTAssertEqual(result.contentType, "image")
    }

    func test_mediaMessageTypes_uppercaseMime_isCaseInsensitive() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: "AUDIO/MP4"
        )
        XCTAssertEqual(result.messageType, "audio")
    }

    func test_mediaMessageTypes_nilMime_returnsText() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: nil
        )
        XCTAssertEqual(result.messageType, "text")
        XCTAssertEqual(result.contentType, "text")
    }

    func test_mediaMessageTypes_emptyMime_returnsText() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: ""
        )
        XCTAssertEqual(result.messageType, "text")
    }

    func test_mediaMessageTypes_unknownMime_returnsText() {
        let result = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: "application/pdf"
        )
        XCTAssertEqual(result.messageType, "text")
        XCTAssertEqual(result.contentType, "text")
    }

    // MARK: - socialCategoryIdentifier (R3 — inline comment action)

    func test_socialCategoryIdentifier_postCommentWithPostId_returnsCommentable() {
        XCTAssertEqual(
            NotificationPayloadHelpers.socialCategoryIdentifier(type: "post_comment", postId: "p1"),
            "MEESHY_SOCIAL_COMMENTABLE"
        )
    }

    func test_socialCategoryIdentifier_friendNewPostWithPostId_returnsCommentable() {
        XCTAssertEqual(
            NotificationPayloadHelpers.socialCategoryIdentifier(type: "friend_new_post", postId: "p1"),
            "MEESHY_SOCIAL_COMMENTABLE"
        )
    }

    func test_socialCategoryIdentifier_threadReplyTypesWithPostId_returnCommentable() {
        for type in ["comment_reply", "story_new_comment", "story_thread_reply", "friend_story_comment"] {
            XCTAssertEqual(
                NotificationPayloadHelpers.socialCategoryIdentifier(type: type, postId: "p1"),
                "MEESHY_SOCIAL_COMMENTABLE",
                "\(type) with a postId must expose the comment action"
            )
        }
    }

    func test_socialCategoryIdentifier_commentableTypeWithoutPostId_returnsSocial() {
        XCTAssertEqual(
            NotificationPayloadHelpers.socialCategoryIdentifier(type: "post_comment", postId: nil),
            "MEESHY_SOCIAL"
        )
        XCTAssertEqual(
            NotificationPayloadHelpers.socialCategoryIdentifier(type: "post_comment", postId: ""),
            "MEESHY_SOCIAL"
        )
    }

    func test_socialCategoryIdentifier_nonCommentableType_returnsSocial() {
        for type in ["post_like", "story_reaction", "comment_like", "friend_new_mood", "friend_new_story", "post_repost"] {
            XCTAssertEqual(
                NotificationPayloadHelpers.socialCategoryIdentifier(type: type, postId: "p1"),
                "MEESHY_SOCIAL",
                "\(type) has no commentable target — a Comment button would be misleading"
            )
        }
    }

    // MARK: - callCategoryIdentifier (G4d — no « Answer » on ended calls)

    func test_callCategoryIdentifier_incomingCall_returnsIncoming() {
        XCTAssertEqual(
            NotificationPayloadHelpers.callCategoryIdentifier(type: "incoming_call"),
            "MEESHY_CALL_INCOMING"
        )
    }

    func test_callCategoryIdentifier_terminalCallTypes_returnMissed() {
        for type in ["missed_call", "call_ended", "call_declined", "call_recording_ready"] {
            XCTAssertEqual(
                NotificationPayloadHelpers.callCategoryIdentifier(type: type),
                "MEESHY_CALL_MISSED",
                "\(type) is a terminal call state — it must NOT expose an Answer action"
            )
        }
    }

    func test_callCategoryIdentifier_nonCallType_returnsNil() {
        XCTAssertNil(NotificationPayloadHelpers.callCategoryIdentifier(type: "new_message"))
    }
}

// MARK: - Résolution des URLs média du payload push

/// Le gateway persiste l'avatar d'un utilisateur en chemin RELATIF
/// (`/api/v1/attachments/file/…`) et le recopie tel quel dans `imageURL`.
/// `URL(string:)` accepte cette chaîne mais produit une URL sans schéma ni
/// hôte : `URLSession` échoue, l'avatar n'arrive jamais, et la bannière
/// retombe sur l'icône de l'app au lieu de la photo de l'auteur.
final class NotificationPayloadMediaURLTests: XCTestCase {

    private let base = "https://gate.meeshy.me"

    func test_resolveRemoteMediaURL_relativePath_prependsTheAPIOrigin() {
        let url = NotificationPayloadHelpers.resolveRemoteMediaURL(
            "/api/v1/attachments/file/2026%2F07%2Favatar_9bf11cbf.webp",
            apiBaseURL: base
        )
        XCTAssertEqual(
            url?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/2026%2F07%2Favatar_9bf11cbf.webp"
        )
    }

    func test_resolveRemoteMediaURL_relativePathWithoutLeadingSlash_stillResolves() {
        let url = NotificationPayloadHelpers.resolveRemoteMediaURL("uploads/a.jpg", apiBaseURL: base)
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/uploads/a.jpg")
    }

    func test_resolveRemoteMediaURL_absoluteHTTPS_isReturnedVerbatim() {
        let raw = "https://static.meeshy.me/u/i/2026/02/avatar_1771743728433_lbsc9z.jpg"
        XCTAssertEqual(
            NotificationPayloadHelpers.resolveRemoteMediaURL(raw, apiBaseURL: base)?.absoluteString,
            raw
        )
    }

    func test_resolveRemoteMediaURL_percentEncodingIsPreserved() {
        // Le chemin encode déjà ses séparateurs (%2F) : les ré-encoder donnerait
        // un 404 sur un fichier dont le nom contiendrait « %252F ».
        let url = NotificationPayloadHelpers.resolveRemoteMediaURL("/f/a%2Fb.webp", apiBaseURL: base)
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/f/a%2Fb.webp")
    }

    func test_resolveRemoteMediaURL_baseWithTrailingSlash_doesNotDoubleTheSeparator() {
        let url = NotificationPayloadHelpers.resolveRemoteMediaURL("/a.jpg", apiBaseURL: "https://gate.meeshy.me/")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/a.jpg")
    }

    func test_resolveRemoteMediaURL_localhostBase_allowsPlainHTTP() {
        // Environnement de dev : la base allowlistée est http://localhost:3000.
        let url = NotificationPayloadHelpers.resolveRemoteMediaURL("/a.jpg", apiBaseURL: "http://localhost:3000")
        XCTAssertEqual(url?.absoluteString, "http://localhost:3000/a.jpg")
    }

    func test_resolveRemoteMediaURL_absolutePlainHTTP_isRejected() {
        // Une URL en clair venue du payload dégraderait le transport ; le NSE
        // ne la suit pas. Seul localhost (dev) est toléré.
        XCTAssertNil(NotificationPayloadHelpers.resolveRemoteMediaURL("http://evil.example/a.jpg", apiBaseURL: base))
    }

    func test_resolveRemoteMediaURL_nonHTTPSchemes_areRejected() {
        for raw in ["file:///etc/passwd", "data:image/png;base64,AAAA", "javascript:alert(1)", "ftp://x/a.jpg"] {
            XCTAssertNil(
                NotificationPayloadHelpers.resolveRemoteMediaURL(raw, apiBaseURL: base),
                "schéma refusé attendu pour \(raw)"
            )
        }
    }

    func test_resolveRemoteMediaURL_emptyOrBlank_returnsNil() {
        XCTAssertNil(NotificationPayloadHelpers.resolveRemoteMediaURL("", apiBaseURL: base))
        XCTAssertNil(NotificationPayloadHelpers.resolveRemoteMediaURL("   ", apiBaseURL: base))
    }
}

// MARK: - Cadrage de la Communication Notification

/// Une notification sociale (commentaire, nouveau post) n'appartient à aucune
/// conversation. Le chemin Communication la rendait donc en 1:1
/// (`recipients: nil`), et iOS ignore `content.subtitle` dans ce mode : la
/// bannière se réduisait à « <nom> » + le corps, sans jamais dire CE QUI
/// s'était passé. `communicationFraming` décide du cadrage : quand il y a
/// quelque chose à dire sous le nom, l'intent passe en mode groupe et l'action
/// devient le `speakableGroupName` — le seul champ qu'iOS rend à cet endroit.
final class NotificationCommunicationFramingTests: XCTestCase {

    private func framing(
        conversationId: String = "",
        conversationType: String = "",
        postId: String = "",
        notificationId: String = "n1",
        subtitle: String
    ) -> NotificationPayloadHelpers.CommunicationFraming {
        NotificationPayloadHelpers.communicationFraming(
            conversationId: conversationId,
            conversationType: conversationType,
            postId: postId,
            notificationId: notificationId,
            subtitle: subtitle
        )
    }

    func test_socialNotification_becomesGroupFramedOnTheAction() {
        let f = framing(postId: "p1", subtitle: "a commenté un réel · Publication de Windie Nh")
        XCTAssertTrue(f.usesGroupFraming)
        XCTAssertEqual(f.groupName, "a commenté un réel · Publication de Windie Nh")
        XCTAssertEqual(f.intentKey, "post:p1")
    }

    func test_socialNotificationWithoutSubtitle_staysOneToOne() {
        // Rien à dire sous le nom : le mode groupe n'apporterait qu'un cadre vide.
        let f = framing(postId: "p1", subtitle: "   ")
        XCTAssertFalse(f.usesGroupFraming)
        XCTAssertNil(f.groupName)
    }

    func test_groupConversation_keepsItsOwnGroupName_notTheSubtitle() {
        // Le nom d'une conversation de groupe est recomposé côté client
        // (Local-First, cf. composedConversationSubtitle) : le cadrage ne doit
        // PAS le remplacer par le subtitle du gateway.
        let f = framing(conversationId: "c1", conversationType: "group", subtitle: "Équipe Dev")
        XCTAssertTrue(f.usesGroupFraming)
        XCTAssertNil(f.groupName)
        XCTAssertEqual(f.intentKey, "c1")
    }

    func test_directConversation_staysOneToOne() {
        let f = framing(conversationId: "c1", conversationType: "direct", subtitle: "")
        XCTAssertFalse(f.usesGroupFraming)
        XCTAssertNil(f.groupName)
        XCTAssertEqual(f.intentKey, "c1")
    }

    func test_directConversationWithSubtitle_staysOneToOne() {
        // Un direct ne doit jamais basculer en groupe : iOS afficherait un
        // cadre de conversation collective pour un tête-à-tête.
        let f = framing(conversationId: "c1", conversationType: "direct", subtitle: "peu importe")
        XCTAssertFalse(f.usesGroupFraming)
    }

    func test_intentKey_fallsBackToNotificationId_whenNothingElseIdentifiesIt() {
        // Sans clé, TOUTES les notifications sociales partageaient la chaîne
        // vide comme identifiant d'intent.
        let f = framing(notificationId: "n42", subtitle: "vous a envoyé une demande")
        XCTAssertEqual(f.intentKey, "n42")
    }
}

// MARK: - Cycle 124 bis — le message PRÉ-ENREGISTRÉ au démarrage à froid

/// La bulle que la NSE écrit dans la base App Group avant que l'app ne démarre.
///
/// Le cycle 124 a posé `content` et `originalLanguage` sur le fil push, sous les
/// noms que `prePersistMessage` lisait déjà. Ces témoins gèlent les TROIS écarts
/// restants, mesurés par le diff du contrat dans les deux sens :
///
///  - `senderName` — lu par la NSE, JAMAIS émis (la passerelle envoie
///    `senderDisplayName`, que le cadrage Communication du même fichier lit
///    correctement depuis toujours) ;
///  - `createdAt` et `messageType` — ÉMIS pour cette extension (« GW5 —
///    persistance NSE ») et lus par personne : la bulle était ordonnée par
///    l'horloge du device.
final class PrePersistedMessageFieldsTests: XCTestCase {

    private let epoch = Date(timeIntervalSince1970: 1_700_000_000)

    private func fields(
        _ userInfo: [AnyHashable: Any]
    ) -> NotificationPayloadHelpers.PrePersistedMessageFields {
        NotificationPayloadHelpers.prePersistedMessageFields(
            userInfo: userInfo,
            fallbackNow: epoch
        )
    }

    // MARK: - Le corps et sa langue

    func test_prePersistedFields_readsContentAndLanguageFromTheWire() {
        let f = fields(["content": "Hola, ¿qué tal?", "originalLanguage": "es"])

        XCTAssertEqual(f.content, "Hola, ¿qué tal?")
        XCTAssertEqual(f.language, "es")
    }

    func test_prePersistedFields_noContent_writesNoBody() {
        // Mode privé, placeholder de protection, transcription : la passerelle
        // n'émet pas le couple. Une bulle sans texte vaut mieux qu'une bulle qui
        // MENT — la synchro REST peut ne jamais arriver.
        XCTAssertEqual(fields([:]).content, "")
    }

    func test_prePersistedFields_emptyLanguage_fallsBackWithoutClaimingFrench() {
        // La passerelle pose `''` quand elle n'a rien à dire. « en » est un faux
        // moins nuisible que « fr » pour le Prisme d'un lecteur non francophone.
        XCTAssertEqual(fields(["content": "Hello", "originalLanguage": ""]).language, "en")
    }

    // MARK: - L'horodatage

    func test_prePersistedFields_serverTimestamp_ordersTheBubble() {
        let f = fields(["createdAt": "2026-08-24T10:00:00.000Z"])

        XCTAssertEqual(f.createdAt, Date(timeIntervalSince1970: 1_787_565_600))
    }

    func test_prePersistedFields_timestampWithoutFraction_stillParses() {
        let f = fields(["createdAt": "2026-08-24T10:00:00Z"])

        XCTAssertEqual(f.createdAt, Date(timeIntervalSince1970: 1_787_565_600))
    }

    func test_prePersistedFields_unparsableTimestamp_fallsBackToDeviceClock() {
        XCTAssertEqual(fields(["createdAt": "pas une date"]).createdAt, epoch)
    }

    // MARK: - L'expéditeur

    func test_prePersistedFields_senderName_readsTheKeyTheGatewayActuallyEmits() {
        let f = fields(["senderDisplayName": "Alice Martin", "senderUsername": "alice"])

        XCTAssertEqual(f.senderName, "Alice Martin")
    }

    func test_prePersistedFields_senderName_fallsBackToUsername() {
        let f = fields(["senderDisplayName": "", "senderUsername": "alice"])

        XCTAssertEqual(f.senderName, "alice")
    }

    func test_prePersistedFields_senderName_absentWhenTheWireSaysNothing() {
        XCTAssertNil(fields([:]).senderName)
    }

    // MARK: - Le type du message

    func test_prePersistedTypes_attachmentMime_stillWins() {
        // N4 reste prioritaire : `Message.messageType` vaut `text` pour un vocal
        // légendé, et c'est le mime qui décide du rendu média.
        let types = NotificationPayloadHelpers.prePersistedMessageTypes(
            userInfo: ["attachmentMimeType": "audio/m4a", "messageType": "text"]
        )

        XCTAssertEqual(types.messageType, "audio")
    }

    func test_prePersistedTypes_wireTypeUsedWhenThereIsNoAttachment() {
        let types = NotificationPayloadHelpers.prePersistedMessageTypes(
            userInfo: ["messageType": "system"]
        )

        XCTAssertEqual(types.messageType, "system")
        XCTAssertEqual(types.contentType, "system")
    }

    func test_prePersistedTypes_noWireType_fallsBackToText() {
        XCTAssertEqual(
            NotificationPayloadHelpers.prePersistedMessageTypes(userInfo: [:]).messageType,
            "text"
        )
    }
}
