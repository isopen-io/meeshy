import SwiftUI
import UserNotifications
import MeeshySDK
import MeeshyUI
import os

@main
struct MeeshyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var toastManager = ToastManager.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @StateObject private var deepLinkRouter = DeepLinkRouter.shared
    @ObservedObject private var theme = ThemeManager.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showSplash = AuthManager.shared.authToken == nil
    @State private var hasCheckedSession = false
    @State private var activeGuestSession: GuestSession?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase

    private var shouldShowOnboarding: Bool {
        !hasCompletedOnboarding && !authManager.isAuthenticated
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
                                toastManager.dismiss()
                            }
                            .zIndex(999)
                    }
                }
                .animation(MeeshyAnimation.springDefault, value: toastManager.currentToast)
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
                    MeeshyConfig.shared.restoreEnvironment()
                    await CacheCoordinator.shared.start()
                    await OfflineQueue.shared.setRetrySend { @Sendable item in
                        do {
                            let request = SendMessageRequest(
                                content: item.content,
                                replyToId: item.replyToId,
                                forwardedFromId: item.forwardedFromId,
                                forwardedFromConversationId: item.forwardedFromConversationId,
                                attachmentIds: item.attachmentIds
                            )
                            _ = try await MessageService.shared.send(
                                conversationId: item.conversationId, request: request
                            )
                            return true
                        } catch {
                            return false
                        }
                    }
                    await MessageRetryQueue.shared.setRetrySend { @Sendable item in
                        do {
                            let request = SendMessageRequest(
                                content: item.content,
                                originalLanguage: item.originalLanguage,
                                replyToId: item.replyToId,
                                attachmentIds: item.attachmentIds
                            )
                            _ = try await MessageService.shared.send(
                                conversationId: item.conversationId, request: request
                            )
                            return true
                        } catch {
                            return false
                        }
                    }
                    // Parallelize: friendship hydration + session check are independent
                    async let friendshipHydration: () = FriendshipCache.shared.hydrate()
                    async let sessionCheck: () = authManager.checkExistingSession()
                    _ = await (friendshipHydration, sessionCheck)
                    hasCheckedSession = true
                    if authManager.isAuthenticated {
                        await requestPushPermissionIfNeeded()
                        VoIPPushManager.shared.register()
                    } else {
                        handleGuestDeepLink(deepLinkRouter.pendingDeepLink)
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
                        Task { await handleForegroundTransition() }
                    case .background:
                        handleBackgroundTransition()
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
                .onChange(of: authManager.isAuthenticated) { _, isAuth in
                    if isAuth {
                        activeGuestSession = nil
                        Task { await requestPushPermissionIfNeeded() }
                        Task { await NotificationManager.shared.refreshUnreadCount() }
                        pushManager.reRegisterTokenIfNeeded()
                        VoIPPushManager.shared.register()
                        Task {
                            do {
                                let bundle = try E2EEService.shared.generatePublicBundle()
                                try await E2EAPI.shared.uploadBundle(bundle: bundle)
                            } catch {
                                Logger.e2ee.error("E2EE bundle upload failed: \(error)")
                            }
                        }
                        if let pending = pushManager.pendingNotificationPayload {
                            handlePushNavigation(payload: pending)
                        }
                    } else {
                        NotificationManager.shared.reset()
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

    // MARK: - App Lifecycle Transitions

    private func handleForegroundTransition() async {
        guard authManager.isAuthenticated else { return }
        await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        if !MessageSocketManager.shared.isConnected {
            MessageSocketManager.shared.connect()
        }
        if !SocialSocketManager.shared.isConnected {
            SocialSocketManager.shared.connect()
        }
    }

    private func handleBackgroundTransition() {
        PlaybackCoordinator.shared.stopAll()
        guard authManager.isAuthenticated else { return }
        BackgroundTaskManager.shared.scheduleConversationSync()
        BackgroundTaskManager.shared.scheduleMessagePrefetch()
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
    }
}
