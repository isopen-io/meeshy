# apps/ios - SwiftUI iOS App

## Tech Stack
- SwiftUI (NOT UIKit), iOS 16.0+, Swift 5.9
- MVVM architecture
- Swift Package Manager (SPM)
- Firebase 10.29 (Analytics, Crashlytics, Messaging, Performance)
- Socket.IO Client 16.1
- WebRTC 120.0 (calls)
- Kingfisher 7.10 (image caching)
- WhisperKit 0.9 (on-device speech recognition)

## Project Structure
```
Meeshy/
├── MeeshyApp.swift              → Entry point, auth flow, splash
├── DesignSystem/
│   ├── DesignSystem.swift       → View modifiers, effects, haptics
│   └── Theme.swift              → ThemeManager, colors, gradients
├── Features/Main/
│   ├── Views/                   → Full-screen views
│   ├── ViewModels/              → State management (MVVM)
│   ├── Models/                  → Data models (API + local)
│   ├── Services/                → Networking & business logic
│   └── Components/              → Reusable UI components
└── Assets.xcassets
```

## Build Commands
Always use `./apps/ios/meeshy.sh`:
```bash
./meeshy.sh build              # Build only (non-blocking)
./meeshy.sh run                # Build+install+launch+logs (BLOCKS)
./meeshy.sh stop               # Stop running app
./meeshy.sh restart            # Stop+build+install+launch
./meeshy.sh logs               # Stream simulator logs
./meeshy.sh status             # Show simulator/app/build status
./meeshy.sh clean              # Clean artifacts (--deep for global)
./meeshy.sh test               # Unit tests (--ui for UI tests)
```
- Simulator: iPhone 16 Pro (UDID: 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5)
- Bundle ID: `com.meeshy.app`

## Naming Conventions
| Category | Pattern | Example |
|----------|---------|---------|
| Views | `{Screen}View` | `ConversationView` |
| ViewModels | `{Feature}ViewModel` | `ConversationViewModel` |
| Services | `{Function}Manager` | `AuthManager`, `PresenceManager` |
| Models (API) | `API{Entity}` | `APIConversation` |
| Models (local) | `{Entity}` | `Conversation` |
| Components | PascalCase | `ChatBubble`, `MeeshyAvatar` |

## State Management
```swift
// Singletons (shared managers)
AuthManager.shared          // Login/logout, session
APIClient.shared            // HTTP requests
MessageSocketManager.shared // Real-time messages
SocialSocketManager.shared  // Social/presence events
PresenceManager.shared      // User online status
ThemeManager.shared         // Dark/light mode
AudioPlayerManager.shared   // Audio playback
MediaCacheManager.shared    // Disk caching

// Reactive patterns
@MainActor class ViewModel: ObservableObject {
    @Published var state: State
}

// View ownership
@StateObject var viewModel       // View-owned
@ObservedObject var manager      // Passed-in
@EnvironmentObject var shared    // App-wide singleton
```

## Networking
- REST: `APIClient` with `async/await`, generic `request<T: Decodable>()`
- WebSocket: Socket.IO with Combine `PassthroughSubject` for events
- Base URL configurable via UserDefaults (local vs remote)
- Date parsing: ISO8601 with fractional seconds
- Bearer token: `Authorization: Bearer {token}`

## Navigation
- **ZStack-based** (NOT NavigationStack)
- State-driven with `@State` flags controlling visibility
- `.asymmetric()` transitions with `.spring()` animations
- Callbacks: `onSelect`, `onBack` between views

## Design System
- Colors: Pink (#FF2E63), Cyan (#08D9D6), Purple (#A855F7)
- Glass UI: `.ultraThinMaterial` + subtle borders
- View modifiers: `.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`
- Haptics: `HapticFeedback.light()`, `.medium()`, `.success()`, `.error()`
- Animations: `.spring(response: 0.4-0.7, dampingFraction: 0.6-0.8)`
- Staggered delays: 0.04-0.05s per list item index

## Concurrency
- `async/await` throughout (NOT completion handlers)
- `@MainActor` on ViewModels and Managers
- `Task { @MainActor in ... }` for UI updates from background
- Combine `Set<AnyCancellable>` for subscription cleanup
- No force unwraps; use optional binding

## App Extensions
- MeeshyNotificationExtension (rich push)
- MeeshyShareExtension (share to Meeshy)
- MeeshyWidgets (home screen)
- MeeshyIntents (Siri/Shortcuts)

## Configuration (xcconfig)
| Config | API URL | Features |
|--------|---------|----------|
| Debug | localhost:3000 | Logging, debug menu |
| Staging | staging.meeshy.me | Crash reporting |
| Production | gate.meeshy.me | Crash reporting |

## Code Organization
- `// MARK: - SectionName` to divide file sections
- Extensions group protocol conformances
- Private properties/methods clearly marked
- One class/struct per logical responsibility
