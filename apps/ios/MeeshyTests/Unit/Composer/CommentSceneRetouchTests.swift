import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les commentaires éditent leurs médias dans la scène du composeur** (#9127) :
/// mêmes pièces que la conversation (image hors GIF, vidéo), même série, et
/// « Terminé » remplace la pièce À SA PLACE.
@MainActor
final class CommentSceneRetouchTests: XCTestCase {

    private func url(_ name: String) -> URL { URL(fileURLWithPath: "/tmp/\(name)") }

    private func attachment(_ id: String, _ type: ComposerAttachmentType, file: String?) -> ComposerAttachment {
        ComposerAttachment(id: id, type: type, name: id, url: file.map(url))
    }

    // MARK: - Les pièces qui s'ouvrent en scène

    func test_candidates_imagesAndVideos_keepTrayOrder() {
        let pieces = [attachment("a", .image, file: "a.jpg"), attachment("b", .video, file: "b.mov"),
                      attachment("c", .image, file: "c.png")]
        let serie = CommentSceneRetouch.candidates(pieces)
        XCTAssertEqual(serie.map(\.attachmentId), ["a", "b", "c"])
        XCTAssertEqual(serie.map(\.kind), [.image, .video, .image])
        XCTAssertEqual(serie.map(\.fileURL), [url("a.jpg"), url("b.mov"), url("c.png")])
        XCTAssertEqual(serie.first?.mimeType, "image/jpeg")
    }

    func test_candidates_voiceGifFileLocationAndMissingFile_areLeftOut() {
        let pieces = [attachment("son", .voice, file: "son.m4a"), attachment("gif", .image, file: "gif.gif"),
                      attachment("pdf", .file, file: "doc.pdf"), attachment("lieu", .location, file: nil),
                      attachment("perdue", .image, file: nil), attachment("ok", .image, file: "ok.jpg")]
        XCTAssertEqual(CommentSceneRetouch.candidates(pieces).map(\.attachmentId), ["ok"])
    }

    // MARK: - Le glyphe « Éditer »

    func test_editGlyph_onlyForWhatTheSceneOpens() {
        XCTAssertEqual(CommentSceneRetouch.editGlyph(for: attachment("a", .image, file: "a.jpg")),
                       ComposerPendingTileGlyph.edit)
        XCTAssertEqual(CommentSceneRetouch.editGlyph(for: attachment("v", .video, file: "v.mov")),
                       ComposerPendingTileGlyph.edit)
        XCTAssertNil(CommentSceneRetouch.editGlyph(for: attachment("g", .image, file: "g.gif")))
        XCTAssertNil(CommentSceneRetouch.editGlyph(for: attachment("s", .voice, file: "s.m4a")))
        XCTAssertNil(CommentSceneRetouch.editGlyph(for: attachment("f", .file, file: "f.pdf")))
    }

    // MARK: - Ce que « Terminé » remplace

    func test_replacing_swapsTheFileInPlace_andHandsBackTheStaleOne() throws {
        let pieces = [attachment("a", .image, file: "a.jpg"), attachment("b", .video, file: "b.mov")]
        let rendu = try XCTUnwrap(CommentSceneRetouch.replacing(pieces, id: "b", with: url("b-edit.mp4"), size: 42))
        XCTAssertEqual(rendu.attachments.map(\.id), ["a", "b"])
        XCTAssertEqual(rendu.attachments.map(\.url), [url("a.jpg"), url("b-edit.mp4")])
        XCTAssertEqual(rendu.attachments[1].type, .video)
        XCTAssertEqual(rendu.attachments[1].size, 42)
        XCTAssertEqual(rendu.stale, url("b.mov"))
    }

    func test_replacing_unknownPiece_leavesTheTrayUntouched() {
        let pieces = [attachment("a", .image, file: "a.jpg")]
        XCTAssertNil(CommentSceneRetouch.replacing(pieces, id: "retirée", with: url("x.jpg"), size: nil),
                     "Une pièce retirée pendant la retouche ne revient pas.")
    }

    func test_replacing_sameFile_handsBackNoStaleFile() {
        let pieces = [attachment("v", .video, file: "v.mov")]
        XCTAssertNil(CommentSceneRetouch.replacing(pieces, id: "v", with: url("v.mov"), size: nil)?.stale)
    }

    // MARK: - Aucun hôte de commentaire n'ouvre plus les anciens éditeurs

    func test_commentHosts_openTheScene_notTheOldEditors() throws {
        let hotes = [
            "Meeshy/Features/Main/Views/FeedCommentsSheet.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/StoryViewerView.swift",
        ]
        for hote in hotes {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(hote))
            XCTAssertFalse(code.contains("MeeshyImageEditorView("), "\(hote) : l'image s'édite dans la scène (#9127).")
            XCTAssertFalse(code.contains("MeeshyVideoEditorView("), "\(hote) : la vidéo s'édite dans la scène (#9127).")
            XCTAssertTrue(code.contains(".commentSceneRetouch("),
                          "\(hote) : « Éditer » sur une pièce jointe ouvre la scène (#9127).")
        }
    }
}
