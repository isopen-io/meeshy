# apps/ios - SwiftUI iOS App

## Tech Stack
- SwiftUI (NOT UIKit), iOS 17.0+, Swift 5.9
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
│   ├── Navigation/              → Router, Route enum (NavigationStack)
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

Based on [Swift.org API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/):

| Category | Pattern | Example |
|----------|---------|---------|
| Views | `{Screen}View` | `ConversationView` |
| ViewModels | `{Feature}ViewModel` | `ConversationViewModel` |
| Services | `{Function}Manager` | `AuthManager`, `PresenceManager` |
| Models (API) | `API{Entity}` | `APIConversation` |
| Models (local) | `{Entity}` | `Conversation` |
| Components | PascalCase | `ChatBubble`, `MeeshyAvatar` |
| Protocols (what it is) | Nouns | `MessageProvider`, `AudioSource` |
| Protocols (capability) | `-able`/`-ible`/`-ing` | `Sendable`, `Cacheable`, `ProgressReporting` |
| Boolean properties | Reads as assertion | `isEmpty`, `isConnected`, `hasUnread` |
| Mutating methods | Imperative verb | `sort()`, `append()`, `disconnect()` |
| Non-mutating methods | Noun/past participle | `sorted()`, `appended()`, `disconnected()` |
| Factory methods | `make` prefix | `makeIterator()`, `makeRequest()` |

### API Design Principles (Apple Official)
- **Clarity at point of use** is the primary goal
- Include all words needed to avoid ambiguity: `remove(at: index)` not `remove(index)`
- Omit needless words that repeat type info: `func add(_ person: Person)` not `addPerson`
- Name by role, not type: `greeting` not `string`
- Methods with side-effects read as imperative verbs: `array.sort()`
- Methods without side-effects read as nouns: `array.sorted()`
- Computed properties with non-O(1) complexity must document it

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
@StateObject var viewModel       // View-owned (ONLY when creating the instance)
@ObservedObject var manager      // Passed-in (NEVER for instantiation - causes re-creation)
@EnvironmentObject var shared    // App-wide singleton
```

### State Management Rules
- Use `@StateObject` when the View CREATES the object; `@ObservedObject` when RECEIVED
- Use `@State` for simple local values (Bool, String, Int)
- Use `let` for properties that never change during the view's lifetime (avoids needless dependency tracking)
- Minimize `@Published` properties: each one triggers view re-evaluation on change
- Derive computed state instead of storing redundant `@Published` values
- Never store view-only state (animations, scroll position) in ViewModels

## Networking
- REST: `APIClient` with `async/await`, generic `request<T: Decodable>()`
- WebSocket: Socket.IO with Combine `PassthroughSubject` for events
- Base URL configurable via UserDefaults (local vs remote)
- Date parsing: ISO8601 with fractional seconds
- Bearer token: `Authorization: Bearer {token}`

## Navigation
- **Hybrid NavigationStack + ZStack** pattern
- NavigationStack for hierarchical flows (conversation list → conversation detail)
- ZStack for overlays (feed, menu ladder, floating buttons)
- Router.swift (`Features/Main/Navigation/Router.swift`) manages NavigationPath
- `@Environment(\.dismiss)` for back navigation (replaces custom `onBack` callbacks)
- Native iOS swipe-to-back gesture (replaces custom DragGesture)

## Design System
- Colors: Pink (#FF2E63), Cyan (#08D9D6), Purple (#A855F7)
- Glass UI: `.ultraThinMaterial` + subtle borders
- View modifiers: `.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`
- Haptics: `HapticFeedback.light()`, `.medium()`, `.success()`, `.error()`
- Animations: `.spring(response: 0.4-0.7, dampingFraction: 0.6-0.8)`
- Staggered delays: 0.04-0.05s per list item index

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

---

# Swift & iOS Best Practices

Based on Apple's official guidelines, WWDC sessions, and Swift.org documentation.

## Value Types vs Reference Types

Prefer `struct` over `class` by default (Apple WWDC guidance):

```swift
// CORRECT: Value type for data models
struct Message: Identifiable, Codable {
    let id: String
    let content: String
    let timestamp: Date
    let senderId: String
}

