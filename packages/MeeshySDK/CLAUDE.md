# packages/MeeshySDK - Swift SDK pour iOS

## Purpose
SDK Swift modulaire fournissant les services core (auth, networking, sockets, cache, notifications) et les composants UI rutilisables pour l'app iOS Meeshy. Spar en deux targets pour permettre l'utilisation du SDK sans la couche UI.

## Tech Stack
- Swift 5.9, iOS 16.0+
- Swift Package Manager (SPM)
- Socket.IO Client 16.1 (seule dpendance externe)
- URLSession natif (HTTP)
- Combine (streams ractifs)

## Structure
```
Sources/
MeeshySDK/                      -> Target core (logique mtier)
  MeeshySDK.swift              -> Point d'entre, version, config
  Configuration/
    MeeshyConfig.swift         -> Configuration centralise (URLs, timeouts)
  Auth/
    AuthManager.swift          -> Singleton auth, token storage, session
    AuthService.swift          -> API calls auth (login, register, refresh)
    AuthModels.swift           -> LoginRequest/Response, RegisterRequest
  Networking/
    APIClient.swift            -> Client HTTP gnrique async/await
    SocketConfig.swift         -> Configuration Socket.IO
  Sockets/
    MessageSocketManager.swift -> WebSocket messages temps rel
    SocialSocketManager.swift  -> WebSocket feed social (posts, stories)
  Models/
    CoreModels.swift           -> Types de base (User, enums)
    ConversationModels.swift   -> Conversation, ConversationMember
    MessageModels.swift        -> Message, MessageTranslation
    PostModels.swift           -> Post, PostComment
    FeedModels.swift           -> Feed, FeedItem
    StoryModels.swift          -> Story, StorySlide
    UserModels.swift           -> UserProfile, UserPreferences
    NotificationModels.swift   -> Notification types
    SampleData.swift           -> Donnes de dmo
  Cache/
    MediaCacheManager.swift    -> Actor cache mdia (NSCache + FileManager)
    AudioPlayerManager.swift   -> Lecture audio
    PhotoLibraryManager.swift  -> Accs photos
  Theme/
    ColorGeneration.swift      -> Gnration couleurs depuis hash
  Notifications/
    PushNotificationManager.swift -> Firebase + APNs push

MeeshyUI/                       -> Target UI (composants SwiftUI)
  Theme/
    ColorExtensions.swift      -> Color(hex:) extension
  Auth/
    MeeshyLoginView.swift      -> cran de connexion
    MeeshyRegisterView.swift   -> cran d'inscription
    MeeshyForgotPasswordView.swift -> Mot de passe oubli
    Components/
      AuthTextField.swift      -> Champ de saisie auth
      UsernameField.swift      -> Champ username avec validation
      PasswordStrengthIndicator.swift -> Indicateur force mdp
      LanguageSelector.swift   -> Slecteur de langue
      CountryPicker.swift      -> Slecteur de pays
```

## Architecture

### Dual-Target Design
```
MeeshySDK (core)     -> Pas de dpendance SwiftUI
    ^
    |
MeeshyUI (views)     -> Dpend de MeeshySDK, importe SwiftUI
```
- **MeeshySDK**: Logique pure (auth, networking, sockets, cache, models)
- **MeeshyUI**: Composants SwiftUI (auth screens, form fields)

### Singletons
Tous les managers sont des singletons:
```swift
AuthManager.shared
APIClient.shared
MessageSocketManager.shared
SocialSocketManager.shared
MediaCacheManager.shared  // Actor, pas class
PushNotificationManager.shared
```

### Networking
- `APIClient`: Client HTTP gnrique avec `async/await`
- Token refresh automatique avec retry sur 401
- Dcodage date ISO8601 avec secondes fractionnaires
- Timeout configurable via `MeeshyConfig`

### Socket.IO
- Deux managers spars: messages et social (reconnexion indpendante)
- Events publis via Combine `PassthroughSubject`
- Convention: `entity:action-word` (hyphens, pas underscores)

