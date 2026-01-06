import SwiftUI

#if canImport(FirebaseCore)
import FirebaseCore
#endif

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

// MARK: - AppDelegate for Firebase and Push Notifications

class AppDelegate: NSObject, UIApplicationDelegate {

    // MARK: - Orientation Lock (for Camera/Video recording)

    /// Static property to lock orientation during recording
    /// Set to .all to allow all orientations, or specific mask to lock
    static var orientationLock: UIInterfaceOrientationMask = .all

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        // Configure Firebase
        FirebaseConfiguration.configure()

        #if canImport(FirebaseMessaging)
        // Set Firebase Messaging delegate
        Messaging.messaging().delegate = self
        #endif

        // Setup push notifications
        setupNotifications()

        // Setup VoIP push for incoming calls (PushKit)
        setupVoIPPush()

        return true
    }

    // MARK: - Orientation Support

    func application(_ application: UIApplication,
                     supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return AppDelegate.orientationLock
    }
}

#if canImport(FirebaseMessaging)
// MARK: - Firebase Messaging Delegate

extension AppDelegate: MessagingDelegate {
    /// Called when FCM token is generated or refreshed
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else {
            print("FCM token is nil")
            return
        }

        print("Firebase registration token: \(token.prefix(30))...")

        // Store token locally
        Task { @MainActor in
            NotificationManager.shared.fcmToken = token
        }

        // Send token to backend
        Task {
            await registerFCMTokenToBackend(token)
        }

        // Post notification for other parts of the app
        NotificationCenter.default.post(
            name: Notification.Name("FCMTokenRefreshed"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    /// Register FCM token with backend
    private func registerFCMTokenToBackend(_ token: String) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/device-token") else {
                logger.error("Invalid URL for FCM token registration")
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            // Add authentication header
            if let authToken = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            } else if let sessionToken = await MainActor.run(body: { AuthenticationManager.shared.sessionToken }) {
                request.setValue("\(sessionToken)", forHTTPHeaderField: "X-Session-Token")
            } else {
                logger.warn("No auth token available for FCM registration - will retry after login")
                return
            }

            // Send FCM token to backend
            let body: [String: Any] = [
                "fcmToken": token,
                "platform": "ios"
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                switch httpResponse.statusCode {
                case 200, 201:
                    logger.info("FCM token registered successfully with backend")
                case 401:
                    logger.warn("FCM token registration failed: not authenticated")
                default:
                    logger.error("FCM token registration failed: HTTP \(httpResponse.statusCode)")
                }
            }
        } catch {
            logger.error("Error registering FCM token: \(error.localizedDescription)")
        }
    }
}
#endif

// MARK: - Splash Screen View

/// Animated splash screen displayed during app launch
/// CORRECTION: N'effectue PLUS de chargement - juste des animations
/// AppLaunchCoordinator gère tout le chargement des données
struct SplashScreenView: View {
    // Animation states
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var pulseAnimation = false
    @State private var showLoadingIndicator = false

    /// Observe progress from AppLaunchCoordinator
    @ObservedObject private var launchCoordinator = AppLaunchCoordinator.shared

    /// Callback when loading is complete (kept for API compatibility)
    let onLoadingComplete: () -> Void

