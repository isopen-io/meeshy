import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// Sorti de `RootView.swift` : le démarrage des services de la racine et le routage des routes poussées.

extension RootView {
    // MARK: - Démarrage de la racine

    /// Le corps du `.task` de la racine, monté par `RootStoryDoorsLayer` :
    /// connexion socket, abonnements, exécuteur de publication, chargements
    /// parallèles. Écrit ICI parce que la racine possède tout ce qu'il touche.
    func startRootServices() async {
        // Connect Socket.IO early so the backend knows we're online
        MessageSocketManager.shared.connect()
        statusViewModel.subscribeToSocketEvents()
        // Sans cet appel, le SDK reçoit bien `story:created` /
        // `story:updated` / `story:deleted` mais personne n'est sink'é
        // sur les publishers de SocialSocketManager → les stories des
        // amis n'arrivent jamais dans `storyGroups` en temps réel.
        storyViewModel.subscribeToSocketEvents()
        // Même raison, pour le feed : `FeedSocketHandler` est le SEUL
        // écrivain disque de post:created/updated/reposted, des
        // commentaires et des réactions. Armé par `FeedView` et désarmé à
        // sa disparition, il ratait tout ce qui arrivait ailleurs dans
        // l'app. `arm()` est idempotent — jamais désarmé.
        await RealtimeRelays.arm()

        // Deferred cleanup
        Task.detached(priority: .background) {
            guard await cancellableSleep(for: .seconds(5)) else { return }
            await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
        }

        // Observe sync events for conversation list
        conversationViewModel.observeSync()

        #if DEBUG
        // Pré-résout à pile courte les métadonnées du 1er rendu de
        // ConversationView (classe de crashs stack-overflow du décodeur
        // Swift sur device Debug — cf. ConversationFirstRenderWarmup).
        ConversationFirstRenderWarmup.run()
        #endif

        // Réponse à un mood (confirmée via pop-up, ou immédiate en DM) :
        // résout/ouvre la DM avec l'auteur et amorce le composer.
        StatusBubbleController.shared.onConfirmedReply = { entry in
            router.navigateToStoryReply(
                .status(statusId: entry.id, authorId: entry.userId,
                        authorName: entry.username, emoji: entry.moodEmoji,
                        content: entry.content, publishedAt: entry.createdAt),
                conversationList: conversationViewModel
            )
        }

        // En conversation, la boule de mood ouvre la page plein écran de
        // l'humeur (#13987) — la même que la notification « nouvelle humeur ».
        StatusBubbleController.shared.onOpenSpotlight = { entry in
            router.push(.moodSpotlight(statusId: entry.id))
        }

        // Republication d'un mood : câblé ICI (hôte racine de la bulle)
        // — l'ancien branchement vivait dans un overlay mort de
        // ConversationListView, le bouton « Republier » n'agissait donc
        // jamais depuis la bulle du modifier.
        StatusBubbleController.shared.onRepublish = { entry in
            republishStatusEntry = entry
        }
        StatusBubbleController.shared.reactionHandler = statusViewModel.reactionHandler

        // Pilier 22 V3 wiring — register the StoryViewModel as the
        // queue's upload executor. setExecutor also registers the
        // queue's publish handler in the same call, so the M5 auto-
        // drain that fires next has a guaranteed-non-nil executor to
        // delegate to. Calling configure() at app boot (in MeeshyApp)
        // intentionally only sets up listeners — the handler is
        // registered HERE, atomic with the executor assignment, to
        // avoid the boot race that would burn retry budget on a
        // guaranteed-fail call.
        StoryPublishService.shared.setExecutor(storyViewModel)

        // C4b — plancher de version lu au démarrage. Best-effort et
        // SILENCIEUX : sans lui, un binaire périmé qui ne fait que LIRE ne
        // rencontre jamais de 426 et se croit à jour indéfiniment.
        // Parallélisé comme les autres : il ne doit rien retenir.
        async let versionFloor: Void = upgradeGate.checkFloor()
        async let storiesLoad: Void = storyViewModel.loadStories()
        async let statusesLoad: Void = statusViewModel.loadStatuses()
        async let conversationsLoad: Void = ConversationListVMOwner.loadAtLaunch(conversationViewModel)
        async let unreadRefresh: Void = notifications.manager.refreshUnreadCount()
        _ = await (storiesLoad, statusesLoad, conversationsLoad, unreadRefresh, versionFloor)
    }

    func handlePushNavigateToRoute(_ notification: Notification) {
        guard let routeName = notification.object as? String else { return }
        if routeName.hasPrefix("postDetail:") {
            let postId = String(routeName.dropFirst("postDetail:".count))
            router.push(.postDetail(postId))
        } else if routeName.hasPrefix("storyDetail:") {
            let postId = String(routeName.dropFirst("storyDetail:".count))
            if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: storyViewModel.storyGroups[groupIdx].id,
                    postId: postId
                ))
            } else {
                router.push(.postDetail(postId))
            }
        } else {
            switch routeName {
            case "userStats": router.push(.userStats)
            case "progression": router.push(.progression)
            case "affiliate": router.push(.affiliate)
            default: break
            }
        }
    }
}
