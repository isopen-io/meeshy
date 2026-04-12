// swift-tools-version: 6.2
import PackageDescription

// Swift 6.2 "Approachable Concurrency" adoption.
//
// Core module (MeeshySDK) keeps default isolation `nonisolated` because it
// contains actors, URLSession delegates, Socket.IO callbacks and background
// workers that must run off the main thread. Each UI-touching type opts in to
// `@MainActor` explicitly.
//
// UI module (MeeshyUI) flips the default to `MainActor` per SE-0466 so that
// SwiftUI views, view models and Combine observers are main-actor-isolated by
// default — cutting a whole class of data races that show up as crashes when
// the app resumes from background.
let coreSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),     // SE-0461
    .enableUpcomingFeature("InferIsolatedConformances"),          // SE-0470
    .enableUpcomingFeature("InferSendableFromCaptures"),          // SE-0418
    .enableUpcomingFeature("GlobalActorIsolatedTypesUsability"),  // SE-0434
    .enableUpcomingFeature("MemberImportVisibility"),             // SE-0444
]

let uiSwiftSettings: [SwiftSetting] = coreSwiftSettings + [
    .defaultIsolation(MainActor.self),                            // SE-0466
]

let package = Package(
    name: "MeeshySDK",
    defaultLocalization: "fr",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MeeshySDK", targets: ["MeeshySDK"]),
        .library(name: "MeeshyUI", targets: ["MeeshyUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", exact: "16.1.1"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "6.29.3"),
        .package(url: "https://github.com/stasel/WebRTC", exact: "146.0.0"),
    ],
    targets: [
        .target(
            name: "MeeshySDK",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "WebRTC", package: "WebRTC"),
            ],
            swiftSettings: coreSwiftSettings
        ),
        .target(
            name: "MeeshyUI",
            dependencies: ["MeeshySDK"],
            resources: [.process("Resources")],
            swiftSettings: uiSwiftSettings
        ),
        .testTarget(
            name: "MeeshySDKTests",
            dependencies: ["MeeshySDK"],
            swiftSettings: coreSwiftSettings
        ),
        .testTarget(
            name: "MeeshyUITests",
            dependencies: ["MeeshyUI", "MeeshySDK"],
            swiftSettings: uiSwiftSettings
        ),
    ]
)
