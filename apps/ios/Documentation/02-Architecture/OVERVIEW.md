# Architecture Meeshy iOS - Vue d'Ensemble

Documentation complète de l'architecture de l'application Meeshy iOS.

---

## Philosophie Architecturale

Meeshy iOS est construite selon les principes de **Clean Architecture** et **MVVM**, offrant:

- ✅ **Séparation des Responsabilités** - Chaque composant a un rôle précis
- ✅ **Testabilité** - Architecture permettant des tests unitaires complets
- ✅ **Maintenabilité** - Code organisé et facile à comprendre
- ✅ **Scalabilité** - Architecture extensible pour les futures fonctionnalités
- ✅ **Performance** - Optimisations intégrées dès la conception

---

## Diagramme d'Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│                                                              │
│  ┌──────────────┐        ┌──────────────────┐              │
│  │              │        │                   │              │
│  │    Views     │◄───────┤   ViewModels     │              │
│  │  (SwiftUI)   │        │  (@Observable)    │              │
│  │              │        │                   │              │
│  └──────────────┘        └────────┬──────────┘              │
│                                   │                          │
└───────────────────────────────────┼──────────────────────────┘
                                    │
                                    │ Use Cases
                                    │
┌───────────────────────────────────▼──────────────────────────┐
│                      DOMAIN LAYER                             │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │           Business Logic / Use Cases             │       │
│  │  - SendMessage    - TranslateText               │       │
│  │  - LoadConversations  - AuthenticateUser        │       │
│  └────────────────────┬─────────────────────────────┘       │
│                       │                                      │
│  ┌────────────────────▼─────────────────────────────┐       │
│  │              Domain Models                        │       │
│  │  User, Message, Conversation, Attachment        │       │
│  └──────────────────────────────────────────────────┘       │
│                       │                                      │
└───────────────────────┼──────────────────────────────────────┘
                        │ Interfaces
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                       DATA LAYER                              │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │             Repositories                       │         │
│  │  - MessageRepository                          │         │
│  │  - ConversationRepository                     │         │
│  │  - UserRepository                             │         │
│  └────────┬─────────────────────────┬─────────────┘         │
│           │                         │                        │
│  ┌────────▼────────┐      ┌────────▼──────────┐            │
│  │                 │      │                    │            │
│  │  Local Storage  │      │  Remote Data       │            │
│  │  (CoreData)     │      │  (REST + Socket)   │            │
│  │                 │      │                    │            │
│  └─────────────────┘      └────────────────────┘            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                        │
│                                                              │
│  Security   •   Analytics   •   Push Notifications          │
│  Keychain   •   Firebase    •   Certificate Pinning         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Couches Architecturales

### 1. Presentation Layer (UI)

**Responsabilité:** Affichage et interactions utilisateur

**Composants:**
- **Views (SwiftUI)** - Interface utilisateur déclarative
- **ViewModels** - État et logique de présentation
- **Components** - Composants UI réutilisables

**Principe:**
- Les Views sont "dumb" - elles affichent ce que le ViewModel leur dit
- Les ViewModels sont "smart" - ils contiennent la logique
- Communication unidirectionnelle: View → ViewModel → Domain

**Exemple:**

```swift
// View (Simple, Déclarative)
struct ChatView: View {
    @StateObject private var viewModel = ChatViewModel()

    var body: some View {
        VStack {
            MessageListView(messages: viewModel.messages)
            MessageInputView(onSend: viewModel.sendMessage)
        }
        .task {
            await viewModel.loadMessages()
        }
    }
}

// ViewModel (Logique)
@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    private let messageService: MessageService

    func sendMessage(_ text: String) async {
        // Logique de traitement
        await messageService.send(text)
    }

    func loadMessages() async {
        messages = await messageService.fetchMessages()
    }
}
```

---

### 2. Domain Layer (Business Logic)

**Responsabilité:** Logique métier pure, indépendante de l'UI et de l'infrastructure

**Composants:**
- **Models** - Entités métier (User, Message, Conversation)
- **Use Cases** - Actions métier spécifiques
- **Protocols** - Contrats pour les services

