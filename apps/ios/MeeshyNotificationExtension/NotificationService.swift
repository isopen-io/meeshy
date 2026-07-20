@preconcurrency import UserNotifications
import Intents
// `import AppIntents` (volontairement non utilisé) émet la directive d'autolink
// AppIntents.framework. La phase auto-injectée « Extract App Intents Metadata »
// tourne sur toute cible app/extension ; sans cette dépendance Swift, son outil
// (appintentsmetadataprocessor) émet le warning « Metadata extraction skipped.
// No AppIntents.framework dependency found. ». L'import le fait passer en scan
// bénin (« no relevant symbols »). Cette NSE ne définit aucun App Intent.
import AppIntents
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

    // Timestamp recorded at the very start of didReceive so that each download
    // can cap its URLRequest timeout to what's left in the OS budget.
    private var extensionStartTime: Date = .distantPast

    // The OS grants the NSE ~30 s. We reserve 3 s at the end for INSendMessageIntent
    // construction + contentHandler invocation, giving downloads 27 s total.
    private static let nseBudget: TimeInterval = 27
    // Never start a download with less than 2 s left — it would almost certainly
    // time out mid-transfer and leave the extension hung right up to the OS kill.
    private static let minDownloadBudget: TimeInterval = 2

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        extensionStartTime = Date()
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
        prefetchSocialData(from: bestAttemptContent.userInfo)
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

        // Localize protected message placeholders.
        //
        // The gateway now sends icon-only bodies for protected messages
        // ("👁️ 🎵", "🔥 💬 5min", "🌫️ 🖼️", "🔒 🎬") that already convey
        // protection + content type without leaking content. Those bodies
        // are emoji and don't need locale-side localisation, so we MUST
        // NOT clobber them with NSLocalizedString here.
        //
        // The locKey override is still useful for ONE case : E2EE pushes
        // where decryption failed locally (key missing, sender device key
        // not paired, etc.). In that case the gateway has no way to know
        // it couldn't be decrypted client-side, so its iconified body
        // ("🔒 🎵") is fine — but historically the NSE swapped it for the
        // user's localised "Message chiffré" string, which is friendlier.
        // We keep that behaviour gated strictly to the E2EE-failure path :
        // any non-E2EE protected message (view-once / blurred / ephemeral)
        // keeps the iconified body from the gateway.
        let isEncryptedPush = userInfo["isEncrypted"] as? Bool == true
            || (userInfo["encryptedContent"] as? String).map { !$0.isEmpty } == true
        if isEncryptedPush, !didDecrypt,
           let locKey = userInfo["notificationLocKey"] as? String, !locKey.isEmpty {
            let localized = NSLocalizedString(locKey, comment: "")
            if localized != locKey {
                bestAttemptContent.body = localized
            }
        }

        // Bug B — audio-only E2EE messages reach the device with an empty
        // plaintext body (the gateway encrypts only the optional caption,
        // which is empty for a voice memo). Without a fallback the user
        // sees just the sender name with no hint that a voice message is
        // waiting. We apply this AFTER the decryption and locKey steps so
        // we only catch the truly-empty case, never a decrypted caption.
        if let fallback = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: bestAttemptContent.body,
            userInfo: userInfo
        ) {
            bestAttemptContent.body = fallback
        }

        // Prisme Linguistique (i18n serveur) : pour `message_reaction`, le gateway
        // envoie désormais le body DÉJÀ localisé dans la langue du destinataire
        // (« reacted ❤️ to your message » / « a réagi ❤️ à votre message » …, via
        // `notificationString(lang, 'reaction.message')`). Le NSE ne reconstruit
        // plus rien : il affiche le body tel quel. Le nom du réacteur est porté par
        // INSendMessageIntent (titre Communication Notification), l'avatar via
        // INPerson.image. Voir docs/superpowers/specs/2026-06-16-notification-system-i18n-design.md

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

        // Social feed — view + mark as read ; commentable types WITH a postId
        // additionally expose the inline « Commenter » text action (R3).
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
            category = NotificationPayloadHelpers.socialCategoryIdentifier(
                type: rawType,
                postId: content.userInfo["postId"] as? String
            )

        // Call events — split by state (G4d): ringing exposes answer/decline,
        // terminal states expose callback/view only (no « Answer » on an
        // already-ended call).
        case "missed_call",
             "incoming_call",
             "call_ended",
             "call_declined",
             "call_recording_ready":
            guard let callCategory = NotificationPayloadHelpers.callCategoryIdentifier(type: rawType) else {
                return
            }
            category = callCategory

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

    /// Social notification types whose deep link opens the post detail. For these
    /// we prefetch the post (+ inline comments) so a cold-start tap never lands on
    /// an empty screen while the network request is in flight.
    private static let socialPostTypes: Set<String> = [
        "post_like", "post_comment", "post_repost",
        "story_reaction", "status_reaction",
        "comment_like", "comment_reply", "comment_reaction",
        "story_new_comment", "story_thread_reply", "friend_story_comment",
        "friend_new_story", "friend_new_post", "friend_new_mood",
    ]

    /// Fire-and-forget prefetch of the post referenced by a SOCIAL notification.
    /// Mirrors `prefetchMessageData`: the post JSON is written to the App Group so
    /// the main app merges it into the feed cache on open / foreground resume.
    private func prefetchSocialData(from userInfo: [AnyHashable: Any]) {
        guard let type = userInfo["type"] as? String,
              Self.socialPostTypes.contains(type),
              let postId = userInfo["postId"] as? String,
              !postId.isEmpty else { return }

        NSEDataSync.syncPost(postId: postId) { _ in }
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
            // N1 — mirror of `DependencyContainer.dbConfig()`'s busy timeout:
            // the main app holds its own pool on this same file, and GRDB's
            // default `.immediateError` busy mode would turn a cross-process
            // write collision into an SQLITE_BUSY swallowed by the catch
            // below (pre-persisted bubble silently lost).
            var config = Configuration()
            config.busyMode = .timeout(5)
            let pool = try DatabasePool(path: path, configuration: config)
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

        // N4 — derive the media kind from the attachment mime so the
        // pre-persisted bubble renders as audio/image/video instead of an
        // empty text bubble until the canonical REST fetch overwrites it.
        let media = NotificationPayloadHelpers.mediaMessageTypes(
            forAttachmentMimeType: userInfo["attachmentMimeType"] as? String
        )

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
                messageType: media.messageType, messageSource: "user",
                contentType: media.contentType,
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
            // iOS renders `speakableGroupName` as the group line in the Communication
            // Notification subtitle (and IGNORES content.subtitle there). So we carry
            // the FULLY DECORATED name here — type glyph + favorite emoji + customName
            // ?? canonical title + (category) + mute/lock badges — via the same
            // Local-First composition used by `composedConversationSubtitle`.
            let localDetails = (userInfo["conversationId"] as? String)
                .flatMap { NSEDataSync.conversationDetails(forId: $0) }
            let decorated = NotificationPayloadHelpers.composedConversationSubtitle(
                conversationType: conversationType,
                conversationTitle: userInfo["conversationTitle"] as? String,
                customName: localDetails?.customName,
                favoriteEmoji: localDetails?.favoriteEmoji,
                categoryName: localDetails?.categoryName,
                isMuted: localDetails?.isMuted ?? false,
                isLocked: localDetails?.isLocked ?? false
            )
            let groupTitle = decorated
                ?? (userInfo["conversationTitle"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? content.title
            speakableGroupName = INSpeakableString(spokenPhrase: groupTitle)
        } else {
            speakableGroupName = nil
        }

        // iOS surfaces the group name (speakableGroupName) in the Communication
        // Notification subtitle ONLY when the intent is a GROUP conversation, which
        // requires ≥2 recipients. With recipients:nil iOS renders a 1:1 banner
        // (sender as title, no group subtitle) and IGNORES any manually-set
        // content.subtitle — confirmed empirically on iOS 26.3.1. We synthesize
        // neutral members keyed by conversationId purely to trigger group mode;
        // the displayed name comes from speakableGroupName, not these handles.
        let groupRecipients: [INPerson]? = isGroup ? [
            INPerson(personHandle: INPersonHandle(value: "\(conversationId)#m1", type: .unknown),
                     nameComponents: nil, displayName: "", image: nil,
                     contactIdentifier: nil, customIdentifier: "\(conversationId)#m1"),
            INPerson(personHandle: INPersonHandle(value: "\(conversationId)#m2", type: .unknown),
                     nameComponents: nil, displayName: "", image: nil,
                     contactIdentifier: nil, customIdentifier: "\(conversationId)#m2")
        ] : nil

        let intent = INSendMessageIntent(
            recipients: groupRecipients,
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

            // Bug A — `content.updating(from: intent)` wipes the APN-native
            // `subtitle` field. Pour une conversation de groupe, on RECOMPOSE le
            // subtitle CÔTÉ CLIENT (Local-First) : `<icône de type> <customName
            // ?? titre>`. Le gateway n'envoie que les identifiants bruts ; le
            // `customName` (renommage LOCAL) est résolu depuis le snapshot App
            // Group keyé par conversationId — préféré au titre canonique,
            // possiblement en avance sur le backend. Pour une notif sociale, le
            // helper restaure le subtitle explicite du gateway tel quel.
            let localDetails = (userInfo["conversationId"] as? String)
                .flatMap { NSEDataSync.conversationDetails(forId: $0) }
            if let restored = NotificationPayloadHelpers.preservedSubtitle(
                originalSubtitle: content.subtitle,
                currentSubtitle: updatedContent.subtitle,
                userInfo: userInfo,
                customName: localDetails?.customName,
                favoriteEmoji: localDetails?.favoriteEmoji,
                categoryName: localDetails?.categoryName,
                isMuted: localDetails?.isMuted ?? false,
                isLocked: localDetails?.isLocked ?? false
            ),
               let mutable = updatedContent.mutableCopy() as? UNMutableNotificationContent {
                mutable.subtitle = restored
                return mutable
            }

            return updatedContent
        } catch {
            return content
        }
    }

    // MARK: - Attachments

    /// Generic data download for any push payload URL (avatar or message media).
    /// Fire-and-forget — completion is invoked exactly once, with nil on any failure.
    ///
    /// The timeout is dynamically capped to the remaining OS budget so that a slow
    /// download never holds the notification hostage past the 30 s kill deadline.
    /// If the remaining budget is below `minDownloadBudget` the download is skipped
    /// immediately (completion(nil)) — better to deliver without rich content than
    /// to let the extension be killed mid-transfer with no content at all.
    private func downloadData(
        from url: URL,
        completion: @escaping (Data?) -> Void
    ) {
        let elapsed = Date().timeIntervalSince(extensionStartTime)
        let budgetRemaining = Self.nseBudget - elapsed
        guard budgetRemaining > Self.minDownloadBudget else {
            completion(nil)
            return
        }
        // Cap to 12 s max per download; reduce proportionally as budget shrinks.
        let timeout = min(12, budgetRemaining)
        nonisolated(unsafe) let completion = completion
        let request = URLRequest(url: url, timeoutInterval: timeout)
        let task = URLSession.shared.dataTask(with: request) { data, _, error in
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