    var body: some View {
        GeometryReader { geometry in
            let isCompact = geometry.size.height < 700
            let logoContainerSize: CGFloat = isCompact ? 90 : 120
            let pulseSize: CGFloat = isCompact ? 120 : 160
            let logoSize: CGFloat = isCompact ? 50 : 70
            let titleSize: CGFloat = isCompact ? 32 : 42
            let subtitleSize: CGFloat = isCompact ? 14 : 16
            let spacing: CGFloat = isCompact ? 16 : 24

            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [
                        Color.meeshyPrimary,
                        Color.meeshyPrimary.opacity(0.8),
                        Color(red: 0.1, green: 0.1, blue: 0.2)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                VStack(spacing: spacing) {
                    Spacer()

                    // Logo with animation
                    ZStack {
                        // Pulse effect
                        Circle()
                            .fill(Color.white.opacity(0.1))
                            .frame(width: pulseSize, height: pulseSize)
                            .scaleEffect(pulseAnimation ? 1.3 : 1.0)
                            .opacity(pulseAnimation ? 0 : 0.5)

                        // Logo container
                        ZStack {
                            // Background circle
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [.white, Color.white.opacity(0.9)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: logoContainerSize, height: logoContainerSize)
                                .shadow(color: .black.opacity(0.2), radius: isCompact ? 12 : 20, x: 0, y: isCompact ? 6 : 10)

                            // App icon/logo
                            AnimatedLogoView(color: .meeshyPrimary, lineWidth: isCompact ? 4 : 5)
                                .frame(width: logoSize, height: logoSize)
                        }
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)
                    }

                    // App name
                    VStack(spacing: isCompact ? 4 : 8) {
                        Text("Meeshy")
                            .font(.system(size: titleSize, weight: .bold, design: .rounded))
                            .foregroundColor(.white)

                        Text("Connect. Translate. Communicate.")
                            .font(.system(size: subtitleSize, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .opacity(textOpacity)

                    Spacer()

                    // Loading indicator - uses progress from AppLaunchCoordinator
                    if showLoadingIndicator {
                        VStack(spacing: isCompact ? 8 : 12) {
                            // Progress bar
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.white.opacity(0.2))
                                    .frame(height: 4)

                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.white)
                                    .frame(width: (isCompact ? 160 : 200) * launchCoordinator.loadingProgress, height: 4)
                                    .animation(.easeInOut(duration: 0.3), value: launchCoordinator.loadingProgress)
                            }
                            .frame(height: 4)
                            .frame(maxWidth: isCompact ? 160 : 200)

                            Text("Chargement...")
                                .font(.system(size: isCompact ? 12 : 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.6))
                        }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        .padding(.bottom, isCompact ? 30 : 60)
                    }

                    Spacer()
                        .frame(height: isCompact ? 40 : 80)
                }
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    // MARK: - Animations Only

    private func startAnimations() {
        // CORRECTION: Le SplashScreen ne charge PLUS les données
        // AppLaunchCoordinator gère tout le chargement via .task dans MeeshyApp

        // Phase 1: Logo appears
        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
            logoScale = 1.0
            logoOpacity = 1.0
        }

        // Phase 2: Text appears
        withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
            textOpacity = 1.0
        }

        // Phase 3: Start pulse animation and show loading indicator
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) {
                pulseAnimation = true
            }
            withAnimation(.easeIn(duration: 0.2)) {
                showLoadingIndicator = true
            }
        }
    }
}

// MARK: - Main App

@main
struct MeeshyApp: App {
    // Register app delegate for future Firebase setup
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    // State management
    @ObservedObject private var authManager = AuthenticationManager.shared
    @StateObject private var navigationCoordinator = NavigationCoordinator()
    @ObservedObject private var appState = AppState.shared
    @ObservedObject private var launchCoordinator = AppLaunchCoordinator.shared
    @ObservedObject private var anonymousLinkService = AnonymousLinkService.shared

    /// Show walkthrough for first-time users
    @State private var showWalkthrough = false

    // Deep link state
    @State private var pendingJoinLinkId: String?
    @State private var showAnonymousJoinSheet = false

