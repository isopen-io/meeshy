import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les pièces en attente que la retouche sait éditer** (#9126, #11133) :
/// images et vidéos dont le fichier est là, dans l'ordre du plateau.
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
}
