import SwiftUI
import Combine
import UserNotifications
import MeeshySDK
import MeeshyUI
import os

@main
struct MeeshyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    private let dependencies = DependencyContainer.shared
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var toastManager = FeedbackToastManager.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @StateObject private var deepLinkRouter = DeepLinkRouter.shared
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var a11yPrefs = MeeshyAccessibilityPreferences.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    // Splash : shown ALWAYS on cold start, regardless of auth state, until the
    // boot work in `.task` finishes (session check + conversations cache
    // preload). Dismissed explicitly from the task once data is ready ; the
    // SplashScreen itself no longer auto-dismisses. A minimum elapsed time
    // (1.2s) is enforced so the animation never flashes when the cache is hot.
    @State private var showSplash = true
    @State private var hasCheckedSession = false
    @State private var activeGuestSession: GuestSession?
    @State private var crashReportsToShow: [CrashDiagnostic] = []
    @State private var showCrashSheet = false
    @State private var hasSurfacedCrashReports = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase

    private var shouldShowOnboarding: Bool {
        !hasCompletedOnboarding && !authManager.isAuthenticated
    }

    // Kept alive for the process lifetime so the Combine pipeline is never
    // deallocated. A static var on the App struct survives SwiftUI re-evaluations.
    private static var nearCapacityCancellable: AnyCancellable?

    init() {
        // Task 1.3 — register the BGProcessingTask identifier BEFORE the
        // scene is created. `BGTaskScheduler.register` MUST run before
        // `application(_:didFinishLaunchingWithOptions:)` returns, which
        // for SwiftUI apps means inside the App initializer. Registering
        // later (e.g. in `.task`) is a programmer error and crashes with
        // a clear "All launch handlers must be registered before
        // application finishes launching" exception. The coordinator
        // submits the request later, when `willTerminate` fires.
        CacheBackgroundFlushTask().register()

        // CALL-FIX 2026-06-05 — wire the "is a call active?" guard into both socket
        // managers. While a call is active, `forceReconnect()` (token rotation,
        // re-auth, lifecycle) is suppressed so the realtime socket carrying the
        // WebRTC signaling is never torn down mid-call (which strands the call on
        // "connecting" + leaves a phantom). The closure reads a thread-safe
        // nonisolated flag — the SDK stays call-agnostic (SDK purity).
        MessageSocketManager.shared.isCallActiveGuard = { CallManager.isCallActiveFlag }
        SocialSocketManager.shared.isCallActiveGuard = { CallManager.isCallActiveFlag }

        // Surface a one-shot toast when the offline outbox reaches 80% of its
        // 500-item capacity. removeDuplicates() in nearCapacityPublisher ensures
        // the toast fires exactly once per true→false→true crossing, not on
        // every new enqueue while near capacity.
        Self.nearCapacityCancellable = OfflineQueue.shared.nearCapacityPublisher
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { _ in
                Task { @MainActor in
                    FeedbackToastManager.shared.showError(
                        String(localized: "offline.queue.near_capacity",
                               defaultValue: "File d'envoi presque pleine — reconnectez-vous pour vider la file.",
                               bundle: .main)
                    )
                }
            }
    }

    var body: some Scene {
        WindowGroup {
            SystemThemeDetector {
                ZStack {
                    Group {
                        if authManager.isAuthenticated {
                            AdaptiveRootView()
                        } else if hasCheckedSession {
                            LoginView()
                                .iPadFormWidth()
                        }
                    }
                    .opacity(showSplash ? 0 : 1)

                    if showSplash {
                        // onFinish is kept as a no-op so the existing component
                        // signature is preserved ; dismissal is driven by the
                        // `.task` block once boot work completes.
                        SplashScreen(onFinish: {})
                            .transition(.opacity.combined(with: .scale(scale: 1.1)))
                            .zIndex(1)
                    }
                }
                .fullScreenCover(isPresented: .init(
                    get: { activeGuestSession != nil && !authManager.isAuthenticated },
                    set: { if !$0 { dismissGuestSession() } }
                )) {
                    if let guestSession = activeGuestSession {
                        GuestConversationContainer(
                            session: guestSession,
                            onSessionCreated: { ctx in
                                if !AnonymousSessionStore.save(ctx) {
                                    toastManager.showError(String(localized: "guest.session.save.error", defaultValue: "Unable to save session", bundle: .main))
                                }
                                activeGuestSession = GuestSession(identifier: guestSession.identifier, context: ctx)
                            },
                            onDismiss: { dismissGuestSession() }
                        )
                    }
                }
                .fullScreenCover(isPresented: .init(
                    get: { shouldShowOnboarding && !showSplash && activeGuestSession == nil },
                    set: { _ in }
                )) {
                    OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                }
                .overlay(alignment: .top) {
                    if let toast = toastManager.currentToast {
                        FeedbackToastView(toast: toast)
                            .transition(.feedbackToastReveal)
                            .padding(.top, MeeshySpacing.xxl)
                            .onTapGesture {
                                if let action = toastManager.onTapAction {
                                    action()
                                }
                                toastManager.dismiss()
                            }
                            .accessibilityIdentifier(MeeshyA11yID.toastContainer)
                            .zIndex(999)
                    }
                }
                .meeshyAnimation(MeeshyAnimation.springBouncy, value: toastManager.currentToast)
                .sheet(isPresented: $showCrashSheet) {
                    CrashReportSheet(reports: crashReportsToShow)
                }
                .environmentObject(authManager)
                .environmentObject(deepLinkRouter)
                .environment(\.meeshyForceReduceMotion, a11yPrefs.reduceMotion)
                .preferredColorScheme(theme.preferredColorScheme)
                .onOpenURL { url in
                    let destination = DeepLinkParser.parse(url)
                    if case .magicLink = destination {
                        handleAppLevelDeepLink(url)
                        return
                    }
                    let _ = deepLinkRouter.handle(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { userActivity in
                    guard let url = userActivity.webpageURL else { return }
                    let destination = DeepLinkParser.parse(url)
                    if case .magicLink = destination {
                        handleAppLevelDeepLink(url)
                        return
                    }
                    let _ = deepLinkRouter.handle(url: url)
                }
                .task {
                    // Splash : capture boot start so we can enforce a minimum
                    // 1.2s display time once data is ready. Without this, a
                    // hot-cache cold start would flash the splash away mid-
                    // animation.
                    let splashStart = ContinuousClock.now

                    ImageDownsamplingConfig.applyGlobal()
                    KeychainManager.shared.migrateToAfterFirstUnlock()
                    MeeshyConfig.shared.restoreEnvironment()
                    // Bridge iOS Focus filter selection into the SDK so in-app
                    // toasts respect the currently-active Focus filter.
                    NotificationToastManager.shared.focusFilterProvider = {
                        MeeshyFocusStore.shared.current.toSDKSnapshot()
                    }
                    // Local-First : résous le sous-titre des toasts de
                    // conversation (nom renommé + favori) depuis le snapshot
                    // local App Group, jamais le titre brut serveur.
                    NotificationToastManager.shared.conversationPresentationProvider = { conversationId in
                        WidgetDataManager.shared.conversationToastPresentation(forId: conversationId)
                    }
                    await CacheCoordinator.shared.start()
                    // Touch PresenceManager early so it has subscribed to
                    // `presence:snapshot` + `user:status` + `didReconnect`
                    // BEFORE the first socket auth lands. Without this, the
                    // very first snapshot emitted after a cold start could
                    // land before any view referencing PresenceManager.shared
                    // has been built, and PassthroughSubject would drop it.
                    _ = PresenceManager.shared
                    // Start NWPathMonitor at the very top of boot so the splash
                    // gating below can read a resolved `isOffline` (the keychain +
                    // session work between here and the socket-wait gives the
                    // initial path time to land). Without this early touch the
                    // monitor would first start at the gate and still report the
                    // optimistic `online` default, defeating the offline fast-path.
                    _ = NetworkMonitor.shared
                    // Wire StoryOfflineQueue publish handler + network-reconnect
                    // flush. Idempotent — safe to call on every cold start.
                    StoryOfflineQueueBootstrap.shared.start()
                    // Wire the outbox pool so OfflineQueue can persist every
                    // outbox kind (sendMessage, sendReaction, edit/delete,
                    // and the 14 non-message mutations) to SQLite on enqueue.
                    // Must run before any enqueue call to avoid silent
                    // poolNotConfigured throws on the hot path.
                    //
                    // Wave 1 Task 3.6 — the legacy MessageRetryQueue +
                    // ReactionQueue actors were collapsed into OfflineQueue ;
                    // they shared the same `outbox` table and namespaces
                    // (`ofq_*` / `mrq_*` / `rxq_*`), so the unified
                    // `OfflineQueue.bootRecovery()` already resets every
                    // inflight record regardless of kind or id prefix.
                    let bootPool = dependencies.dbPool
                    await OfflineQueue.shared.configure(pool: bootPool)

                    // Phase 4 §6.1.1 — boot crash recovery. Any record left
                    // `.inflight` from a previous process (the app was killed
                    // mid-dispatch) is reset to `.pending` so the flusher
                    // picks it back up. The gateway dedup contract on
                    // `(conversationId, clientMessageId)` ensures a message
                    // that actually reached the server before the crash is
                    // not duplicated at replay time. The sweep covers ALL
                    // kinds (sendMessage, sendReaction, edit/delete,
                    // non-message mutations) thanks to the unified outbox.
                    Task.detached(priority: .background) {
                        do {
                            _ = try await OfflineQueue.shared.bootRecovery()
                        } catch {
                            Logger.messages.error("Boot recovery failed: \(error.localizedDescription, privacy: .public)")
                        }
                    }

                    // Wire the in-memory retry handlers so the reconnection
                    // path (socket reconnect → retryAll/retryPending) can
                    // send queued items without going through the outbox
                    // flusher. The outbox flusher handles items that survive
                    // a crash or cold start; these handlers handle the hot
                    // reconnection path for items that were in-memory.
                    //
                    // Phase 4 — `clientMessageId` is propagated through the
                    // SendMessageRequest so the server applies the same
                    // catch-P2002 idempotent dedup (cf. spec §6.2) regardless
                    // of which path (cold flush or hot retry) sent the item.
                    await OfflineQueue.shared.setRetrySend { @Sendable item in
                        do {
                            let request = SendMessageRequest(
                                content: item.content,
                                originalLanguage: item.originalLanguage,
                                replyToId: item.replyToId,
                                forwardedFromId: item.forwardedFromId,
                                forwardedFromConversationId: item.forwardedFromConversationId,
                                attachmentIds: item.attachmentIds,
                                clientMessageId: item.clientMessageId
                            )
                            let response = try await MessageService.shared.send(
                                conversationId: item.conversationId, request: request
                            )
                            return response.id
                        } catch {
                            return nil
                        }
                    }
                    await SettingsActionQueue.shared.setFlushHandler { @Sendable action in
                        do {
                            // Most settings endpoints return the updated user.
                            // We only care that the request succeeded; the
                            // optimistic UI already reflects the new value.
                            let _: APIResponse<MeeshyUser> = try await APIClient.shared.request(
                                endpoint: action.endpoint,
                                method: action.httpMethod,
                                body: action.payload
                            )
                            return true
                        } catch APIError.serverError(let code, _) where code >= 400 && code < 500 {
                            // Treat client-side validation errors as terminal —
                            // replaying the same payload won't help. Drop the
                            // action so the queue doesn't bounce forever.
                            return true
                        } catch {
                            // Transient (5xx / connectivity): keep the action
                            // queued; the next NetworkMonitor `online` edge
                            // will replay it.
                            return false
                        }
                    }
                    // Delete legacy JSON queue files from disk on the first boot
                    // after migration to the SQLite outbox pipeline. The files are
                    // no longer written to; this removes any stale data on device.
                    // Wave 1 Task 3.6 — `OfflineQueue.deleteLegacyFile()` now
                    // sweeps the `message_retry_queue.json` + `reaction_queue.json`
                    // files in addition to the original `offline_queue.json`
                    // since the corresponding actors were folded into the
                    // unified queue.
                    let didDeleteLegacyKey = "meeshy.outbox.legacyFilesDeleted"
                    if !UserDefaults.standard.bool(forKey: didDeleteLegacyKey) {
                        Task.detached(priority: .background) {
                            OfflineQueue.deleteLegacyFile()
                            await MainActor.run {
                                UserDefaults.standard.set(true, forKey: didDeleteLegacyKey)
                            }
                        }
                    }
                    // Drain any outbox rows that survived a crash or cold start.
                    // This runs at every boot (not just once) so items from the
                    // previous session are retried as soon as the app is active.
                    Task.detached(priority: .background) {
                        // bootRecovery resets any rows that were left in the
                        // `.inflight` state by a prior crash mid-dispatch. Without
                        // this, those rows are invisible to flush() (which only
                        // selects `.pending`) until the next background/foreground
                        // cycle triggers BackgroundTransitionCoordinator which also
                        // calls bootRecovery. SwiftUI's onChange(of:scenePhase) does
                        // NOT fire on the initial `.active` state, so the coordinator
                        // path is skipped on cold start.
                        _ = try? await OfflineQueue.shared.bootRecovery()
                        let flusher = OutboxFlusher(
                            pool: bootPool,
                            dispatcher: OutboxDispatcher(),
                            onOutcome: { @Sendable outcome in
                                Task { await OfflineQueue.shared.publishOutcome(outcome) }
                            },
                            // BW1 — skip flushing while offline so retries
                            // do not burn through 60s URLSession timeouts ×
                            // 5 maxAttempts in airplane mode.
                            isNetworkReachable: { @Sendable in
                                await MainActor.run { NetworkConditionMonitor.shared.isOnline }
                            }
                        )
                        let nextRetry = await flusher.flush()
                        await OutboxRetryScheduler.shared.schedule(at: nextRetry)
                        // T10 — wake the outbox flusher on every network
                        // reconnect: a mutation enqueued offline leaves no
                        // backoff timer armed, so without this it waits for an
                        // incidental lifecycle event.
                        await OutboxRetryScheduler.shared.startObservingNetworkReconnect()
                    }

                    // Engagement outbox boot: recover orphan .open sessions
                    // (crash-truncated), evict rows older than 7d / over the cap,
                    // flush finalized rows, and arm the reconnect observer so a
                    // session finalized offline ships as soon as the link returns.
                    Task { @MainActor in
                        await EngagementOutbox.shared.bootSweep()
                        await EngagementOutbox.shared.purge(olderThan: Date().addingTimeInterval(-7 * 86400), maxRows: 5000)
                        await EngagementFlushTrigger.flushNow()
                        EngagementRetryScheduler.shared.startObservingNetworkReconnect()
                    }

                    // Session check gates auth and MUST finish before the splash
                    // dismisses. Friendship hydration only powers non-critical
                    // friend-status badges, yet it fetches ALL sent + received
                    // requests over the network (paginated) — keep it OFF the
                    // cold-start critical path. `hydrate()` coalesces concurrent
                    // callers and fast-paths when already hydrated, so firing it
                    // here and letting it finish in the background is safe; the
                    // badges fill in shortly after the list is already on screen.
                    Task { await FriendshipCache.shared.hydrate() }
                    await authManager.checkExistingSession()
                    hasCheckedSession = true
                    // Splash gating : trois bornes temporelles concurrentes
                    //   floor   1.0s — laisse l'intro jouer : à 1.0s logo/title
                    //                    sont posés et le sous-titre (spring lancé
                    //                    à 0.35s) est ~95% settled ; le résidu de
                    //                    rebond passe sous le fade-out de 0.6s.
                    //                    AVANT 1.2s = 200ms de splash en trop.
                    //   socket  1.5s — fenêtre BORNÉE pour que les sockets
                    //                    échangent leur 1er handshake. Cache-first
                    //                    (NON-NÉGOCIABLE) : on n'attend PAS le
                    //                    réseau quand le cache est prêt. Sur une
                    //                    connexion lente, la liste cachée s'affiche
                    //                    à 1.5s puis se rafraîchit (présences /
                    //                    unreads) dès que les sockets landent —
                    //                    plutôt que de retenir le splash 3s.
                    //   ceiling 5.0s — hard cap : si le réseau est down,
                    //                    on dismiss quand même pour ne JAMAIS
                    //                    bloquer l'utilisateur derrière un
                    //                    splash infini.
                    let minSplashDuration: Duration = .milliseconds(1000)
                    let socketTimeout: Duration = .milliseconds(1500)
                    let maxSplashDuration: Duration = .seconds(5)

                    if authManager.isAuthenticated {
                        // Précharge le cache liste — SQLite read instantané,
                        // retourne `.empty` au tout premier install.
                        let cacheResult = await CacheCoordinator.shared.conversations.load(for: "list")
                        let hasCachedContent = cacheResult.snapshot() != nil

                        // Détacher TOUS les bootstraps réseau (push, VoIP,
                        // unread, sync). Sur un réseau dégradé, chacun peut
                        // timeout 60s — un cold start observé a déjà tenu
                        // le splash 86s. Ces tâches tournent en parallèle
                        // du reste du splash et finalisent imperceptiblement
                        // après que la vue principale soit affichée.
                        Task { [authManager] in
                            _ = authManager  // capture explicite (lint)
                            await requestPushPermissionIfNeeded()
                            VoIPPushManager.shared.register()
                            await NotificationToastManager.shared.refreshUnreadCount()
                            await NotificationCoordinator.shared.syncNow()
                        }

                        // Si on a déjà du contenu en cache, attendre que LES
                        // DEUX sockets (Message + Social) aient confirmé leur
                        // connexion avant de dismiss → la liste s'affiche
                        // avec présences + unreads "frais" sans flash post-
                        // splash. Bounded par maxSplashDuration depuis
                        // splashStart pour ne jamais bloquer.
                        //
                        // Si cache vide (premier lancement, cold-start total),
                        // on NE bloque PAS : ConversationListView a son
                        // skeleton (`loadState == .loading`) qui prend le
                        // relais et anime le chargement initial.
                        // Offline fast-path : when the device is confirmed offline
                        // the sockets cannot handshake, so awaiting them only burns
                        // the full `socketTimeout` (1.5s) of dead time behind the
                        // splash. The cached list is ready — dismiss on the 1.0s
                        // floor instead and let presences/unreads refresh once the
                        // sockets land after reconnect. Only the optimistic `online`
                        // default (path not yet resolved) or a real online path
                        // takes the bounded wait.
                        if hasCachedContent && !NetworkMonitor.shared.isOffline {
                            let remaining = maxSplashDuration - splashStart.duration(to: .now)
                            let bounded = min(socketTimeout, remaining)
                            if bounded > .zero {
                                await Self.awaitBothSocketsConnected(timeout: bounded)
                            }
                        }
                    } else {
                        handleGuestDeepLink(deepLinkRouter.pendingDeepLink)
                    }

                    // Floor 1.2s : enforce que l'animation joue intégralement.
                    let elapsed = splashStart.duration(to: .now)
                    if elapsed < minSplashDuration {
                        try? await Task.sleep(for: minSplashDuration - elapsed)
                    }
                    withAnimation(.easeInOut(duration: 0.6)) {
                        showSplash = false
                    }
                    // Surface any crash/hang reports captured since the last
                    // foreground. Done after the splash + session work so the
                    // toast lands on a stable UI rather than racing the splash
                    // animation.
                    surfacePendingCrashReports()

                    // Retention policy: purge messages older than 6 months from
                    // GRDB on every cold start. The server remains the source of
                    // truth — purged messages can be re-fetched via pagination.
                    // Runs at background priority so it never blocks the UI.
                    let retentionPersistence = MessagePersistenceActor(dbWriter: dependencies.dbPool)
                    Task.detached(priority: .background) {
                        await retentionPersistence.start()
                        if let count = try? await retentionPersistence.purgeOldMessages() {
                            if count > 0 {
                                Logger(subsystem: "com.meeshy.app", category: "retention")
                                    .info("Purged \(count) messages older than \(MessagePersistenceActor.defaultRetentionMonths) months")
                            }
                        }
                    }
                }
                .adaptiveOnChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
                        // CALL-FIX 2026-06-06 — tell the gateway we're foreground so
                        // incoming calls use the in-app banner (socket) instead of a
                        // VoIP push / CallKit.
                        MessageSocketManager.shared.emitAppForeground(true)
                        Task { await handleForegroundTransition() }
                        // Drain any mark-as-read actions the user tapped from the
                        // widget while the app was suspended.
                        Task { await WidgetActionFlusher.shared.flush() }
                    case .background:
                        // CALL-FIX 2026-06-06 — tell the gateway we're backgrounded
                        // FIRST (while the socket is still alive, before the
                        // coordinator may suspend it) so incoming calls fall back to
                        // a VoIP push (CallKit) — a suspended socket can't ring.
                        MessageSocketManager.shared.emitAppForeground(false)
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
                        // Compact free pages and refresh query-planner stats on
                        // every background transition. Runs at background priority
                        // so the system can defer or kill it under memory pressure.
                        // Capture dbPool before crossing the actor boundary.
                        let pool = dependencies.dbPool
                        Task.detached(priority: .background) {
                            do {
                                try DatabaseMaintenance.runIncrementalVacuum(on: pool)
                                try DatabaseMaintenance.runOptimize(on: pool)
                            } catch {
                                Logger(subsystem: "me.meeshy.app", category: "maintenance")
                                    .error("Background DB maintenance failed: \(error.localizedDescription, privacy: .public)")
                            }
                        }
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
                .adaptiveOnChange(of: authManager.isAuthenticated) { _, isAuth in
                    // Tag every subsequent crash report with the active user
                    // so we can filter the Crashlytics dashboard per account.
                    // Cleared on logout to prevent the next user inheriting
                    // the previous identity.
                    CrashDiagnosticsManager.shared.setUserID(
                        isAuth ? authManager.currentUser?.id : nil
                    )
                    if isAuth {
                        activeGuestSession = nil
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
                        ConversationStoreSocketBridge.shared.activate()
                        Task { await requestPushPermissionIfNeeded() }
                        Task { await NotificationToastManager.shared.refreshUnreadCount() }
                        pushManager.reRegisterTokenIfNeeded()
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
                        // `reset()` purges every disk-backed store (GRDB +
                        // media) — required because the stores are not
                        // namespaced by userId and would otherwise expose
                        // user A's data to user B on the next login.
                        Task { await CacheCoordinator.shared.reset() }
                        MessageSocketManager.shared.disconnect()
                        SocialSocketManager.shared.disconnect()
                        // Drop the store subscriptions so an event from user A
                        // can't mutate the store after logout.
                        ConversationStoreSocketBridge.shared.deactivate()
                    }
                }
                .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink) { _, link in
                    handleGuestDeepLink(link)
                }
            }
        }
    }

    // MARK: - Test seam (DEBUG)

    /// Reproduces the `.background` branch of `adaptiveOnChange(of: scenePhase)`
    /// in a testable, static form. Kept aligned with the production handler:
    /// when the conversation audio coordinator is actively playing we do NOT
    /// tear down the shared `AVAudioSession`, so iOS keeps streaming the
    /// engine in background under the `UIBackgroundModes: audio` declaration.
    // MARK: - Splash gating

    /// Bloque jusqu'à ce que `MessageSocketManager.isConnected` ET
    /// `SocialSocketManager.isConnected` soient simultanément `true`, ou
    /// jusqu'à expiration de `timeout` — celui des deux qui arrive en
    /// premier. Aucune erreur ni Throwable : en cas de timeout réseau, on
    /// retourne silencieusement pour laisser le splash dismiss.
    ///
    /// Polling 100ms : empreinte mémoire négligeable, < 50 cycles sur le
    /// timeout 3-5s typique, et évite la complexité d'un `withCheckedContinuation`
    /// qui leak si annulé pendant l'attente Combine.
    @MainActor
    fileprivate static func awaitBothSocketsConnected(timeout: Duration) async {
        // Already connected: pas d'attente nécessaire
        if MessageSocketManager.shared.isConnected && SocialSocketManager.shared.isConnected {
            return
        }
        let pollInterval: Duration = .milliseconds(100)
        let deadline = ContinuousClock.now.advanced(by: timeout)
        while ContinuousClock.now < deadline {
            if MessageSocketManager.shared.isConnected && SocialSocketManager.shared.isConnected {
                return
            }
            try? await Task.sleep(for: pollInterval)
            if Task.isCancelled { return }
        }
    }

    static func handleScenePhaseForTesting(_ newPhase: ScenePhase) async {
        switch newPhase {
        case .background:
            if !ConversationAudioCoordinator.sharedForTesting.isPlaying {
                // `deactivateForBackground()` owns the `deactivateCount` probe
                // increment (post `callActive` guard) — do NOT pre-count here or
                // a single background transition double-counts.
                await MediaSessionCoordinator.shared.deactivateForBackground()
            }
        default:
            break
        }
    }

    // MARK: - Push Notifications

    private func requestPushPermissionIfNeeded() async {
        await pushManager.checkAuthorizationStatus()
        if !pushManager.isAuthorized {
            _ = await pushManager.requestPermission()
        } else {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: - Crash Diagnostics Surfacing

    /// Drains the queue of crash/hang reports captured since the last
    /// foreground and shows a single toast describing the most recent one.
    /// Each report is also logged via `Logger.crash` so the full call stack
    /// is grep-able in Console.app under subsystem `me.meeshy.app` /
    /// category `crash`.
    private func surfacePendingCrashReports() {
        guard !hasSurfacedCrashReports else { return }
        hasSurfacedCrashReports = true

        let reports = CrashDiagnosticsManager.shared.consumePending()
        guard let mostRecent = reports.first else { return }

        for report in reports {
            let when = report.timestamp.formatted(.iso8601)
            Logger.crash.error("""
                [\(report.kind.rawValue, privacy: .public)] \
                \(when, privacy: .public) — \
                \(report.summary, privacy: .public)
                \(report.details, privacy: .public)
                """)
        }

        crashReportsToShow = reports

        let kindLabel = mostRecent.kind.localizedLabel
        let extra = reports.count > 1 ? " (+\(reports.count - 1))" : ""
        toastManager.show(
            String(
                format: String(
                    localized: "crash.toast.previous",
                    defaultValue: "%1$@ précédent%2$@ : %3$@",
                    bundle: .main
                ),
                kindLabel, extra, mostRecent.summary
            ),
            type: .info
        ) { [self] in
            showCrashSheet = true
        }
    }

    // MARK: - App Lifecycle Transitions

    private func handleForegroundTransition() async {
        guard authManager.isAuthenticated else { return }
        // Coordinator rearms the sockets (force reconnect), flushes pending
        // delivery receipts and drives the conversation sync. We do NOT
        // check `isConnected` here — that flag is unreliable after iOS
        // suspension because the Socket.IO `disconnect` callback may not
        // fire when the OS kills the WebSocket. The coordinator forces a
        // fresh disconnect + connect cycle regardless of the flag state.
        await BackgroundTransitionCoordinator.shared.resumeFromBackground()
    }

    // MARK: - Guest Session Lifecycle

    private func dismissGuestSession() {
        if let ctx = activeGuestSession?.context {
            Task { try? await ShareLinkService.shared.leaveAnonymousSession(sessionToken: ctx.sessionToken) }
        }
        if let id = activeGuestSession?.identifier {
            AnonymousSessionStore.delete(linkId: id)
        }
        activeGuestSession = nil
    }

    // MARK: - Guest Deep Link (handles join/chat links when not authenticated)

    private func handleGuestDeepLink(_ link: DeepLink?) {
        guard let link else { return }
        // Hold the link until the session check finishes. Otherwise an
        // incoming join/chat link would activate a guest session BEFORE
        // `checkExistingSession` flips `isAuthenticated` to true, leaving
        // the user stranded in an anonymous flow even though they have a
        // valid token. The `.task` block below re-invokes this method
        // after `hasCheckedSession = true`, so the link survives in
        // `deepLinkRouter.pendingDeepLink` and is processed then.
        guard hasCheckedSession else { return }
        guard !authManager.isAuthenticated else { return }
        switch link {
        case .joinLink(let id), .chatLink(let id):
            activeGuestSession = GuestSession(identifier: id, context: AnonymousSessionStore.load(linkId: id))
            deepLinkRouter.consumePendingDeepLink()
        case .magicLink(let token):
            // Cold-launch Universal Link magic link. `AppDelegate
            // .application(_:continue:)` set `pendingDeepLink = .magicLink`
            // before any view mounted, and `RootView` (the warm consumer)
            // never mounts while unauthenticated — so this is the ONLY place
            // a cold-launch magic link gets validated. Consume first so the
            // `.task` + `.onChange` callers don't double-fire the request.
            deepLinkRouter.consumePendingDeepLink()
            validateMagicLinkToken(token)
        default:
            break
        }
    }

    // MARK: - App-Level Deep Link (handles magic link when not authenticated)

    private func handleAppLevelDeepLink(_ url: URL) {
        let destination = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = destination else { return }
        validateMagicLinkToken(token)
    }

    /// Validate a passwordless magic-link token and surface the outcome.
    /// Shared by the warm path (`.onOpenURL` / `.onContinueUserActivity` via
    /// `handleAppLevelDeepLink`) and the cold-launch path
    /// (`handleGuestDeepLink`) so both report success/failure identically.
    private func validateMagicLinkToken(_ token: String) {
        Task {
            await authManager.validateMagicLink(token: token)

            if authManager.isAuthenticated {
                toastManager.showSuccess(String(localized: "magicLink.success", defaultValue: "Login successful!", bundle: .main))
            } else {
                toastManager.showError(authManager.errorMessage ?? String(localized: "magicLink.error.invalidLink", defaultValue: "Invalid or expired link", bundle: .main))
            }
        }
    }
}

// MARK: - System Theme Detector
// Sits OUTSIDE preferredColorScheme to always see the real system colorScheme
struct SystemThemeDetector<Content: View>: View {
    @Environment(\.colorScheme) private var systemScheme
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .adaptiveOnChange(of: systemScheme) { _, newScheme in
                ThemeManager.shared.syncWithSystem(newScheme)
            }
            .onAppear {
                ThemeManager.shared.syncWithSystem(systemScheme)
            }
    }
}

// MARK: - Splash Screen
struct SplashScreen: View {
    let onFinish: () -> Void

    @State private var showLogo = false
    @State private var showTitle = false
    @State private var showSubtitle = false
    @State private var glowPulse = false
    @State private var backgroundScale: CGFloat = 1.2
    @ObservedObject private var theme = ThemeManager.shared

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        ZStack {
            // Animated gradient background
            LinearGradient(
                colors: isDark ? [
                    Color(hex: "09090B"),
                    Color(hex: "13111C"),
                    MeeshyColors.indigo950
                ] : [
                    Color(hex: "FFFFFF"),
                    Color(hex: "F8F7FF"),
                    MeeshyColors.indigo50
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .scaleEffect(backgroundScale)
            .ignoresSafeArea()

            // Ambient orbs
            Circle()
                .fill(MeeshyColors.indigo600.opacity(isDark ? 0.15 : 0.10))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: -80, y: -200)
                .scaleEffect(glowPulse ? 1.3 : 0.8)

            Circle()
                .fill(MeeshyColors.indigo400.opacity(isDark ? 0.12 : 0.08))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .offset(x: 90, y: 180)
                .scaleEffect(glowPulse ? 1.2 : 0.9)

            Circle()
                .fill(MeeshyColors.indigo800.opacity(isDark ? 0.10 : 0.06))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .offset(x: 60, y: -80)
                .scaleEffect(glowPulse ? 1.1 : 1.0)

            VStack(spacing: 0) {
                Spacer()

                // Animated Logo
                AnimatedLogoView(color: isDark ? .white : MeeshyColors.indigo950, lineWidth: 10, continuous: false)
                    .frame(width: 120, height: 120)
                    .opacity(showLogo ? 1 : 0)
                    .scaleEffect(showLogo ? 1 : 0.5)
                    .padding(.bottom, 32)

                // App Name
                Text("Meeshy")
                    .font(MeeshyFont.relative(46, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: MeeshyColors.indigo500.opacity(isDark ? 0.5 : 0.25), radius: 12, x: 0, y: 4)
                    .fixedSize()
                    .frame(height: 80)
                    .opacity(showTitle ? 1 : 0)
                    .offset(y: showTitle ? 0 : -40)
                    .padding(.bottom, 8)

                // Tagline
                Text(String(localized: "splash.tagline", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(height: 40)
                    .opacity(showSubtitle ? 1 : 0)
                    .offset(y: showSubtitle ? 0 : -20)

                Spacer()

                // Footer : version + signature + brand logo (shared — see BrandSignature)
                BrandSignature()
                    .opacity(showSubtitle ? 1 : 0)
                    .padding(.bottom, 24)
            }
        }
        .onAppear {
            // Staggered entrance — fast and punchy
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                showLogo = true
            }

            // Title: fade in + descend with bounce overshoot
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.2)) {
                showTitle = true
            }

            // Subtitle: same bounce, slightly later
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.35)) {
                showSubtitle = true
            }

            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                glowPulse = true
            }

            withAnimation(.easeInOut(duration: 1.0)) {
                backgroundScale = 1.0
            }

            // Dismissal is driven by MeeshyApp.task once boot data is ready.
            // The `onFinish` callback is kept in the signature for backwards
            // compatibility (callers may still wire it) but is no longer
            // invoked automatically here — the previous 1.2s timer caused
            // the splash to vanish before the conversations cache was
            // hydrated, which defeated its purpose.
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                glowPulse = false
            }
        }
    }
}
