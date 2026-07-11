import XCTest
@testable import Meeshy

/// Source-guards du lifting Liquid Glass de la galerie média (spec
/// 2026-07-11) : un seul contrôleur play (fini le bouton poster empilé sur
/// le play/pause du transport quand la vidéo est en pause), chrome glass.
@MainActor
final class ConversationMediaGalleryVideoControlsTests: XCTestCase {

    private func gallerySource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_galleryVideoPage_postersButton_gatedOnPlayerAttached_notPlaying() throws {
        // Double contrôleur (bug) : gaté sur `!isPlayerActive`, le bouton
        // poster 64pt réapparaissait PENDANT LA PAUSE, empilé sur le
        // play/pause du transport partagé. Le poster ne doit exister que
        // tant que le player n'est pas attaché à cette URL.
        let source = try gallerySource()
        guard source.range(of: "if !isPlayerAttached {\n                playOrDownloadButton") != nil else {
            XCTFail(
                "GalleryVideoPage must gate playOrDownloadButton on !isPlayerAttached " +
                "(not !isPlayerActive) so the paused state shows ONLY the shared transport controls."
            )
            return
        }
    }

    func test_controlsOverlay_chrome_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let start = source.range(of: "private var controlsOverlay") else {
            XCTFail("controlsOverlay not found"); return
        }
        let end = source.index(start.lowerBound, offsetBy: 2600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[start.lowerBound..<end])
        XCTAssertFalse(
            body.contains("xmark.circle.fill"),
            "Le X doit être un glyphe xmark dans un cercle .adaptiveGlass, pas le xmark.circle.fill plein."
        )
        XCTAssertGreaterThanOrEqual(
            body.components(separatedBy: ".adaptiveGlass(").count - 1, 3,
            "X, compteur et save doivent porter chacun leur surface .adaptiveGlass."
        )
        XCTAssertFalse(
            body.contains("Circle().fill(Color.white.opacity(0.2))"),
            "Plus de cercle blanc opaque 0.2 : chrome Liquid Glass uniquement."
        )
    }

    func test_galleryVideoPage_posterButton_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let start = source.range(of: "private var playOrDownloadButton") else {
            XCTFail("playOrDownloadButton not found"); return
        }
        let end = source.index(start.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[start.lowerBound..<end])
        XCTAssertTrue(
            body.contains(".adaptiveGlassProminent(in: Circle()"),
            "Le bouton poster doit être en Liquid Glass prominent teinté accent " +
            "(remplace le duo ultraThinMaterial + fill accent)."
        )
    }
}
