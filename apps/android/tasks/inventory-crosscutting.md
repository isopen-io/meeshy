# Cross-Cutting Systems Inventory for Android Port

**Date:** 2026-05-18  
**Purpose:** Complete reference of Meeshy's platform-agnostic systems for faithful Android implementation.  
**Sources:** iOS/packages/MeeshySDK + packages/shared + docs/superpowers/specs + CLAUDE.md files

---

## 1. Design System & Theme

### 1.1 Color Generation Algorithm

**Source:** `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`

Every conversation gets a unique, deterministic accent color computed from its metadata using **weighted blending**:

#### Primary Color Calculation
```
primaryHex = blend(
  languageColor × 0.30,   // Conversation language mapping (e.g., fr→#3498DB, en→#E74C3C)
  typeColor    × 0.30,    // Conversation type mapping (direct→#FF6B6B, group→#4ECDC4)
  themeColor   × 0.40     // Conversation theme mapping (work→#3498DB, social→#E91E63)
)
```

#### Secondary & Accent Colors
```
secondaryHex = hueShift(primaryHex, +30°)  // Rotate hue by +30 degrees
accentHex    = hueShift(primaryHex, -30°)  // Rotate hue by -30 degrees
saturationBoost = min(1.0, memberCount / 100) × 0.2
```

#### Color Mappings

**Language Colors:**
- french: #3498DB, english: #E74C3C, spanish: #F39C12, german: #27AE60, japanese: #E91E63
- arabic: #F8B500, chinese: #C0392B, portuguese: #2ECC71, italian: #1ABC9C, other: #9B59B6

**Type Colors:**
- direct: #FF6B6B, group: #4ECDC4, community: #9B59B6, channel: #F8B500, bot: #00CED1

**Theme Colors:**
- general: #4ECDC4, work: #3498DB, social: #E91E63, gaming: #2ECC71, music: #9B59B6
- sports: #F39C12, tech: #00CED1, art: #E74C3C, travel: #1ABC9C, food: #FF7F50

#### Hue Shift Implementation
```
1. Convert hex to RGB
2. Convert RGB to HSB (Hue, Saturation, Brightness)
3. Add/subtract degrees from hue (normalize to 0-360)
4. Convert HSB back to RGB
5. Convert RGB to hex
```

**Note:** Color adaption for readability adjusts brightness based on theme mode:
- Dark mode: boost brightness ≥0.70, increase saturation to 1.1
- Light mode: cap brightness ≤0.60, maintain saturation ≥0.70

#### Fallback: colorForName()
For name-only contexts (no conversation metadata):
- Use DJB2 hash algorithm on stable identifier (userId preferred, NOT displayName)
- Map hash modulo to 40-color vibrant palette (saturated 65%+, brightness 50-85%)
- All 40 colors designed for legibility on both light and dark backgrounds

#### Post Color Generation
```
colorForPost(authorId, type, originalLanguage) = blend(
  authorColor    × 0.40,  // DJB2 hash of authorId into vibrant palette
  postTypeColor  × 0.25,  // POST/STORY/STATUS lookup
  languageColor  × 0.35   // ISO 639-1 code (fr/en/es/etc.)
)
```

### 1.2 Semantic & Brand Colors

**Brand Identity — Indigo Gradient:** `#6366F1` → `#4338CA`

**Indigo Scale:**
- indigo50: #EEF2FF, indigo100: #E0E7FF, indigo200: #C7D2FE, indigo300: #A5B4FC
- indigo400: #818CF8, indigo500: #6366F1 (primary), indigo600: #4F46E5
- indigo700: #4338CA (primary deep), indigo800: #3730A3, indigo900: #312E81, indigo950: #1E1B4B

**Semantic Colors:**
- success: #34D399, error: #F87171, warning: #FBBF24, info: #60A5FA

**Theme Tokens (Dark/Light):**
| Token | Dark | Light |
|-------|------|-------|
| backgroundPrimary | #09090B | #FFFFFF |
| backgroundSecondary | #13111C | #F8F7FF |
| backgroundTertiary | #1E1B4B | #EEF2FF |
| textPrimary | #EEF2FF | #1E1B4B |
| textSecondary | #A5B4FC | #4338CA@60% |
| textMuted | #818CF8@50% | #6366F1@40% |
| inputBackground | #16142A | #F5F3FF |
| inputBorder | #312E81@60% | #C7D2FE |