### Cache Mdia
- `actor MediaCacheManager` (thread-safe via Swift actors)
- Double couche: NSCache (mmoire) + FileManager (disque, 7j TTL)
- Dduplification in-flight (vite tlchargements parallles du mme fichier)

### Prisme Linguistique — Models & Socket

Le SDK fournit les types API et la communication temps reel pour le prisme linguistique :

**Models SDK** (`Models/MessageModels.swift`) :
- `APITextTranslation` : Traduction brute depuis l'API (id, messageId, sourceLanguage, targetLanguage, translatedContent, translationModel, confidenceScore)
- `APIMessage.translations: [APITextTranslation]?` : Traductions pre-chargees avec le message via REST

**Model App** (`Features/Main/ViewModels/ConversationViewModel.swift`) :
- `MessageTranslation` : Type domain cote app (pas dans le SDK) pour les traductions en cache dans le ViewModel

**Socket** (`Sockets/MessageSocketManager.swift`) :
- `requestTranslation(messageId:targetLanguage:)` : Demande de traduction on-demand
- `translationReceivedPublisher` : Combine publisher pour les traductions recues en temps reel
- Evenements : `translation:request` (client → server), `translation:completed` (server → client)

**Resolution** : La logique de resolution de langue preferee est dans le ViewModel de l'app (pas dans le SDK). Le SDK fournit les donnees brutes, l'app decide de l'affichage.

## Visual Identity — Indigo Brand

The Meeshy brand identity is built on an **Indigo gradient** derived from the logo SVGs.

### Logo
- **Light mode**: Gradient background (`#6366F1` -> `#4338CA`) + white stacked-dashes icon
- **Dark mode**: Black background (`#000000`) + gradient stacked-dashes icon (`#6366F1` -> `#4338CA`)
- Icon: Three horizontal lines of decreasing length, left-aligned, rounded caps

### Brand Color System (`MeeshyUI/Theme/MeeshyColors.swift`)
```
Indigo Scale (the full palette):
  indigo50  #EEF2FF   indigo100 #E0E7FF   indigo200 #C7D2FE
  indigo300 #A5B4FC   indigo400 #818CF8   indigo500 #6366F1  <- primary
  indigo600 #4F46E5   indigo700 #4338CA  <- primary deep
  indigo800 #3730A3   indigo900 #312E81   indigo950 #1E1B4B

Semantic: success=#34D399  error=#F87171  warning=#FBBF24  info=#60A5FA
```

### Gradients
- **`brandGradient`**: `#6366F1` -> `#4338CA` (top-leading -> bottom-trailing) — THE signature
- **`brandGradientLight`**: `#818CF8` -> `#6366F1` — secondary elements
- **`brandGradientSubtle`**: indigo300@30% -> indigo500@30% — tinted backgrounds
- **`avatarRingGradient`**: indigo500 -> indigo400 -> indigo500 — avatar borders

### Theme Colors (`MeeshyUI/Theme/ThemeManager.swift`)
| Token | Dark | Light |
|-------|------|-------|
| `backgroundPrimary` | `#09090B` | `#FFFFFF` |
| `backgroundSecondary` | `#13111C` | `#F8F7FF` |
| `backgroundTertiary` | `#1E1B4B` | `#EEF2FF` |
| `textPrimary` | `#EEF2FF` | `#1E1B4B` |
| `textSecondary` | `#A5B4FC` | `#4338CA@60%` |
| `textMuted` | `#818CF8@50%` | `#6366F1@40%` |
| `inputBackground` | `#16142A` | `#F5F3FF` |
| `inputBorder` | `#312E81@60%` | `#C7D2FE` |

### Rules
1. The Indigo gradient is sacred — always `#6366F1` -> `#4338CA`
2. New code MUST use `indigo50`-`indigo950` or semantic names (`success`, `error`, etc.)
3. Legacy aliases (`pink`, `coral`, `cyan`, `teal`, etc.) are `@available(*, deprecated)` — do not use
4. Glass effects use `.ultraThinMaterial` tinted with Indigo, not neutral
5. Ambient orbs use Indigo family colors (indigo500, indigo700, indigo400, indigo300)

