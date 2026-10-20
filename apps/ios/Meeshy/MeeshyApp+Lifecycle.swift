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
        // Tag every subsequent crash report with the active user
        // so we can filter the Crashlytics dashboard per account.
        // Cleared on logout to prevent the next user inheriting
        // the previous identity.
        CrashDiagnosticsManager.shared.setUserID(
            isAuth ? AuthManager.shared.currentUser?.id : nil
        )
        if isAuth {
            DeepLinkRouter.shared.replayShareLinkAwaitingAccount()
            // Re-arm every coordinator after a logout/login cycle.
            // `start()` is idempotent-guarded, so without the
            // matching `reset()` on the logout branch below the
            // second login would be a silent no-op and socket
            // publishers would be left without subscribers.
            NotificationCoordinator.shared.widgetSink = WidgetDataManager.shared
            NotificationCoordinator.shared.start()
            // A5.3 — resync notifications quand SyncSeqTracker
            // détecte un trou de séquence (_seq) sur notification:new.
            NotificationGapResyncCoordinator.shared.start()
            Task { await CacheCoordinator.shared.start() }
            // SOTA audit Pilier 22 V2 — register the publish-queue
            // handler + listeners so any pending stories from a
            // previous session start surfacing to the UI as soon
            // as the user authenticates.
            StoryPublishService.shared.configure()
            // Re-hydrate the friendship cache for the now-active
            // user. `MeeshyApp.task` only hydrates once per view
            // lifecycle, so without this call an account switch
            // (logout A → login B) would leave B with A's friend
            // graph until the next cold start.
            if !FriendshipCache.shared.isHydrated {
                Task { await FriendshipCache.shared.hydrate() }
            }
            // `MeeshyApp.task` only runs once per view lifecycle;
            // force a fresh socket connection so we don't rely on
            // any stale state carried over from a prior session.
            MessageSocketManager.shared.forceReconnect()
            SocialSocketManager.shared.forceReconnect()
            // Route conversation/category socket events (deleted,
            // reordered, category:×4) into ConversationStore /
            // UserCategoryStore. Idempotent (re-wires cleanly) and
            // the 6 publishers live on the socket singleton, so a
            // single activation after login survives reconnects.
            //
            // `onReadingModePreferenceChanged` — G-124, volet
            // « préférence serveur » de P7. Le SDK relaie la
            // valeur BRUTE reçue sur `user:preferences-updated`
            // (scope conversation) ; ici, et ici seulement, elle
            // devient un `ReadingModePreference` typé et atterrit
            // dans le MÊME magasin scopé que les trois autres
            // points d'entrée (encoche liste, sous-menu, fil
            // ouvert — `LentilleReadingModePreferenceCenter`,
            // `Lentille/Mode/LentilleReadingModeContext.swift`) :
            // ce n'est PAS un second canal, c'est une quatrième
            // écriture dans le magasin optimiste existant, qui
            // devient cache devant ce canal serveur (contrat
            // LWS-2bis, en-tête de `ReadingModePreferenceStoring`).
            // Gate sur le MÊME drapeau que ces trois surfaces —
            // écrire sous drapeau OFF n'aurait aucun lecteur, mais
            // couper la garde ferait dépendre R19 d'une future
            // purge plutôt que d'un simple gate au point d'écriture.
            // Une valeur brute hors des 5 cas gelés (`rawValue:`
            // échoue) est ignorée — jamais une préférence
            // fabriquée depuis une chaîne inconnue.
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
            Task { await PushPermissionPrompt.onSessionOpened(origin: AuthManager.shared.sessionOrigin) }
            Task { await NotificationToastManager.shared.refreshUnreadCount() }
            PushNotificationManager.shared.reRegisterTokenIfNeeded()
            // Force a PushKit re-registration on every login so the
            // gateway UPSERT-by-(userId,token,type) flips back to
            // isActive=true any device row deactivated during a
            // previous BadDeviceToken burst. register() alone is a
            // no-op when voipRegistry is already set.
            VoIPPushManager.shared.forceReregister()
            Task {
                do {
                    let bundle = try E2EEService.shared.generatePublicBundle()
                    try await E2EAPI.shared.uploadBundle(bundle: bundle)
                } catch {
                    Logger.e2ee.error("E2EE bundle upload failed: \(error)")
                }
            }
            Task { await SessionManager.shared.migrateKeychainIfNeeded() }
            // A push tapped from the login screen leaves a pending
            // payload on `PushNotificationManager`; the root view
            // mounted by this login transition consumes it directly
            // via its `$pendingNotificationPayload` subscription
            // (the published value is replayed to that late
            // subscriber), so no manual hop is needed here.
        } else {
            NotificationToastManager.shared.reset()
            NotificationCoordinator.shared.reset()
            // Clear the in-memory friendship graph BEFORE the
            // cache purge so any view that re-renders during the
            // transition can't read user A's friend list.
            FriendshipCache.shared.clear()
            // Wipe the Signal/E2EE material — IdentityKey,
            // SignedPreKey, per-peer SymmetricKeys, peer list.
            // Without this, user B logging in next would
            // generate a public bundle from user A's leftover
            // IdentityKey and upload it under their own
            // account — a hard cross-account identity leak.
            Task { await SessionManager.shared.clearSessions() }
            // #8674 — le cache n'est plus vidé ici : la sortie de
            // session le lie à « personne », en mettant de côté
            // celui d'un compte gardé et en effaçant celui d'un
            // compte déconnecté. Sans effet quand c'est déjà fait ;
            // le coordinateur est seulement démonté pour que le
            // `start()` suivant réarme.
            CacheAccountBinder.shared.bind(nil)
            Task { await CacheCoordinator.shared.stop() }
            // Purge the device's VoIP registration (PushKit +
            // keychain-backed token record) — without this, a
            // different user logging in on this device inherits
            // user A's VoIP push registration until the
            // registration cooldown naturally expires.
            Task { await VoIPPushManager.shared.unregisterAndClearToken() }
            // End any active call before the sockets go down —
            // otherwise the call is orphaned locally: the peer
            // keeps ringing/connecting to a device that vanished
            // without sending a hangup signal.
            if CallManagerHost.shared.manager?.callState.isActive == true {
                CallManager.shared.endCall()
            }
            MessageSocketManager.shared.disconnect()
            SocialSocketManager.shared.disconnect()
            // Close store and sync-engine lanes: no queued event of user A may mutate state after logout.
            ConversationStoreSocketBridge.shared.deactivate()
            Task { await ConversationSyncEngine.shared.stopSocketRelay() }
            // startup-08 — une BGTask soumise avant le logout ne
            // doit pas survivre pour réveiller un appareil
            // déconnecté (delta sync 401 en boucle, prefetch sur
            // cache vidé).
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
