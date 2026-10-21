import XCTest
import MeeshySDK
@testable import Meeshy

/// **Chaque pièce en attente porte « Éditer » en son centre, et le toucher
/// l'édite** (#9119). Le geste éditait déjà ; l'icône annonçait « voir »
/// (œil en coin pour l'image, lecture au centre pour la vidéo et l'audio).
@MainActor
final class ComposerPendingTileGlyphTests: XCTestCase {

    func test_center_imageVideoAudio_returnsEditGlyph() {
        XCTAssertEqual(ComposerPendingTileGlyph.center(for: .image, mimeType: "image/jpeg"), "pencil")
        XCTAssertEqual(ComposerPendingTileGlyph.center(for: .video, mimeType: "video/mp4"), "pencil")
        XCTAssertEqual(ComposerPendingTileGlyph.center(for: .audio, mimeType: "audio/m4a"), "pencil")
    }

    func test_center_imageTheSceneCannotRetouch_returnsNil() {
        XCTAssertNil(ComposerPendingTileGlyph.center(for: .image, mimeType: "image/gif"))
    }

    func test_center_fileAndLocation_returnsNil() {
        XCTAssertNil(ComposerPendingTileGlyph.center(for: .file, mimeType: "application/pdf"))
        XCTAssertNil(ComposerPendingTileGlyph.center(for: .location, mimeType: ""))
    }

    func test_tile_drawsTheLawAndNoLongerAnnouncesViewing() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent(
            "Meeshy/Features/Main/Views/ConversationView+ComposerAttachments.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("ComposerPendingTileGlyph.center("), "La tuile consulte la loi.")
        XCTAssertFalse(source.contains("\"eye.fill\""), "L'œil annonçait « voir » sur un geste qui édite.")
        XCTAssertFalse(source.contains("\"play.circle.fill\""), "La lecture annonçait « voir » sur un geste qui édite.")
        XCTAssertTrue(source.contains("conversation.composer.attachment.edit"), "Le rôle d'accessibilité dit « Éditer ».")
    }
}