## Conventions

### Nommage
```swift
class ServiceName { }           // PascalCase classes
struct DataModel: Codable { }   // PascalCase structs
func fetchData() async { }     // camelCase fonctions
let maxRetryCount = 3           // camelCase constantes locales
static let shared = Service()   // Singletons
```

### Patterns
```swift
// Modle Decodable avec CodingKeys
struct APIResponse: Decodable {
    let id: String
    let title: String?

    enum CodingKeys: String, CodingKey {
        case id, title
    }
}

// Conversion API -> Domain
extension APIModel {
    func toDomain() -> DomainModel {
        DomainModel(id: id, name: title ?? "Default")
    }
}

// Combine subscriptions
private var cancellables = Set<AnyCancellable>()
socketManager.messagePublisher
    .receive(on: DispatchQueue.main)
    .sink { [weak self] message in
        self?.handleMessage(message)
    }
    .store(in: &cancellables)
```

### Error Handling
```swift
do {
    let result = try await apiClient.request(endpoint)
} catch let error as APIError {
    // Erreur rseau type
} catch {
    // Erreur inattendue
}
```

## Testing

### Running Tests
```bash
# Via xcodebuild (required — swift test doesn't link UIKit)
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet

# Filter specific test suite
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/ConversationServiceTests
```

### Test Targets
- `MeeshySDKTests` → Tests for MeeshySDK core (models, services, networking, auth)
- `MeeshyUITests` → Tests for MeeshyUI components (placeholder for now)

### Test Organization
```
Tests/
├── MeeshySDKTests/
│   ├── Models/        → Codable roundtrip, toDomain() conversion tests
│   ├── Services/      → Service tests with MockAPIClient
│   ├── Networking/    → APIResponse, APIError, APIClient tests
│   ├── Auth/          → AuthService, AuthManager tests
│   └── Mocks/         → MockAPIClient (shared test infrastructure)
└── MeeshyUITests/     → UI component tests
```

### MockAPIClient
All service tests use `MockAPIClient` (in `Tests/MeeshySDKTests/Mocks/`):
```swift
let mock = MockAPIClient()
mock.stubResponse(endpoint: "/conversations", data: [...])
let service = ConversationService(api: mock)
let result = try await service.list(offset: 0, limit: 30)
```

### Convention
- Swift Testing (`@Test`, `#expect`) for pure model decoding tests
- XCTest for service tests requiring async/await patterns
- JSONStub pattern for creating test fixtures from JSON strings
- 506+ SDK tests currently passing

## Relation avec apps/ios
- `apps/ios/Meeshy/` importe `MeeshySDK` et `MeeshyUI` via SPM local
- Les modles dans `apps/ios/Features/Main/Models/` utilisent les types SDK comme base
- `ConversationModels.swift` (app) a `APIConversation` qui map vers `Conversation` (SDK)
- Les services app (AuthManager, APIClient) sont ceux du SDK via `.shared`

## Scurit
- **DETTE TECHNIQUE**: Tokens stocks dans `UserDefaults` (DOIT migrer vers Keychain)
- HTTPS enforc via App Transport Security

## Build
```bash
# Build SDK seul
cd packages/MeeshySDK
swift build

# Build avec l'app (via SPM local dependency)
./apps/ios/meeshy.sh build
```

## Tests
```bash
swift test                           # Tous les tests
swift test --filter MeeshySDKTests   # Tests SDK uniquement
```

## Rgles cls
1. **Pas de dpendance SwiftUI dans MeeshySDK** (uniquement dans MeeshyUI)
2. **Socket.IO est la seule dpendance externe** (garder minimal)
3. **Actor pour le cache** (pas class, pour thread safety)
4. **Combine pour les streams**, async/await pour le single-value
5. **Modles Decodable** avec CodingKeys explicites
6. **Conversion API -> Domain** via extensions `toDomain()`
7. **Consulter `decisions.md`** pour les choix architecturaux et leurs justifications