**Principe:**
- Aucune dépendance vers l'UI ou l'infrastructure
- Contient les règles métier
- Définit les interfaces (protocols)

**Exemple:**

```swift
// Domain Model
struct Message: Identifiable {
    let id: String
    let content: String
    let senderId: String
    let conversationId: String
    let timestamp: Date
    var translations: [String: String] = [:]
}

// Use Case Protocol
protocol SendMessageUseCase {
    func execute(content: String, conversationId: String) async throws -> Message
}

// Use Case Implementation
class SendMessageUseCaseImpl: SendMessageUseCase {
    private let repository: MessageRepository
    private let translator: TranslationService

    func execute(content: String, conversationId: String) async throws -> Message {
        // 1. Créer le message
        var message = Message(...)

        // 2. Détecter la langue
        let language = await translator.detect(content)

        // 3. Envoyer via repository
        return try await repository.send(message)
    }
}
```

---

### 3. Data Layer (Accès aux Données)

**Responsabilité:** Gestion des sources de données (API, Cache, Database)

**Composants:**
- **Repositories** - Abstraction des sources de données
- **Network Services** - API REST et WebSocket
- **Cache Services** - Persistence locale (CoreData)
- **DTOs** - Objets de transfert de données

**Principe:**
- Abstraire les détails d'implémentation des sources de données
- Fournir une interface unifiée
- Gérer la synchronisation cache/réseau

**Exemple:**

```swift
// Repository Protocol (Domain)
protocol MessageRepository {
    func send(_ message: Message) async throws -> Message
    func fetchMessages(conversationId: String) async throws -> [Message]
}

// Repository Implementation (Data)
class MessageRepositoryImpl: MessageRepository {
    private let apiService: APIService
    private let cacheService: CacheService

    func send(_ message: Message) async throws -> Message {
        // 1. Optimistic: save to cache
        await cacheService.saveMessage(message)

        // 2. Send to API
        let dto = MessageDTO(from: message)
        let response = try await apiService.post("/messages/send", body: dto)

        // 3. Update cache with server response
        let serverMessage = response.toDomain()
        await cacheService.updateMessage(serverMessage)

        return serverMessage
    }

    func fetchMessages(conversationId: String) async throws -> [Message] {
        // 1. Return cached data immediately
        let cached = await cacheService.getMessages(conversationId: conversationId)

        // 2. Fetch from API in background
        Task {
            let fresh = try await apiService.get("/conversations/\(conversationId)/messages")
            await cacheService.saveMessages(fresh.map { $0.toDomain() })
        }

        return cached
    }
}
```

---

### 4. Infrastructure Layer (Services Transverses)

**Responsabilité:** Services techniques réutilisables

**Composants:**
- **Security** - Keychain, Certificate Pinning, Biometrics
- **Analytics** - Firebase Analytics, Crashlytics
- **Notifications** - Push notifications, Local notifications
- **Monitoring** - Logging, Performance tracking

---

## Patterns Architecturaux Utilisés

### 1. MVVM (Model-View-ViewModel)

**Utilisation:** Presentation Layer

**Avantages:**
- Séparation UI / Logique
- Testabilité du ViewModel
- Binding réactif avec SwiftUI

```
View ◄──(Observe)── ViewModel ◄──(Uses)── Model
  │                     │
  └──(Actions)──────────┘
```

### 2. Repository Pattern

**Utilisation:** Data Layer

**Avantages:**
- Abstraction des sources de données
- Facilite le test (mock repositories)
- Centralise la logique de cache

```
ViewModel → Repository → [API, Cache, Database]
```

### 3. Dependency Injection

**Utilisation:** Toutes les couches

**Avantages:**
- Découplage des composants
- Facilite les tests
- Flexibilité

```swift
// Protocol-based DI
protocol AuthService {
    func login(email: String, password: String) async throws -> User
}

class AuthServiceImpl: AuthService {
    // Implementation
}

// Injection in ViewModel
class LoginViewModel {
    private let authService: AuthService

    init(authService: AuthService = AuthServiceImpl.shared) {
        self.authService = authService
    }
}
```

### 4. Observer Pattern

**Utilisation:** State Management

**Avantages:**
- Réactivité
- Updates automatiques de l'UI
- Gestion d'état centralisée