### 1.3 Fonts & Spacing (from iOS)

**Typography:**
- Display: 32px (bold), Headline: 24px (semibold), Title: 18px (semibold)
- Body: 16px (regular), Subtitle: 14px (regular), Caption: 12px (regular)

**Spacing Scale:**
- xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 20px, 2xl: 24px, 3xl: 32px

**Dark Mode:** Native support via theme mode enum (dark/light)

---

## 2. Translation — Prisme Linguistique

**Philosophy:** User always consumes content in their configured language. Translations are automatic and discrete.

**Source Files:**
- `packages/shared/utils/conversation-helpers.ts`: `resolveUserLanguage()`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`: `MeeshyUser.preferredContentLanguages`
- `/home/user/meeshy/CLAUDE.md` section "Prisme Linguistique"

### 2.1 Language Resolution Order (Source of Truth)

**For content display (messages, transcriptions, metadata):**

```
1. systemLanguage       (primary, highest priority)
2. regionalLanguage     (secondary, case-insensitive duplicate check)
3. customDestinationLanguage  (override)
4. 'fr'                 (fallback)
```

**Implementation** (from `resolveUserLanguage` in shared):
```typescript
export function resolveUserLanguage(user: {
  systemLanguage?: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string;
}): string {
  if (user.systemLanguage) return user.systemLanguage;
  if (user.regionalLanguage) return user.regionalLanguage;
  if (user.customDestinationLanguage) return user.customDestinationLanguage;
  return 'fr';
}
```

**iOS equivalent** (`MeeshyUser.preferredContentLanguages`):
```swift
public var preferredContentLanguages: [String] {
  var preferred: [String] = []
  if let sys = systemLanguage {
    preferred.append(sys)
  }
  if let reg = regionalLanguage, !preferred.contains(where: { 
    $0.caseInsensitiveCompare(reg) == .orderedSame 
  }) {
    preferred.append(reg)
  }
  if let custom = customDestinationLanguage, !preferred.contains(where: { 
    $0.caseInsensitiveCompare(custom) == .orderedSame 
  }) {
    preferred.append(custom)
  }
  if preferred.isEmpty {
    preferred.append("fr")
  }
  return preferred
}
```

### 2.2 Critical Rules

**Rule 1: Missing translation fallback**
- If NO translation matches the preferred language, display original content (return nil/empty)
- NEVER fall back to `translations.first` or arbitrary alternate language
- Absence of translation for preferred language means content is already in that language

**Rule 2: No locale device interference**
- NEVER add `Locale.current` (device locale) to content language preferences
- Device locale is UI language, NOT content language
- Example: Francophone with English iPhone should read messages in French, not English

### 2.3 Message Translation Types

**From API/SDK** (`packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`):
```swift
public struct APITextTranslation: Codable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let translatedContent: String
    let translationModel: String
    let confidenceScore: Double
}

public struct APIMessage: Codable {
    // ...
    let translations: [APITextTranslation]?  // Pre-loaded with message
}
```

**Display Logic:**
1. Load message + its translations array from cache/network
2. For each translation in array, check if `targetLanguage` matches any `preferredContentLanguages[0..n]`
3. Display matching translation or original `message.content` if no match
4. Show discrete language indicator (flag, badge) if translation active

---

## 3. Navigation & Routing

**Source:** `apps/ios/Meeshy/Features/Main/Navigation/` (Router.swift, DeepLinkRouter.swift)

### 3.1 Route Enum (Hierarchical)

```swift
enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case contacts(ContactsTab = .contacts)
    case communityList
    case communityDetail(String)
    case communityCreate
    case communitySettings(Community)
    case communityMembers(String)
    case communityInvite(String)
    case notifications
    case postDetail(String, FeedPost? = nil, showComments: Bool = false)
    case bookmarks
    case starredMessages
    case friendRequests
    case editProfile
    case storyNotificationTarget(storyId: String, intent: StoryIntent, context: StoryNotificationContext)
    // ... (18+ cases)
}
```

### 3.2 Router State Management

**NavigationStack Pattern:**
- `@Published var path: [Route]` — Stack of routes
- `push(_ route: Route)` — Push to stack
- `pop()` — Pop last route
- `popToRoot()` — Clear all routes
- `navigateToConversation(_ conversation, highlightMessageId)` — Atomic path replacement

**Hub Routes:** Settings, profile, contacts, notifications act as tab-like hubs; re-navigation collapses intermediate routes.

**iPad Two-Column Mode:**
- `onRouteRequested: ((Route) -> Bool)?` callback intercepts push
- `onPopRequested: (() -> Void)?` callback for pop/popToRoot
- Routes can be handled in split-view detail pane instead of stack

### 3.3 Deep Links

**Parser:** `DeepLinkRouter` + `DeepLinkParser`

**Supported Schemes:**
- `meeshy://` — Custom app scheme
- `https://meeshy.me/` — Universal links
- `https://www.meeshy.me/` — Alternate domain
- `https://app.meeshy.me/` — App-specific domain

