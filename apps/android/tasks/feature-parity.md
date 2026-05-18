# Meeshy Android — Feature Parity Tracker

Master checklist for porting the Meeshy iOS app (`apps/ios` + `packages/MeeshySDK`,
~1 164 Swift files) to native Android (`apps/android`). This file is the anti-omission
mechanism: **nothing ships as "done" until its box is checked here and verified.**

## Detailed inventories (source of truth for scope)
- `tasks/inventory-screens.md` — ~144 user-facing screens across 15 feature areas
- `tasks/inventory-sdk.md` — 32 services, 33+ model files, 70+ socket events
- `tasks/inventory-crosscutting.md` — theme/color, Prisme Linguistique, navigation, cache, auth

## Tech mapping (iOS → Android)
| iOS | Android |
|-----|---------|
| SwiftUI | Jetpack Compose |
| MVVM + `@Published` | ViewModel + `StateFlow` |
| MeeshySDK / MeeshyUI dual target | `:sdk-core` / `:sdk-ui` modules |
| URLSession | Retrofit + OkHttp |
| Socket.IO Swift | `io.socket:socket.io-client` |
| Keychain | Android Keystore (`EncryptedSharedPreferences`) |
| Combine | Kotlin Flow |
| GRDB cache | Room + DataStore |
| WhisperKit | translator service / on-device ASR |
| WebRTC iOS | `stream-webrtc-android` |
| Firebase iOS | Firebase Android (FCM) |

## Verification (no emulator in this environment)
- Compile gate: `./meeshy.sh build`
- JVM unit tests: `./meeshy.sh test`
- Screenshot tests (planned): Roborazzi / Paparazzi — render Compose on the JVM

---

## Phase 0 — Project setup
- [x] Android SDK installed (`/root/android-sdk`, platform 35, build-tools 35.0.0)
- [x] Gradle multi-module project (`:app`, `:sdk-core`, `:sdk-ui`), version catalog
- [x] Gradle wrapper 8.11.1, AGP 8.7.3, Kotlin 2.0.21, Compose
- [x] `meeshy.sh` build helper
- [x] App compiles to debug APK

## Phase 1 — Inventory
- [x] Screens inventory
- [x] SDK inventory
- [x] Cross-cutting inventory
- [x] Master tracker (this file)

## Phase 2 — SDK foundation (`:sdk-core`)
- [x] Models: `ApiResponse`, `MeeshyUser`/`UserRole`, auth, conversation, message
- [x] `LanguageResolver` — Prisme Linguistique (resolveUserLanguage, preferredTranslation)
- [x] `DynamicColorGenerator` — accent color port (blend + hue shift + DJB2 palette)
- [x] Networking: `MeeshyConfig`, `TokenStore`/`EncryptedTokenStore`, `AuthInterceptor`,
      `NetworkResult`, `apiCall`, Retrofit `MeeshyApi`
- [x] Repositories: `AuthRepository`, `ConversationRepository`, `MessageRepository`
- [ ] Socket.IO client wrapper (`message:*`, `presence:*`, `reaction:*` events)
- [ ] Room cache + `CacheResult` / `CachePolicy` (stale-while-revalidate)
- [ ] Offline queue (FIFO, idempotent `clientMessageId`)
- [ ] FCM push integration
- [ ] Crypto / Signal Protocol E2EE
- [ ] Remaining 29 services (see `inventory-sdk.md`)

## Phase 3 — Design system (`:sdk-ui`)
- [x] `MeeshyTheme` (Material3 placeholder)
- [ ] Indigo brand palette + semantic colors + theme tokens
- [ ] Typography + spacing scale
- [ ] Conversation `accentColor` Compose integration
- [ ] Reusable primitives (avatar, buttons, fields, skeletons)

## Phase 4 — Feature slices
- [ ] Auth & Onboarding (login, register wizard, magic link, 2FA)
- [ ] Conversations list (story tray, sections, search)
- [ ] Conversation / Messages (composer, attachments, reactions, replies, translation prism)
- [ ] Stories (tray, viewer, canvas, controls)
- [ ] Feed & Posts (feed, post detail, audio posts, comments)
- [ ] Community & Community Links
- [ ] Profile & Contacts
- [ ] Settings & Account (privacy, security, notifications, data export, legal)
- [ ] Voice Profile (wizard, manage)
- [ ] Calls (WebRTC)
- [ ] Search, Notifications, Bookmarks, Affiliate/Share/Tracking links

## Phase 5 — Integration & audit
- [ ] Navigation graph + deep links (`meeshy://`, `https://meeshy.me`)
- [ ] Live integration test vs gateway (`atabeth` test account)
- [ ] Final diff audit: iOS feature list vs Android
