// swift-tools-version:6.0

// libsignal (Signal Messenger, AGPL-3.0-only) au tag épinglé de LIBSIGNAL_VERSION
// (#12536, spec 2026-10-23 § 2.2). Les sources Swift de `Sources/` et les tests
// de `Tests/` sont copiés du tag SANS modification ; la bibliothèque Rust
// `libsignal_ffi` arrive en `SignalFfi.xcframework`, construit depuis le même
// tag par `scripts/build-signal-ffi-xcframework.sh` (workflow
// `.github/workflows/libsignal-ffi.yml`), publié en artefact de release du dépôt
// et vérifié par sa somme de contrôle. Le binaire n'est jamais committé.
//
// Le Package.swift amont lie `libsignal_ffi` par `unsafeFlags`, refusés à une
// dépendance distante : c'est la seule raison de ce paquet local.

import PackageDescription

let package = Package(
    name: "LibSignalClient",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "LibSignalClient", targets: ["LibSignalClient"])
    ],
    targets: [
        .binaryTarget(
            name: "SignalFfi",
            url: "https://github.com/isopen-io/meeshy/releases/download/libsignal-ffi-v0.105.4/SignalFfi.xcframework.zip",
            checksum: "ca4d60ac81b69c6e9c02668797aa838a10c2454954c9f6ee23c18e7ae6af6529"
        ),
        .target(
            name: "LibSignalClient",
            dependencies: ["SignalFfi"],
            path: "Sources/LibSignalClient",
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")],
            // BoringSSL, dans libsignal_ffi, est en C++ : sans libc++, un
            // binaire qui ne la tient pas d'ailleurs (les tests) ne se lie pas.
            linkerSettings: [.linkedLibrary("c++")]
        ),
        .testTarget(
            name: "LibSignalClientTests",
            dependencies: ["LibSignalClient"],
            path: "Tests/LibSignalClientTests",
            resources: [.process("Resources")],
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        ),
    ]
)
