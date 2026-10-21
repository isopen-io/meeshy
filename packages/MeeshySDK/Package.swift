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
// Only features still marked "upcoming" in Swift 6.2 are listed here.
// SE-0418 (InferSendableFromCaptures) and SE-0434 (GlobalActorIsolatedTypesUsability)
// are already enabled by default in Swift 6 language mode — enabling them
// again as upcoming features would emit a compiler warning.
let coreSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),     // SE-0461
    .enableUpcomingFeature("InferIsolatedConformances"),          // SE-0470
    .enableUpcomingFeature("MemberImportVisibility"),             // SE-0444
]

let uiSwiftSettings: [SwiftSetting] = coreSwiftSettings + [
    .defaultIsolation(MainActor.self),                            // SE-0466
]

let package = Package(
    name: "MeeshySDK",
    defaultLocalization: "fr",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "MeeshySDK", targets: ["MeeshySDK"]),
        .library(name: "MeeshyUI", targets: ["MeeshyUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", exact: "16.1.1"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "6.29.3"),
        .package(url: "https://github.com/stasel/WebRTC", exact: "146.0.0"),
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.17.6"),
        // Le moteur Lottie des stickers, fonds, contours et bannières (#10638) :
        // un XCFramework précompilé, lié à MeeshyUI seul — jamais aux extensions.
        .package(url: "https://github.com/airbnb/lottie-spm.git", exact: "4.6.1"),
    ],
    targets: [
        .target(
            name: "MeeshySDK",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "WebRTC", package: "WebRTC"),
            ],
            // `Resources/appearance-catalog.json` n'est PAS une ressource SwiftPM : elle ferait générer
            // `Bundle.module` ici, ambigu avec celui de MeeshyUI dans tout test qui importe les deux.
            // Son contenu est embarqué en Swift (`AppearanceCatalogData.swift`), copie gardée identique.
            exclude: ["Resources"],
            swiftSettings: coreSwiftSettings
        ),
        .target(
            name: "MeeshyUI",
            dependencies: [
                "MeeshySDK",
                .product(name: "Lottie", package: "lottie-spm"),
            ],
            resources: [
                .process("Resources"),
            ],
            swiftSettings: uiSwiftSettings
        ),
        // #10854 — le sceau réseau de CHAQUE bundle de test du package. Cible
        // de support : dépendance des seules cibles de test, jamais d'un
        // produit livré. Le chargeur C pose un constructeur qui s'exécute au
        // chargement du bundle, avant la première classe de test.
        .target(
            name: "MeeshyTestSupportLoader",
            path: "Sources/MeeshyTestSupportLoader"
        ),
        .target(
            name: "MeeshyTestSupport",
            dependencies: ["MeeshySDK", "MeeshyTestSupportLoader"],
            swiftSettings: coreSwiftSettings
        ),
        .testTarget(
            name: "MeeshySDKTests",
            dependencies: ["MeeshySDK", "MeeshyTestSupport"],
            swiftSettings: coreSwiftSettings
        ),
        .testTarget(
            name: "MeeshyUITests",
            dependencies: [
                "MeeshyUI",
                "MeeshySDK",
                "MeeshyTestSupport",
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            exclude: ["__Snapshots__"],
            // Test target keeps default `nonisolated` to match XCTestCase's
            // parent isolation. UI-touching test bodies opt into `@MainActor`
            // explicitly when they need to. Using `uiSwiftSettings` here
            // (with defaultIsolation MainActor per SE-0466) breaks every
            // XCTestCase override (init/setUp/tearDown) because the inherited
            // declaration is nonisolated.
            swiftSettings: coreSwiftSettings
        ),
    ]
)
