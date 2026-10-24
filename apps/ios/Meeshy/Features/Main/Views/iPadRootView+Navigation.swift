import SwiftUI
import MeeshySDK
import os

// MARK: - Sélection de la colonne de détail

/// Règle pure : la colonne de détail se referme quand la conversation qu'elle montre quitte la liste.
nonisolated enum iPadSelectionRule {
    static func closesDetail(activeConversationId: String?, removedId: String) -> Bool {
        activeConversationId == removedId
    }
}

// MARK: - iPad Root View Navigation Helpers

extension iPadRootView {

    func openConversation(_ conversation: Conversation) {
        // Do NOT clear router.pendingReplyContext here: when openConversation is
        // invoked through navigateToStoryReply, the context was just set and must
        // survive until ConversationView consumes it. ConversationView clears it
        // in .onAppear (see rightColumn).
        // Story, réel ou plein écran en cours : le routeur les referme d'abord
        // (#10539) — le site unique, partagé avec l'iPhone. Puis la porte du
        // verrou PIN (#11386) : la colonne de détail ne reçoit une conversation
        // verrouillée qu'après le PIN, quel que soit le chemin qui l'ouvre.
        router.clearPresentedSurfaces { _ in
            router.admitConversation(conversation, alreadyShowing: activeConversation?.id == conversation.id) {
                placeConversation(conversation)
            }
        }
    }

