import XCTest
@testable import MeeshyUI

/// B8 item 1 (ios-full-remediation) — fullscreen image open is manual,
/// explicit user intent: it must never sit on an infinite spinner because the
/// ambient network policy (Low Data Mode / Wi-Fi-only) blocked the fetch.
/// `CachedAsyncImage`'s body isn't introspectable without ViewInspector (not
/// a project dependency) — this repo's established pattern for locking
/// SwiftUI wiring is a source-guard (cf. `AvatarBannerNoRetryWiringTests`).
/// Read the code, not comments — the assertions below anchor on the exact
/// call expression.
@MainActor
final class ImageFullscreenAutoLoadWiringTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_imageFullscreen_forcesAutoLoad_bypassingPolicyGate() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/ImageViewerView.swift")
        XCTAssertTrue(source.contains("CachedAsyncImage(url: url.absoluteString, autoLoad: true)"),
                      "ImageFullscreen must force autoLoad:true — a manual tap overrides the network policy gate (contract §14.1); otherwise Low Data Mode leaves the fullscreen viewer spinning forever.")
    }

    func test_imageFullscreen_savesTheStampedImage_withRawBytesFallback() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/ImageViewerView.swift")
        XCTAssertTrue(source.contains("MeeshyImageWatermark.stamped("),
                      "ImageFullscreen enregistre l'image MARQUÉE — même règle que le flux unifié de l'app (MediaSaveBranding) : le viewer passe par l'atome de filigrane avant d'écrire en photothèque.")
        XCTAssertTrue(source.contains("PhotoLibraryManager.shared.saveImage(stamped)"),
                      "Le chemin nominal écrit l'image marquée via saveImage — plus de saveFromURL : les octets viennent du cache partagé, pas d'un aller-retour réseau.")
        XCTAssertTrue(source.contains("PhotoLibraryManager.shared.saveImage(data)"),
                      "Un marquage impossible (format animé, décodage raté) n'empêche JAMAIS l'enregistrement : repli sur les octets d'origine.")
    }
}
