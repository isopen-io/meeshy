# Meeshy iOS - Complete Implementation Guide

This guide provides step-by-step instructions to implement the complete Meeshy iOS app architecture.

## Table of Contents
1. [Project Setup](#project-setup)
2. [Core Data Model Setup](#core-data-model-setup)
3. [Dependency Installation](#dependency-installation)
4. [Feature Implementation Order](#feature-implementation-order)
5. [Testing Implementation](#testing-implementation)
6. [Deployment Preparation](#deployment-preparation)

---

## Project Setup

### Step 1: Create Xcode Project

```bash
# Navigate to iOS directory
cd /Users/smpceo/Documents/Services/Meeshy/ios/

# Open in Xcode
open -a Xcode Meeshy.xcodeproj
```

If the project doesn't exist:

1. Open Xcode
2. File → New → Project
3. Choose "iOS" → "App"
4. Configure:
   - Product Name: **Meeshy**
   - Team: Your Apple ID team
   - Organization Identifier: **com.meeshy**
   - Bundle Identifier: **com.meeshy.app**
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Minimum Deployment: **iOS 16.0**

### Step 2: Configure Project Settings

**General Tab:**
- Deployment Target: iOS 16.0
- Supports: iPhone, iPad
- Orientation: Portrait, Landscape

**Signing & Capabilities:**
- ✅ Automatically manage signing
- Add Capabilities:
  - Push Notifications
  - Background Modes (Remote notifications, Background fetch)
  - App Groups (com.meeshy.app.group)
  - Keychain Sharing

**Build Settings:**
- Swift Language Version: Swift 5
- Enable Bitcode: No
- Dead Code Stripping: Yes

### Step 3: Create Build Schemes

Create 3 schemes in Xcode:

**1. Meeshy (Dev)**
- Build Configuration: Debug
- Environment Variables:
  - `API_BASE_URL`: `https://dev.gate.meeshy.me`
  - `ENABLE_LOGGING`: `true`

**2. Meeshy (Staging)**
- Build Configuration: Staging
- Environment Variables:
  - `API_BASE_URL`: `https://staging.gate.meeshy.me`
  - `ENABLE_LOGGING`: `true`

**3. Meeshy (Production)**
- Build Configuration: Release
- Environment Variables:
  - `API_BASE_URL`: `https://gate.meeshy.me`
  - `ENABLE_LOGGING`: `false`

---

## Core Data Model Setup

### Step 1: Create Core Data Model

1. File → New → File
2. Choose "Data Model"
3. Name: **Meeshy.xcdatamodeld**
4. Location: `/Meeshy/Core/Persistence/`

### Step 2: Define Entities

**CachedUser Entity:**
- id: String
- username: String
- email: String
- displayName: String (Optional)
- avatarURL: String (Optional)
- bio: String (Optional)
- preferredLanguage: String
- isOnline: Boolean
- lastActiveAt: Date (Optional)
- updatedAt: Date

**CachedConversation Entity:**
- id: String
- type: String
- name: String (Optional)
- unreadCount: Integer 32
- isArchived: Boolean
- isMuted: Boolean
- updatedAt: Date

**CachedMessage Entity:**
- id: String
- conversationId: String
- senderId: String
- content: String
- type: String
- status: String
- isEdited: Boolean
- createdAt: Date
- updatedAt: Date

**CachedAttachment Entity:**
- id: String
- messageId: String
- filename: String
- mimeType: String
- size: Integer 64
- url: String
- thumbnailURL: String (Optional)

### Step 3: Generate NSManagedObject Classes

1. Select Meeshy.xcdatamodeld
2. Editor → Create NSManagedObject Subclass
3. Select all entities
4. Generate in `/Meeshy/Core/Persistence/ManagedObjects/`

---

## Dependency Installation

### Option 1: Swift Package Manager (Recommended)

1. In Xcode: File → Add Package Dependencies
2. Add the following packages:

**Socket.IO Client**
```
URL: https://github.com/socketio/socket.io-client-swift
Version: 16.1.0+
```

**Firebase SDK**
```
URL: https://github.com/firebase/firebase-ios-sdk
Version: 10.20.0+
Products:
  - FirebaseAnalytics
  - FirebaseCrashlytics
  - FirebaseMessaging
```

**Kingfisher (Image Caching)**
```
URL: https://github.com/onevcat/Kingfisher
Version: 7.10.0+
```

### Option 2: CocoaPods

Create `Podfile`:

```ruby
platform :ios, '16.0'
use_frameworks!

target 'Meeshy' do
  # Socket.IO
  pod 'Socket.IO-Client-Swift', '~> 16.1.0'

  # Firebase
  pod 'Firebase/Analytics'
  pod 'Firebase/Crashlytics'
  pod 'Firebase/Messaging'

  # Image Loading
  pod 'Kingfisher', '~> 7.10.0'
end

target 'MeeshyTests' do
  inherit! :search_paths
end
```

Install:
```bash
cd /Users/smpceo/Documents/Services/Meeshy/ios/
pod install
open Meeshy.xcworkspace
```

---

## Feature Implementation Order

Implement features in this order to maintain dependencies:

### Phase 1: Core Infrastructure (Week 1)

**Day 1-2: Configuration & Models**
- [x] `/Meeshy/Configuration/Environment.swift`
- [x] `/Meeshy/Configuration/FeatureFlags.swift`
- [x] All models in `/Meeshy/Core/Models/`

**Day 3-4: Network Layer**
- [x] `/Meeshy/Core/Network/APIService.swift`
- [x] `/Meeshy/Core/Network/WebSocketService.swift`
- [x] `/Meeshy/Core/Network/NetworkMonitor.swift`

**Day 5-6: Security & Persistence**
- [x] `/Meeshy/Core/Security/KeychainService.swift`
- [x] `/Meeshy/Core/Security/CertificatePinning.swift`
- [x] `/Meeshy/Core/Persistence/CacheService.swift`

**Day 7: Core Services**
- [x] `/Meeshy/Core/Services/AuthService.swift`
- [ ] `/Meeshy/Core/Services/NotificationService.swift`
- [ ] `/Meeshy/Core/Services/TranslationService.swift`
- [ ] `/Meeshy/Core/Services/MediaService.swift`

### Phase 2: State Management & Navigation (Week 2)

**Day 1-2: App State**
- [x] `/Meeshy/StateManagement/AppState.swift`
- [x] `/Meeshy/Navigation/NavigationCoordinator.swift`
- [x] `/Meeshy/Navigation/MainTabView.swift`

**Day 3-4: Design System**
- [x] `/Meeshy/DesignSystem/Theme/Colors.swift`
- [ ] `/Meeshy/DesignSystem/Theme/Typography.swift`
- [ ] `/Meeshy/DesignSystem/Theme/Spacing.swift`
- [x] `/Meeshy/DesignSystem/Components/PrimaryButton.swift`
- [ ] `/Meeshy/DesignSystem/Components/TextField.swift`
- [ ] `/Meeshy/DesignSystem/Components/LoadingView.swift`
- [ ] `/Meeshy/DesignSystem/Components/ErrorView.swift`

**Day 5-7: App Entry Point**
- [x] `/Meeshy/App/MeeshyApp.swift`
- [x] `/Meeshy/App/ContentView.swift`

### Phase 3: Authentication Feature (Week 3)

**Day 1-2: Auth Views**
```swift
// Implement in this order:
1. /Meeshy/Features/Auth/Views/LoginView.swift
2. /Meeshy/Features/Auth/Views/RegisterView.swift
3. /Meeshy/Features/Auth/Views/TwoFactorView.swift
4. /Meeshy/Features/Auth/Views/BiometricSetupView.swift
```

**Day 3-4: Auth ViewModels**
```swift
1. /Meeshy/Features/Auth/ViewModels/LoginViewModel.swift
2. /Meeshy/Features/Auth/ViewModels/RegisterViewModel.swift
```

**Day 5: Auth Coordinator**
```swift
1. /Meeshy/Features/Auth/Services/AuthenticationCoordinator.swift
```

**Testing:**
```swift
// Create unit tests
MeeshyTests/Unit/Features/AuthServiceTests.swift
MeeshyTests/Unit/Features/LoginViewModelTests.swift
```

### Phase 4: Conversations Feature (Week 4)

**Day 1-2: Conversations Views**
```swift
1. /Meeshy/Features/Conversations/Views/ConversationsListView.swift
2. /Meeshy/Features/Conversations/Views/ConversationRowView.swift
3. /Meeshy/Features/Conversations/Views/NewConversationView.swift
```

**Day 3-4: Conversations ViewModel**
```swift
1. /Meeshy/Features/Conversations/ViewModels/ConversationsViewModel.swift
2. /Meeshy/Features/Conversations/Repositories/ConversationRepository.swift
```

**Day 5: WebSocket Integration**
- Connect conversation list to real-time events
- Implement unread count updates
- Add typing indicators

### Phase 5: Chat Feature (Week 5)

**Day 1-3: Chat Views**
```swift
1. /Meeshy/Features/Chat/Views/ChatView.swift
2. /Meeshy/Features/Chat/Views/MessageBubbleView.swift
3. /Meeshy/Features/Chat/Views/MessageInputView.swift
4. /Meeshy/Features/Chat/Views/TranslationOverlayView.swift
```

**Day 4-5: Chat ViewModel**
- [x] `/Meeshy/Features/Chat/ViewModels/ChatViewModel.swift`
- [x] `/Meeshy/Features/Chat/Repositories/MessageRepository.swift`

**Day 6-7: Real-time Features**
- Message sending (optimistic updates)
- Message receiving (WebSocket)
- Typing indicators
- Read receipts
- Pagination

### Phase 6: Media & Attachments (Week 6)

**Day 1-3: Media Views**
```swift
1. /Meeshy/Features/Media/Views/ImagePickerView.swift
2. /Meeshy/Features/Media/Views/CameraView.swift
3. /Meeshy/Features/Media/Views/ImageViewerView.swift
```

**Day 4-5: Media Service**
```swift
1. /Meeshy/Features/Media/Services/MediaUploadService.swift
2. /Meeshy/Core/Utils/ImageCache.swift
```

**Day 6-7: Integration**
- Image compression
- Upload progress
- Thumbnail generation
- Cache management

### Phase 7: Profile & Settings (Week 7)

**Day 1-2: Profile**
```swift
1. /Meeshy/Features/Profile/Views/ProfileView.swift
2. /Meeshy/Features/Profile/Views/EditProfileView.swift
3. /Meeshy/Features/Profile/ViewModels/ProfileViewModel.swift
```

**Day 3-5: Settings**
```swift
1. /Meeshy/Features/Settings/Views/SettingsView.swift
2. /Meeshy/Features/Settings/Views/SecuritySettingsView.swift
3. /Meeshy/Features/Settings/Views/NotificationSettingsView.swift
4. /Meeshy/Features/Settings/ViewModels/SettingsViewModel.swift
```

### Phase 8: Notifications & Calls (Week 8)

**Day 1-3: Notifications**
```swift
1. /Meeshy/Features/Notifications/Views/NotificationsListView.swift
2. /Meeshy/Features/Notifications/Views/NotificationRowView.swift
3. /Meeshy/Features/Notifications/ViewModels/NotificationsViewModel.swift
4. /Meeshy/Core/Services/NotificationService.swift
```

**Day 4-7: Calls (Optional)**
```swift
1. /Meeshy/Features/Calls/Views/CallsListView.swift
2. /Meeshy/Features/Calls/Views/CallView.swift
3. /Meeshy/Features/Calls/Views/IncomingCallView.swift
4. /Meeshy/Features/Calls/ViewModels/CallViewModel.swift
5. /Meeshy/Features/Calls/Services/CallService.swift
```

---

## Testing Implementation

### Unit Tests Setup

**Create Test Base Class:**
```swift
// /MeeshyTests/TestBase.swift
import XCTest
@testable import Meeshy

class TestBase: XCTestCase {
    var mockAPIService: MockAPIService!

    override func setUp() {
        super.setUp()
        mockAPIService = MockAPIService()
    }

    override func tearDown() {
        mockAPIService = nil
        super.tearDown()
    }
}
```

**Mock API Service:**
```swift
// /MeeshyTests/Mocks/MockAPIService.swift
@testable import Meeshy

class MockAPIService {
    var mockLoginResponse: User?
    var mockError: Error?

    func get<T: Decodable>(_ endpoint: String) async throws -> T {
        if let error = mockError {
            throw error
        }
        // Return mock data
        return mockLoginResponse as! T
    }
}
```

### Test Examples

**1. AuthService Tests**
```swift
// /MeeshyTests/Unit/Services/AuthServiceTests.swift
import XCTest
@testable import Meeshy

final class AuthServiceTests: TestBase {
    func testLoginSuccess() async throws {
        // Given
        let expectedUser = User(...)
        mockAPIService.mockLoginResponse = expectedUser

        // When
        let user = try await AuthService.shared.login(
            email: "test@test.com",
            password: "password"
        )

        // Then
        XCTAssertEqual(user.email, expectedUser.email)
    }

    func testLoginFailure() async {
        // Given
        mockAPIService.mockError = APIError.unauthorized

        // When/Then
        do {
            _ = try await AuthService.shared.login(
                email: "test@test.com",
                password: "wrong"
            )
            XCTFail("Should throw error")
        } catch {
            XCTAssertTrue(error is APIError)
        }
    }
}
```

**2. ChatViewModel Tests**
```swift
// /MeeshyTests/Unit/Features/ChatViewModelTests.swift
@MainActor
final class ChatViewModelTests: TestBase {
    func testSendMessageSuccess() async {
        // Given
        let viewModel = ChatViewModel(conversationId: "conv123")

        // When
        await viewModel.sendMessage(content: "Hello", type: .text)

        // Then
        XCTAssertFalse(viewModel.isSending)
        XCTAssertGreaterThan(viewModel.messages.count, 0)
    }
}
```

### UI Tests

**Login Flow Test:**
```swift
// /MeeshyUITests/Flows/LoginFlowTests.swift
import XCTest

final class LoginFlowTests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testCompleteLoginFlow() {
        // Enter email
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.exists)
        emailField.tap()
        emailField.typeText("test@example.com")

        // Enter password
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText("password123")

        // Tap login
        app.buttons["Login"].tap()

        // Verify navigation to main tab
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
    }
}
```

---

## Deployment Preparation

### Step 1: Firebase Configuration

**1. Create Firebase Project**
- Go to [Firebase Console](https://console.firebase.google.com)
- Create new project: "Meeshy"
- Add iOS app with bundle ID: `com.meeshy.app`

**2. Download Config File**
- Download `GoogleService-Info.plist`
- Add to `/Meeshy/` (ensure it's in target membership)

**3. Enable Services**
- Analytics: Enabled
- Crashlytics: Enabled
- Cloud Messaging: Enabled
- Get APNs Auth Key from Apple Developer

### Step 2: App Icons & Assets

**Create App Icon:**
1. Use [AppIcon Generator](https://www.appicon.co/)
2. Upload 1024x1024 PNG
3. Download all sizes
4. Add to `Assets.xcassets/AppIcon`

**Launch Screen:**
```swift
// /Meeshy/App/LaunchScreen.storyboard
// Or use SwiftUI LaunchScreen (iOS 16+)
```

### Step 3: Info.plist Configuration

Add required keys:

```xml
<!-- Privacy Descriptions -->
<key>NSCameraUsageDescription</key>
<string>Meeshy needs camera access to send photos and videos</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Meeshy needs photo library access to send images</string>

<key>NSMicrophoneUsageDescription</key>
<string>Meeshy needs microphone access for voice messages and calls</string>

<key>NSFaceIDUsageDescription</key>
<string>Meeshy uses Face ID to secure your account</string>

<!-- Background Modes -->
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>remote-notification</string>
    <string>voip</string>
</array>

<!-- URL Types for Deep Links -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>meeshy</string>
        </array>
    </dict>
</array>
```

### Step 4: Certificate Pinning

**1. Get SSL Certificate**
```bash
# Download certificate from server
openssl s_client -connect gate.meeshy.me:443 -showcerts < /dev/null | \
  openssl x509 -outform DER > meeshy-cert.cer
```

**2. Add to Project**
- Add `meeshy-cert.cer` to project
- Ensure "Copy items if needed" is checked
- Add to target membership

### Step 5: Build for Release

**1. Update Version**
- Version: 1.0.0
- Build: 1

**2. Archive**
```bash
xcodebuild archive \
  -scheme Meeshy \
  -configuration Release \
  -archivePath ./build/Meeshy.xcarchive
```

**3. Export IPA**
```bash
xcodebuild -exportArchive \
  -archivePath ./build/Meeshy.xcarchive \
  -exportPath ./build/ \
  -exportOptionsPlist ExportOptions.plist
```

**4. Upload to App Store**
- Xcode → Window → Organizer
- Select archive
- Distribute App → App Store Connect

---

## Next Steps

### Week 9-10: Polish & Testing
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Memory leak detection (Instruments)
- [ ] Accessibility audit (VoiceOver)
- [ ] Localization (if needed)

### Week 11-12: Beta Testing
- [ ] TestFlight setup
- [ ] Internal testing (10+ testers)
- [ ] External testing (100+ testers)
- [ ] Bug fixes based on feedback

### Week 13: App Store Submission
- [ ] Final build
- [ ] Screenshots (all device sizes)
- [ ] App description
- [ ] Keywords
- [ ] Submit for review

---

## Checklist Before Launch

- [ ] All features implemented and tested
- [ ] No compiler warnings
- [ ] No memory leaks (verified with Instruments)
- [ ] All test suites passing
- [ ] Firebase configured
- [ ] Push notifications working
- [ ] Deep links working
- [ ] Certificate pinning enabled
- [ ] App icons complete
- [ ] Privacy policy in app
- [ ] Terms of service in app
- [ ] TestFlight beta complete
- [ ] App Store metadata ready
- [ ] Marketing materials ready

---

**Estimated Timeline:** 13 weeks from start to App Store submission

**Team Size:** 1-2 iOS developers

**Difficulty:** Intermediate to Advanced

For questions or issues, refer to [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.