    /// Pose la conversation dans la colonne de détail, SANS repasser la porte :
    /// réservé à ce que le routeur a déjà admis (`onRouteRequested`).
    func placeConversation(_ conversation: Conversation) {
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

            if let landing = resolution.landing(identifier: identifier) {
                shareLinkChoice = landing
                return
            }
            guard case .openConversation(let conversationId) = resolution.intent else {
                joinViaShareLink(identifier: identifier)
                return
            }
            navigateToConversationById(conversationId)
        }
    }

    // MARK: - Deep Link Handling

    func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        // Story, réel, composer ou feuille en cours : refermés d'ABORD, comme
        // pour un tap de notification (#10543). Seules les conversations le
        // faisaient ; un lien vers un post, un tag, une communauté ou un profil
        // s'ouvrait SOUS la couverture, et le tap semblait sans effet.
        router.clearPresentedSurfaces { _ in showDeepLink(deepLink) }
    }

    private func showDeepLink(_ deepLink: DeepLink) {
        switch deepLink {
        case .callRequest(let conversationId, let isVideo):
            // Le lien d'appel ne compose pas : il DEMANDE (feuille de
            // confirmation). Mise à jour forcée et barrière d'âge passent avant.
            let upgradeGate = self.upgradeGate
            let gatesOpen: @MainActor () -> Bool = {
                !upgradeGate.isBlocked && !AgeGateController.shared.isShowing
            }
            Task { @MainActor in
                await CallLinkConfirmationController.shared.request(
                    conversationId: conversationId, isVideo: isVideo, gatesOpen: gatesOpen)
            }
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
        case .reel(let postId):
            // Même porte que l'iPhone : le lecteur de réels (#7805, #7806).
            openReel(postId: postId)
        case .storyDetail(let postId):
            // La même porte que l'iPhone (#7807) : le lecteur s'ouvre sur
            // CETTE story, chargée si le tray l'ignore ; le détail du post
            // n'est que le repli d'une story expirée ou supprimée.
            Task { @MainActor in
                await StoryDoor(tray: storyViewModel, viewer: storyViewerCoordinator)
                    .open(postId: postId) { rightPanelRoute = .postDetail(postId) }
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
        case .community(let id):
            rightPanelRoute = .communityDetail(id)
        case .unreadConversations:
            // Widgets « Non lus » (#7811) : la liste sur le filtre de la puce. Le panneau ouvert la cachait —
            // l'iPhone revient à la racine, l'iPad referme le panneau.
            rightPanelRoute = nil
            conversationViewModel.selectedFilters = ConversationListEntry.unreadFilters
        case .recentConversation:
            // App Shortcut « Open Recent Conversation » et widget (#7811).
            if let id = ConversationListEntry.recentConversationId(in: conversationViewModel.conversations) {
                navigateToConversationById(id)
            }
        case .externalLink(let url):
            // Cible EXTERNAL d'un `/l/<token>` : elle s'ouvre, elle ne se
            // rejoint pas. Même geste que `RootView`.
            UIApplication.shared.open(url)
        case .game(let link):
            // Même porte que l'iPhone (#9947) : la chaîne du Jeu, dans le panneau.
            router.openGame(at: GameNavigationMap.entry(for: link))
        case .packShop(let domain, let pack):
            router.openPackShop(domain: domain, pack: pack)
        case .unresolvedTrackedLink:
            FeedbackToastManager.shared.showError(
                String(localized: "deepLink.tracked.unresolved",
                       defaultValue: "Ce lien n'a pas pu être ouvert",
                       bundle: .main)
            )
        case .magicLink, .emailVerificationLink:
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
                // Le coordinateur, comme l'iPhone : la requête porte son uid. Le couple @State de l'ancien
                // chemin pouvait présenter le lecteur avant que l'uid ne soit posé — « Story introuvable ».
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: storyViewModel.storyGroups[groupIdx].id,
                    postId: postId
                ))
            } else {
                rightPanelRoute = .postDetail(postId)
            }
        } else {
            switch routeName {
            case "userStats": rightPanelRoute = .userStats
            case "progression": rightPanelRoute = .progression
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
        router.navigateToStoryReply(context, conversationList: conversationViewModel)
    }

    // MARK: - Notification taps — UN aiguillage, comme l'iPhone
    //
    // Les trois sources de tap (liste, bannière en direct, push) passent par le MÊME contexte que l'iPhone
    // (`RootView.NotificationNavContext`) et le MÊME aiguillage ci-dessous. Trois gestionnaires recopiés
    // divergeaient : un repli présent sur iPhone manquait à l'un ou l'autre côté iPad, une ancienne demande d'ami
    // était muette dans la bannière, une notification de message sans conversation l'était dans la liste
    // (audits de parité du 2026-10-14). Seules les ACTIONS diffèrent de l'iPhone — colonne droite, panneau —,
    // jamais la décision.

    func handleNotificationTap(_ notification: APINotification) {
        navigateFromNotification(RootView.NotificationNavContext(from: notification))
    }

    func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        navigateFromNotification(RootView.NotificationNavContext(from: event))
    }

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        navigateFromNotification(RootView.NotificationNavContext(from: payload))
    }

    private func openSocialContent(_ ctx: RootView.NotificationNavContext, postId: String) {
        routeSocialNotification(
            postId: postId,
            postType: ctx.postType,
            contentType: ctx.contentType,
            type: ctx.type,
            commentId: ctx.commentId,
            parentCommentId: ctx.parentCommentId,
            storyContext: ctx.storyContext
        )
    }

    func navigateFromNotification(_ ctx: RootView.NotificationNavContext) {
        switch ctx.type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .legacyStoryReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = ctx.conversationId, !conversationId.isEmpty else {
                // Une mention vit SOIT dans une conversation SOIT dans un post ou un commentaire : jamais un tap muet.
                if let postId = ctx.postId, !postId.isEmpty {
                    openSocialContent(ctx, postId: postId)
                }
                return
            }
            navigateToConversationById(conversationId, highlightMessageId: ctx.messageId)

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
                navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        // Guideline 5 (MIIT) — appel entrant de la région Chine : sans CallKit ni PushKit VoIP, ce tap est le seul
        // moyen de décrocher. Même flux que l'iPhone ; sans callId, la conversation.
        case .incomingCallAlert:
            guard let callId = ctx.callId, !callId.isEmpty else {
                if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                    navigateToConversationById(conversationId)
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

        // ===== SOCIAL CONTENT — la surface vient de `NotificationContentRouter` (`routeSocialNotification`) =====
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction, .contentRemoved,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            guard let postId = ctx.postId, !postId.isEmpty else {
                // Certaines anciennes notifications sociales ne portent que la conversation : jamais un tap muet.
                if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                    navigateToConversationById(conversationId)
                }
                return
            }
            openSocialContent(ctx, postId: postId)

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned:
            // Le palier se CÉLÈBRE d'abord (#5809) — `nil` quand la charge ne dit pas lequel (push) — puis la fiche
            // de son concept s'ouvre sur son chemin complet (#9564).
            router.pendingEngagementReveal = ctx.reveal
            router.openGame(at: GameNavigationMap.entry(for: ctx.type) ?? .progression)

        case .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep, .gameMissionWindow:
            // Une notification du jeu (#9490, #9539) ouvre l'écran que la carte de navigation nomme (#9564).
            router.openGame(at: GameNavigationMap.entry(for: ctx.type) ?? .progression)

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady, .reportResolved:
            // Pas d'entité cible : le panneau des notifications plutôt qu'un tap muet.
            rightPanelRoute = .notifications
        }
    }

    // MARK: - Navigate to Conversation by ID

    /// #6998 — jumelle de `RootView.navigateToConversationById`, et le
    /// paramètre `ensureUnread` y disparaît pour la même raison : il forçait
    /// `unreadCount = 1` hors de tout store, sur la seule ouverture par
    /// notification, ouvrant la conversation sur un non-lu FICTIF. Le compteur
    /// appartient au registre de lecture ; aucune vue ne le fabrique.
    func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil) {
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            if let messageId = highlightMessageId {
                router.pendingHighlightMessageId = messageId
                router.pendingHighlightConversationId = conversationId
            }
            openConversation(existing)
            return
        }
        Task {
            // Le cache d'abord, comme `RootView` : un push touché à froid — la liste pas encore chargée — ou
            // hors ligne ouvre le fil de la session précédente au lieu de buter sur le réseau.
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                if let messageId = highlightMessageId {
                    router.pendingHighlightMessageId = messageId
                    router.pendingHighlightConversationId = conversationId
                }
                openConversation(cached)
                return
            }
            // Phase: navigate-from-notification timing race. Same retry-once
            // pattern as `RootView.navigateToConversationById` — a push for
            // a freshly-created conversation can land before the gateway
            // commit is visible to the recipient's auth context.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            for attempt in 0..<2 {
                do {
                    let apiConv = try await ConversationService.shared.getById(conversationId)
                    let conv = apiConv.toConversation(currentUserId: currentUserId)
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
        guard let conversationId = event.conversationId, !conversationId.isEmpty, ConversationOpenRoute.mayPreview(conversationId) else {
            handleSocketNotificationTap(event)
            return
        }
        suppressToastTap = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { suppressToastTap = false }
        HapticFeedback.medium()
        notifications.manager.dismissToast()

        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            sheetTargets.notificationPreview = existing
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
                sheetTargets.notificationPreview = cached
                return
            }
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                sheetTargets.notificationPreview = apiConv.toConversation(currentUserId: currentUserId)
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
    // A réel opens in the immersive reel reader — the same `ReelDoor` as
    // iPhone (#7806; `iPadCoversAndChromeLayer` mounts `ReelsPresenter`) —
    // and is NEVER sent to the story notification screen, which would resolve
    // an unrelated story.

    func routeSocialNotification(
        postId: String,
        postType: String?,
        contentType: String?,
        type: MeeshyNotificationType,
        commentId: String?,
        parentCommentId: String?,
        storyContext: StoryNotificationContext
    ) {
        DetailOpenSources.shared.markOpenedFromNotification(postId)
        let surface = NotificationContentRouter.surface(
            postType: postType,
            contentType: contentType,
            notificationType: type,
            storyLifecycleHint: StoryService.shared.cachedPost(id: postId)?.expiresAt != nil
        )
        // Story, réel ou feuille en cours : le routeur les referme d'abord, par
        // le site des conversations (#10543) — la cible ne s'ouvre plus dessous.
        router.clearPresentedSurfaces { _ in
            showSocialSurface(surface, postId: postId, type: type, commentId: commentId,
                              parentCommentId: parentCommentId, storyContext: storyContext)
        }
    }

    private func showSocialSurface(
        _ surface: NotificationContentSurface,
        postId: String,
        type: MeeshyNotificationType,
        commentId: String?,
        parentCommentId: String?,
        storyContext: StoryNotificationContext
    ) {
        switch surface {
        case .story:
            router.push(NotificationContentRouter.ephemeralRoute(
                postId: postId, notificationType: type, context: storyContext,
                commentId: commentId, parentCommentId: parentCommentId
            ))
        case .reel:
            openReel(postId: postId, commentId: commentId, parentCommentId: parentCommentId)
        case .post:
            rightPanelRoute = .postDetail(
                postId,
                nil,
                showComments: NotificationContentRouter.opensComments(type),
                commentId: commentId,
                parentCommentId: parentCommentId
            )
        }
    }

    /// Ouvre un réel nommé par la porte partagée avec l'iPhone (#7806). Un post
    /// trouvé qui n'est pas un réel se rend dans la colonne droite, semé du
    /// post déjà chargé et avec sa cible commentaire.
    func openReel(postId: String, commentId: String? = nil, parentCommentId: String? = nil) {
        Task { @MainActor in
            await revealReel(postId: postId, commentId: commentId, parentCommentId: parentCommentId)
        }
    }

    func revealReel(postId: String, commentId: String?, parentCommentId: String?) async {
        await ReelDoor.live.open(postId: postId, commentId: commentId, parentCommentId: parentCommentId) { post in
            rightPanelRoute = .postDetail(postId, post, showComments: commentId != nil,
                                          commentId: commentId, parentCommentId: parentCommentId)
        }
    }
}
