import XCTest
import MeeshySDK
@testable import Meeshy

/// **Éditer une pièce en attente ouvre toutes les pièces du message en scènes**
/// (#9126) : l'ordre du plateau, la pièce touchée toujours montée, et
/// « Terminé » ne rend que les scènes retouchées.
final class ComposerRetouchSeriesTests: XCTestCase {

    private func piece(_ id: String, _ mime: String) -> MessageAttachment {
        MessageAttachment(id: id, fileName: "\(id).bin", originalName: "\(id).bin", mimeType: mime)
    }

    private func url(_ id: String) -> URL { URL(fileURLWithPath: "/tmp/\(id).bin") }

    // MARK: - Les pièces qui s'ouvrent

    func test_candidates_imagesAndVideos_keepTrayOrder() {
        let pieces = [piece("a", "image/jpeg"), piece("b", "video/mp4"), piece("c", "image/png")]
        let files = ["a": url("a"), "b": url("b"), "c": url("c")]
        let serie = ComposerRetouchSeries.candidates(attachments: pieces, files: files)
        XCTAssertEqual(serie.map(\.attachmentId), ["a", "b", "c"])
        XCTAssertEqual(serie.map(\.kind), [.image, .video, .image])
        XCTAssertEqual(serie.map(\.fileURL), [url("a"), url("b"), url("c")])
    }

    func test_candidates_audioGifFileAndMissingFile_areLeftOut() {
        let pieces = [piece("son", "audio/m4a"), piece("gif", "image/gif"), piece("pdf", "application/pdf"),
                      piece("perdue", "image/jpeg"), piece("ok", "image/heic")]
        let files = ["son": url("son"), "gif": url("gif"), "pdf": url("pdf"), "ok": url("ok")]
        XCTAssertEqual(ComposerRetouchSeries.candidates(attachments: pieces, files: files).map(\.attachmentId),
                       ["ok"])
    }

    // MARK: - La fenêtre de scènes

    func test_window_fewerPiecesThanCap_mountsThemAll() {
        XCTAssertEqual(ComposerRetouchSeries.window(count: 3, focus: 1), 0..<3)
    }

    func test_window_morePiecesThanCap_alwaysHoldsTheTouchedPiece() {
        for focus in 0..<25 {
            let fenetre = ComposerRetouchSeries.window(count: 25, focus: focus)
            XCTAssertEqual(fenetre.count, ComposerRetouchSeries.sceneCap)
            XCTAssertTrue(fenetre.contains(focus), "pièce \(focus) hors de \(fenetre)")
        }
    }

    // MARK: - Ce que « Terminé » rend

    func test_retouchedScenes_onlyChangedScenes_inPieceOrder() throws {
        let a = ComposerRetouchPiece(attachmentId: "a", fileURL: url("a"), mimeType: "image/jpeg", kind: .image)
        let b = ComposerRetouchPiece(attachmentId: "b", fileURL: url("b"), mimeType: "video/mp4", kind: .video)
        let c = ComposerRetouchPiece(attachmentId: "c", fileURL: url("c"), mimeType: "image/jpeg", kind: .image)
        let s1 = StorySlide(), s2 = StorySlide(), s3 = StorySlide()
        let baselines = try [s1, s2, s3].reduce(into: [String: Data]()) {
            $0[$1.id] = try XCTUnwrap(ComposerRetouchSeries.fingerprint($1))
        }
        var s1Edite = s1
        s1Edite.effects.background = "#FF0000"
        var s3Edite = s3
        s3Edite.effects.drawingData = Data([1, 2, 3])

        let rendues = ComposerRetouchSeries.retouchedScenes(
            pieces: [a, b, c],
            slideIdByURL: [url("a"): s1.id, url("b"): s2.id, url("c"): s3.id],
            baselines: baselines,
            slides: [s3Edite, s2, s1Edite])

        XCTAssertEqual(rendues, [ComposerRetouchedScene(piece: a, slideId: s1.id),
                                 ComposerRetouchedScene(piece: c, slideId: s3.id)])
    }

    func test_retouchedScenes_nothingTouched_returnsNothing() throws {
        let a = ComposerRetouchPiece(attachmentId: "a", fileURL: url("a"), mimeType: "image/jpeg", kind: .image)
        let s1 = StorySlide()
        let rendues = ComposerRetouchSeries.retouchedScenes(
            pieces: [a], slideIdByURL: [url("a"): s1.id],
            baselines: [s1.id: try XCTUnwrap(ComposerRetouchSeries.fingerprint(s1))], slides: [s1])
        XCTAssertEqual(rendues, [])
    }

    func test_retouchedScenes_pieceNeverPlaced_isNotReturned() {
        let a = ComposerRetouchPiece(attachmentId: "a", fileURL: url("a"), mimeType: "image/jpeg", kind: .image)
        XCTAssertEqual(ComposerRetouchSeries.retouchedScenes(pieces: [a], slideIdByURL: [:],
                                                             baselines: [:], slides: [StorySlide()]), [])
    }

    func test_retouchedScenes_doneBeforeTheStartingStateIsTaken_returnsNothing() {
        let a = ComposerRetouchPiece(attachmentId: "a", fileURL: url("a"), mimeType: "image/jpeg", kind: .image)
        var s1 = StorySlide()
        s1.effects.background = "#00FF00"
        XCTAssertEqual(ComposerRetouchSeries.retouchedScenes(pieces: [a], slideIdByURL: [url("a"): s1.id],
                                                             baselines: [:], slides: [s1]), [],
                       "Sans état de départ, rien n'a pu être retouché : la pièce reste telle quelle.")
    }

    func test_seedFocus_returnsTheTouchedPiece() {
        let a = ComposerRetouchPiece(attachmentId: "a", fileURL: url("a"), mimeType: "image/jpeg", kind: .image)
        let b = ComposerRetouchPiece(attachmentId: "b", fileURL: url("b"), mimeType: "video/mp4", kind: .video)
        XCTAssertEqual(ComposerRetouchSeed(pieces: [a, b], focusId: "b").focus, b)
    }
}
