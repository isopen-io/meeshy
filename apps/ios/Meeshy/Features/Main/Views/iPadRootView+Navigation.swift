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

    // MARK: - Deep Link Handling

    func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        switch deepLink {
        case .trackedLink(let token):
            // `/l/<token>` resolved async by targetType (re-sets pendingDeepLink).
            deepLinkRouter.resolveTrackedLink(token)
        case .joinLink(let identifier), .chatLink(let identifier):
            // iPadRootView only mounts when authenticated, so we never
            // want the anonymous join sheet here — that flow is owned by
            // MeeshyApp.handleGuestDeepLink for the unauthenticated
            // branch. For authenticated users we resolve the share link
            // server-side: the gateway is idempotent, so an existing
            // member gets the same payload as a fresh join and we can
            // navigate to the canonical conversationId either way.
            joinViaShareLink(identifier: identifier)
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
            // (handleNotificationTap → router.deepLinkProfileUser).
            router.deepLinkProfileUser = ProfileSheetUser(username: username)
        case .ownProfile:
            // iPad surfaces own profile + user links in the right column,
            // matching the existing achievement / affiliate notification
            // routing in the same file.
            rightPanelRoute = .profile
        case .userLinks:
            rightPanelRoute = .links
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
                    message = String(localized: "Lien introuvable", defaultValue: "Lien introuvable")
                case .server(410, let msg):
                    message = msg.isEmpty
                        ? String(localized: "Ce lien n'est plus actif", defaultValue: "Ce lien n'est plus actif")
                        : msg
                case .forbidden(let reason, _):
                    message = reason ?? String(localized: "Acces refuse a cette conversation", defaultValue: "Acces refuse a cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
                }
                FeedbackToastManager.shared.showError(message)
            } catch {
                FeedbackToastManager.shared.showError(
                    String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
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
                FeedbackToastManager.shared.showError("Impossible de creer la conversation")
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
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .legacyStoryReply, .reply,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = data?.conversationId else { return }
            navigateToConversationById(conversationId)

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

        case .postLike, .legacyPostLike, .postRepost, .friendNewPost:
            if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction:
            if let postId = notification.context?.postId ?? data?.postId {
                let postType = notification.metadata?.postType
                if isStoryPost(postId: postId, postType: postType) {
                    router.push(.storyNotificationTarget(
                        storyId: postId,
                        intent: .comments,
                        context: StoryNotificationContext.from(notification)
                    ))
                } else {
                    rightPanelRoute = .postDetail(
                        postId,
                        nil,
                        showComments: true,
                        commentId: notification.context?.commentId ?? notification.metadata?.commentId,
                        parentCommentId: notification.context?.parentCommentId ?? notification.metadata?.parentCommentId
                    )
                }
            }

        case .storyReaction, .statusReaction:
            // Phase G follow-up — every story-reaction notification routes
            // through the dedicated screen (which redirects into the viewer's
            // viewers/reactions sheet, or surfaces the expired empty state
            // when the underlying story is gone). Replaces the previous
            // best-effort `groupIndex(forStoryId:)` lookup that silently
            // dropped the notification when the local tray hadn't loaded
            // the story yet.
            if let postId = notification.context?.postId ?? data?.postId {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .reactions,
                    context: StoryNotificationContext.from(notification)
                ))
            }

        case .storyNewComment, .friendStoryComment, .storyThreadReply:
            if let postId = notification.context?.postId ?? data?.postId {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .comments,
                    context: StoryNotificationContext.from(notification)
                ))
            }

        case .friendNewStory, .friendNewMood:
            if let postId = notification.context?.postId ?? data?.postId {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .view,
                    context: StoryNotificationContext.from(notification)
                ))
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
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
            break
        }
    }

    // MARK: - Handle Socket Notification Tap

    func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        switch event.notificationType {
        case .newMessage, .messageReply, .messageReaction, .reaction,
             .mention, .missedCall,
             .newConversation, .newConversationDirect, .newConversationGroup, .addedToConversation, .memberJoined:
            if let conversationId = event.conversationId {
                navigateToConversationById(conversationId)
            }

        case .friendRequest, .contactRequest, .friendAccepted, .contactAccepted:
            if let senderId = event.senderId, let username = event.senderUsername {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: username
                )
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = event.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = event.postId {
                if isStoryPost(postId: postId, postType: event.postType) {
                    router.push(.storyNotificationTarget(
                        storyId: postId,
                        intent: .comments,
                        context: makeStoryContext(from: event)
                    ))
                } else {
                    rightPanelRoute = .postDetail(
                        postId,
                        nil,
                        showComments: true,
                        commentId: event.commentId,
                        parentCommentId: event.parentCommentId
                    )
                }
            }

        case .storyReaction, .statusReaction:
            if let postId = event.postId {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .reactions,
                    context: makeStoryContext(from: event)
                ))
            }

        default:
            break
        }
    }

    // MARK: - Handle Push Notification Tap

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        let type = MeeshyNotificationType(rawValue: payload.type ?? "") ?? .system

        switch type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .legacyStoryReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = payload.conversationId, !conversationId.isEmpty else { return }
            navigateToConversationById(conversationId, highlightMessageId: payload.messageId, ensureUnread: true)

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

        case .postLike, .legacyPostLike, .postRepost, .friendNewPost:
            if let postId = payload.postId, !postId.isEmpty {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction:
            if let postId = payload.postId, !postId.isEmpty {
                if isStoryPost(postId: postId, postType: payload.postType) {
                    router.push(.storyNotificationTarget(
                        storyId: postId,
                        intent: .comments,
                        context: makeStoryContext(from: payload)
                    ))
                } else {
                    rightPanelRoute = .postDetail(
                        postId,
                        nil,
                        showComments: true,
                        commentId: payload.commentId,
                        parentCommentId: payload.parentCommentId
                    )
                }
            }

        case .storyReaction, .statusReaction:
            if let postId = payload.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .reactions,
                    context: makeStoryContext(from: payload)
                ))
            }

        case .storyNewComment, .friendStoryComment, .storyThreadReply:
            if let postId = payload.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .comments,
                    context: makeStoryContext(from: payload)
                ))
            }

        case .friendNewStory, .friendNewMood:
            if let postId = payload.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .view,
                    context: makeStoryContext(from: payload)
                ))
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            rightPanelRoute = .userStats

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            break
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
            var lastError: Error?
            for attempt in 0..<2 {
                do {
                    let apiConv = try await ConversationService.shared.getById(conversationId)
                    var conv = apiConv.toConversation(currentUserId: currentUserId)
                    if ensureUnread && conv.userState.unreadCount == 0 {
                        conv.userState.unreadCount = 1
                    }
                    if let messageId = highlightMessageId {
                        router.pendingHighlightMessageId = messageId
                    }
                    openConversation(conv)
                    return
                } catch {
                    lastError = error
                    Logger.messages.error("[iPadRootView] navigateToConversationById attempt=\(attempt) id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
                    if attempt == 0 {
                        try? await Task.sleep(nanoseconds: 600_000_000)
                    }
                }
            }
            let underlying = (lastError as? LocalizedError)?.errorDescription ?? lastError?.localizedDescription
            let detail = underlying.map { " (\($0))" } ?? ""
            FeedbackToastManager.shared.showError("Impossible d'ouvrir la conversation" + detail)
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

    // MARK: - Story Notification Heuristics
    //
    // Mirrors the iPhone (RootView) heuristic: a `.postComment` /
    // `.commentReply` notification routes to the dedicated story
    // notification screen when (a) the gateway tagged the post as
    // `metadata.postType == "STORY"`, OR (b) the local cache holds a post
    // with a non-nil `expiresAt` (which is, by definition, a story).
    // Both signals are best-effort — the dedicated screen still degrades
    // gracefully (`expired` empty state) for posts that no longer exist.

    func isStoryPost(postId: String, postType: String?) -> Bool {
        // A reel is never a story: an explicit `REEL` tag must win over the
        // cache-expiry heuristic below, otherwise a reel comment/reaction could
        // be misrouted into the story notification screen (the "story view opens
        // with the wrong post" bug). iPad has no immersive reel viewer, so reels
        // fall through to the universal `.postDetail` surface, which renders them.
        if postType?.uppercased() == "REEL" { return false }
        if postType?.uppercased() == "STORY" { return true }
        if let cached = StoryService.shared.cachedPost(id: postId), cached.expiresAt != nil {
            return true
        }
        return false
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
