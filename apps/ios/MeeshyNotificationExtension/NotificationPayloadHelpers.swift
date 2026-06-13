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
        userInfo: [AnyHashable: Any]
    ) -> String? {
        // Only repair when the post-`updating(from: intent)` subtitle was wiped.
        // Trimming whitespace catches the "single space" workaround that
        // some integrations use to force iOS to keep a subtitle slot.
        guard currentSubtitle.trimmingCharacters(in: .whitespaces).isEmpty else {
            return nil
        }

        // 1. Whatever the gateway sent in the alert wins — it already encodes
        //    the right context for the notification type (group name, story /
        //    post / mood context, parent comment…).
        let trimmedOriginal = originalSubtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedOriginal.isEmpty {
            return trimmedOriginal
        }

        // 2. Legacy fallback: rebuild the group/global conversation name from
        //    userInfo for pushes whose alert subtitle never made it through
        //    (e.g. E2EE payloads where only `data` survives).
        let conversationType = (userInfo["conversationType"] as? String) ?? ""
        let isGroupOrGlobal = !conversationType.isEmpty && conversationType != "direct"
        guard isGroupOrGlobal else { return nil }

        let title = (userInfo["conversationTitle"] as? String) ?? ""
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return trimmed
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
}
