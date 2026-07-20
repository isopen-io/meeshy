import Foundation

/// Pure, side-effect-free helpers used by `NotificationService` (the rich-push
/// `UNNotificationServiceExtension`) to repair fields that iOS Communication
/// Notifications (`INSendMessageIntent` donation + `content.updating(from:)`)
/// either silently drop or that the gateway cannot deliver through the
/// encrypted (E2EE) push path.
///
/// Living in a separate file with no `UserNotifications` / `Intents`
/// dependencies makes the policy unit-testable from the main `MeeshyTests`
/// target without dragging the whole notification extension runtime.
///
/// Source of the bugs these helpers patch:
///  - APN subtitle (conversation name for groups / Meeshy Global) is wiped by
///    `try content.updating(from: intent)` — confirmed empirically in iOS 18
///    and aligned with the long-standing `feedback_ios_communication_intent_overwrites_title`
///    pattern (same issue, the title was already worked around server-side
///    via `subtitle`, now we have to preserve `subtitle` after donation).
///  - Audio-only E2EE messages reach the device with an empty plaintext body
///    (the gateway only encrypts the optional caption, which is empty for a
///    voice memo), so after decryption the rich push has no audio context at
///    all even though `attachmentMimeType` is `audio/*`.
nonisolated enum NotificationPayloadHelpers {

    /// Returns the subtitle that should be re-applied to the notification
    /// content AFTER `try content.updating(from: intent)`, since that call
    /// strips the APN-native `subtitle` field on iOS Communication Notifications.
    ///
    /// - Parameters:
    ///   - originalSubtitle: subtitle of the ORIGINAL (pre-`updating`) content,
    ///     i.e. whatever the gateway actually sent in the APN alert. Covers the
    ///     social context subtitles ("Votre story", "En réponse à « … »",
    ///     "Nouvelle humeur"…) as well as group conversation names.
    ///   - currentSubtitle: subtitle currently set on the (post-`updating`)
    ///     content. Pass `bestAttemptContent.subtitle` (which is `""` when iOS
    ///     dropped it).
    ///   - userInfo: the original `request.content.userInfo` carrying the
    ///     server-provided `conversationTitle` + `conversationType`, used as a
    ///     legacy fallback when the alert subtitle itself was empty.
    /// - Returns: the subtitle to write back, or `nil` to leave the content
    ///   unchanged. We only restore when the post-`updating` subtitle is empty
    ///   (so we never clobber a subtitle iOS actually preserved).
    nonisolated static func preservedSubtitle(
        originalSubtitle: String,
        currentSubtitle: String,
        userInfo: [AnyHashable: Any],
        customName: String? = nil,
        favoriteEmoji: String? = nil,
        categoryName: String? = nil,
        isMuted: Bool = false,
        isLocked: Bool = false
    ) -> String? {
        // Only repair when the post-`updating(from: intent)` subtitle was wiped.
        // Trimming whitespace catches the "single space" workaround that
        // some integrations use to force iOS to keep a subtitle slot.
        guard currentSubtitle.trimmingCharacters(in: .whitespaces).isEmpty else {
            return nil
        }

        // 1. Notification DE CONVERSATION (group/public/global/broadcast) : la
        //    présentation est résolue CÔTÉ CLIENT (Local-First). On compose
        //    `<icône de type> <customName ?? titre canonique>` — le gateway
        //    n'envoie que les identifiants bruts (type + titre), le client
        //    préfère le renommage LOCAL (`customName`) résolu depuis l'App
        //    Group, et déduit l'icône du type. Indépendant de la valeur du
        //    subtitle d'origine (qui n'est que le titre brut).
        let conversationType = (userInfo["conversationType"] as? String) ?? ""
        if !conversationType.trimmingCharacters(in: .whitespaces).isEmpty,
           conversationType.lowercased() != "direct" {
            return composedConversationSubtitle(
                conversationType: conversationType,
                conversationTitle: userInfo["conversationTitle"] as? String,
                customName: customName,
                favoriteEmoji: favoriteEmoji,
                categoryName: categoryName,
                isMuted: isMuted,
                isLocked: isLocked
            )
        }

        // 2. Notification SOCIALE (réponse story/post, mood…) : le subtitle
        //    d'origine est une string explicite du gateway (« Votre story »,
        //    « En réponse à … ») — on la restaure telle quelle.
        let trimmedOriginal = originalSubtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedOriginal.isEmpty ? nil : trimmedOriginal
    }

    /// Icône préfixant le nom d'une conversation de groupe dans une notification,
    /// pour distinguer son type d'un coup d'œil :
    ///   - groupe privé   (group)             → 👥  (communauté de personnes)
    ///   - groupe public  (public)            → 🌐  (ouvert à tous)
    ///   - général/broadcast (global, broadcast) → 📢
    ///   - direct / inconnu                   → ""  (pas d'icône)
    ///
    /// Miroir exact du helper TS `conversationTypeIcon` côté gateway
    /// (services/gateway/.../NotificationService.ts) — garder les deux en
    /// lockstep. Le cadenas 🔒 est délibérément évité (évoque le chiffrement) ;
    /// il sera réservé à un futur état « conversation verrouillée ».
    nonisolated static func conversationTypeIcon(_ conversationType: String) -> String {
        switch conversationType.trimmingCharacters(in: .whitespaces).lowercased() {
        case "group":  return "👥"
        case "public": return "🌐"
        case "global", "broadcast": return "📢"
        default: return ""
        }
    }

    /// Compose le subtitle final d'une notification de conversation de groupe,
    /// dans l'ordre demandé :
    ///
    ///   `<emoji favori> <icône de type> <nom> (<catégorie>) <mute> <lock>`
    ///
    /// Exemple : `😴 👥 Cours de mathématique classe CME1 (cours élémentaire) 🔒`
    ///
    /// - `nom` = renommage LOCAL (`customName`) s'il existe, sinon titre canonique.
    /// - `favoriteEmoji` = emoji favori associé à la conversation (en TÊTE).
    /// - `categoryName` = nom d'une catégorie CRÉÉE PAR L'UTILISATEUR uniquement
    ///   (les catégories induites/prédéfinies passent `nil` → pas de parenthèses).
    /// - `🔇`/`🔒` = badges mute / verrou, APRÈS le titre (et la catégorie).
    ///
    /// Retourne `nil` pour une conversation directe ou sans nom. PUR et testable.
    nonisolated static func composedConversationSubtitle(
        conversationType: String,
        conversationTitle: String?,
        customName: String?,
        favoriteEmoji: String? = nil,
        categoryName: String? = nil,
        isMuted: Bool = false,
        isLocked: Bool = false
    ) -> String? {
        let type = conversationType.trimmingCharacters(in: .whitespaces).lowercased()
        guard !type.isEmpty, type != "direct" else { return nil }

        let custom = customName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let canonical = conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = (custom?.isEmpty == false ? custom : canonical) ?? ""
        guard !name.isEmpty else { return nil }

        var parts: [String] = []
        // 1. Emoji favori, en premier.
        if let fav = favoriteEmoji?.trimmingCharacters(in: .whitespaces), !fav.isEmpty {
            parts.append(fav)
        }
        // 2. Icône de type de groupe.
        let icon = conversationTypeIcon(type)
        if !icon.isEmpty { parts.append(icon) }
        // 3. Nom + (catégorie utilisateur) accolée.
        let cat = categoryName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let cat, !cat.isEmpty {
            parts.append("\(name) (\(cat))")
        } else {
            parts.append(name)
        }
        // 4. Badges après le titre : mute puis lock.
        if isMuted { parts.append("🔇") }
        if isLocked { parts.append("🔒") }

        return parts.joined(separator: " ")
    }

    /// Returns a body fallback for an audio-only push when the current body
    /// arrived empty (typical for E2EE: the gateway encrypted an empty caption
    /// since the message is a voice memo) and the payload carries an audio
    /// mime type. Returns `nil` when the existing body is already meaningful
    /// (the gateway's pre-formatted `"🎵 Audio · 0:34"` for non-E2EE messages)
    /// or when the attachment isn't audio.
    ///
    /// The fallback is intentionally short — iOS Communication Notifications
    /// truncate aggressively on the lock screen.
    nonisolated static func audioBodyFallback(
        currentBody: String,
        userInfo: [AnyHashable: Any]
    ) -> String? {
        let trimmedBody = currentBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedBody.isEmpty else { return nil }

        let mime = (userInfo["attachmentMimeType"] as? String) ?? ""
        guard mime.lowercased().hasPrefix("audio/") else { return nil }

        return NSLocalizedString(
            "notification.audio_voice_message.body",
            value: "🎵 Message vocal",
            comment: "Push body fallback for an audio-only message when the gateway body is empty (E2EE caption)."
        )
    }

    /// N4 — maps the push payload's `attachmentMimeType` to the
    /// `messageType` / `contentType` pair stored on the pre-persisted
    /// `MessageRecord`, so the bubble written by the NSE renders as the right
    /// media kind BEFORE the canonical REST payload overwrites it (previously
    /// hardcoded to `"text"`, showing an empty text bubble for a voice memo).
    ///
    /// Values mirror `MeeshyMessage.MessageType` raw values (`text`, `image`,
    /// `audio`, `video`). Unknown / absent mime → `text`, matching the
    /// gateway's default for caption-only messages.
    nonisolated static func mediaMessageTypes(
        forAttachmentMimeType mimeType: String?
    ) -> (messageType: String, contentType: String) {
        let normalized = mimeType?
            .trimmingCharacters(in: .whitespaces)
            .lowercased() ?? ""
        if normalized.hasPrefix("audio/") { return ("audio", "audio") }
        if normalized.hasPrefix("video/") { return ("video", "video") }
        if normalized.hasPrefix("image/") { return ("image", "image") }
        return ("text", "text")
    }

    /// R3 — social push types whose banner exposes the inline « Commenter »
    /// text action. A type is commentable when the produced comment has an
    /// unambiguous target:
    ///  - comment / thread notifications (`post_comment`, `comment_reply`,
    ///    `story_new_comment`, `story_thread_reply`, `friend_story_comment`)
    ///    → threaded reply to THE notified comment ;
    ///  - `friend_new_post` → root comment on the new post.
    /// Reactions / likes / moods / new stories stay on plain `MEESHY_SOCIAL`
    /// (a Comment button there would be misleading).
    nonisolated static let commentableSocialTypes: Set<String> = [
        "post_comment",
        "comment_reply",
        "story_new_comment",
        "story_thread_reply",
        "friend_story_comment",
        "friend_new_post"
    ]

    /// Category for a social push: `MEESHY_SOCIAL_COMMENTABLE` when the type
    /// is commentable AND the payload carries a `postId` (the comment
    /// endpoint's target), plain `MEESHY_SOCIAL` otherwise. Identifiers are a
    /// cross-layer contract — the gateway (`category` push field) and
    /// `AppDelegate.registerNotificationCategories` use the SAME strings.
    nonisolated static func socialCategoryIdentifier(
        type: String,
        postId: String?
    ) -> String {
        guard commentableSocialTypes.contains(type),
              let postId,
              !postId.trimmingCharacters(in: .whitespaces).isEmpty else {
            return "MEESHY_SOCIAL"
        }
        return "MEESHY_SOCIAL_COMMENTABLE"
    }

    /// G4d — call categories are SPLIT by call state so a terminated call
    /// never shows an « Answer » button:
    ///  - `incoming_call` (regular-APNs ringing path — China devices, VoIP
    ///    fallback) → `MEESHY_CALL_INCOMING` [answer, decline] ;
    ///  - terminal states (`missed_call`, `call_ended`, `call_declined`,
    ///    `call_recording_ready`) → `MEESHY_CALL_MISSED` [callback, view].
    /// Returns `nil` for non-call types. Identifiers are a cross-layer
    /// contract shared with the gateway `category` push field and
    /// `AppDelegate.registerNotificationCategories`.
    nonisolated static func callCategoryIdentifier(type: String) -> String? {
        switch type {
        case "incoming_call":
            return "MEESHY_CALL_INCOMING"
        case "missed_call", "call_ended", "call_declined", "call_recording_ready":
            return "MEESHY_CALL_MISSED"
        default:
            return nil
        }
    }
}
