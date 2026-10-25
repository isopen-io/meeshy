import SwiftUI
import MeeshySDK
import os

/// Le corps des crochets de cycle de vie de l'APPLICATION (`AppLifecycleHooks`).
///
/// Ils vivaient dans les `adaptiveOnChange(of: scenePhase)` et
/// `adaptiveOnChange(of: authManager.isAuthenticated)` de la fenêtre principale,
/// et mouraient avec elle quand l'iPad la fermait en gardant une fenêtre
/// détachée. Ils ne touchent que des services partagés : aucun état de vue.
extension MeeshyApp {
    /// Branché une fois, depuis `init()` : avant que la moindre fenêtre ne monte.
    static func installApplicationLifecycleHooks() {
        AppLifecycleHooks.shared.install(
            authentication: AuthManager.shared.$isAuthenticated.eraseToAnyPublisher(),
            isAuthenticated: { AuthManager.shared.isAuthenticated },
            handlers: .init(
                becameActive: { applicationBecameActive(returnsFromBackground: $0) },
                enteredBackground: { applicationEnteredBackground() },
                authenticationChanged: { sessionChanged(isAuthenticated: $0) }
            )
        )
    }

    static func applicationBecameActive(returnsFromBackground: Bool) {
            // #7000 — ici vivait `removeAllDeliveredNotifications()` :
            // TOUTES les bannières livrées effacées à chaque retour au
            // premier plan, celles d'autres conversations comprises,
            // même sans session, et sans rien rafraîchir derrière. On
            // vidait le seul endroit où l'utilisateur pouvait lire ce
            // qu'il avait manqué, en laissant cloche et badge périmés.
            // Le geste juste est l'inverse : relire (liste + compteur).
            // Les bannières ne partent plus qu'à la consommation de ce
            // qu'elles annoncent.
            NotificationGapResyncCoordinator.shared.refreshOnForeground()
            // IL8 (#11286) — lancement à froid ET retour au premier plan :
            // une autre application a pu remplir le volume pendant que la
            // nôtre ne faisait que lire. Passe hors du fil principal, bornée
            // à une toutes les dix minutes.
            DiskPressureSweeper.shared.requestSweep()
            // CALL-FIX 2026-06-06 — tell the gateway we're foreground so
            // incoming calls use the in-app banner (socket) instead of a
            // VoIP push / CallKit.
            MessageSocketManager.shared.emitAppForeground(true)
            ConversationViewingReporter.shared.setForeground(true)
            Task { await AuthManager.shared.refreshCurrentUserProfile() }
            // Only rearm the socket + backfill if we ACTUALLY backgrounded.
            // A transient .inactive→.active (Control Center, notification
            // banner, app-switcher peek, Face ID) never suspended the
            // socket, so force-reconnecting a healthy socket here is pure
            // churn — disconnect/reconnect + the presence-refresh loop (#11).
            // Cold launch also lands here with the flag false: RootView's
            // own connect() handles the initial connection.
            if returnsFromBackground {
                Task { await handleForegroundTransition() }
            }
            // Drain any mark-as-read actions the user tapped from the
            // widget while the app was suspended.
            Task { await WidgetActionFlusher.shared.flush() }
    }

    static func applicationEnteredBackground() {
            // CALL-FIX 2026-06-06 — tell the gateway we're backgrounded
            // FIRST (while the socket is still alive, before the
            // coordinator may suspend it) so incoming calls fall back to
            // a VoIP push (CallKit) — a suspended socket can't ring.
            MessageSocketManager.shared.emitAppForeground(false)
            ConversationViewingReporter.shared.setForeground(false)
            // Delegate the whole background entry to a single
            // coordinator guarded by a beginBackgroundTask. The
            // coordinator owns the order (stop players → flush
            // caches → ack pushes → stop heartbeats → schedule
            // BGTasks → sync widgets) and guarantees the task id
            // is ended even if a step throws.
            Task { await BackgroundTransitionCoordinator.shared.enterBackground() }
            // Persist current dwell/watch into the open engagement
            // rows so an OS kill while suspended is recovered as a
            // truncated session at next boot (no network flush here —
            // background time is too scarce, the resume/boot paths flush).
            Task { await EngagementTracker.shared.checkpointAll() }
    }

    static func sessionChanged(isAuthenticated isAuth: Bool) {
        let context = sessionTransitionContext(isAuthenticated: isAuth)
        if isAuth {
            SessionTransitionPlan.opening(context).forEach(performOpeningStep)
        } else {
            SessionTransitionPlan.closing(context).forEach(performClosingStep)
        }
    }

