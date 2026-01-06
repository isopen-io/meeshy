// swift-tools-version: 6.0
// The swift-tools-version declares the minimum version of Swift required to build this package.
// This file defines Swift Package Manager dependencies for Meeshy iOS

import PackageDescription

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
        .package(
            url: "https://github.com/firebase/firebase-ios-sdk.git",
            from: "10.29.0"
        ),

        // Socket.IO Client for real-time messaging and presence
        .package(
            url: "https://github.com/socketio/socket.io-client-swift.git",
            from: "16.1.0"
        ),

        // WebRTC for video/audio calls and peer-to-peer communication
        .package(
            url: "https://github.com/stasel/WebRTC.git",
            from: "120.0.0"
        ),

        // Kingfisher for efficient image loading, caching, and processing
        .package(
            url: "https://github.com/onevcat/Kingfisher.git",
            from: "7.10.0"
        ),

        // WhisperKit for on-device speech recognition (OpenAI Whisper)
        .package(
            url: "https://github.com/argmaxinc/WhisperKit.git",
            from: "0.9.0"
        )

        // Note: ONNX Runtime for voice cloning requires manual integration
        // Install via CocoaPods: pod 'onnxruntime-objc' or download XCFramework
        // See: https://onnxruntime.ai/docs/get-started/with-objective-c.html
    ],
    targets: [
        .target(
            name: "Meeshy",
            dependencies: [
                // Firebase Products (only what's actively used)
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAnalytics", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),
                .product(name: "FirebasePerformance", package: "firebase-ios-sdk"),

                // Real-time Communication
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "WebRTC", package: "WebRTC"),

                // Image Handling
                .product(name: "Kingfisher", package: "Kingfisher"),

                // On-device Speech Recognition
                .product(name: "WhisperKit", package: "WhisperKit")
            ]
        ),
        .testTarget(
            name: "MeeshyTests",
            dependencies: ["Meeshy"]
        )
    ]
)
