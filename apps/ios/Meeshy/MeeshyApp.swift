import SwiftUI
import MeeshySDK
import MeeshyUI

@main
struct MeeshyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var toastManager = ToastManager.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @StateObject private var deepLinkRouter = DeepLinkRouter.shared
    @ObservedObject private var theme = ThemeManager.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showSplash = true
    @State private var hasCheckedSession = false
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
                            RootView()
                        } else if hasCheckedSession {
                            LoginView()
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
                    get: { shouldShowOnboarding && !showSplash },
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
                    handleAppLevelDeepLink(url)
                }
                .task {
                    await authManager.checkExistingSession()
                    hasCheckedSession = true
                    if authManager.isAuthenticated {
                        await requestPushPermissionIfNeeded()
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        Task { await pushManager.resetBadge() }
                    }
                }
                .onChange(of: authManager.isAuthenticated) { _, isAuth in
                    if isAuth {
                        Task { await requestPushPermissionIfNeeded() }
                        pushManager.reRegisterTokenIfNeeded()
                    }
                }
                .onReceive(pushManager.$pendingNotificationPayload) { payload in
                    guard let payload, let conversationId = payload.conversationId else { return }
                    handlePushNavigation(conversationId: conversationId)
                }
                .onOpenURL { url in
                    let _ = deepLinkRouter.handle(url: url)
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

    private func handlePushNavigation(conversationId: String) {
        guard authManager.isAuthenticated else { return }

        Task {
            do {
                let userId = AuthManager.shared.currentUser?.id ?? ""
                let apiConversation = try await ConversationService.shared.getById(conversationId)
                let conversation = apiConversation.toConversation(currentUserId: userId)
                NotificationCenter.default.post(
                    name: .navigateToConversation,
                    object: conversation
                )
            } catch {
                toastManager.showError("Impossible d'ouvrir la conversation")
            }
            pushManager.clearPendingNotification()
        }
    }

    // MARK: - App-Level Deep Link (handles magic link when not authenticated)

    private func handleAppLevelDeepLink(_ url: URL) {
        let destination = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = destination else { return }

        Task {
            await authManager.validateMagicLink(token: token)

            if authManager.isAuthenticated {
                toastManager.showSuccess("Connexion reussie !")
            } else {
                toastManager.showError(authManager.errorMessage ?? "Lien invalide ou expire")
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
                    Color(hex: "0a0a14"),
                    Color(hex: "18141E"),
                    Color(hex: "0d1520")
                ] : [
                    Color(hex: "FAF8F5"),
                    Color(hex: "F5F0EA"),
                    Color(hex: "F8F6F2")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .scaleEffect(backgroundScale)
            .ignoresSafeArea()

            // Ambient orbs
            Circle()
                .fill(Color(hex: "2A9D8F").opacity(isDark ? 0.15 : 0.10))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: -80, y: -200)
                .scaleEffect(glowPulse ? 1.3 : 0.8)

            Circle()
                .fill(Color(hex: "E76F51").opacity(isDark ? 0.12 : 0.08))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .offset(x: 90, y: 180)
                .scaleEffect(glowPulse ? 1.2 : 0.9)

            Circle()
                .fill(Color(hex: "B24BF3").opacity(isDark ? 0.10 : 0.06))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .offset(x: 60, y: -80)
                .scaleEffect(glowPulse ? 1.1 : 1.0)

            VStack(spacing: 0) {
                Spacer()

                // Animated Logo
                AnimatedLogoView(color: isDark ? .white : Color(hex: "1C1917"), lineWidth: 10, continuous: false)
                    .frame(width: 120, height: 120)
                    .opacity(showLogo ? 1 : 0)
                    .scaleEffect(showLogo ? 1 : 0.5)
                    .padding(.bottom, 32)

                // App Name
                Text("Meeshy")
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "B24BF3"), Color(hex: "8B5CF6"), Color(hex: "A855F7")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: "B24BF3").opacity(isDark ? 0.5 : 0.25), radius: 12, x: 0, y: 4)
                    .fixedSize()
                    .frame(height: 80)
                    .opacity(showTitle ? 1 : 0)
                    .offset(y: showTitle ? 0 : -40)
                    .padding(.bottom, 8)

                // Tagline
                Text("Break the language barrier")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(height: 40)
                    .opacity(showSubtitle ? 1 : 0)
                    .offset(y: showSubtitle ? 0 : -20)

                Spacer()
            }
        }
        .onAppear {
            // Staggered entrance
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                showLogo = true
            }

            // Title: fade in + descend with bounce overshoot
            withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.5)) {
                showTitle = true
            }

            // Subtitle: same bounce, slightly later
            withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.9)) {
                showSubtitle = true
            }

            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                glowPulse = true
            }

            withAnimation(.easeInOut(duration: 2.0)) {
                backgroundScale = 1.0
            }

            // Transition to main app (give enough time for all bounce animations)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) {
                onFinish()
            }
        }
    }
}
