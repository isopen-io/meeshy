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

    /// **Directive porteur du 2026-09-12 — elle SUPPLANTE celle du 2026-08-12**
    /// (« un média qui quitte Meeshy porte sa marque »), sous laquelle ce témoin
    /// exigeait l'INVERSE : que le viewer passe par `MeeshyImageWatermark.stamped`
    /// avant d'écrire en photothèque.
    ///
    /// La marque est désormais réservée aux œuvres COMPOSÉES (story enregistrée
    /// ou exportée, scène de post, scène de réel) ; les originaux d'une
    /// conversation sortent nus. Or ce chemin direct n'est atteint que lorsque
    /// l'hôte ne fournit pas `onSaveRequested`, c'est-à-dire depuis les deux
    /// surfaces de conversation — il n'avait donc plus aucun média à marquer.
    ///
    /// L'assertion est écrite en NÉGATIF à dessein : un filigrane qui reviendrait
    /// ici ne casserait rien d'autre, et ne se verrait pas.
    func test_imageFullscreen_savesTheImageAsReceived_withoutAnyWatermark() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/ImageViewerView.swift")
        XCTAssertFalse(source.contains("MeeshyImageWatermark"),
                       "Le chemin direct d'ImageFullscreen ne sert que des médias de CONVERSATION : la directive 2026-09-12 leur interdit la marque.")
        XCTAssertTrue(source.contains("PhotoLibraryManager.shared.saveImage(data)"),
                      "Le chemin nominal écrit les octets REÇUS via saveImage — pas de saveFromURL : ils viennent du cache partagé, pas d'un aller-retour réseau.")
    }
}
