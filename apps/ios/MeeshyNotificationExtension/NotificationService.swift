import UserNotifications

/// Rich-push service extension.
///
/// Responsibilities:
/// - Download inline image attachments (sender avatars, media previews).
/// - Map the backend `type` to a `categoryIdentifier` so the OS exposes the right
///   quick actions on the banner / lock screen / notification center.
/// - Override the badge value so iOS keeps the displayed count in sync without a
///   foreground round-trip.
class NotificationService: UNNotificationServiceExtension {

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

        if let imageURLString = bestAttemptContent.userInfo["imageURL"] as? String,
           let imageURL = URL(string: imageURLString) {
            downloadAttachment(from: imageURL) { attachment in
                if let attachment {
                    bestAttemptContent.attachments = [attachment]
                }
                contentHandler(bestAttemptContent)
            }
            return
        }

        contentHandler(bestAttemptContent)
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    // MARK: - Enrichment

    /// Map the server-provided `type` to an iOS category so action buttons appear.
    private func applyCategory(to content: UNMutableNotificationContent) {
        let rawType = content.userInfo["type"] as? String ?? ""
        let category: String

        switch rawType {
        case "new_message", "newMessage", "message_reply", "reply", "message_forwarded":
            category = "MEESHY_MESSAGE"
        case "mention", "user_mentioned":
            category = "MEESHY_MENTION"
        case "friend_request", "contact_request":
            category = "MEESHY_FRIEND_REQUEST"
        case "post_comment", "post_like", "post_repost", "story_reaction", "comment_like":
            category = "MEESHY_SOCIAL"
        default:
            category = "MEESHY_MESSAGE"
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
        guard let defaults = UserDefaults(suiteName: "group.me.meeshy.app") else { return }
        if let count = userInfo["unreadCount"] as? Int {
            defaults.set(max(count, 0), forKey: "unread_count")
        } else if let strCount = userInfo["unreadCount"] as? String, let parsed = Int(strCount) {
            defaults.set(max(parsed, 0), forKey: "unread_count")
        }
    }

    // MARK: - Attachments

    private func downloadAttachment(
        from url: URL,
        completion: @escaping (UNNotificationAttachment?) -> Void
    ) {
        let task = URLSession.shared.downloadTask(with: url) { localURL, _, error in
            guard let localURL, error == nil else {
                completion(nil)
                return
            }

            let tempDir = FileManager.default.temporaryDirectory
            let fileExtension = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let tempFile = tempDir.appendingPathComponent(UUID().uuidString + "." + fileExtension)

            do {
                try FileManager.default.moveItem(at: localURL, to: tempFile)
                let attachment = try UNNotificationAttachment(
                    identifier: UUID().uuidString,
                    url: tempFile,
                    options: nil
                )
                completion(attachment)
            } catch {
                completion(nil)
            }
        }
        task.resume()
    }
}
