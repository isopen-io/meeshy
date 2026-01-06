# Integration Guide: Authentication & Onboarding

This guide explains how to integrate the authentication and onboarding features into your main Meeshy app.

## Quick Start

### 1. App Launch Logic

In your main `App.swift` or root view, determine which screen to show:

```swift
import SwiftUI

@main
struct MeeshyApp: App {
    @StateObject private var authService = AuthService.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authService)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var authService: AuthService
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if authService.isAuthenticated {
                // User is logged in
                MainTabView()
            } else {
                // User is not logged in
                if hasCompletedOnboarding {
                    LoginView()
                } else {
                    WelcomeView()
                }
            }
        }
        .animation(.easeInOut, value: authService.isAuthenticated)
    }
}
```

### 2. Handle Post-Registration Onboarding

After successful registration, show onboarding:

```swift
struct RegisterView: View {
    @StateObject private var viewModel = RegisterViewModel()
    @State private var showOnboarding = false

    var body: some View {
        // ... registration form ...

        .onChange(of: viewModel.registrationComplete) { completed in
            if completed {
                showOnboarding = true
            }
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingCoordinatorView()
        }
    }
}
```

### 3. Biometric Setup (Optional)

Offer biometric setup after first successful login:

```swift
struct LoginView: View {
    @StateObject private var viewModel = LoginViewModel()
    @State private var showBiometricPrompt = false
    @AppStorage("hasOfferedBiometric") private var hasOfferedBiometric = false

    var body: some View {
        // ... login form ...

        .onChange(of: AuthService.shared.isAuthenticated) { isAuth in
            if isAuth && !hasOfferedBiometric && viewModel.biometricType != .none {
                showBiometricPrompt = true
            }
        }
        .sheet(isPresented: $showBiometricPrompt) {
            BiometricPromptView(
                biometricType: viewModel.biometricType,
                onEnable: {
                    try await AuthService.shared.enableBiometricAuth()
                    hasOfferedBiometric = true
                },
                onSkip: {
                    hasOfferedBiometric = true
                }
            )
        }
    }
}
```

## Navigation Patterns

### Option A: Modal Presentation (Recommended)

Best for first launch and registration:

```swift
.fullScreenCover(isPresented: $showAuth) {
    LoginView()
}
```

### Option B: Navigation Stack

Best for settings and password changes:

```swift
NavigationStack {
    LoginView()
}
```

### Option C: Root View Switching

Best for main app authentication state:

```swift
if authService.isAuthenticated {
    MainTabView()
} else {
    LoginView()
}
```

## Deep Linking

### Password Reset

Handle password reset deep links:

```swift
struct MeeshyApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }

        // Handle: meeshy://reset-password?token=xyz
        if components.path == "/reset-password",
           let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
            // Show PasswordResetView
            NotificationCenter.default.post(
                name: .showPasswordReset,
                object: token
            )
        }
    }
}

extension Notification.Name {
    static let showPasswordReset = Notification.Name("showPasswordReset")
}
```

## State Management

### Authentication State

The `AuthService` is the single source of truth:

```swift
// Anywhere in the app
@ObservedObject var authService = AuthService.shared

// Check authentication
if authService.isAuthenticated {
    // User is logged in
}

// Access current user
if let user = authService.currentUser {
    Text("Welcome, \(user.displayName ?? user.username)")
}
```

### Onboarding State

Use `UserDefaults` for onboarding completion:

```swift
@AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

// Mark as complete
hasCompletedOnboarding = true

// Reset (for testing)
hasCompletedOnboarding = false
```

### Biometric State

Check if biometric is available and enabled:

```swift
let biometricAvailable = AuthService.shared.biometricAuthenticationAvailable()
let biometricType = AuthService.shared.biometricType()

if biometricAvailable {
    // Show biometric login option
}
```

## Error Handling

### Global Error Handler

Implement a global error handler for auth errors:

```swift
extension View {
    func handleAuthError(_ error: Error?) -> some View {
        self.alert("Error", isPresented: .constant(error != nil)) {
            Button("OK") { }
        } message: {
            if let error = error {
                Text(error.localizedDescription)
            }
        }
    }
}

// Usage
LoginView()
    .handleAuthError(viewModel.errorMessage)
```

### Network Monitoring

Monitor network state for better UX:

```swift
import Network

class NetworkMonitor: ObservableObject {
    @Published var isConnected = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = path.status == .satisfied
            }
        }
        monitor.start(queue: DispatchQueue.global())
    }
}

// In views
@StateObject private var networkMonitor = NetworkMonitor()

if !networkMonitor.isConnected {
    Text("No internet connection")
        .foregroundColor(.red)
}
```

## Testing Integration

### Mock Authentication

For SwiftUI previews and testing:

```swift
#if DEBUG
extension AuthService {
    static var preview: AuthService {
        let service = AuthService()
        service.currentUser = User.mock
        service.isAuthenticated = true
        return service
    }
}

extension User {
    static var mock: User {
        User(
            id: "1",
            username: "testuser",
            email: "test@example.com",
            displayName: "Test User",
            // ... other properties
        )
    }
}

// Preview
#Preview {
    LoginView()
        .environmentObject(AuthService.preview)
}
#endif
```

### Reset App State

For testing, add a reset function:

```swift
#if DEBUG
extension AuthService {
    func resetForTesting() {
        Task {
            try? await logout()
            UserDefaults.standard.set(false, forKey: "hasCompletedOnboarding")
            UserDefaults.standard.set(false, forKey: "hasOfferedBiometric")
        }
    }
}
#endif
```

## Performance Optimization

### Lazy Loading

Only load auth views when needed:

```swift
struct RootView: View {
    @EnvironmentObject private var authService: AuthService

    var body: some View {
        if authService.isAuthenticated {
            MainTabView()
        } else {
            authenticationView
        }
    }

    @ViewBuilder
    private var authenticationView: some View {
        if hasCompletedOnboarding {
            LoginView()
        } else {
            WelcomeView()
        }
    }
}
```

### Image Optimization

For profile photos, resize before uploading:

```swift
extension UIImage {
    func resized(to size: CGSize) -> UIImage? {
        UIGraphicsBeginImageContextWithOptions(size, false, scale)
        defer { UIGraphicsEndImageContext() }
        draw(in: CGRect(origin: .zero, size: size))
        return UIGraphicsGetImageFromCurrentImageContext()
    }
}

// Before upload
if let profileImage = viewModel.profileImage {
    let resized = profileImage.resized(to: CGSize(width: 512, height: 512))
    // Upload resized image
}
```

## Security Best Practices

### 1. Secure Token Storage

Tokens are automatically stored in Keychain via `KeychainService`. No action needed.

### 2. SSL Pinning (Optional)

Add certificate pinning in `APIService` for enhanced security:

```swift
// In APIService
func enableSSLPinning() {
    // Implement certificate pinning
}
```

### 3. Biometric Timeout

Implement auto-logout after biometric failure:

```swift
var biometricFailureCount = 0

func loginWithBiometrics() async {
    do {
        try await viewModel.loginWithBiometrics()
        biometricFailureCount = 0
    } catch {
        biometricFailureCount += 1
        if biometricFailureCount >= 3 {
            // Force password login
            showPasswordLogin = true
        }
    }
}
```

### 4. Session Timeout

Implement auto-logout on inactivity:

```swift
class SessionManager: ObservableObject {
    private var timer: Timer?
    private let timeout: TimeInterval = 900 // 15 minutes

    func resetTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { _ in
            Task {
                try? await AuthService.shared.logout()
            }
        }
    }

    func stopTimer() {
        timer?.invalidate()
    }
}
```

## Common Issues & Solutions

### Issue: White screen after login
**Solution**: Ensure `AuthService.isAuthenticated` updates on main thread:
```swift
await MainActor.run {
    self.isAuthenticated = true
}
```

### Issue: Keyboard covering input
**Solution**: Use `.ignoresSafeArea(.keyboard)` or scroll view:
```swift
ScrollView {
    // Form content
}
```

### Issue: Navigation not working
**Solution**: Wrap in NavigationStack:
```swift
NavigationStack {
    LoginView()
}
```

### Issue: Biometric not showing
**Solution**: Add to Info.plist:
```xml
<key>NSFaceIDUsageDescription</key>
<string>Use Face ID to sign in quickly</string>
```

## Checklist

Before going to production:

- [ ] Add Face ID usage description to Info.plist
- [ ] Test all authentication flows
- [ ] Test on iOS 16 and iOS 17+
- [ ] Test biometric on real devices
- [ ] Verify token storage in Keychain
- [ ] Test password strength validation
- [ ] Test 2FA flow (if enabled)
- [ ] Test network error handling
- [ ] Verify accessibility with VoiceOver
- [ ] Test deep linking
- [ ] Review security measures
- [ ] Add analytics tracking (optional)
- [ ] Test logout clears all data

## Analytics Integration (Optional)

Track key events:

```swift
enum AuthEvent {
    case loginSuccess
    case loginFailed
    case registerSuccess
    case biometricEnabled
    case onboardingCompleted
}

func trackEvent(_ event: AuthEvent) {
    // Your analytics service
    // Analytics.track(event.name, properties: ...)
}

// In ViewModels
func login() async {
    do {
        try await authService.login(...)
        trackEvent(.loginSuccess)
    } catch {
        trackEvent(.loginFailed)
    }
}
```

## Support

For issues or questions:
1. Check the main README.md
2. Review AuthService implementation
3. Verify EnvironmentConfig endpoints
4. Check Keychain permissions
5. Review console logs

---

**Last Updated**: 2025-11-22
**iOS Compatibility**: 16.0+
**SwiftUI Version**: Latest