// CORRECT: Reference type only when identity/shared mutable state is needed
@MainActor class ConversationViewModel: ObservableObject {
    @Published private(set) var messages: [Message] = []
}
```

### When to use `struct`
- Data models, DTOs, configuration
- Immutable or copy-on-write semantics
- No need for inheritance
- Thread-safe by default (value types are copied across boundaries)

### When to use `class`
- ViewModels (`ObservableObject` requires class)
- Shared mutable state (managers, services)
- Identity matters (two instances are NOT the same even with equal values)
- Interop with Objective-C frameworks

## Protocol-Oriented Programming

Design with protocols first, concrete types second ([WWDC19: Modern Swift API Design](https://developer.apple.com/videos/play/wwdc2019/415/)):

```swift
// Define capability as protocol
protocol MessageSending {
    func send(_ message: Message, to conversation: Conversation) async throws
}

// Conform concrete types
class MessageSocketManager: MessageSending {
    func send(_ message: Message, to conversation: Conversation) async throws { ... }
}

// Depend on abstraction, not concretion
class ConversationViewModel: ObservableObject {
    private let messageSender: MessageSending  // Protocol, not concrete type

    init(messageSender: MessageSending = MessageSocketManager.shared) {
        self.messageSender = messageSender
    }
}
```

### Protocol Rules
- Use protocols to define **behavior contracts** (not data shapes)
- Name protocols that describe "what it is" as nouns: `AudioSource`
- Name protocols that describe capability with `-able`/`-ing`: `Cacheable`, `ProgressReporting`
- Prefer protocol composition over inheritance: `Codable & Identifiable & Hashable`
- Use protocol extensions for default implementations shared across conforming types
- Avoid protocol overuse: concrete types are fine when abstraction adds no value

## Memory Management (ARC)

Swift uses Automatic Reference Counting. Retain cycles are the #1 source of memory leaks:

```swift
// WRONG: Retain cycle - closure captures self strongly
viewModel.onUpdate = {
    self.updateUI()  // self -> closure -> self (cycle)
}

// CORRECT: Weak capture breaks the cycle
viewModel.onUpdate = { [weak self] in
    self?.updateUI()
}

// CORRECT: Unowned when lifetime is guaranteed (parent-child)
parent.onChildEvent = { [unowned self] in
    self.handleEvent()
}
```

### ARC Rules
- **Always** use `[weak self]` in closures stored as properties or passed to async operations
- Use `[unowned self]` only when the captured object's lifetime is guaranteed to outlive the closure
- Delegates must be `weak`: `weak var delegate: ConversationDelegate?`
- NotificationCenter observers: always use `[weak self]` in closure-based observers
- Combine subscriptions: `[weak self]` in `sink` closures; clean up via `Set<AnyCancellable>`
- Timer closures: always `[weak self]`, invalidate in `deinit`
- Use Xcode Memory Graph Debugger to detect retain cycles
- Use Instruments Leaks tool to profile memory in complex flows

### Common Retain Cycle Traps
```swift
// TRAP: Socket.IO event handlers
socket.on("message:new") { [weak self] data, ack in
    self?.handleNewMessage(data)
}

// TRAP: Combine pipelines
cancellable = publisher
    .sink { [weak self] value in
        self?.process(value)
    }

// TRAP: DispatchQueue closures
DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
    self?.refresh()
}
```

## Error Handling

Based on [Swift.org Error Handling](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/):

```swift
// Define domain-specific errors
enum NetworkError: LocalizedError {
    case unauthorized
    case serverError(statusCode: Int)
    case decodingFailed(underlying: Error)
    case connectionLost

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Session expired. Please log in again."
        case .serverError(let code): return "Server error (\(code))"
        case .decodingFailed: return "Failed to process server response"
        case .connectionLost: return "No internet connection"
        }
    }
}

enum MessageError: LocalizedError {
    case emptyContent
    case attachmentTooLarge(maxMB: Int)
    case conversationNotFound
    case rateLimited(retryAfter: TimeInterval)
}
```

### Error Handling Rules
- Define `enum` errors conforming to `LocalizedError` per domain (Network, Message, Auth, Media)
- Use `do-try-catch` for recoverable operations; propagate with `throws` when caller should decide
- Use `try?` only when failure genuinely means "no value" (optional conversion)
- Never use `try!` unless failure is a programmer error (assertions)
- ViewModel errors: catch in ViewModel, expose user-friendly state to Views
- Log detailed errors via `os.Logger`, show user-friendly messages in UI
- Use `Result<T, Error>` for callback-based APIs that can't use async/await

```swift
// ViewModel pattern: catch, log, expose
@MainActor class ConversationViewModel: ObservableObject {
    @Published var errorMessage: String?

