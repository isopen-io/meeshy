// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MeeshySDK",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "MeeshySDK", targets: ["MeeshySDK"]),
        .library(name: "MeeshyUI", targets: ["MeeshyUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", from: "16.1.0"),
    ],
    targets: [
        .target(
            name: "MeeshySDK",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift"),
            ]
        ),
        .target(
            name: "MeeshyUI",
            dependencies: ["MeeshySDK"]
        ),
    ]
)