    private static func sessionTransitionContext(isAuthenticated isAuth: Bool) -> SessionTransitionContext {
        SessionTransitionContext(
            userId: isAuth ? AuthManager.shared.currentUser?.id : nil,
            friendshipsHydrated: FriendshipCache.shared.isHydrated,
            hasActiveCall: CallManagerHost.shared.manager?.callState.isActive == true
        )
    }

    private static func performOpeningStep(_ step: SessionOpeningStep) {
        switch step {
        case .tagCrashReports(let userId):
            CrashDiagnosticsManager.shared.setUserID(userId)
        case .replayShareLinkAwaitingAccount:
            DeepLinkRouter.shared.replayShareLinkAwaitingAccount()
        case .startNotificationCoordinators:
            NotificationCoordinator.shared.widgetSink = WidgetDataManager.shared
            NotificationCoordinator.shared.start()
            NotificationGapResyncCoordinator.shared.start()
        case .startCache:
            Task { await CacheCoordinator.shared.start() }
        case .configureStoryPublishing:
            StoryPublishService.shared.configure()
        case .hydrateFriendships:
            Task { await FriendshipCache.shared.hydrate() }
        case .reconnectSockets:
            MessageSocketManager.shared.forceReconnect()
            SocialSocketManager.shared.forceReconnect()
        case .activateConversationStoreBridge:
            ConversationStoreSocketBridge.shared.activate(
                onReadingModePreferenceChanged: { conversationId, rawReadingMode in
                    guard LentilleFeatureFlag.isReadingModesEnabled,
                          let value = ReadingModePreference(rawValue: rawReadingMode)
                    else { return }
                    Task {
                        await LentilleReadingModePreferenceCenter.shared.set(
                            conversationId: conversationId, value: value, optimistic: false
                        )
                    }
                }
            )
        case .promptPushPermission:
            Task { await PushPermissionPrompt.onSessionOpened(origin: AuthManager.shared.sessionOrigin) }
        case .refreshUnreadCount:
            Task { await NotificationToastManager.shared.refreshUnreadCount() }
        case .reRegisterPushTokens:
            PushNotificationManager.shared.reRegisterTokenIfNeeded()
            VoIPPushManager.shared.forceReregister()
        case .startEndToEnd(let userId):
            // #3707 — plus aucun bundle hérité (`/signal/keys`) n'est publié : l'annuaire
            // libsignal par appareil le remplace, et les anciens clients le lisent encore.
            EndToEndSessionBridge.shared.start(userId: userId ?? "")
        case .migrateKeychain:
            Task { await SessionManager.shared.migrateKeychainIfNeeded() }
        }
    }

    private static func performClosingStep(_ step: SessionClosingStep) {
        switch step {
        case .untagCrashReports:
            CrashDiagnosticsManager.shared.setUserID(nil)
        case .resetNotifications:
            NotificationToastManager.shared.reset()
            NotificationCoordinator.shared.reset()
        case .clearFriendships:
            FriendshipCache.shared.clear()
        case .clearE2EESessions:
            Task { await SessionManager.shared.clearSessions() }
        case .stopEndToEnd:
            EndToEndSessionBridge.shared.stop()
            // #10789 — le clair des pièces chiffrées de bout en bout ne survit pas à la session.
            Task { await EndToEndAttachmentVault.shared.wipe() }
        case .unbindCache:
            CacheAccountBinder.shared.bind(nil)
            Task { await CacheCoordinator.shared.stop() }
        case .unregisterVoIP:
            Task { await VoIPPushManager.shared.unregisterAndClearToken() }
        case .endActiveCall:
            CallManager.shared.endCall()
        case .disconnectSockets:
            MessageSocketManager.shared.disconnect()
            SocialSocketManager.shared.disconnect()
        case .stopSocketRelays:
            ConversationStoreSocketBridge.shared.deactivate()
            Task { await ConversationSyncEngine.shared.stopSocketRelay() }
        case .cancelBackgroundTasks:
            BackgroundTaskManager.shared.cancelAllScheduled()
        }
    }

    private static func handleForegroundTransition() async {
        guard AuthManager.shared.isAuthenticated else {
            // Sans compte, la base suspendue à la mise en arrière-plan se relève quand même (#7059), et
            // l'invité retrouve son socket.
            BackgroundTransitionCoordinator.shared.resumeWithoutSession()
            return
        }
        // Coordinator rearms the sockets (force reconnect), flushes pending
        // delivery receipts and drives the conversation sync. We do NOT
        // check `isConnected` here — that flag is unreliable after iOS
        // suspension because the Socket.IO `disconnect` callback may not
        // fire when the OS kills the WebSocket. The coordinator forces a
        // fresh disconnect + connect cycle regardless of the flag state.
        await BackgroundTransitionCoordinator.shared.resumeFromBackground()
    }
}
