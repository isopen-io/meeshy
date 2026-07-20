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
}