**Deep Link Destinations:**
| Path | Destination | Example |
|------|-------------|---------|
| `/me` | Own profile | `meeshy://me`, `https://meeshy.me/me` |
| `/u/{username}` | User profile sheet | `meeshy://u/atabeth` |
| `/c/{id}` or `/conversation/{id}` | Conversation detail | `meeshy://c/507f1f77bcf86cd799439011` |
| `/links` | User links hub | `meeshy://links` |
| `/auth/magic-link?token=...` | Magic link validation | `meeshy://auth/magic-link?token=abc123` |
| `/share?text=...&url=...` | Share intent | `meeshy://share?text=hello&url=...` |
| `/join/{id}` or `/l/{id}` | Join community/conversation | `meeshy://join/communityId` |
| `/chat/{id}` | Chat deep link | `meeshy://chat/conversationId` |

**Magic Link Token Validation:**
- Parsed from query parameters
- Validated via `AuthManager.validateMagicLink(token:)`
- On success: auto-login + toast
- On failure: show error + stay on login

---

## 4. Instant App Principles

**Source:** `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` + `packages/MeeshySDK/Sources/MeeshySDK/Cache/`

### 4.1 Cache-First Architecture

**Pattern:**
```
User opens screen
  ↓
Check local cache (GRDB/SQLite)
  ├─ Data found → Display IMMEDIATELY
  │   ↓
  │   Fetch network in background
  │   Merge silently (no spinner, no flash)
  │
  └─ Cache empty (cold start)
     ↓
     Show skeleton placeholder
     Fetch network (blocking)
```

**Critical Rule:** NO spinner if cached data exists. Spinner ONLY on empty cache.

### 4.2 CacheResult<T> States

**Enum Definition:**
```swift
public enum CacheResult<T: Sendable>: Sendable {
    case fresh(T, age: TimeInterval)       // Recent, use immediately
    case stale(T, age: TimeInterval)       // Old but usable, refresh in background
    case expired                            // Too old, must fetch
    case empty                              // Nothing cached, must fetch
}
```

**UI Switch Pattern:**
```swift
let cacheResult = CacheCoordinator.shared.messages.load(for: conversationId)
switch cacheResult {
case .fresh(let messages, _):
    displayMessages(messages)
    // No background refresh needed

case .stale(let messages, _):
    displayMessages(messages)  // Immediately!
    Task {
        await refreshMessagesInBackground()  // Silent refresh
    }

case .expired:
    showSkeletonPlaceholder()
    let messages = try await fetchMessagesFromAPI()
    displayMessages(messages)

case .empty:
    showSkeletonPlaceholder()
    let messages = try await fetchMessagesFromAPI()
    displayMessages(messages)
}
```

**Deprecation:** Calling `.value` directly collapses freshness signal. Must use explicit `switch`.

### 4.3 Stale-While-Revalidate

**Recommended TTL Schedule:**

| Data | TTL | staleTTL | maxItems |
|------|-----|----------|----------|
| Conversations | 24h | 5 min | unlimited |
| Messages | 6 months | 2 min | 600 |
| User profiles | 1h | 5 min | 100 |
| Feed posts | 6h | 2 min | 100 |
| Stories | 24h | 5 min | unlimited |
| Bookmarks | 24h | 5 min | 200 |
| Notifications | 24h | 2 min | 200 |
| Preferences | 24h | 10 min | 500 |
| Communities | 24h | 5 min | 500 |
| Drafts | 30 days | 30 days | 500 |

**Implementation** (from `CachePolicy.swift`):
```swift
public struct CachePolicy {
    let ttl: TimeInterval              // Fresh window
    let staleTTL: TimeInterval?        // When stale starts
    let maxItemCount: Int?             // LRU eviction threshold
    let storageLocation: StorageLocation  // GRDB or disk
    
    func freshness(age: TimeInterval) -> Freshness {
        if let stale = staleTTL {
            if age < stale { return .fresh }
            if age < ttl { return .stale }
            return .expired
        } else {
            return age < ttl ? .fresh : .expired
        }
    }
}
```

