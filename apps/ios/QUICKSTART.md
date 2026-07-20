# Quick Start - Meeshy iOS

## Prerequisites

- macOS 14+
- Xcode 16+ with iOS 17+ SDK
- iPhone 16 Pro simulator (or physical device)
- Backend services running (gateway on port 3000, translator on port 8000)

## First-Time Setup

### 1. Clone and install dependencies

```bash
git clone git@github.com:isopen-io/meeshy.git
cd meeshy
pnpm install          # Installs gateway + web dependencies
```

### 2. Build and run the iOS app

From the repo root:

```bash
./apps/ios/meeshy.sh build    # Build only
./apps/ios/meeshy.sh run      # Build + install + launch + stream logs
```

`meeshy.sh` handles simulator boot, SPM resolution, code signing, and log streaming. Never use `xcodebuild` directly.

### 3. Test credentials

| User       | Password                 |
|------------|--------------------------|
| `atabeth`  | `<DEMO_PASSWORD — see apps/ios/fastlane/.env>`   |

API base: `http://localhost:3000/api/v1/` (dev) or `https://gate.meeshy.me/api/v1/` (prod)

## Project Structure

```
apps/ios/
├── Meeshy.xcodeproj           → Xcode project (SPM dependencies)
├── Package.swift              → SPM package definition (Firebase, WebRTC, SocketIO, etc.)
├── GoogleService-Info.plist   → Firebase config (Analytics, Crashlytics, Messaging)
├── meeshy.sh                  → Build/run/test script (single entry point)
├── Meeshy/
│   ├── MeeshyApp.swift        → App entry point
│   ├── AppDelegate.swift      → Firebase init, push notifications, crash reporting
│   ├── DesignSystem/          → Theme, colors, modifiers
│   └── Features/Main/
│       ├── Views/             → SwiftUI screens
│       ├── ViewModels/        → MVVM state management
│       ├── Models/            → App-level models
│       ├── Navigation/        → Router, Route enum
│       ├── Services/          → Networking, calls, audio, analytics
│       └── Components/        → Reusable UI
├── MeeshyNotificationExtension/ → Rich push (avatar, threading, prefetch)
├── MeeshyShareExtension/     → Share-to-Meeshy
├── MeeshyWidgets/             → Home screen widgets
└── MeeshyTests/               → Unit tests (XCTest)
```

## Key Dependencies

| Package            | Purpose                          |
|--------------------|----------------------------------|
| `MeeshySDK`       | Core SDK (auth, networking, sockets, cache) — `packages/MeeshySDK/` |
| `MeeshyUI`        | Reusable SwiftUI components — `packages/MeeshySDK/` |
| `FirebaseCore`     | Firebase initialization           |
| `FirebaseAnalytics`| Screen tracking, usage analytics  |
| `FirebaseCrashlytics` | Crash reporting               |
| `FirebaseMessaging`| Push notifications (APNs)        |
| `SocketIO`         | Real-time messaging               |
| `WebRTC`           | Voice/video calls (P2P)          |
| `Kingfisher`       | Image caching                     |
| Apple `Speech`     | On-device speech recognition (SFSpeechRecognizer) |

## Common Commands

```bash
./apps/ios/meeshy.sh build     # Build (non-blocking)
./apps/ios/meeshy.sh run       # Build + install + launch + logs (blocks)
./apps/ios/meeshy.sh test      # Run unit tests
./apps/ios/meeshy.sh clean     # Clean build artifacts
./apps/ios/meeshy.sh status    # Show simulator/app/build status
./apps/ios/meeshy.sh restart   # Stop + build + install + launch
```

## Architecture

- **MVVM** with `@MainActor` ViewModels and `@Published` state
- **Singletons** for shared services: `AuthManager`, `APIClient`, `MessageSocketManager`, `CacheCoordinator`
- **NavigationStack** + `Router` for navigation (supports iPad two-column)
- **Cache-first**: Every screen loads from GRDB/disk cache before network
- **Prisme Linguistique**: Content displayed in user's preferred language automatically

## Troubleshooting

### "No such module 'MeeshySDK'"
SPM hasn't resolved yet. Run `./apps/ios/meeshy.sh clean --deep` then rebuild.

### Build killed or hangs
A previous build may be running. Run `./apps/ios/meeshy.sh clean` first.

### Simulator not found
Check available simulators: `xcrun simctl list devices available | grep iPhone`

### Firebase not configured
Ensure `GoogleService-Info.plist` is in `apps/ios/` with correct `BUNDLE_ID` (`me.meeshy.app`).

### WebSocket connection failed
Ensure the gateway is running on port 3000: `tmux attach -t meeshy` (window 1).
