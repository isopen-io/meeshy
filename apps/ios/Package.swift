// swift-tools-version: 6.2
// The swift-tools-version declares the minimum version of Swift required to build this package.
// This file defines Swift Package Manager dependencies for Meeshy iOS.

import PackageDescription

// App-level target is UI-heavy (SwiftUI views + view models). Default isolation
// is `MainActor` per SE-0466 so concurrency issues surface at compile-time
// rather than crashing the app when it resumes from background.
// Only features still marked "upcoming" in Swift 6.2 are listed here.
// SE-0418 and SE-0434 are already enabled by Swift 6 language mode.
let appSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .defaultIsolation(MainActor.self),                            // SE-0466
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),     // SE-0461
    .enableUpcomingFeature("InferIsolatedConformances"),          // SE-0470
    .enableUpcomingFeature("MemberImportVisibility"),             // SE-0444
]

let package = Package(
    name: "Meeshy",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "Meeshy",
            targets: ["Meeshy"]
        )
    ],
    dependencies: [
        // Firebase for Analytics, Crashlytics, Authentication, and Push Notifications
        // 12.x required for CrashlyticsPlugin SPM build tool (automatic dSYM upload)
        .package(
            url: "https://github.com/firebase/firebase-ios-sdk.git",
            from: "12.12.1"
        ),

        // Socket.IO Client for real-time messaging and presence
        .package(
            url: "https://github.com/socketio/socket.io-client-swift.git",
            from: "16.1.0"
        ),

        // WebRTC for video/audio calls and peer-to-peer communication
        // Pinned to match packages/MeeshySDK/Package.swift for deterministic resolution.
        .package(
            url: "https://github.com/stasel/WebRTC.git",
            exact: "146.0.0"
        )

        // On-device speech recognition uses Apple's Speech framework
        // (SFSpeechRecognizer) via MeeshySDK's EdgeTranscriptionService.
        // WhisperKit was declared but never imported — removed 2026-07-10.

        // Note: ONNX Runtime for voice cloning requires manual integration
        // Install via CocoaPods: pod 'onnxruntime-objc' or download XCFramework
        // See: https://onnxruntime.ai/docs/get-started/with-objective-c.html
    ],
    targets: [
        .target(
            name: "Meeshy",
            dependencies: [
                // Firebase Products (only what's actively used).
                // G7 (2026-07-20): FirebaseMessaging removed — push is pure
                // APNs (no import, no MessagingDelegate, no fcmToken anywhere).
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAnalytics", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk"),
                .product(name: "FirebasePerformance", package: "firebase-ios-sdk"),

                // Real-time Communication
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "WebRTC", package: "WebRTC"),

                // Image handling: SwiftUI AsyncImage + custom DiskCacheStore
                // (CachedAsyncImage in MeeshyUI). Kingfisher was previously
                // declared but never imported — removed 2026-05-06.

                // On-device speech recognition = Apple Speech framework via
                // MeeshySDK.EdgeTranscriptionService (no third-party dep).
                // WhisperKit was linked but never imported — removed 2026-07-10.
            ],
            swiftSettings: appSwiftSettings,
            plugins: [
                .plugin(name: "CrashlyticsPlugin", package: "firebase-ios-sdk")
            ]
        ),
        .testTarget(
            name: "MeeshyTests",
            dependencies: ["Meeshy"],
            swiftSettings: appSwiftSettings
        )
    ]
)