### 4.4 Optimistic Updates

**Pattern:**
```
1. Capture snapshot of current state
2. Apply change to local cache IMMEDIATELY
3. Update UI (user sees change instantly)
4. Send network request
5. On success: confirm (nothing to do, already displayed)
6. On failure: rollback to snapshot + error toast
```

**Examples:**
- Send message → Add to list `.sending`, network confirms
- Mark conversation read → Remove badge, network confirms
- Like post → Increment count, network confirms
- Delete message → Hide with animation, network confirms, restore on failure

### 4.5 Offline Queue

**Type Definition** (`packages/shared/types/delivery-queue.ts`):
```typescript
type QueuedMessagePayload = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly payload: Record<string, unknown>;
  readonly enqueuedAt: string;
};
```

**Mechanism:**
- Messages sent offline are queued locally (FIFO)
- On reconnect, flush queue to network
- Show "✓" for sent, "✓✓" for delivered (when network confirms)
- Queue persisted across app restarts
- TTL: 48 hours (172800 seconds)

### 4.6 Prefetch Strategy

| Data | Trigger | Method |
|------|---------|--------|
| Messages (20 convos) | After conversation list loads | Parallel TaskGroup |
| Stories | After list loads | Background fetch |
| Feed posts (page 1) | App launch | Simultaneous with conversation load |
| Avatars | With conversation list | Disk cache pre-warm |
| Post comments | When post visible | Scroll-triggered prefetch |

---

## 5. Authentication Model

**Source:** `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`

### 5.1 MeeshyUser Structure

```swift
public struct MeeshyUser: Codable, Identifiable, Sendable {
    // Identity
    public let id: String                           // MongoDB ObjectId
    public let username: String                     // Unique username
    
    // Profile
    public let email: String?
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let bio: String?
    public let avatar: String?
    public let avatarThumbHash: String?
    public let banner: String?
    public let bannerThumbHash: String?
    
    // Roles & status
    public let role: String?                        // BIGBOSS, ADMIN, MODERATOR, etc.
    public let isActive: Bool?
    public let deactivatedAt: String?
    public let isAnonymous: Bool?
    public let isMeeshyer: Bool?
    
    // Language preferences (Prisme Linguistique)
    public let systemLanguage: String?              // Primary content language
    public let regionalLanguage: String?            // Secondary content language
    public let customDestinationLanguage: String?   // Override destination
    public let autoTranslateEnabled: Bool?
    
    // Contact
    public let phoneNumber: String?
    public let phoneVerifiedAt: String?
    public let emailVerifiedAt: String?
    
    // Presence
    public let isOnline: Bool?
    public let lastActiveAt: String?
    
    // Metadata
    public let timezone: String?
    public let registrationCountry: String?
    public let profileCompletionRate: Int?
    public let blockedUserIds: [String]?
    public let createdAt: String?
    public let updatedAt: String?
    
    // Encryption
    public let signalIdentityKeyPublic: String?
}
```

### 5.2 User Types

**Registered User:**
- Has `id`, `username`, `email`
- Authenticates with JWT token via `Authorization: Bearer {token}` header
- Can log out (token invalidated)
- Gets `emailVerifiedAt` and `phoneVerifiedAt` on verification

**Anonymous User:**
- `isAnonymous: true`
- Authenticates with session token via `X-Session-Token` header (NO encryption)
- Session token is long-lived (365-day sliding window)
- Can be converted to registered user
- No email/phone required

**Meeshyer:** Premium user with badge (isMeeshyer: true)

### 5.3 Token Management

**JWT (Registered Users):**
- Issued on login (`POST /auth/login`)
- Stored securely in Keychain (iOS)
- Sent with every API request: `Authorization: Bearer {token}`
- Expires per `expiresIn` seconds
- Refreshed via `POST /auth/refresh` with sessionToken fallback

**Session Token (All Users):**
- Long-lived token for account persistence
- 365-day sliding window (extends on each refresh)
- Used in `RefreshTokenRequest` when JWT expires
- Enables "remember device" functionality
- Survives app deletion/reinstall if stored in secure enclave

