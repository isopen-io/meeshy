import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'aiguillage UNIQUE d'une notification touchée (API, socket, push) vers sa
/// cible, sorti de `RootView.swift` (cohésion du fichier). Il ne lit que le
/// routeur et la porte d'ouverture des conversations ; le contexte d'entrée est
/// `RootView.NotificationNavContext`. La racine garde les trois gestionnaires
/// (`handleNotificationTap`, `handleSocketNotificationTap`,
/// `handlePushNotificationTap`) comme façade qui construit le contexte.
struct RootNotificationNavigator {
    let router: Router
    let conversationOpener: RootConversationOpener

    typealias NotificationNavContext = RootView.NotificationNavContext

    // Routing decision for a social-content notification — delegated to the pure
    // `NotificationContentRouter` (single source of truth, mirrors the web's
    // `resolveContentRoute`). The metadata discriminant (`postType`, or
    // `contentType` for the `friend_new_*` family) is the high-confidence
    // signal; when the gateway omits it we fall back to the notification type
    // and, last, to the local cache where any post carrying a non-nil
    // `expiresAt` is ephemeral by definition.
    //
    // EVERY social branch below goes through this — including the comment
    // fan-out types (`story_thread_reply`, `friend_story_comment`,
    // `story_new_comment`), which the gateway emits for ANY commented content,
    // reels included. Routing those on their name alone is what opened the
    // story viewer on an unrelated story when the user tapped a comment
    // notification for a réel.
    private func socialSurface(_ ctx: NotificationNavContext, postId: String) -> NotificationContentSurface {
        NotificationContentRouter.surface(
            postType: ctx.postType,
            contentType: ctx.contentType,
            notificationType: ctx.type,
            storyLifecycleHint: StoryService.shared.cachedPost(id: postId)?.expiresAt != nil
        )
    }

    /// Opens the entity a social notification points at, on the surface the
    /// router resolved. Shared by the social branch and by the mention branch —
    /// a mention lives either in a conversation OR in a post/comment, and the
    /// latter used to dead-end because the mention branch only knew about
    /// conversations.
    private func openSocialContent(_ ctx: NotificationNavContext, postId: String) {
        DetailOpenSources.shared.markOpenedFromNotification(postId)
        // Story, réel ou feuille en cours : le routeur les referme d'abord, par
        // le site des conversations (#10543) — la cible ne s'ouvre plus dessous.
        router.clearPresentedSurfaces { _ in showSocialContent(ctx, postId: postId) }
    }

    private func showSocialContent(_ ctx: NotificationNavContext, postId: String) {
        switch socialSurface(ctx, postId: postId) {
        case .reel:
            // The user tapped a notification about a réel — it must land on the
            // réel in the immersive viewer, never on the story target screen
            // (which would resolve an unrelated story) nor on the flat detail.
            openReelFromNotification(
                postId: postId,
                commentId: ctx.commentId,
                parentCommentId: ctx.parentCommentId
            )

        case .story:
            // Phase G — ephemeral entities route to the notification target
            // screen, which redirects into the viewer (comments overlay /
            // reactions sheet) or surfaces the expired empty state when the
            // content is gone.
            router.push(NotificationContentRouter.ephemeralRoute(
                postId: postId, notificationType: ctx.type, context: ctx.storyContext,
                commentId: ctx.commentId, parentCommentId: ctx.parentCommentId
            ))

        case .post:
            router.push(.postDetail(
                postId,
                nil,
                showComments: ctx.opensComments,
                commentId: ctx.commentId,
                parentCommentId: ctx.parentCommentId
            ))
        }
    }

