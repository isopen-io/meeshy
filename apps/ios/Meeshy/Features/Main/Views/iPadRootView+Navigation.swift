import SwiftUI
import MeeshySDK
import os

// MARK: - iPad Root View Navigation Helpers

extension iPadRootView {

    func openConversation(_ conversation: Conversation) {
        // Do NOT clear router.pendingReplyContext here: when openConversation is
        // invoked through navigateToStoryReply, the context was just set and must
        // survive until ConversationView consumes it. ConversationView clears it
        // in .onAppear (see rightColumn).
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = conversation
            rightPanelRoute = nil
        }
    }

    func closePanels() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = nil
            rightPanelRoute = nil
            router.pendingReplyContext = nil
        }
    }

    // MARK: - Sync Pill

    /// Ouvre la cible d'une entrée de la pastille de synchronisation. Miroir
    /// iPad de `RootView.handleSyncPillTap` : sans lui, `ConnectionBanner` était
    /// construit sans `onItemTap` et taper « Envoi dans <conversation> » ne
    /// menait nulle part (la pastille se contentait d'avancer d'un cran).
    func handleSyncPillTap(_ source: OutboxUIItem.Source) {
        switch source {
        case .conversation(let id, let messageId):
            guard let conv = conversationViewModel.conversations.first(where: { $0.id == id }) else {
                Logger.messages.info("syncPill tap: conversation \(id, privacy: .public) not in cache, skipping")
                return
            }
        // #4027 — l'entrée mène à sa CIBLE EXACTE. Le surlignage est posé
            // AVANT la navigation et SCOPÉ à la conversation visée : sans le
            // scope, une ancre survivrait à une ouverture différente et ferait
            // sauter un autre fil sur un id qui n'est pas le sien.
            // `ConversationView` le consomme (scroll + flash) puis le remet à
            // `nil` — même chemin que le tap d'une notification, d'un résultat
            // de recherche ou d'un message étoilé, à un seul exemplaire.
            if let messageId {
                router.pendingHighlightMessageId = messageId
                router.pendingHighlightConversationId = id
            }
            openConversation(conv)
        case .post(let id):
            rightPanelRoute = .postDetail(id, nil, showComments: false)
        case .story:
            // Parité RootView : ouvrir une story exige un StoryIntent + un
            // StoryNotificationContext que la pastille ne transporte pas.
            Logger.messages.info("syncPill tap: story open not yet supported")
        case .unknown:
            break
        }
    }

    /// Jumeau strict de `RootView.resolveShareLinkEntry`. La collecte des faits
    /// et la décision sont partagées (`ShareLinkEntryResolver` →
    /// `ShareLinkEntryPolicy`) ; seule la présentation diffère.
    func resolveShareLinkEntry(identifier: String) {
        Task {
            let known = Set(conversationViewModel.conversations.map(\.id))
            guard let resolution = await ShareLinkEntryResolver.resolve(
                identifier: identifier,
                isAuthenticated: true,
                knownConversationIds: known
            ) else {
                joinViaShareLink(identifier: identifier)
                return
            }

            switch resolution.intent {
            case .openConversation(let conversationId):
                navigateToConversationById(conversationId)
            case .chooseIdentity(let conversationId):
                shareLinkChoice = ShareLinkIdentityChoice(
                    identifier: identifier,
                    conversationId: conversationId,
                    conversationTitle: resolution.conversationTitle,
                    resumesGuestSession: AnonymousSessionStore.load(linkId: identifier) != nil
                )
            case .joinWithAccount, .joinAnonymously, .resumeGuestSession, .requiresAccount:
                joinViaShareLink(identifier: identifier)
            }
        }
    }

    // MARK: - Deep Link Handling

    func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        switch deepLink {
        case .trackedLink(let token):
            // `/l/<token>` resolved async by targetType (re-sets pendingDeepLink).
            deepLinkRouter.resolveTrackedLink(token)
        case .joinLink(let identifier), .chatLink(let identifier):
            // iPadRootView ne se monte qu'authentifié — la branche SANS compte
            // est tenue par `MeeshyApp.handleGuestDeepLink`. Ici la personne A
            // un compte, et le choix lui revient : à visage découvert, ou sous
            // pseudonyme. Même résolveur que `RootView`, à un seul exemplaire.
            resolveShareLinkEntry(identifier: identifier)
        case .conversation(let id):
            // Validate the conversation exists BEFORE opening. Otherwise a
            // deep link to a deleted/unknown conversation lands the user on
            // an empty pane with no recovery, and re-firing the same URL
            // (e.g. from a web redirect that retries on every render) keeps
            // recreating the same empty view — perceived as an infinite
            // loop.
            navigateToConversationById(id)
        case .postDetail(let postId):
            // iPad surfaces the post detail in the right column, matching
            // the existing post-notification handling above.
            rightPanelRoute = .postDetail(postId)
        case .storyDetail(let postId):
            // Mirror of the existing `storyDetail:` push-notification
            // handler below (handlePushNavigateToRoute). Try to surface
            // the dedicated story viewer when the group is in the local
            // tray, otherwise fall back to the post detail right pane.
            if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else {
                rightPanelRoute = .postDetail(postId)
            }
        case .userProfile(let username):
            // Opens the profile sheet over the two-pane layout. Same
            // surface as friend-request notification taps above
            // (handleNotificationTap → router.deepLinkProfileUser). Même
            // fabrique que `RootView` : un `/l/<token>` de type PROFILE porte
            // un userId, pas un pseudo.
            router.deepLinkProfileUser = ProfileSheetUser.from(idOrUsername: username)
        case .ownProfile:
            // iPad surfaces own profile + user links in the right column,
            // matching the existing achievement / affiliate notification
            // routing in the same file.
            rightPanelRoute = .profile
        case .userLinks:
            rightPanelRoute = .links
        case .hashtag(let tag):
            rightPanelRoute = .hashtagResults(tag: tag)
        case .externalLink(let url):
            // Cible EXTERNAL d'un `/l/<token>` : elle s'ouvre, elle ne se
            // rejoint pas. Même geste que `RootView`.
            UIApplication.shared.open(url)
        case .unresolvedTrackedLink:
            FeedbackToastManager.shared.showError(
                String(localized: "deepLink.tracked.unresolved",
                       defaultValue: "Ce lien n'a pas pu être ouvert",
                       bundle: .main)
            )
        case .magicLink:
            break
        }
    }

    func joinViaShareLink(identifier: String) {
        Task {
            do {
                let response = try await ShareLinkService.shared.joinAuthenticated(linkId: identifier)
                navigateToConversationById(response.conversationId)
            } catch let error as MeeshyError {
                let message: String
                switch error {
                case .server(404, _):
                    message = String(localized: "link.error.not-found", defaultValue: "Lien introuvable")
                case .server(410, let msg):
                    message = msg.isEmpty
                        ? String(localized: "link.error.inactive", defaultValue: "Ce lien n'est plus actif")
                        : msg
                case .forbidden(let reason, _):
                    message = reason ?? String(localized: "link.error.forbidden", defaultValue: "Accès refusé à cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "link.error.open", defaultValue: "Impossible d'ouvrir le lien")
                }
                FeedbackToastManager.shared.showError(message)
            } catch {
                FeedbackToastManager.shared.showError(
                    String(localized: "link.error.open", defaultValue: "Impossible d'ouvrir le lien")
                )
            }
        }
    }

    // MARK: - Notification Handlers

    func handleSendMessageToUser(_ notification: Notification) {
        guard let targetUserId = notification.object as? String else { return }
        if let existingConv = conversationViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == targetUserId
        }) {
            openConversation(existingConv)
            return
        }
        Task {
            do {
                let response = try await ConversationService.shared.create(
                    type: "direct",
                    participantIds: [targetUserId]
                )
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(response.id)
                let conv = apiConv.toConversation(currentUserId: currentUserId)
                openConversation(conv)
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "conversation.create.error", defaultValue: "Impossible de créer la conversation", bundle: .main))
            }
        }
    }

    func handlePushNavigateToRoute(_ notification: Notification) {
        guard let routeName = notification.object as? String else { return }
        if routeName.hasPrefix("postDetail:") {
            let postId = String(routeName.dropFirst("postDetail:".count))
            rightPanelRoute = .postDetail(postId)
        } else if routeName.hasPrefix("storyDetail:") {
            let postId = String(routeName.dropFirst("storyDetail:".count))
            if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else {
                rightPanelRoute = .postDetail(postId)
            }
        } else {
            switch routeName {
            case "userStats": rightPanelRoute = .userStats
            case "affiliate": rightPanelRoute = .affiliate
            default: break
            }
        }
    }

    // MARK: - Handle Story Reply

    func handleStoryReply(_ context: ReplyContext) {
        // Delegate to the centralized helper. iPad's openConversation is wired
        // through router.onRouteRequested, so navigateToConversation dispatches
        // into the two-column flow automatically.
        router.navigateToStoryReply(context, conversationListViewModel: conversationViewModel)
    }

    // MARK: - Handle Notification Tap

    func handleNotificationTap(_ notification: APINotification) {
        let data = notification.data
        switch notification.notificationType {
        case .newMessage, .legacyNewMessage, .messageReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .legacyStoryReply, .reply,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = data?.conversationId else { return }
            // Parité iPhone/push : scroll + flash sur le message exact.
            navigateToConversationById(
                conversationId,
                highlightMessageId: notification.context?.messageId,
                ensureUnread: true
            )

        // Une mention vit SOIT dans une conversation SOIT dans un post/commentaire
        // (`createPostMentionNotificationsBatch` / `createCommentMentionNotificationsBatch`
        // portent un `postId` et AUCUN `conversationId`) — même repli que
        // `RootView.navigateFromNotification` (iPhone). Sans lui, référencer
        // quelqu'un dans un post/story/réel/statut ouvrait un tap MUET sur iPad.
        case .userMentioned, .mention, .legacyMention:
            if let conversationId = data?.conversationId, !conversationId.isEmpty {
                navigateToConversationById(
                    conversationId,
                    highlightMessageId: notification.context?.messageId,
                    ensureUnread: true
                )
            } else if let postId = notification.context?.postId ?? data?.postId ?? notification.metadata?.postId {
                routeSocialNotification(
                    postId: postId,
                    postType: notification.metadata?.postType,
                    contentType: notification.metadata?.contentType,
                    type: notification.notificationType,
                    commentId: notification.context?.commentId ?? notification.metadata?.commentId,
                    parentCommentId: notification.context?.parentCommentId ?? notification.metadata?.parentCommentId,
                    storyContext: StoryNotificationContext.from(notification)
                )
            }

        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted,
             .legacyStatusUpdate:
            if let senderId = notification.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(userId: senderId, username: notification.senderName ?? senderId)
            }

        case .communityInvite, .communityJoined, .communityLeft, .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
             .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        // ===== SOCIAL CONTENT =====
        // Single decision point, shared with iPhone via
        // `NotificationContentRouter` — see `routeSocialNotification`.
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            if let postId = notification.context?.postId ?? data?.postId ?? notification.metadata?.postId {
                routeSocialNotification(
                    postId: postId,
                    postType: notification.metadata?.postType,
                    contentType: notification.metadata?.contentType,
                    type: notification.notificationType,
                    commentId: notification.context?.commentId ?? notification.metadata?.commentId,
                    parentCommentId: notification.context?.parentCommentId ?? notification.metadata?.parentCommentId,
                    storyContext: StoryNotificationContext.from(notification)
                )
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .incomingCallAlert, .callEnded, .legacyCallIncoming:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            rightPanelRoute = .userStats

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            // Pas d'entité cible : ouvrir le panneau notifications plutôt
            // qu'un tap muet.
            rightPanelRoute = .notifications
        }
    }

    // MARK: - Handle Socket Notification Tap

    func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        switch event.notificationType {
        case .newMessage, .messageReply, .messageReaction, .reaction,
             .missedCall,
             .newConversation, .newConversationDirect, .newConversationGroup, .addedToConversation, .memberJoined:
            if let conversationId = event.conversationId {
                // Parité iPhone/push : scroll + flash sur le message exact.
                navigateToConversationById(
                    conversationId,
                    highlightMessageId: event.messageId,
                    ensureUnread: true
                )
            }

        case .friendRequest, .contactRequest, .friendAccepted, .contactAccepted:
            if let senderId = event.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: event.senderUsername ?? senderId
                )
            }

        // ===== SOCIAL CONTENT =====
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            if let postId = event.postId {
                routeSocialNotification(
                    postId: postId,
                    postType: event.postType,
                    contentType: event.metadata?.contentType,
                    type: event.notificationType,
                    commentId: event.commentId,
                    parentCommentId: event.parentCommentId,
                    storyContext: makeStoryContext(from: event)
                )
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            rightPanelRoute = .userStats

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            rightPanelRoute = .notifications

        default:
            // Parité avec le chemin push : ~30 types (familles legacy message,
            // communauté, appels…) tombaient ici en tap MUET. Toute entité
            // conversationnelle → conversation (avec highlight), sinon entité
            // sociale → surface post/story/reel.
            if let conversationId = event.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId, highlightMessageId: event.messageId)
            } else if let postId = event.postId, !postId.isEmpty {
                routeSocialNotification(
                    postId: postId,
                    postType: event.postType,
                    contentType: event.metadata?.contentType,
                    type: event.notificationType,
                    commentId: event.commentId,
                    parentCommentId: event.parentCommentId,
                    storyContext: makeStoryContext(from: event)
                )
            }
        }
    }

    // MARK: - Handle Push Notification Tap

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        let type = MeeshyNotificationType(rawValue: payload.type ?? "") ?? .system

        switch type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .legacyStoryReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = payload.conversationId, !conversationId.isEmpty else { return }
            navigateToConversationById(conversationId, highlightMessageId: payload.messageId, ensureUnread: true)

        // Une mention vit SOIT dans une conversation SOIT dans un post/commentaire
        // — même repli que `RootView.navigateFromNotification` (iPhone). C'est le
        // chemin le PLUS emprunté (tap sur la bannière push) : sans ce repli, une
        // référence dans un post/story/réel/statut était un tap MUET sur iPad.
        case .userMentioned, .mention, .legacyMention:
            if let conversationId = payload.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId, highlightMessageId: payload.messageId, ensureUnread: true)
            } else if let postId = payload.postId, !postId.isEmpty {
                routeSocialNotification(
                    postId: postId,
                    postType: payload.postType,
                    contentType: payload.contentType,
                    type: type,
                    commentId: payload.commentId,
                    parentCommentId: payload.parentCommentId,
                    storyContext: makeStoryContext(from: payload)
                )
            }

        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted,
             .legacyStatusUpdate:
            if let senderId = payload.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: payload.senderUsername ?? senderId
                )
            }

        case .communityInvite, .communityJoined, .communityLeft,
             .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
             .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
            if let conversationId = payload.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = payload.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        // Guideline 5 (MIIT) — China-region incoming-call push, same
        // rationale/wiring as RootView.navigateFromNotification: no CallKit,
        // no PushKit VoIP registration there, so this tap is the only way to
        // engage the call. A plain deep-link would neither negotiate WebRTC
        // nor show an answer UI.
        case .incomingCallAlert:
            guard let callId = payload.callId, !callId.isEmpty else {
                if let conversationId = payload.conversationId, !conversationId.isEmpty {
                    navigateToConversationById(conversationId)
                }
                return
            }
            CallManager.shared.handleIncomingCallNotification(
                callId: callId,
                fromUserId: payload.callerUserId ?? "",
                fromUsername: payload.callerName ?? payload.senderUsername ?? "",
                isVideo: payload.isVideoCall,
                iceServers: VoIPPushManager.parseIceServers(payload.iceServersJSON),
                conversationId: payload.conversationId
            )

        // ===== SOCIAL CONTENT =====
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            if let postId = payload.postId, !postId.isEmpty {
                routeSocialNotification(
                    postId: postId,
                    postType: payload.postType,
                    contentType: payload.contentType,
                    type: type,
                    commentId: payload.commentId,
                    parentCommentId: payload.parentCommentId,
                    storyContext: makeStoryContext(from: payload)
                )
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            rightPanelRoute = .userStats

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            // Pas d'entité cible : ouvrir le panneau notifications plutôt
            // qu'un tap muet.
            rightPanelRoute = .notifications
        }
    }

    // MARK: - Navigate to Conversation by ID

    func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil, ensureUnread: Bool = false) {
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            var conv = existing
            if ensureUnread && conv.userState.unreadCount == 0 {
                conv.userState.unreadCount = 1
            }
            if let messageId = highlightMessageId {
                router.pendingHighlightMessageId = messageId
                router.pendingHighlightConversationId = conversationId
            }
            openConversation(conv)
            return
        }
        Task {
            // Phase: navigate-from-notification timing race. Same retry-once
            // pattern as `RootView.navigateToConversationById` — a push for
            // a freshly-created conversation can land before the gateway
            // commit is visible to the recipient's auth context.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            for attempt in 0..<2 {
                do {
                    let apiConv = try await ConversationService.shared.getById(conversationId)
                    var conv = apiConv.toConversation(currentUserId: currentUserId)
                    if ensureUnread && conv.userState.unreadCount == 0 {
                        conv.userState.unreadCount = 1
                    }
                    if let messageId = highlightMessageId {
                        router.pendingHighlightMessageId = messageId
                        router.pendingHighlightConversationId = conversationId
                    }
                    openConversation(conv)
                    return
                } catch {
                    Logger.messages.error("[iPadRootView] navigateToConversationById attempt=\(attempt) id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
                    if attempt == 0 {
                        try? await Task.sleep(nanoseconds: 600_000_000)
                    }
                }
            }
            // Le détail brut (errorDescription) reste dans le log ci-dessus :
            // MeeshyError.server transporte du texte de debug/décodage qui n'a
            // rien à faire dans un toast utilisateur — même politique que
            // ConversationViewModel.userFacingMessage(for:).
            FeedbackToastManager.shared.showError(String(localized: "conversation.open.error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main))
        }
    }

    // MARK: - Notification Preview (long-press / pull-down)

    /// Long-press / pull-down on a notification toast: open the conversation as
    /// a preview over the columns (reuses `ConversationView` with `previewMode`)
    /// instead of opening it fully. Resolves cache-first (in-memory → GRDB →
    /// network), falling back to normal handling when it can't be resolved.
    func openNotificationPreview(for event: SocketNotificationEvent) {
        guard let conversationId = event.conversationId, !conversationId.isEmpty else {
            handleSocketNotificationTap(event)
            return
        }
        suppressToastTap = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { suppressToastTap = false }
        HapticFeedback.medium()
        notificationManager.dismissToast()

        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            notificationPreviewConversation = existing
            return
        }
        Task { @MainActor in
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                notificationPreviewConversation = cached
                return
            }
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                notificationPreviewConversation = apiConv.toConversation(currentUserId: currentUserId)
            } else {
                handleSocketNotificationTap(event)
            }
        }
    }

    // MARK: - Social Notification Routing
    //
    // Single decision point shared with iPhone (`RootView.socialSurface`) via
    // the pure `NotificationContentRouter`: the metadata discriminant
    // (`postType`, or `contentType` for the `friend_new_*` family) decides the
    // surface, the notification type only decides the intent.
    //
    // iPad has no immersive reel viewer, so a réel lands on the universal
    // `.postDetail` surface (which renders it) — but it is NEVER sent to the
    // story notification screen, which would resolve an unrelated story.

    func routeSocialNotification(
        postId: String,
        postType: String?,
        contentType: String?,
        type: MeeshyNotificationType,
        commentId: String?,
        parentCommentId: String?,
        storyContext: StoryNotificationContext
    ) {
        let surface = NotificationContentRouter.surface(
            postType: postType,
            contentType: contentType,
            notificationType: type,
            storyLifecycleHint: StoryService.shared.cachedPost(id: postId)?.expiresAt != nil
        )

        switch surface {
        case .story:
            router.push(.storyNotificationTarget(
                storyId: postId,
                intent: NotificationContentRouter.intent(for: type),
                context: storyContext,
                commentId: commentId,
                parentCommentId: parentCommentId
            ))
        case .reel, .post:
            rightPanelRoute = .postDetail(
                postId,
                nil,
                showComments: NotificationContentRouter.opensComments(type),
                commentId: commentId,
                parentCommentId: parentCommentId
            )
        }
    }

    // Push payloads + socket events don't carry the typed metadata that
    // `StoryNotificationContext.from(APINotification)` consumes, so we
    // reproduce the fallback chain inline. Matches the iPhone
    // implementation in `RootView.NotificationNavContext.makeStoryContext`.

    func makeStoryContext(from event: SocketNotificationEvent) -> StoryNotificationContext {
        let trigger: StoryNotificationContext.Trigger
        switch event.notificationType {
        case .storyReaction, .statusReaction:
            trigger = .reaction(emoji: event.metadata?.emoji ?? "❤️")
        default:
            trigger = .comment(preview: event.metadata?.commentPreview ?? "")
        }
        return StoryNotificationContext(
            actorAvatar: event.actor?.avatar,
            actorDisplayName: event.actor?.displayName ?? event.actor?.username ?? "",
            trigger: trigger,
            occurredAt: Date()
        )
    }

    func makeStoryContext(from payload: NotificationPayload) -> StoryNotificationContext {
        let trigger: StoryNotificationContext.Trigger = {
            switch payload.type ?? "" {
            case MeeshyNotificationType.storyReaction.rawValue,
                 MeeshyNotificationType.statusReaction.rawValue:
                return .reaction(emoji: "❤️")
            default:
                return .comment(preview: "")
            }
        }()
        return StoryNotificationContext(
            actorAvatar: payload.senderAvatar,
            actorDisplayName: payload.senderDisplayName ?? payload.senderUsername ?? "",
            trigger: trigger,
            occurredAt: Date()
        )
    }
}