**Login Response:**
```swift
public struct LoginResponseData: Decodable {
    public let user: MeeshyUser
    public let token: String           // JWT
    public let sessionToken: String?   // Session token (nullable)
    public let expiresIn: Int?         // Seconds until JWT expiry
}
```

### 5.4 Role Hierarchy

**Global Roles:**
- BIGBOSS (100) — Full platform control
- ADMIN (80) — Administrative actions
- MODERATOR (60) — Content moderation
- AUDIT (40) — Read-only audit access
- ANALYST (30) — Analytics-only access
- USER (10) — Normal user

**Conversation Member Roles:**
- admin, moderator, member (within a conversation)

### 5.5 Language Preferences Chain

```swift
public var preferredContentLanguages: [String] {
    var preferred: [String] = []
    
    // Order: system → regional → custom → fr
    if let sys = systemLanguage {
        preferred.append(sys)
    }
    if let reg = regionalLanguage, !preferred.contains(where: { 
        $0.caseInsensitiveCompare(reg) == .orderedSame 
    }) {
        preferred.append(reg)
    }
    if let custom = customDestinationLanguage, !preferred.contains(where: { 
        $0.caseInsensitiveCompare(custom) == .orderedSame 
    }) {
        preferred.append(custom)
    }
    if preferred.isEmpty {
        preferred.append("fr")
    }
    
    return preferred
}
```

---

## 6. Socket.IO Event Convention

**Format:** `entity:action-word` (colons + hyphens, NO underscores)

**Examples:**
- `message:send` (client → server)
- `message:new` (server → client)
- `typing:start` (client → server)
- `reaction:added` (server → client)
- `message:send-with-attachments` (client → server with binary)

**Source:** `packages/shared/types/socketio-events.ts`

---

## 7. Implementation Checklist for Android

### Color Generation
- [ ] Implement DJB2 hash algorithm for stable color generation
- [ ] Create color mapping dictionaries (languages, types, themes)
- [ ] Implement RGB ↔ HSB conversion for hue rotation
- [ ] Build 40-color vibrant palette with saturation/brightness constraints
- [ ] Add dark/light mode color adaptation (brightness ≥0.70 / ≤0.60)

### Translation System
- [ ] Implement `resolveUserLanguage()` with exact order (system → regional → custom → 'fr')
- [ ] Add case-insensitive duplicate detection in language list
- [ ] Enforce "no fallback to .first" rule — if no match, show original
- [ ] Add discrete language indicators (flags, badges) to message display
- [ ] Prevent device locale from affecting content language

### Navigation
- [ ] Build Route enum with all 18+ destinations
- [ ] Implement NavigationStack pattern (or Android equivalent)
- [ ] Create DeepLinkParser supporting meeshy:// and https:// schemes
- [ ] Add hub route collapse logic (re-navigate to hub clears stack)
- [ ] Wire magic link token parsing and validation

### Cache-First Architecture
- [ ] Implement CacheResult<T> enum (.fresh/.stale/.expired/.empty)
- [ ] Build CachePolicy with configurable TTL/staleTTL
- [ ] Create cache stores (GRDB equivalent for Android: Room/MMKV)
- [ ] Ensure switch() pattern enforced, ban direct .value access
- [ ] Implement stale-while-revalidate background refresh

### Auth Model
- [ ] Map MeeshyUser struct to Android data class
- [ ] Implement JWT storage in Keychain equivalent (Android Keystore)
- [ ] Implement session token management (sliding window 365 days)
- [ ] Wire language preference chain (preferredContentLanguages)
- [ ] Support both registered (JWT) and anonymous (session token) auth

---

## 8. References

- **ColorGeneration.swift:** `/home/user/meeshy/packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`
- **Prisme Linguistique:** `/home/user/meeshy/CLAUDE.md` + `packages/shared/utils/conversation-helpers.ts`
- **Router:** `/home/user/meeshy/apps/ios/Meeshy/Features/Main/Navigation/Router.swift`
- **Auth Models:** `/home/user/meeshy/packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`
- **Cache System:** `/home/user/meeshy/packages/MeeshySDK/Sources/MeeshySDK/Cache/{CacheResult,CachePolicy,CacheCoordinator}.swift`
- **Architecture Bible:** `/home/user/meeshy/docs/superpowers/specs/2026-03-17-architecture-bible-design.md`
- **iOS CLAUDE.md:** `/home/user/meeshy/apps/ios/CLAUDE.md`

---