    var body: some Scene {
        WindowGroup {
            ZStack {
                // WORLD-CLASS LAUNCH FLOW:
                // 1. First launch → Walkthrough → Login
                // 2. Returning user not logged in → Login
                // 3. Returning user logged in with cache → Instant content
                // 4. Returning user logged in no cache → Splash with loading

                switch launchCoordinator.launchState {
                case .loading:
                    // Splash screen with loading progress
                    SplashScreenView {
                        // Completion callback - handled by coordinator
                    }
                    .transition(.opacity)

                case .walkthrough:
                    // First launch - permissions only
                    // PermissionsView calls walkthroughCompleted() directly
                    OnboardingCoordinatorView()
                        .transition(.opacity)

                case .login:
                    // Authentication required
                    LoginView()
                        .transition(.opacity)

                case .ready:
                    // Main app content
                    MainTabView()
                        .environmentObject(navigationCoordinator)
                        .environmentObject(appState)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: launchCoordinator.launchState)
            // Anonymous join sheet
            .sheet(isPresented: $showAnonymousJoinSheet) {
                if let linkId = pendingJoinLinkId {
                    AnonymousJoinView(linkId: linkId) { conversationId in
                        handleJoinSuccess(conversationId: conversationId)
                    }
                }
            }
            .onOpenURL { url in
                handleDeepLink(url)
            }
            .onChange(of: authManager.isAuthenticated) { oldValue, isAuthenticated in
                // User just logged in - trigger data loading
                if isAuthenticated && !oldValue {
                    Task {
                        await launchCoordinator.userDidLogin()
                    }

                    // Handle pending join link
                    if let linkId = pendingJoinLinkId {
                        Task {
                            await handleAuthenticatedJoin(linkId: linkId)
                        }
                    }
                }

                // User logged out
                if !isAuthenticated && oldValue {
                    launchCoordinator.userDidLogout()
                }
            }
            .onAppear {
                // Start observing state changes
                AppState.shared.startObserving()
                checkForPendingAnonymousSession()
            }
            .task {
                // Start the launch sequence
                await launchCoordinator.startLaunchSequence()
            }
        }
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ url: URL) {
        // Handle deep links for various app features
        // Supported schemes:
        // - meeshy://{route}
        // - https://meeshy.me/{route}

        #if DEBUG
        print("📱 Deep link received: \(url)")
        #endif

        let path: String
        let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems

        // Extract path from URL
        if url.scheme == "meeshy" {
            // Custom scheme: meeshy://join/abc -> path = "/join/abc"
            if let host = url.host {
                path = "/\(host)" + url.path
            } else {
                path = url.path
            }
        } else if url.scheme == "https" && (url.host == "meeshy.me" || url.host == "www.meeshy.me") {
            // Universal link: https://meeshy.me/join/abc -> path = "/join/abc"
            path = url.path
        } else {
            #if DEBUG
            print("⚠️ Unsupported URL scheme: \(url.scheme ?? "nil")")
            #endif
            return
        }

        // Route based on path
        routeDeepLink(path: path, queryItems: queryItems)
    }

    private func routeDeepLink(path: String, queryItems: [URLQueryItem]?) {
        let components = path.components(separatedBy: "/").filter { !$0.isEmpty }

        guard !components.isEmpty else {
            // Root path - go to conversations
            navigationCoordinator.navigate(to: .conversations)
            return
        }

        let route = components[0]
        let param = components.count > 1 ? components[1] : nil

        #if DEBUG
        print("📱 Routing deep link - route: \(route), param: \(param ?? "nil")")
        #endif

        switch route {
        // MARK: Join Links
        case "join", "invite", "l":
            // /join/{linkId}, /invite/{linkId}, /l/{shortCode}
            if let linkId = param {
                pendingJoinLinkId = linkId
                showAnonymousJoinSheet = true
            }

        case "links":
            // /links/tracked/{linkId}
            if components.count >= 3, components[1] == "tracked" {
                pendingJoinLinkId = components[2]
                showAnonymousJoinSheet = true
            }

        // MARK: Conversations
        case "conversations", "conversation":
            // /conversations or /conversations/{id} or /conversation/{id}
            if let conversationId = param {
                navigationCoordinator.navigate(to: .conversation(conversationId))
            } else {
                navigationCoordinator.navigate(to: .conversations)
            }

        case "chat":
            // /chat/{conversationId}
            if let conversationId = param {
                navigationCoordinator.navigate(to: .conversation(conversationId))
            }

        // MARK: User Profiles
        case "u":
            // /u/{username}
            if let username = param {
                navigationCoordinator.navigate(to: .userProfile(username))
            }

        // MARK: Groups/Communities
        case "groups":
            // /groups/{groupId}
            if let groupId = param {
                navigationCoordinator.navigate(to: .group(groupId))
            } else {
                navigationCoordinator.navigate(to: .groups)
            }

        // MARK: Video Calls
        case "call":
            // /call/{callId}
            if let callId = param {
                navigationCoordinator.navigate(to: .call(callId))
            }

        // MARK: Authentication
        case "signin":
            // /signin/affiliate/{code}
            if components.count >= 3, components[1] == "affiliate" {
                let affiliateCode = components[2]
                navigationCoordinator.navigate(to: .affiliateSignup(affiliateCode))
            }

        case "reset-password":
            // /reset-password?token={token}
            if let token = queryItems?.first(where: { $0.name == "token" })?.value {
                navigationCoordinator.navigate(to: .resetPassword(token))
            }

        // MARK: App Sections
        case "notifications":
            navigationCoordinator.navigate(to: .notifications)

        case "contacts":
            navigationCoordinator.navigate(to: .contacts)

        case "search":
            navigationCoordinator.navigate(to: .search)

        case "settings":
            navigationCoordinator.navigate(to: .settings)

        default:
            #if DEBUG
            print("⚠️ Unknown deep link route: \(route)")
            #endif
        }
    }

    // MARK: - Join Handling

    private func handleJoinSuccess(conversationId: String) {
        // Close the sheet
        showAnonymousJoinSheet = false
        pendingJoinLinkId = nil

        // Navigate to the conversation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            navigationCoordinator.navigate(to: .conversation(conversationId))
        }
    }

    private func handleAuthenticatedJoin(linkId: String) async {
        // User is authenticated, try to join the conversation with their account
        // This is called when user logs in while having a pending join link

        #if DEBUG
        print("📱 Attempting authenticated join for linkId: \(linkId)")
        #endif

        // For now, just show the join sheet which will handle the logic
        // The AnonymousJoinView will detect the authenticated state and
        // offer appropriate options
        await MainActor.run {
            showAnonymousJoinSheet = true
        }
    }

    private func checkForPendingAnonymousSession() {
        // Check if user has an active anonymous session from a previous app launch
        if anonymousLinkService.hasActiveSession,
           let storedLinkId = anonymousLinkService.getStoredLinkId() {
            #if DEBUG
            print("Found active anonymous session for linkId: \(storedLinkId)")
            #endif

            // User has an active anonymous session
            // Could auto-navigate to their conversation here if desired
        }
    }

}