    func sendMessage(_ content: String) async {
        do {
            try await messageSender.send(content)
            errorMessage = nil
        } catch let error as NetworkError {
            errorMessage = error.errorDescription
            Logger.network.error("Send failed: \(error)")
        } catch {
            errorMessage = "Something went wrong"
            Logger.network.error("Unexpected: \(error)")
        }
    }
}
```

## Swift Concurrency

Based on [Swift 6 Concurrency](https://www.hackingwithswift.com/swift/6.0/concurrency) and [WWDC sessions](https://developer.apple.com/videos/):

### Actor Isolation
```swift
// ViewModels & UI Managers: @MainActor (UI thread safety)
@MainActor class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []

    func loadMessages() async {
        let fetched = await apiClient.fetchMessages()  // Runs off main actor
        messages = fetched  // Back on MainActor automatically
    }
}

// Data processing: Custom actor (background thread safety)
actor MediaProcessor {
    private var cache: [String: Data] = [:]

    func process(_ audio: Data) async -> Data {
        // Isolated - no data races possible
    }
}
```

### Sendable
```swift
// Structs with Sendable properties are automatically Sendable
struct Message: Sendable {
    let id: String
    let content: String
}

// Classes must be explicitly marked and proven safe
final class ImmutableConfig: Sendable {
    let apiURL: URL    // let = safe
    let timeout: Int   // let = safe
}

// Use @unchecked Sendable ONLY with internal synchronization
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

### Concurrency Rules
- `@MainActor` on all ViewModels, UI Managers, and anything touching `@Published`
- `async/await` throughout; never use completion handlers for new code
- `Task { }` for launching async work from synchronous contexts (button actions, onAppear)
- `Task.detached` only when you explicitly need to escape the current actor
- `TaskGroup` / `async let` for parallel independent operations
- Always handle `Task` cancellation: check `Task.isCancelled` in long loops
- Never do heavy computation on `@MainActor`: decode JSON, process images, etc. off the main thread
- Combine `Set<AnyCancellable>` for Socket.IO subscriptions cleanup

```swift
// Parallel loading
func loadConversationData() async {
    async let messages = apiClient.fetchMessages(conversationId)
    async let members = apiClient.fetchMembers(conversationId)
    async let media = apiClient.fetchMedia(conversationId)

    let (msgs, mems, med) = await (messages, members, media)
    self.messages = msgs
    self.members = mems
    self.mediaItems = med
}
```

## SwiftUI Performance

