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
class NotificationService: UNNotificationServiceExtension {

    private var delivery: NSEDelivery<UNNotificationContent>?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var enrichment: Task<Void, Never>?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        let budget = NSEBudget(start: Date())
        let delivery = NSEDelivery(handler: contentHandler)
        self.delivery = delivery
        // #10507 — « reçue » : déposée dans la boîte du groupe d'app, sans réseau.
        if let received = SocialNotificationEvents.event(.received, userInfo: request.content.userInfo) {
            SocialNotificationInbox.shared.append(received)
        }
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            delivery.deliver(request.content)
            return
        }
        bestAttemptContent = content
        prepareBestAttempt(content)
        startEnrichment(
            request: request,
            content: content,
            delivery: delivery,
            budget: budget
        )
    }

    override func serviceExtensionTimeWillExpire() {
        enrichment?.cancel()
        guard let bestAttemptContent else { return }
        delivery?.deliver(bestAttemptContent)
    }

    // MARK: - Pipeline

    private func prepareBestAttempt(_ content: UNMutableNotificationContent) {
        let lock = Self.conversationLock(content.userInfo)
        // #11387 — l'ORDRE est une loi pure (`NSEPreparationStep.plan`) : une
        // conversation verrouillée est scellée avant toute décision, ne dépose
        // rien de son message, et son corps est remplacé en dernier.
        for step in NSEPreparationStep.plan(isLockedConversation: lock.sealsContent) {
            perform(step, on: content, lock: lock)
        }
    }

    private func perform(_ step: NSEPreparationStep, on content: UNMutableNotificationContent, lock: NSEConversationLock) {
        switch step {
        case .sealLockedConversation:
            content.userInfo = NSEAttachmentPolicy.sealingLockedConversation(content.userInfo, isLocked: true)
        case .applyCategory:
            applyCategory(to: content)
            // #12655 — verrouillée, scellée ou inconnue : aucune action rapide.
            content.categoryIdentifier = NSEAttachmentPolicy.category(
                content.categoryIdentifier, under: lock, userInfo: content.userInfo
            )
        case .applyBadge:
            applyBadge(to: content)
        case .applyThreading:
            applyThreading(to: content)
        case .applyPreferences:
            // Préférences de notification (miroir App Group) — APRÈS applyBadge et
            // applyThreading pour que sons/badge/regroupement coupés gagnent, et
            // avant tout chemin de sortie (contentHandler / expiration).
            NSEPreferencesGate.apply(
                preferences: NSEPreferencesGate.loadPreferences() ?? .defaults,
                to: content,
                rawType: content.userInfo["type"] as? String
            )
        case .updateUnreadCount:
            updateSharedUnreadCount(from: content.userInfo)
        case .syncMessage:
            prefetchMessageData(from: content.userInfo)
        case .prefetchSocial:
            prefetchSocialData(from: content.userInfo)
        case .prePersistMessage:
            NSEMessagePrePersister.prePersist(from: content.userInfo)
        case .postDeliveryReceipt:
            postDeliveryReceipt(from: content.userInfo)
        case .rewriteBody:
            applyBodyRewrites(to: content)
        case .applyEphemeralDeadline:
            // #7453 — L'ÉCHÉANCE, pas une durée figée : une HEURE ne se périme pas,
            // et elle est aussi GRAVÉE dans le `userInfo` où les balayages la lisent.
            applyEphemeralDeadline(to: content)
        case .sweepExpiredBanners:
            // Une NSE s'exécute à chaque push reçu : l'occasion la plus fréquente
            // de retirer les bannières dont l'échéance est passée.
            Self.sweepExpiredDeliveredBanners()
        case .replaceBodyWithLockLabel:
            content.body = NSLocalizedString(
                NSEAttachmentPolicy.lockedConversationLocKey,
                bundle: InterfaceLanguageResolver.bundle(),
                comment: ""
            )
        }
    }

    /// La conversation est-elle verrouillée par PIN sur cet appareil ? Le
    /// miroir COMPLET que l'app dépose dans l'App Group fait foi (#11387) — le
    /// cliché `conversation_snapshots` ne couvre que la liste chargée. Un
    /// miroir illisible rend `unknown` (#12655).
    private static func conversationLock(_ userInfo: [AnyHashable: Any]) -> NSEConversationLock {
        let conversationId = userInfo["conversationId"] as? String
        let mirrored = UserDefaults(suiteName: "group.me.meeshy.apps")?
            .stringArray(forKey: NSEAttachmentPolicy.lockedConversationIdsKey)
        let snapshotDeclaresLock = conversationId
            .flatMap { NSEDataSync.conversationDetails(forId: $0)?.isLocked } ?? false
        return NSEAttachmentPolicy.conversationLock(
            conversationId: conversationId,
            mirroredLockedIds: mirrored,
            snapshotDeclaresLock: snapshotDeclaresLock
        )
    }

    private func applyBodyRewrites(to content: UNMutableNotificationContent) {
        let userInfo = content.userInfo
        var didDecrypt = false
        if let encryptedContent = userInfo["encryptedContent"] as? String,
           let senderId = userInfo["senderId"] as? String,
           !encryptedContent.isEmpty,
           let decrypted = NSEDecryptor.decrypt(encryptedBase64: encryptedContent, senderUserId: senderId) {
            content.body = decrypted
            didDecrypt = true
        }
        // Les corps protégés de la passerelle sont des emoji déjà localisés :
        // seul l'échec de déchiffrement E2EE les remplace par le libellé du
        // catalogue de l'extension.
        let isEncryptedPush = userInfo["isEncrypted"] as? Bool == true
            || (userInfo["encryptedContent"] as? String).map { !$0.isEmpty } == true
        if isEncryptedPush, !didDecrypt,
           let locKey = userInfo["notificationLocKey"] as? String, !locKey.isEmpty {
            let localized = NSLocalizedString(locKey, bundle: InterfaceLanguageResolver.bundle(), comment: "")
            if localized != locKey {
                content.body = localized
            }
        }
        // Bug B — un vocal E2EE arrive au corps vide : le repli audio n'agit
        // qu'APRÈS déchiffrement et locKey, jamais sur une légende déchiffrée.
        if let fallback = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: content.body,
            userInfo: userInfo
        ) {
            content.body = fallback
        }
        // #8858 — position, contact, invitation, lien : le corps DIT le détail
        // quand la passerelle ne l'a pas composé (vide, ou URL brute).
        applyDetailedBody(to: content)
    }

    private func startEnrichment(
        request: UNNotificationRequest,
        content: UNMutableNotificationContent,
        delivery: NSEDelivery<UNNotificationContent>,
        budget: NSEBudget
    ) {
        guard let working = content.mutableCopy() as? UNMutableNotificationContent else {
            delivery.deliver(content)
            return
        }
        let userInfo = working.userInfo
        let plan = NSEEnrichmentRequest.make(
            userInfo: userInfo,
            apiBaseURL: NSEDataSync.trustedApiBaseURL,
            budget: budget,
            now: Date()
        )
        let isCommunicationType = Self.communicationTypes.contains(userInfo["type"] as? String ?? "")
        let identifier = request.identifier
        let owned = NSEOwnedContent(content: working)
        enrichment = Task {
            await NotificationService.deliverEnriched(
                owned.content,
                plan: plan,
                incomingIdentifier: identifier,
                budget: budget,
                delivery: delivery,
                isCommunicationType: isCommunicationType
            )
        }
    }

    private static func deliverEnriched(
        _ working: UNMutableNotificationContent,
        plan: NSEEnrichmentRequest,
        incomingIdentifier: String,
        budget: NSEBudget,
        delivery: NSEDelivery<UNNotificationContent>,
        isCommunicationType: Bool
    ) async {
        let result = await enrich(plan, incomingIdentifier: incomingIdentifier, budget: budget)
        guard !delivery.hasDelivered else {
            discard(result)
            return
        }
        delivery.deliver(finalContent(from: working, result: result, isCommunicationType: isCommunicationType))
    }

    private static func finalContent(
        from content: UNMutableNotificationContent,
        result: NSEEnrichmentResult,
        isCommunicationType: Bool
    ) -> UNNotificationContent {
        if let file = result.attachment,
           let attachment = createMessageAttachment(
               fromFile: file.fileURL, originalURL: file.originalURL, mimeType: file.mimeType
           ) {
            content.attachments = [attachment]
        }
        guard isCommunicationType else { return content }
        return applyCommunicationIntent(to: content, avatarData: result.avatarData)
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

        // #8858 — une position, une carte de visite ou une invitation appellent
        // leurs propres actions (Plans, Contacts, Rejoindre).
        content.categoryIdentifier = NotificationDetailPolicy.refinedCategory(
            category, type: rawType, userInfo: content.userInfo,
            declared: content.categoryIdentifier
        )
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

    // MARK: - GRDB Pre-persist (voir NSEMessagePrePersister)

    // MARK: - Éphémère (#7453)

    /// Réécrit le corps avec l'heure d'échéance et grave cette échéance dans
    /// le `userInfo`.
    ///
    /// Les deux vont ensemble et se font ici : le corps est ce que
    /// l'utilisateur LIT, l'échéance du `userInfo` est ce qui permettra de
    /// retirer la bannière quand elle sera passée. Poser l'un sans l'autre
    /// laisserait soit une bannière qui annonce une heure et ne part pas, soit
    /// une bannière qui part sans avoir jamais dit quand.
    private func applyEphemeralDeadline(to content: UNMutableNotificationContent) {
        guard let deadline = NotificationPayloadHelpers.ephemeralDeadline(
            userInfo: content.userInfo,
            now: Date()
        ) else { return }

        if let body = NotificationPayloadHelpers.ephemeralBodyOverride(
            userInfo: content.userInfo,
            deadline: deadline
        ) {
            content.body = body
        }

        var userInfo = content.userInfo
        userInfo[EphemeralBannerDeadline.userInfoKey] = deadline.timeIntervalSince1970
        content.userInfo = userInfo
    }

    /// Retire les bannières délivrées dont l'échéance est passée.
    ///
    /// Fire-and-forget : le centre de notifications répond en asynchrone, et ce
    /// balayage ne doit jamais retarder l'affichage. Il ne touche QUE les
    /// bannières qui portent une échéance — une notification ordinaire n'est
    /// jamais retirée par ce chemin.
    static func sweepExpiredDeliveredBanners(now: Date = Date()) {
        // Le centre est redemandé DANS la fermeture plutôt que capturé : une
        // fermeture d'API système doit être `@Sendable`, et la capture d'un
        // objet de framework y coûte une exception de concurrence pour rien —
        // `current()` rend le même singleton.
        UNUserNotificationCenter.current().getDeliveredNotifications { delivered in
            let entries = delivered.map {
                (id: $0.request.identifier, userInfo: $0.request.content.userInfo)
            }
            let expired = EphemeralBannerDeadline.expiredIdentifiers(from: entries, now: now)
            guard !expired.isEmpty else { return }
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: expired)
        }
    }

    // MARK: - Delivery Receipt

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
        guard NotificationPayloadHelpers.isDeliveryReceiptType(type) else { return }

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
        "friend_request", "contact_request", "contact_joined", "contact_recently_active",
        // Le jeu (#9490) : un duo vient d'un ami, dont l'avatar dit QUI. La ligue et la saison n'ont pas d'acteur.
        "game_duo_invited", "game_duo_accepted"
    ]

    /// Creates an `INSendMessageIntent` and returns updated notification content
    /// that iOS renders with circular avatar + sender name + group name.
    private static func applyCommunicationIntent(
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

        // Cadrage : une notification SOCIALE n'a pas de conversation et tombait
        // donc en 1:1, mode où iOS n'affiche que le nom et le corps — son
        // sous-titre (« a commenté un réel · Publication de Windie Nh »)
        // n'atteignait jamais l'écran. On la cadre en groupe pour que l'action
        // devienne le `speakableGroupName`, seul champ rendu sous le nom.
        let framing = NotificationPayloadHelpers.communicationFraming(
            conversationId: conversationId,
            conversationType: conversationType,
            postId: userInfo["postId"] as? String ?? "",
            notificationId: userInfo["notificationId"] as? String ?? "",
            subtitle: content.subtitle
        )
        let isGroup = framing.usesGroupFraming

        let speakableGroupName: INSpeakableString?
        if let socialGroupName = framing.groupName {
            speakableGroupName = INSpeakableString(spokenPhrase: socialGroupName)
        } else if isGroup {
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
        // neutral members keyed by the framing key purely to trigger group mode;
        // the displayed name comes from speakableGroupName, not these handles.
        // La clé vient du cadrage (conversation, sinon `post:<id>`, sinon
        // l'identifiant de notification) : la chaîne vide que TOUTES les
        // notifications sociales partageaient les fondait en un seul fil.
        let intentKey = framing.intentKey
        let groupRecipients: [INPerson]? = isGroup ? [
            INPerson(personHandle: INPersonHandle(value: "\(intentKey)#m1", type: .unknown),
                     nameComponents: nil, displayName: "", image: nil,
                     contactIdentifier: nil, customIdentifier: "\(intentKey)#m1"),
            INPerson(personHandle: INPersonHandle(value: "\(intentKey)#m2", type: .unknown),
                     nameComponents: nil, displayName: "", image: nil,
                     contactIdentifier: nil, customIdentifier: "\(intentKey)#m2")
        ] : nil

        let intent = INSendMessageIntent(
            recipients: groupRecipients,
            outgoingMessageType: .unknown,
            content: content.body,
            speakableGroupName: speakableGroupName,
            conversationIdentifier: intentKey,
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

    /// Taille d'un fichier local, `nil` s'il a disparu. C'est la mesure du
    /// SECOND étage de `NSEAttachmentPolicy` : un serveur n'est jamais tenu par
    /// la taille qu'il annonce sur le fil.
    static func fileSize(at url: URL) -> Int? {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else {
            return nil
        }
        return (attributes[.size] as? NSNumber)?.intValue
    }

    /// Creates a UNNotificationAttachment from raw bytes for a message media.
    /// Picks the right file extension + UTI typeHint so iOS renders the attachment
    /// in its native style (image preview, audio waveform with play button, video
    /// thumbnail with tap-to-play).
    ///
    /// **Prend un FICHIER, plus des octets (#7003)** : le corps n'a jamais
    /// transité par la mémoire, il est descendu sur disque et il n'y a qu'à le
    /// renommer avec la bonne extension. `UNNotificationAttachment` déplace
    /// ensuite ce fichier dans son propre magasin ; s'il refuse, on efface —
    /// une extension qui laisse des temporaires derrière elle les paie au
    /// push suivant.
    static func createMessageAttachment(
        fromFile downloadedFile: URL,
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
            try FileManager.default.moveItem(at: downloadedFile, to: tempFile)
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
            try? FileManager.default.removeItem(at: tempFile)
            try? FileManager.default.removeItem(at: downloadedFile)
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
            if normalized.contains("heif") { return ("heif", "public.heif") }
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

// unchecked: le contenu est copié juste avant la tâche d'enrichissement et n'est plus touché que par elle ;
// l'expiration livre bestAttemptContent, un autre objet. Le vérificateur par régions de Xcode 26.1.1 ne sait pas
// analyser cette capture (« pattern that the region based isolation checker does not understand »).
struct NSEOwnedContent: @unchecked Sendable {
    let content: UNMutableNotificationContent
}