```swift
@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []

    func addMessage(_ message: Message) {
        messages.append(message) // UI auto-update
    }
}
```

### 5. Coordinator Pattern (Navigation)

**Utilisation:** Navigation entre écrans

**Avantages:**
- Navigation centralisée
- Découplage des vues
- Deep linking facilité

```swift
class NavigationCoordinator: ObservableObject {
    @Published var path = NavigationPath()

    func navigateToChat(conversationId: String) {
        path.append(Route.chat(id: conversationId))
    }
}
```

---

## Flux de Données

### Pattern: Unidirectional Data Flow

```
┌──────────────────────────────────────────────┐
│                                              │
│  User Action (Tap, Swipe, etc.)            │
│         │                                   │
│         ▼                                   │
│    ┌─────────┐                             │
│    │  View   │                             │
│    └────┬────┘                             │
│         │ Trigger Action                   │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │  ViewModel   │                          │
│  └──────┬───────┘                          │
│         │ Execute Use Case                 │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │  Service /   │                          │
│  │  Repository  │                          │
│  └──────┬───────┘                          │
│         │ API Call / Cache Access          │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │   Network /  │                          │
│  │    Cache     │                          │
│  └──────┬───────┘                          │
│         │ Response                         │
│         │                                   │
│         │ (Data flows back)                │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │  ViewModel   │                          │
│  │ (Update State)│                         │
│  └──────┬───────┘                          │
│         │ @Published update                │
│         ▼                                   │
│    ┌─────────┐                             │
│    │  View   │ (Auto re-render)            │
│    └─────────┘                             │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Organisation des Fichiers

### Structure Recommandée

```
Meeshy/
├── App/
│   ├── MeeshyApp.swift          # Entry point
│   └── ContentView.swift         # Root view
│
├── Core/                         # Core business logic
│   ├── Domain/
│   │   ├── Models/              # Domain entities
│   │   ├── UseCases/            # Business logic
│   │   └── Protocols/           # Service contracts
│   │
│   ├── Data/
│   │   ├── Network/             # API client
│   │   ├── Persistence/         # CoreData
│   │   ├── Repositories/        # Data access
│   │   └── DTOs/                # Data transfer objects
│   │
│   └── Infrastructure/
│       ├── Security/            # Keychain, Biometrics
│       ├── Analytics/           # Firebase Analytics
│       └── Notifications/       # Push notifications
│
├── Features/                     # Feature modules
│   ├── Auth/
│   │   ├── Presentation/
│   │   │   ├── Views/
│   │   │   ├── ViewModels/
│   │   │   └── Components/
│   │   ├── Domain/
│   │   │   └── UseCases/
│   │   └── Data/
│   │       └── Services/
│   │
│   ├── Chat/
│   ├── Conversations/
│   └── Profile/
│
├── DesignSystem/                 # Shared UI
│   ├── Components/
│   ├── Theme/
│   └── Resources/
│
└── Navigation/
    └── NavigationCoordinator.swift
```

---

## Principes de Conception

### 1. Single Responsibility Principle (SRP)

Chaque classe a une seule responsabilité.

```swift
// ❌ BAD: Fait trop de choses
class ChatView {
    func loadMessages() { }
    func sendMessage() { }
    func translateMessage() { }
    func saveToDatabase() { }
}

// ✅ GOOD: Responsabilités séparées
class ChatViewModel {
    private let messageService: MessageService
    private let translationService: TranslationService
    private let cacheService: CacheService
}
```

### 2. Dependency Inversion Principle

Dépendre d'abstractions, pas d'implémentations concrètes.

```swift
// ❌ BAD: Dépend de l'implémentation
class ChatViewModel {
    private let api = APIService.shared
}

// ✅ GOOD: Dépend d'une abstraction
protocol MessageRepository {
    func fetchMessages() async -> [Message]
}

class ChatViewModel {
    private let repository: MessageRepository

    init(repository: MessageRepository) {
        self.repository = repository
    }
}
```

### 3. Open/Closed Principle

Ouvert à l'extension, fermé à la modification.

```swift
// ✅ Extension via protocols
protocol MessageTransformer {
    func transform(_ message: Message) -> Message
}