    func navigateFromNotification(_ ctx: NotificationNavContext) {
        switch ctx.type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .legacyStoryReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = ctx.conversationId, !conversationId.isEmpty else {
                // A mention lives EITHER in a conversation OR in a post/comment
                // (`createPostMentionNotificationsBatch` /
                // `createCommentMentionNotificationsBatch` ship a `postId` and
                // no `conversationId`). Without this fallback the tap was a
                // dead end for every mention made outside a chat.
                if let postId = ctx.postId, !postId.isEmpty {
                    openSocialContent(ctx, postId: postId)
                }
                return
            }
            conversationOpener.navigateToConversationById(conversationId, highlightMessageId: ctx.messageId)

        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted,
             .contactJoined, .contactRecentlyActive, .legacyStatusUpdate:
            if let senderId = ctx.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: ctx.senderUsername ?? senderId
                )
            }

        case .communityInvite, .communityJoined, .communityLeft,
             .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
             .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                conversationOpener.navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                conversationOpener.navigateToConversationById(conversationId)
            }

        // Guideline 5 (MIIT) — China-region incoming-call push. This is the
        // ONLY affordance a backgrounded/killed-app China user has to engage
        // an incoming call (no CallKit, no PushKit VoIP registration — see
        // VoIPPushManager.shouldRegisterVoIPPush). A plain conversation
        // deep-link would neither negotiate WebRTC nor show an answer UI, so
        // this drives the same call-answer flow the socket-delivered
        // foreground path already uses.
        case .incomingCallAlert:
            guard let callId = ctx.callId, !callId.isEmpty else {
                // Malformed/legacy payload without a callId — fall back to
                // the conversation so the tap is never a dead end.
                if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                    conversationOpener.navigateToConversationById(conversationId)
                }
                return
            }
            CallManager.shared.handleIncomingCallAlertTap(
                callId: callId,
                fromUserId: ctx.callerUserId ?? "",
                fromUsername: ctx.callerName ?? ctx.senderUsername ?? "",
                isVideo: ctx.isVideoCall,
                iceServers: VoIPPushManager.parseIceServers(ctx.iceServersJSON),
                conversationId: ctx.conversationId
            )

        // ===== SOCIAL CONTENT =====
        // One decision point for every social notification: the surface comes
        // from `socialSurface` (metadata discriminant first), the story intent
        // from the notification type. Never from the type alone.
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction, .contentRemoved,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            guard let postId = ctx.postId, !postId.isEmpty else {
                // No entity to open — some legacy social pushes only carry the
                // conversation. Never a dead end.
                if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                    conversationOpener.navigateToConversationById(conversationId)
                }
                return
            }
            // Le MÊME site que la mention hors conversation : la surface en
            // cours se referme, puis la cible s'ouvre (#10543).
            openSocialContent(ctx, postId: postId)

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned:
            // Un palier annoncé ouvre le tableau de bord qui le RESTITUE
            // (#5698) — pas les statistiques, qui ne connaissent pas ces paliers.
            //
            // Et il se CÉLÈBRE d'abord (#5809) : `EngagementRevealHost` couvre
            // le tableau de bord dès que ce palier est posé. `nil` quand la
            // charge ne dit pas lequel — on n'en invente pas, et le tap se
            // comporte alors exactement comme avant.
            router.pendingEngagementReveal = ctx.reveal
            // … puis ouvre la FICHE de son concept, au-dessus de la première page (#9564, carte de navigation).
            router.openGame(at: GameNavigationMap.entry(for: ctx.type) ?? .progression)

        case .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep, .gameMissionWindow:
            // Une notification du jeu (#9490, #9539) ouvre l'écran que la carte de navigation nomme (#9564) : le
            // Classement pour un duo ou un résultat de ligue, la Saison pour une étape, la fiche des Missions à ses
            // gestes — posé sur son chemin complet, le retour remonte la chaîne. Le type décide, jamais la métadonnée.
            router.openGame(at: GameNavigationMap.entry(for: ctx.type) ?? .progression)

        case .legacyAffiliateSignup:
            router.push(.affiliate)

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady, .reportResolved:
            // Pas d'entité cible : ouvrir la liste des notifications plutôt
            // qu'un tap muet — l'utilisateur retrouve au moins la notification
            // (et son détail) qu'il vient de toucher.
            router.push(.notifications)
        }
    }

    /// Opens the full-screen reel viewer for a reel-flavoured social
    /// notification. The reels feed (`getReels(seedReelId:)`) deliberately
    /// EXCLUDES the seed reel, so the target reel must be injected as the pager's
    /// seed — otherwise the pager opens on the first affinity reel (the original
    /// "wrong post" bug). Cache first, ONE request, and the reader's own failure
    /// state when it fails: the decision is `ReelNotificationOpener` (#6508).
    func openReelFromNotification(postId: String, commentId: String? = nil, parentCommentId: String? = nil) {
        Task { @MainActor in
            await revealReelFromNotification(postId: postId, commentId: commentId, parentCommentId: parentCommentId)
        }
    }

    func revealReelFromNotification(postId: String, commentId: String?, parentCommentId: String?) async {
        // La même porte que le lien `/reel/<id>` et que l'iPad (#7805, #7806).
        // Trouvé mais NON réel (le pager filtre sur `isReel`) : la surface
        // post universelle le rend, semée du post déjà chargé, en CONSERVANT
        // la cible commentaire.
        await ReelDoor.live.open(postId: postId, commentId: commentId, parentCommentId: parentCommentId) { post in
            router.push(.postDetail(postId, post, showComments: commentId != nil,
                                    commentId: commentId, parentCommentId: parentCommentId))
        }
    }
}
