// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MeeshySDK",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MeeshySDK", targets: ["MeeshySDK"]),
        .library(name: "MeeshyUI", targets: ["MeeshyUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", exact: "16.1.1"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "6.29.3"),
        // WebRTC: uncomment when a Xcode 26 compatible build is available
        // .package(url: "https://github.com/stasel/WebRTC", exact: "141.0.0"),
    ],
    targets: [
        .target(
            name: "MeeshySDK",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "GRDB", package: "GRDB.swift"),
                // .product(name: "WebRTC", package: "WebRTC"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "MeeshyUI",
            dependencies: ["MeeshySDK"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "MeeshySDKTests",
            dependencies: ["MeeshySDK"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "MeeshyUITests",
            dependencies: ["MeeshyUI", "MeeshySDK"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
