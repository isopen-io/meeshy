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

        let userInfo = bestAttemptContent.userInfo

        // E2EE decryption: if the push payload contains encrypted content,
        // attempt to decrypt it locally using the shared Keychain session key.
        // On success, replace the notification body with the decrypted plaintext.
        if let encryptedContent = userInfo["encryptedContent"] as? String,
           let senderId = userInfo["senderId"] as? String,
           !encryptedContent.isEmpty {
            if let decrypted = NSEDecryptor.decrypt(
                encryptedBase64: encryptedContent,
                senderUserId: senderId
            ) {
                bestAttemptContent.body = decrypted
            }
        }

        // Localize protected message placeholders. The gateway sends a
        // notificationLocKey (e.g. "notification.encrypted_message") and a
        // plain-English fallback body. If the loc-key is present and the body
        // was NOT already overridden by the E2EE decryptor above, resolve the
        // localized string from the NSE bundle's Localizable.xcstrings.
        if let locKey = userInfo["notificationLocKey"] as? String, !locKey.isEmpty {
            let localized = NSLocalizedString(locKey, comment: "")
            if localized != locKey {
                bestAttemptContent.body = localized
            }
        }

        let isCommunicationType = Self.communicationTypes.contains(
            userInfo["type"] as? String ?? ""
        )

        if let imageURLString = userInfo["imageURL"] as? String,
           let imageURL = URL(string: imageURLString) {
            downloadAvatarData(from: imageURL) { [weak self] avatarData in
                guard let self else {
                    contentHandler(bestAttemptContent)
                    return
                }

                if let avatarData {
                    let attachment = self.createAttachment(from: avatarData, fileExtension: imageURL.pathExtension)
                    if let attachment {
                        bestAttemptContent.attachments = [attachment]
                    }
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
            return
        }

        if isCommunicationType {
            let finalContent = applyCommunicationIntent(to: bestAttemptContent, avatarData: nil)
            contentHandler(finalContent)
        } else {
            contentHandler(bestAttemptContent)
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
             "message_reaction":
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
             "comment_like",
             "comment_reply":
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

        let apiBase = (userInfo["apiBaseURL"] as? String) ?? "https://gate.meeshy.me"

        NSEDataSync.syncMessage(
            conversationId: conversationId,
            messageId: messageId,
            apiBaseURL: apiBase
        ) { _ in }
    }

    // MARK: - GRDB Pre-persist

    /// Writes the incoming message directly to the App Group GRDB store so that
    /// when the user taps the notification banner the message is already available
    /// locally — no network round-trip required on cold launch.
    ///
    /// This is a best-effort, fire-and-forget operation. Any failure is silently
    /// swallowed; the main app will fetch the message from the REST API on resume.
    private func prePersistMessage(from userInfo: [AnyHashable: Any]) {
        guard let messageId = userInfo["messageId"] as? String,
              let conversationId = userInfo["conversationId"] as? String,
              let senderId = userInfo["senderId"] as? String
        else { return }

        let content = userInfo["content"] as? String ?? ""

        do {
            let dbPath = Self.appGroupDatabasePath()
            let pool = try DatabasePool(path: dbPath)
            try MessageDatabaseMigrations.runAll(on: pool)

            let now = Date()
            let record = MessageRecord(
                localId: messageId, serverId: messageId,
                conversationId: conversationId, senderId: senderId,
                content: content, originalLanguage: "fr",
                messageType: "text", messageSource: "user", contentType: "text",
                state: .sent, retryCount: 0, lastError: nil,
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
                createdAt: now, sentAt: nil, deliveredAt: nil, readAt: nil,
                updatedAt: now,
                attachmentsJson: nil, reactionsJson: nil, reactionCount: 0,
                currentUserReactionsJson: nil, mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil, layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )

            try pool.write { db in try record.save(db) }
        } catch {
            // Silent fail — the app will fetch the message from the API on launch.
        }
    }

    /// Returns the path to the shared App Group SQLite database.
    /// Mirrors `DependencyContainer.databasePath()` from the main app target.
    private static func appGroupDatabasePath() -> String {
        let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
        )!
        let dbDir = container.appendingPathComponent("Database")
        try? FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
        return dbDir.appendingPathComponent("meeshy_messages.sqlite").path
    }

    // MARK: - Communication Notifications

    /// Notification types that should use iOS Communication Notification style.
    private static let communicationTypes: Set<String> = [
        "new_message", "message_reply", "reply",
        "message_reaction", "mention", "user_mentioned"
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

    /// Downloads image data (raw bytes) for use as both attachment and INImage.
    private func downloadAvatarData(
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

    /// Creates a `UNNotificationAttachment` from raw image data.
    private func createAttachment(from data: Data, fileExtension: String) -> UNNotificationAttachment? {
        let tempDir = FileManager.default.temporaryDirectory
        let ext = fileExtension.isEmpty ? "jpg" : fileExtension
        let tempFile = tempDir.appendingPathComponent(UUID().uuidString + "." + ext)

        do {
            try data.write(to: tempFile)
            return try UNNotificationAttachment(
                identifier: UUID().uuidString,
                url: tempFile,
                options: nil
            )
        } catch {
            return nil
        }
    }
}