class TranslationTransformer: MessageTransformer {
    func transform(_ message: Message) -> Message {
        // Translation logic
    }
}

class EncryptionTransformer: MessageTransformer {
    func transform(_ message: Message) -> Message {
        // Encryption logic
    }
}
```

---

## Gestion d'État

### État Local (View-Specific)

```swift
struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false

    var body: some View {
        // UI using local state
    }
}
```

### État Partagé (Feature-Level)

```swift
@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var isTyping = false
}
```

### État Global (App-Level)

```swift
@MainActor
class AppState: ObservableObject {
    @Published var currentUser: User?
    @Published var isAuthenticated = false
    @Published var unreadCount = 0

    static let shared = AppState()
}
```

---

## Communication Entre Composants

### 1. View → ViewModel (Actions)

```swift
struct ChatView: View {
    @StateObject var viewModel: ChatViewModel

    var body: some View {
        Button("Send") {
            viewModel.sendMessage(text) // Call action
        }
    }
}
```

### 2. ViewModel → View (State Updates)

```swift
@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = [] // Auto-updates view
}
```

### 3. Service → Service (Protocols)

```swift
class MessageService {
    private let translationService: TranslationService

    func processMessage(_ message: Message) async -> Message {
        return await translationService.translate(message)
    }
}
```

### 4. Global Events (Notifications)

```swift
// Post notification
NotificationCenter.default.post(
    name: .messageReceived,
    object: message
)

// Listen to notification
NotificationCenter.default.addObserver(
    forName: .messageReceived,
    object: nil,
    queue: .main
) { notification in
    // Handle event
}
```

---

## Gestion de la Concurrence

### async/await (Préféré)

```swift
func fetchMessages() async throws -> [Message] {
    let messages = try await apiService.get("/messages")
    return messages
}
```

### Combine (Legacy)

```swift
func fetchMessages() -> AnyPublisher<[Message], Error> {
    apiService.get("/messages")
        .decode(type: [Message].self, decoder: JSONDecoder())
        .eraseToAnyPublisher()
}
```

### Task Management

```swift
class ChatViewModel {
    private var loadTask: Task<Void, Never>?

    func loadMessages() {
        loadTask?.cancel()
        loadTask = Task {
            await fetchMessages()
        }
    }

    func cancelLoading() {
        loadTask?.cancel()
    }
}
```

---

## Testing Architecture

### Unit Tests (ViewModels, Services)

```swift
class ChatViewModelTests: XCTestCase {
    func testSendMessage() async throws {
        // Arrange
        let mockService = MockMessageService()
        let viewModel = ChatViewModel(service: mockService)

        // Act
        await viewModel.sendMessage("Hello")

        // Assert
        XCTAssertEqual(viewModel.messages.count, 1)
        XCTAssertEqual(mockService.sendCallCount, 1)
    }
}
```

### Integration Tests (Repositories)

```swift
class MessageRepositoryTests: XCTestCase {
    func testFetchFromAPI() async throws {
        let repository = MessageRepositoryImpl(
            apiService: RealAPIService(),
            cacheService: MockCacheService()
        )

        let messages = try await repository.fetchMessages(conversationId: "123")
        XCTAssertFalse(messages.isEmpty)
    }
}
```

### UI Tests

```swift
class ChatUITests: XCTestCase {
    func testSendMessageFlow() {
        let app = XCUIApplication()
        app.launch()

        app.textFields["Message"].tap()
        app.textFields["Message"].typeText("Hello")
        app.buttons["Send"].tap()

        XCTAssertTrue(app.staticTexts["Hello"].exists)
    }
}
```

---

## Prochaines Étapes

- [Modules Features](./FEATURE_MODULES.md) - Détail des modules fonctionnels
- [Modèles de Données](./DATA_MODELS.md) - Structure des données
- [Flux de Données](./DATA_FLOW.md) - Diagrammes de flux
- [Design System](./DESIGN_SYSTEM.md) - Composants UI
- [Performance](./PERFORMANCE.md) - Optimisations

---

**Dernière Mise à Jour:** 25 Novembre 2025
