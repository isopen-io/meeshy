import SwiftUI
import MeeshySDK

// MARK: - iPad Root View Navigation Helpers

extension iPadRootView {

    func openConversation(_ conversation: Conversation) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = conversation
            rightPanelRoute = nil
            pendingReplyContext = nil
        }
    }

    func closePanels() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = nil
            rightPanelRoute = nil
            pendingReplyContext = nil
        }
    }

    // MARK: - Deep Link Handling

    func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        switch deepLink {
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
                case .forbidden(let reason):
                    message = reason ?? String(localized: "Acces refuse a cette conversation", defaultValue: "Acces refuse a cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
                }
                ToastManager.shared.showError(message)
            } catch {
                ToastManager.shared.showError(
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
                ToastManager.shared.showError("Impossible de creer la conversation")
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
        let authId: String
        switch context {
        case .story(_, let authorId, _, _, _, _, _, _): authId = authorId
        case .status(_, let authorId, _, _, _): authId = authorId
        }

        if let existingConv = conversationViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == authId
        }) {
            pendingReplyContext = context
            openConversation(existingConv)
            return
        }

        Task {
            do {
                let response = try await ConversationService.shared.create(
                    type: "direct",
                    participantIds: [authId]
                )
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(response.id)
                let conv = apiConv.toConversation(currentUserId: currentUserId)
                await MainActor.run {
                    pendingReplyContext = context
                    openConversation(conv)
                }
            } catch {
                ToastManager.shared.showError("Impossible de creer la conversation")
            }
        }
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
             .addedToConversation, .newConversation, .removedFromConversation:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId, nil, showComments: true)
            }

        case .storyReaction, .statusReaction:
            if let postId = notification.context?.postId ?? data?.postId,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId)
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
             .newConversation, .addedToConversation, .memberJoined:
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
                rightPanelRoute = .postDetail(postId, nil, showComments: true)
            }

        case .storyReaction, .statusReaction:
            if let postId = event.postId,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else if let postId = event.postId {
                rightPanelRoute = .postDetail(postId)
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
             .addedToConversation, .newConversation, .removedFromConversation:
            if let conversationId = payload.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = payload.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = payload.postId, !postId.isEmpty {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = payload.postId, !postId.isEmpty {
                rightPanelRoute = .postDetail(postId, nil, showComments: true)
            }

        case .storyReaction, .statusReaction:
            if let postId = payload.postId, !postId.isEmpty,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else if let postId = payload.postId, !postId.isEmpty {
                rightPanelRoute = .postDetail(postId)
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
            if ensureUnread && conv.unreadCount == 0 {
                conv.unreadCount = 1
            }
            if let messageId = highlightMessageId {
                router.pendingHighlightMessageId = messageId
            }
            openConversation(conv)
            return
        }
        Task {
            do {
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(conversationId)
                var conv = apiConv.toConversation(currentUserId: currentUserId)
                if ensureUnread && conv.unreadCount == 0 {
                    conv.unreadCount = 1
                }
                if let messageId = highlightMessageId {
                    router.pendingHighlightMessageId = messageId
                }
                openConversation(conv)
            } catch {
                ToastManager.shared.showError("Impossible d'ouvrir la conversation")
            }
        }
    }
}
