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
    @StateObject private var toastManager = ToastManager.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @StateObject private var deepLinkRouter = DeepLinkRouter.shared
    @StateObject private var theme = ThemeManager.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showSplash = AuthManager.shared.authToken == nil
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
                        SplashScreen(onFinish: {
                            withAnimation(.easeInOut(duration: 0.6)) {
                                showSplash = false
                            }
                        })
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
                                    toastManager.showError(String(localized: "Impossible de sauvegarder la session", defaultValue: "Impossible de sauvegarder la session"))
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
                        ToastView(toast: toast)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.top, MeeshySpacing.xxl)
                            .onTapGesture {
                                if let action = toastManager.onTapAction {
                                    action()
                                }
                                toastManager.dismiss()
                            }
                            .zIndex(999)
                    }
                }
                .animation(MeeshyAnimation.springDefault, value: toastManager.currentToast)
                .sheet(isPresented: $showCrashSheet) {
                    CrashReportSheet(reports: crashReportsToShow)
                }
                .environmentObject(authManager)
                .environmentObject(deepLinkRouter)
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
                    ImageDownsamplingConfig.applyGlobal()
                    KeychainManager.shared.migrateToAfterFirstUnlock()
                    MeeshyConfig.shared.restoreEnvironment()
                    // Bridge iOS Focus filter selection into the SDK so in-app
                    // toasts respect the currently-active Focus filter.
                    NotificationManager.shared.focusFilterProvider = {
                        MeeshyFocusStore.shared.current.toSDKSnapshot()
                    }
                    await CacheCoordinator.shared.start()
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
                        let flusher = OutboxFlusher(pool: bootPool, dispatcher: OutboxDispatcher())
                        await flusher.flush()
                    }

                    // Parallelize: friendship hydration + session check are independent
                    async let friendshipHydration: () = FriendshipCache.shared.hydrate()
                    async let sessionCheck: () = authManager.checkExistingSession()
                    _ = await (friendshipHydration, sessionCheck)
                    hasCheckedSession = true
                    if authManager.isAuthenticated {
                        await requestPushPermissionIfNeeded()
                        VoIPPushManager.shared.register()
                        await NotificationManager.shared.refreshUnreadCount()
                        await NotificationCoordinator.shared.syncNow()
                    } else {
                        handleGuestDeepLink(deepLinkRouter.pendingDeepLink)
                    }
                    // Surface any crash/hang reports captured since the last
                    // foreground. Done after the splash + session work so the
                    // toast lands on a stable UI rather than racing the splash
                    // animation.
                    surfacePendingCrashReports()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
                        Task { await handleForegroundTransition() }
                        // Drain any mark-as-read actions the user tapped from the
                        // widget while the app was suspended.
                        Task { await WidgetActionFlusher.shared.flush() }
                    case .background:
                        // Delegate the whole background entry to a single
                        // coordinator guarded by a beginBackgroundTask. The
                        // coordinator owns the order (stop players → flush
                        // caches → ack pushes → stop heartbeats → schedule
                        // BGTasks → sync widgets) and guarantees the task id
                        // is ended even if a step throws.
                        Task { await BackgroundTransitionCoordinator.shared.enterBackground() }
                        // Compact free pages and refresh query-planner stats on
                        // every background transition. Runs at background priority
                        // so the system can defer or kill it under memory pressure.
                        // Capture dbPool before crossing the actor boundary.
                        let pool = dependencies.dbPool
                        Task.detached(priority: .background) {
                            try? DatabaseMaintenance.runIncrementalVacuum(on: pool)
                            try? DatabaseMaintenance.runOptimize(on: pool)
                        }
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
                .onChange(of: authManager.isAuthenticated) { _, isAuth in
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
                        Task { await requestPushPermissionIfNeeded() }
                        Task { await NotificationManager.shared.refreshUnreadCount() }
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
                        if let pending = pushManager.pendingNotificationPayload {
                            handlePushNavigation(payload: pending)
                        }
                    } else {
                        NotificationManager.shared.reset()
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
                    }
                }
                .onReceive(pushManager.$pendingNotificationPayload) { payload in
                    guard let payload else { return }
                    handlePushNavigation(payload: payload)
                }
                .onChange(of: deepLinkRouter.pendingDeepLink) { _, link in
                    handleGuestDeepLink(link)
                }
            }
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

    private func handlePushNavigation(payload: NotificationPayload) {
        guard authManager.isAuthenticated else {
            return
        }

        NotificationCenter.default.post(
            name: .handlePushNotification,
            object: payload
        )
        pushManager.clearPendingNotification()
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

        let isoFormatter = ISO8601DateFormatter()
        for report in reports {
            let when = isoFormatter.string(from: report.timestamp)
            Logger.crash.error("""
                [\(report.kind.rawValue, privacy: .public)] \
                \(when, privacy: .public) — \
                \(report.summary, privacy: .public)
                \(report.details, privacy: .public)
                """)
        }

        crashReportsToShow = reports

        let kindLabel: String
        switch mostRecent.kind {
        case .nsException: kindLabel = "Exception"
        case .crash: kindLabel = "Crash"
        case .hang: kindLabel = "Blocage"
        case .cpuException: kindLabel = "Pic CPU"
        case .diskWriteException: kindLabel = "Ecriture disque"
        }
        let extra = reports.count > 1 ? " (+\(reports.count - 1))" : ""
        toastManager.show(
            "\(kindLabel) precedent\(extra) : \(mostRecent.summary)",
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
        default:
            break
        }
    }

    // MARK: - App-Level Deep Link (handles magic link when not authenticated)

    private func handleAppLevelDeepLink(_ url: URL) {
        let destination = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = destination else { return }

        Task {
            await authManager.validateMagicLink(token: token)

            if authManager.isAuthenticated {
                toastManager.showSuccess(String(localized: "Connexion reussie !", defaultValue: "Connexion r\u{00E9}ussie !"))
            } else {
                toastManager.showError(authManager.errorMessage ?? String(localized: "Lien invalide ou expire", defaultValue: "Lien invalide ou expir\u{00E9}"))
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
            .onChange(of: systemScheme) { _, newScheme in
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
                    .font(.system(size: 46, weight: .bold, design: .rounded))
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
                Text(String(localized: "Break the language barrier", defaultValue: "Break the language barrier"))
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(height: 40)
                    .opacity(showSubtitle ? 1 : 0)
                    .offset(y: showSubtitle ? 0 : -20)

                Spacer()
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

            // Transition to main app
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                onFinish()
            }
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                glowPulse = false
            }
        }
    }
}
