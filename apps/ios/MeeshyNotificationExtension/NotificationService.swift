@preconcurrency import UserNotifications
import Intents
import GRDB
import MeeshySDK

/// Rich-push service extension.
///
/// Responsibilities:
/// - Download inline image attachments (sender avatars, media previews).
/// - Map the backend `type` to a `categoryIdentifier` so the OS exposes the right
///   quick actions on the banner / lock screen / notification center.
/// - Override the badge value so iOS keeps the displayed count in sync without a
///   foreground round-trip.
nonisolated class NotificationService: UNNotificationServiceExtension {

    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent

        guard let bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        applyCategory(to: bestAttemptContent)
        applyBadge(to: bestAttemptContent)
        applyThreading(to: bestAttemptContent)
        updateSharedUnreadCount(from: bestAttemptContent.userInfo)
        prefetchMessageData(from: bestAttemptContent.userInfo)
        prePersistMessage(from: bestAttemptContent.userInfo)
        postDeliveryReceipt(from: bestAttemptContent.userInfo)

        let userInfo = bestAttemptContent.userInfo

        // E2EE decryption: if the push payload contains encrypted content,
        // attempt to decrypt it locally using the shared Keychain session key.
        // On success, replace the notification body with the decrypted plaintext.
        var didDecrypt = false
        if let encryptedContent = userInfo["encryptedContent"] as? String,
           let senderId = userInfo["senderId"] as? String,
           !encryptedContent.isEmpty {
            if let decrypted = NSEDecryptor.decrypt(
                encryptedBase64: encryptedContent,
                senderUserId: senderId
            ) {
                bestAttemptContent.body = decrypted
                didDecrypt = true
            }
        }

        // Localize protected message placeholders. The gateway sends a
        // notificationLocKey (e.g. "notification.encrypted_message") AND a
        // plain placeholder body for EVERY E2EE message. Without the
        // `didDecrypt` guard the localized "Message chiffré" string would
        // unconditionally clobber the just-decrypted plaintext from the
        // E2EE block above, defeating the entire E2EE rich-push feature
        // for every user on a localized device. Only fall back to the
        // localized placeholder when decryption did NOT succeed (or was
        // not applicable because the push wasn't encrypted at all).
        if !didDecrypt,
           let locKey = userInfo["notificationLocKey"] as? String, !locKey.isEmpty {
            let localized = NSLocalizedString(locKey, comment: "")
            if localized != locKey {
                bestAttemptContent.body = localized
            }
        }

        // Phase B — for `message_reaction`, the gateway sends body = "❤️" (emoji alone).
        // Reformat it to "<sender> a réagi <emoji> à votre message" so the banner is
        // self-explanatory. Done BEFORE applyCommunicationIntent so INSendMessageIntent
        // sees the final body. The avatar of the reactor is still rendered via the
        // standard Communication Notifications path (INPerson.image from `imageURL`).
        if (userInfo["type"] as? String) == "message_reaction" {
            let emoji = (userInfo["reactionEmoji"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? bestAttemptContent.body
            let senderName = (userInfo["senderDisplayName"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? (userInfo["senderUsername"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? ""
            let template = NSLocalizedString(
                "notification.message_reaction.body",
                value: "%@ a réagi %@ à votre message",
                comment: "Push body for a message reaction: sender name + emoji"
            )
            bestAttemptContent.body = senderName.isEmpty
                ? String(format: NSLocalizedString(
                    "notification.message_reaction.body.no_sender",
                    value: "A réagi %@ à votre message",
                    comment: "Fallback when no sender name is available"
                ), emoji)
                : String(format: template, senderName, emoji)
        }

        let isCommunicationType = Self.communicationTypes.contains(
            userInfo["type"] as? String ?? ""
        )

        // Phase A — separate concerns:
        //   1. `imageURL`  → sender's avatar — ONLY fed to INPerson.image so the
        //      Communication Notification renders it on the left of the banner
        //      with the app icon as a badge bottom-right (WhatsApp/Telegram style).
        //      NEVER attached as UNNotificationAttachment — that slot is for
        //      message media, and feeding the avatar there made iOS render it as
        //      the message preview while the banner kept showing the default
        //      app icon on the left.
        //   2. `attachmentUrl` + `attachmentMimeType` → media of the message
        //      itself (audio/image/video). Downloaded and attached with a UTI
        //      typeHint so iOS picks the native inline renderer (audio waveform
        //      with play button, image preview, video thumbnail with tap-to-play).
        let group = DispatchGroup()
        var avatarData: Data?
        nonisolated(unsafe) var messageAttachment: UNNotificationAttachment?

        if let avatarURLString = userInfo["imageURL"] as? String,
           !avatarURLString.isEmpty,
           let avatarURL = URL(string: avatarURLString) {
            group.enter()
            downloadData(from: avatarURL) { data in
                avatarData = data
                group.leave()
            }
        }

        if let attachmentURLString = userInfo["attachmentUrl"] as? String,
           !attachmentURLString.isEmpty,
           let attachmentURL = URL(string: attachmentURLString) {
            let mime = userInfo["attachmentMimeType"] as? String ?? ""
            group.enter()
            downloadData(from: attachmentURL) { [weak self] data in
                defer { group.leave() }
                guard let self, let data else { return }
                messageAttachment = self.createMessageAttachment(
                    from: data,
                    originalURL: attachmentURL,
                    mimeType: mime
                )
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) { [weak self] in
            guard let self else {
                contentHandler(bestAttemptContent)
                return
            }
            if let messageAttachment {
                bestAttemptContent.attachments = [messageAttachment]
            }
            if isCommunicationType {
                let finalContent = self.applyCommunicationIntent(
                    to: bestAttemptContent,
                    avatarData: avatarData
                )
                contentHandler(finalContent)
            } else {
                contentHandler(bestAttemptContent)
            }
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    // MARK: - Enrichment

    /// Map the server-provided `type` to an iOS category so action buttons appear.
    ///
    /// Source of truth: `packages/shared/types/notification.ts` → `NotificationTypeEnum`.
    /// The gateway sends the enum's lowercase snake_case raw value as the `type` field.
    /// Keep this switch aligned with that file whenever new types are added.
    private func applyCategory(to content: UNMutableNotificationContent) {
        let rawType = content.userInfo["type"] as? String ?? ""
        let category: String

        switch rawType {
        // Messaging — quick reply + mark as read
        case "new_message",
             "message_reply",
             "reply",
             "message_forwarded",
             "message_reaction",
             // First-message notification for a freshly created conversation
             // (direct or group) — same actions as a new message: tap opens
             // the conversation, quick reply + mark-as-read are useful from
             // the lock screen. The gateway emits these from
             // `NotificationService.createConversationInviteNotification`.
             "new_conversation",
             "new_conversation_direct",
             "new_conversation_group",
             "added_to_conversation":
            category = "MEESHY_MESSAGE"

        // Mentions — view + reply + mark as read
        case "mention", "user_mentioned":
            category = "MEESHY_MENTION"

        // Social graph — accept / decline
        case "friend_request", "contact_request":
            category = "MEESHY_FRIEND_REQUEST"

        // Social feed — view + mark as read
        case "post_like",
             "post_comment",
             "post_repost",
             "story_reaction",
             "status_reaction",
             "comment_like",
             "comment_reply",
             "comment_reaction",
             // Story comment fan-out (Phase 1) — author / thread / friends
             "story_new_comment",
             "story_thread_reply",
             "friend_story_comment",
             // Friend content fan-out (Phase 4F)
             "friend_new_story",
             "friend_new_post",
             "friend_new_mood":
            category = "MEESHY_SOCIAL"

        // Call events — callback / answer / decline actions
        case "missed_call",
             "incoming_call",
             "call_ended",
             "call_declined",
             "call_recording_ready":
            category = "MEESHY_CALL"

        default:
            // Unknown / new server-side type: stay quiet and show the default
            // system banner with no actions. Do NOT fall back to MESSAGE — the
            // reply action would be misleading for e.g. a security alert.
            return
        }

        content.categoryIdentifier = category
    }

    /// Respect the per-push badge override so the lock screen shows an accurate count.
    private func applyBadge(to content: UNMutableNotificationContent) {
        guard let rawBadge = content.userInfo["badge"] else { return }
        if let intBadge = rawBadge as? Int {
            content.badge = NSNumber(value: max(intBadge, 0))
        } else if let strBadge = rawBadge as? String, let parsed = Int(strBadge) {
            content.badge = NSNumber(value: max(parsed, 0))
        }
    }

    /// Group notifications by conversation so iOS stacks them in the notification
    /// center like Messages.app does.
    private func applyThreading(to content: UNMutableNotificationContent) {
        if let conversationId = content.userInfo["conversationId"] as? String, !conversationId.isEmpty {
            content.threadIdentifier = "conversation:\(conversationId)"
        } else if let postId = content.userInfo["postId"] as? String, !postId.isEmpty {
            content.threadIdentifier = "post:\(postId)"
        }
    }

    /// Mirror the unread count into the App Group so widgets can refresh from the
    /// extension context (no main app launch required).
    private func updateSharedUnreadCount(from userInfo: [AnyHashable: Any]) {
        guard let defaults = UserDefaults(suiteName: "group.me.meeshy.apps") else { return }
        if let count = userInfo["unreadCount"] as? Int {
            defaults.set(max(count, 0), forKey: "unread_count")
        } else if let strCount = userInfo["unreadCount"] as? String, let parsed = Int(strCount) {
            defaults.set(max(parsed, 0), forKey: "unread_count")
        }
    }

    // MARK: - Message Prefetch

    /// Fire-and-forget prefetch of the message data from the REST API.
    /// The result is written to the App Group container so the main app
    /// can merge it into the GRDB cache on foreground resume, giving the
    /// user instant access to the message without a network round-trip.
    private func prefetchMessageData(from userInfo: [AnyHashable: Any]) {
        guard let conversationId = userInfo["conversationId"] as? String,
              let messageId = userInfo["messageId"] as? String,
              !conversationId.isEmpty, !messageId.isEmpty else { return }

        // Audit 2026-05-11: NSEDataSync now resolves the API base URL
        // internally from a strict allowlist + App Group UserDefaults.
        // We deliberately stop reading `userInfo["apiBaseURL"]` — that
        // path was an SSRF / JWT exfiltration vector for any attacker
        // who could deliver a push payload.
        NSEDataSync.syncMessage(
            conversationId: conversationId,
            messageId: messageId
        ) { _ in }
    }

    // MARK: - GRDB Pre-persist

    /// Writes the incoming message directly to the App Group GRDB store so that
    /// when the user taps the notification banner the message is already available
    /// locally — no network round-trip required on cold launch.
    ///
    /// This is a best-effort, fire-and-forget operation. Any failure is silently
    /// swallowed; the main app will fetch the message from the REST API on resume.
    private static let sharedPool: DatabasePool? = {
        guard let path = appGroupDatabasePath() else { return nil }
        do {
            let pool = try DatabasePool(path: path)
            try MessageDatabaseMigrations.runAll(on: pool)
            return pool
        } catch { return nil }
    }()

    private func prePersistMessage(from userInfo: [AnyHashable: Any]) {
        guard let messageId = userInfo["messageId"] as? String,
              let conversationId = userInfo["conversationId"] as? String,
              let senderId = userInfo["senderId"] as? String,
              let pool = Self.sharedPool
        else { return }

        // Audit 2026-05-11: For E2EE messages we deliberately skip the
        // pre-persist path. The push payload's plaintext `content` field
        // is just the placeholder ("Encrypted message"), and writing
        // `isEncrypted: false` would let attacker-controlled push content
        // render in the bubble until NSEDataSync.syncMessage's API
        // response overwrites it. NSEDataSync already fetches the
        // canonical record from the gateway and writes it via the
        // pending-messages path — that's the trustworthy source.
        let isEncryptedPush = (userInfo["encryptedContent"] as? String).map { !$0.isEmpty } ?? false
        if isEncryptedPush { return }

        let content = userInfo["content"] as? String ?? ""

        do {
            let now = Date()
            let record = MessageRecord(
                localId: messageId, serverId: messageId,
                conversationId: conversationId, senderId: senderId,
                // Don't hardcode "fr" — read from push payload if present, else
                // default to "en" (the safer fake for an unknown language than
                // the previous "fr" which guaranteed wrong Prisme Linguistique
                // resolution for non-French speakers). The NSEDataSync API
                // fetch will overwrite with the canonical value seconds later.
                content: content,
                originalLanguage: (userInfo["originalLanguage"] as? String) ?? "en",
                messageType: "text", messageSource: "user", contentType: "text",
                // Incoming messages are .delivered (received by us), not
                // .sent (which means "sent BY us and acked by server").
                // The previous .sent value broke any GRDB query that
                // partitions by sender ownership.
                state: .delivered, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: nil, storyReplyToId: nil,
                forwardedFromId: nil, forwardedFromConversationId: nil,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: userInfo["senderName"] as? String,
                senderUsername: nil, senderColor: nil, senderAvatarURL: nil,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: now, sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: now,
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )

            try pool.write { db in try record.save(db) }
        } catch {
            // Silent fail — the app will fetch the message from the API on launch.
        }
    }

    /// Returns the path to the shared App Group SQLite database, or nil if
    /// the App Group entitlement is not available (misconfigured signing,
    /// stripped entitlement on Ad Hoc builds, etc.). Audit 2026-05-11
    /// removed the prior `containerURL!` force-unwrap which crashed the
    /// extension via EXC_BREAKPOINT on the very first push when the
    /// entitlement was absent — invisible to users, hard to diagnose
    /// without a sysdiagnose.
    private static func appGroupDatabasePath() -> String? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
        ) else { return nil }
        let dbDir = container.appendingPathComponent("Database")
        try? FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
        return dbDir.appendingPathComponent("meeshy_messages.sqlite").path
    }

    // MARK: - Delivery Receipt

    /// Push types that mean "a new message was delivered to this recipient".
    /// Reactions and social events also carry a `messageId`, but they do not
    /// constitute message delivery, so they are excluded.
    private static let deliveryReceiptTypes: Set<String> = [
        "new_message", "message_reply", "reply", "message_forwarded",
        "new_conversation", "new_conversation_direct", "new_conversation_group",
        "added_to_conversation"
    ]

    /// Acknowledge delivery of a push-delivered message to the gateway.
    ///
    /// For an OFFLINE recipient the gateway's online auto-delivery path never
    /// fires (the extension holds no socket), so the author would stay stuck
    /// on a single checkmark until the recipient opens the app. Posting a
    /// receipt here lets the gateway mark the message delivered and broadcast
    /// `read-status:updated`, upgrading the author's checkmark ✓ → ✓✓.
    ///
    /// Fire-and-forget via a background `URLSession` — it survives the
    /// extension being torn down and never delays the banner. The gateway
    /// still enforces the recipient's `showReadReceipts` preference.
    private func postDeliveryReceipt(from userInfo: [AnyHashable: Any]) {
        guard let messageId = userInfo["messageId"] as? String,
              let conversationId = userInfo["conversationId"] as? String,
              !messageId.isEmpty, !conversationId.isEmpty else { return }

        let type = userInfo["type"] as? String ?? ""
        guard Self.deliveryReceiptTypes.contains(type) else { return }

        NSEDataSync.postDeliveryReceipt(
            conversationId: conversationId,
            messageId: messageId
        )
    }

    // MARK: - Communication Notifications

    /// Notification types that should use iOS Communication Notification style.
    /// Phase C — call notifications (APN non-VoIP path) are also routed through
    /// INSendMessageIntent so the banner shows the caller's avatar on the left
    /// with the app badge bottom-right. The VoIP `incoming_call` push is NOT
    /// in this set — it goes through PushKit (PKPushRegistry) and uses CallKit's
    /// own UI, so the notification extension never sees it.
    /// Phase D+E — social events (likes, comments, reposts, story reactions)
    /// and friend requests all carry the actor's avatar in `imageURL`, so the
    /// Communication path renders them with the same WhatsApp/Telegram style.
    private static let communicationTypes: Set<String> = [
        "new_message", "message_reply", "reply", "message_forwarded",
        "new_conversation", "new_conversation_direct", "new_conversation_group", "added_to_conversation",
        "message_reaction", "mention", "user_mentioned",
        "missed_call", "call_ended", "call_declined", "call_recording_ready",
        "post_like", "post_comment", "post_repost", "story_reaction", "status_reaction",
        "comment_like", "comment_reply", "comment_reaction",
        "story_new_comment", "story_thread_reply", "friend_story_comment",
        "friend_new_story", "friend_new_post", "friend_new_mood",
        "friend_request", "contact_request"
    ]

    /// Creates an `INSendMessageIntent` and returns updated notification content
    /// that iOS renders with circular avatar + sender name + group name.
    private func applyCommunicationIntent(
        to content: UNMutableNotificationContent,
        avatarData: Data?
    ) -> UNNotificationContent {
        let userInfo = content.userInfo

        let senderName = (userInfo["senderDisplayName"] as? String)
            .flatMap { $0.isEmpty ? nil : $0 }
            ?? (userInfo["senderUsername"] as? String)
            .flatMap { $0.isEmpty ? nil : $0 }
            ?? "Meeshy"

        let senderId = (userInfo["senderId"] as? String) ?? UUID().uuidString
        let conversationId = (userInfo["conversationId"] as? String) ?? ""

        let senderImage: INImage? = avatarData.flatMap { INImage(imageData: $0) }

        let senderHandle = INPersonHandle(value: senderId, type: .unknown)
        let sender = INPerson(
            personHandle: senderHandle,
            nameComponents: nil,
            displayName: senderName,
            image: senderImage,
            contactIdentifier: nil,
            customIdentifier: senderId
        )

        let conversationType = userInfo["conversationType"] as? String ?? ""
        let isGroup = !conversationType.isEmpty && conversationType != "direct"

        let speakableGroupName: INSpeakableString?
        if isGroup {
            let groupTitle = (userInfo["conversationTitle"] as? String)
                .flatMap { $0.isEmpty ? nil : $0 }
                ?? content.title
            speakableGroupName = INSpeakableString(spokenPhrase: groupTitle)
        } else {
            speakableGroupName = nil
        }

        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .unknown,
            content: content.body,
            speakableGroupName: speakableGroupName,
            conversationIdentifier: conversationId,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )

        if isGroup, let senderImage {
            intent.setImage(senderImage, forParameterNamed: \INSendMessageIntent.speakableGroupName)
        }

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = INInteractionDirection.incoming
        interaction.donate { _ in }

        do {
            let updatedContent = try content.updating(from: intent)
            return updatedContent
        } catch {
            return content
        }
    }

    // MARK: - Attachments

    /// Generic data download for any push payload URL (avatar or message media).
    /// Fire-and-forget — completion is invoked exactly once, with nil on any failure.
    private func downloadData(
        from url: URL,
        completion: @escaping (Data?) -> Void
    ) {
        nonisolated(unsafe) let completion = completion
        let task = URLSession.shared.dataTask(with: url) { data, _, error in
            guard let data, error == nil else {
                completion(nil)
                return
            }
            completion(data)
        }
        task.resume()
    }

    /// Creates a UNNotificationAttachment from raw bytes for a message media.
    /// Picks the right file extension + UTI typeHint so iOS renders the attachment
    /// in its native style (image preview, audio waveform with play button, video
    /// thumbnail with tap-to-play).
    private func createMessageAttachment(
        from data: Data,
        originalURL: URL,
        mimeType: String
    ) -> UNNotificationAttachment? {
        let (ext, typeHint) = Self.fileHints(
            mimeType: mimeType,
            fallbackPathExtension: originalURL.pathExtension
        )
        let tempFile = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + "." + ext)
        do {
            try data.write(to: tempFile)
            var options: [String: Any] = [:]
            if let typeHint {
                options[UNNotificationAttachmentOptionsTypeHintKey] = typeHint
            }
            return try UNNotificationAttachment(
                identifier: UUID().uuidString,
                url: tempFile,
                options: options.isEmpty ? nil : options
            )
        } catch {
            return nil
        }
    }

    /// Maps a payload mime type (or a URL path extension fallback) to a UTI typeHint
    /// and a sensible file extension. Returns ("m4a", "public.audio") for unknown
    /// audio etc. so iOS still treats the attachment as a media of the right family.
    private static func fileHints(
        mimeType: String,
        fallbackPathExtension: String
    ) -> (ext: String, typeHint: String?) {
        let normalized = mimeType.lowercased()
        if normalized.hasPrefix("image/") {
            if normalized.contains("png") { return ("png", "public.png") }
            if normalized.contains("gif") { return ("gif", "com.compuserve.gif") }
            if normalized.contains("webp") { return ("webp", "org.webmproject.webp") }
            if normalized.contains("heic") { return ("heic", "public.heic") }
            return ("jpg", "public.jpeg")
        }
        if normalized.hasPrefix("audio/") {
            if normalized.contains("m4a") || normalized.contains("mp4a") || normalized.contains("aac") {
                return ("m4a", "com.apple.m4a-audio")
            }
            if normalized.contains("mp3") || normalized.contains("mpeg") {
                return ("mp3", "public.mp3")
            }
            if normalized.contains("wav") {
                return ("wav", "com.microsoft.waveform-audio")
            }
            if normalized.contains("ogg") {
                return ("ogg", "public.audio")
            }
            return ("m4a", "public.audio")
        }
        if normalized.hasPrefix("video/") {
            if normalized.contains("quicktime") || normalized.contains("mov") {
                return ("mov", "com.apple.quicktime-movie")
            }
            return ("mp4", "public.mpeg-4")
        }
        let ext = fallbackPathExtension.isEmpty ? "bin" : fallbackPathExtension
        return (ext, nil)
    }
}