Based on [WWDC23: Demystify SwiftUI Performance](https://developer.apple.com/videos/play/wwdc2023/10160/) and [Apple Developer Docs](https://developer.apple.com/documentation/Xcode/understanding-and-improving-swiftui-performance):

### View Body Optimization
```swift
// WRONG: Complex logic in body
var body: some View {
    VStack {
        ForEach(messages.filter { $0.isVisible }.sorted(by: { $0.date > $1.date })) { msg in
            MessageRow(message: msg)
        }
    }
}

// CORRECT: Pre-compute in ViewModel or computed property
var visibleMessages: [Message] {
    messages.filter(\.isVisible).sorted(by: { $0.date > $1.date })
}

var body: some View {
    VStack {
        ForEach(visibleMessages) { msg in
            MessageRow(message: msg)
        }
    }
}
```

### Performance Rules
- Keep `body` pure and fast: no side effects, no heavy computation
- Extract static sub-views into separate structs (SwiftUI skips re-evaluation if inputs unchanged)
- Use `let` for properties that never change (SwiftUI won't track them as dependencies)
- Use `EquatableView` or `.equatable()` on expensive sub-views
- Use `LazyVStack` / `LazyHStack` for long scrollable lists (loads on demand)
- Avoid `AnyView`: it defeats SwiftUI's structural identity optimization
- Use `@ViewBuilder` instead of `AnyView` for conditional views
- Profile with SwiftUI Instruments to identify slow body evaluations
- Minimize `@Published` property count: each change triggers full view graph re-evaluation
- Use `id()` carefully: changing identity destroys and recreates the view (expensive)

### Image & Media Performance
```swift
// CORRECT: Async image loading with placeholder
AsyncImage(url: avatarURL) { image in
    image.resizable().scaledToFill()
} placeholder: {
    Circle().fill(Color.gray.opacity(0.3))
}
.frame(width: 40, height: 40)
.clipShape(Circle())

// For lists: use Kingfisher with disk cache
KFImage(url)
    .placeholder { ShimmerView() }
    .fade(duration: 0.2)
    .cacheMemoryOnly(false)
```

## Accessibility

Based on [Apple Accessibility Documentation](https://developer.apple.com/documentation/swiftui/view-accessibility):

```swift
// Every interactive element needs a label
Button(action: sendMessage) {
    Image(systemName: "paperplane.fill")
}
.accessibilityLabel("Send message")
.accessibilityHint("Sends the current message to the conversation")

// Group related content
VStack {
    Text(sender.name)
    Text(message.content)
    Text(message.timestamp.formatted())
}
.accessibilityElement(children: .combine)

// Dynamic Type support
Text("Hello")
    .font(.body)  // Scales automatically with Dynamic Type
    // NEVER use fixed font sizes for body text

// Hide decorative elements
Image("decorative-divider")
    .accessibilityHidden(true)
```

### Accessibility Rules
- Every `Button`, `Image`, and custom interactive element MUST have `.accessibilityLabel()`
- Use `.accessibilityHint()` for actions whose result isn't obvious from the label
- Use `.accessibilityElement(children: .combine)` to group related content for VoiceOver
- Hide decorative images with `.accessibilityHidden(true)`
- Use semantic fonts (`.body`, `.headline`, `.caption`) not fixed sizes for Dynamic Type
- Test with VoiceOver enabled (Simulator: Cmd+F5)
- Test with largest Dynamic Type size (Settings > Accessibility > Larger Text)
- Use `.accessibilityValue()` for stateful controls (sliders, toggles, progress)
- Use `.accessibilityAction()` for custom swipe actions in VoiceOver
- Use Xcode Accessibility Inspector to audit screens
- Minimum touch target: 44x44pt (Apple HIG requirement)

## Security

Based on [Apple Keychain Documentation](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web) and iOS security best practices:

### Sensitive Data Storage
```swift
// CORRECT: Store tokens in Keychain (AES-256-GCM encrypted)
import Security

func saveToken(_ token: String, for key: String) throws {
    let data = Data(token.utf8)
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
}

// WRONG: Never store tokens in UserDefaults (unencrypted plist)
// UserDefaults.standard.set(token, forKey: "authToken")  // NEVER
```

### Security Rules
- **JWT tokens**: Store in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- **UserDefaults**: Only for non-sensitive preferences (theme, locale, onboarding flags)
- **SSL Pinning**: Implement for API connections to prevent MITM attacks
- **App Transport Security**: Keep ATS enabled; never disable globally
- **Biometric Auth**: Use `LAContext` for Face ID/Touch ID gated operations
- **Data Protection**: Use `FileProtectionType.complete` for sensitive files on disk
- **Clipboard**: Clear sensitive data from clipboard after paste timeout
- **Logging**: Never log tokens, passwords, or PII even in debug builds
- **Screenshots**: Use `UIApplication.shared.isProtectedDataAvailable` to hide sensitive content in app switcher

## Testing

Based on [XCTest Best Practices](https://developer.apple.com/documentation/xctest):

### Test Structure
```swift
// Arrange-Act-Assert pattern
func test_sendMessage_withValidContent_addsToMessages() async {
    // Arrange
    let mockSender = MockMessageSender()
    let viewModel = ConversationViewModel(messageSender: mockSender)

    // Act
    await viewModel.sendMessage("Hello")

    // Assert
    XCTAssertEqual(viewModel.messages.count, 1)
    XCTAssertEqual(viewModel.messages.first?.content, "Hello")
    XCTAssertNil(viewModel.errorMessage)
}

// Test error paths
func test_sendMessage_whenNetworkFails_setsErrorMessage() async {
    let mockSender = MockMessageSender(shouldFail: true)
    let viewModel = ConversationViewModel(messageSender: mockSender)

    await viewModel.sendMessage("Hello")

    XCTAssertNotNil(viewModel.errorMessage)
    XCTAssertTrue(viewModel.messages.isEmpty)
}
```

### Dependency Injection for Testability
```swift
// Protocol-based injection enables mocking
protocol MessageSending {
    func send(_ content: String) async throws
}

// Production implementation
class MessageSocketManager: MessageSending { ... }

// Test mock
class MockMessageSender: MessageSending {
    var sentMessages: [String] = []
    var shouldFail = false

    func send(_ content: String) async throws {
        if shouldFail { throw NetworkError.connectionLost }
        sentMessages.append(content)
    }
}

// ViewModel accepts protocol, not concrete type
class ConversationViewModel: ObservableObject {
    private let sender: MessageSending
    init(sender: MessageSending = MessageSocketManager.shared) {
        self.sender = sender
    }
}
```

### Testing Rules
- Test **behavior**, not implementation details
- Use Arrange-Act-Assert (Given-When-Then) structure
- One assertion focus per test (multiple XCTAssert is fine if testing one behavior)
- Test names: `test_{method}_{condition}_{expectedResult}`
- Use `XCTestExpectation` for async operations, never `sleep()`/`Thread.sleep()`
- Mock external dependencies (network, database, filesystem) via protocols
- Test error paths and edge cases, not just happy paths
- Use factory functions for test data, not shared mutable state
- Run tests in random order to catch hidden dependencies
- Profile test performance: slow tests erode developer velocity

## Logging

Use Apple's unified logging system (`os.Logger`), not `print()`:

```swift
import os

extension Logger {
    static let network = Logger(subsystem: "com.meeshy.app", category: "network")
    static let auth = Logger(subsystem: "com.meeshy.app", category: "auth")
    static let messages = Logger(subsystem: "com.meeshy.app", category: "messages")
    static let media = Logger(subsystem: "com.meeshy.app", category: "media")
    static let socket = Logger(subsystem: "com.meeshy.app", category: "socket")
}

// Usage
Logger.network.info("Fetching messages for \(conversationId)")
Logger.auth.error("Token refresh failed: \(error.localizedDescription)")
Logger.messages.debug("Received \(count) new messages")
```

### Logging Rules
- Use `os.Logger` (system-level, filterable, performance-optimized) not `print()`
- Categories per domain: `network`, `auth`, `messages`, `media`, `socket`
- Levels: `.debug` (development), `.info` (notable events), `.error` (failures), `.fault` (critical)
- Sensitive data is automatically redacted in non-debug builds by `os.Logger`
- Never log full tokens, passwords, or message content in production
- Use string interpolation: `Logger` defers formatting to read-time (zero cost if log level filtered)

## App Lifecycle

```swift
@main
struct MeeshyApp: App {
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                // Resume connections, refresh data
                PresenceManager.shared.goOnline()
            case .inactive:
                // Prepare for background
                PresenceManager.shared.goAway()
            case .background:
                // Save state, disconnect non-essential sockets
                PresenceManager.shared.goOffline()
            @unknown default:
                break
            }
        }
    }
}
```

### Lifecycle Rules
- Use `scenePhase` to manage connection lifecycle (connect/disconnect)
- Save critical state on `.background` transition
- Refresh stale data on `.active` transition
- Cancel non-essential network requests on `.inactive`
- Use `BGTaskScheduler` for background refresh (messages sync, push token refresh)

## Performance Profiling

### Tools
| Tool | Purpose |
|------|---------|
| SwiftUI Instruments | View body evaluations, dependency tracking |
| Allocations | Memory usage, peak memory, growth over time |
| Leaks | Retain cycles, leaked objects |
| Memory Graph Debugger | Visual object graph, find strong reference cycles |
| Time Profiler | CPU hotspots, slow functions |
| Network | Request timing, payload sizes |
| Core Animation | FPS drops, offscreen rendering |
| Energy Log | Battery impact, wake events |

### Performance Targets
- App launch to interactive: < 1 second
- View transitions: 60 FPS (16ms per frame)
- Message list scroll: zero dropped frames
- Memory: < 150MB typical usage
- Network: < 5 seconds for initial conversation load

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (MVVM, ZStack navigation, singletons, networking, property wrappers, mdia, design system, concurrence, tokens, build script, dpendances) avec contexte, alternatives rejetes et consquences.

## API Data Models
Le mapping complet entre les reponses JSON du gateway et les modeles Swift (API layer -> domain layer) est documente dans `api-data-models.md` dans ce repertoire. Ce fichier couvre:
- Tous les champs retournes par `GET /conversations` et `GET /conversations/:id/messages`
- Les structs `Decodable` du SDK (`APIConversation`, `APIMessage`, etc.)
- La logique de conversion vers les types domain (`MeeshyConversation`, `MeeshyMessage`, etc.)
- Les notes sur les cas particuliers (pinnedAt string, latitude/longitude non implemente, enrichment gateway)

## MeeshySDK
Le SDK Swift est dans `packages/MeeshySDK/` avec son propre `CLAUDE.md` et `decisions.md`. Voir ces fichiers pour l'architecture dual-target (MeeshySDK core + MeeshyUI), les conventions et les dcisions architecturales du SDK.
