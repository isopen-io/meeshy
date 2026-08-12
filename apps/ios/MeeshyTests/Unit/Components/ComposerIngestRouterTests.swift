import XCTest
@testable import Meeshy

/// Table de routage MIME → pipeline d'ingestion du composer.
///
/// `ComposerIngestRouter` est la décision partagée par les quatre hôtes du
/// composer (conversation, feed, commentaires, story) : elle doit être
/// insensible à la casse, et rabattre le MIME vide comme
/// `application/octet-stream` sur le pipeline fichier générique — jamais de
/// pipeline « deviné » pour des octets opaques.
final class ComposerIngestRouterTests: XCTestCase {

    func test_route_imageMimes_goToImagePipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "image/png"), .image)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "image/jpeg"), .image)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "image/heic"), .image)
    }

    func test_route_videoMimes_goToVideoPipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "video/mp4"), .video)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "video/quicktime"), .video)
    }

    func test_route_audioMimes_goToAudioPipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "audio/mpeg"), .audio)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "audio/mp4"), .audio)
    }

    func test_route_documentMimes_goToFilePipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "application/pdf"), .file)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "text/plain"), .file)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "application/zip"), .file)
    }

    func test_route_emptyMime_goesToFilePipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: ""), .file)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "   "), .file)
    }

    func test_route_octetStream_goesToFilePipeline() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "application/octet-stream"), .file)
    }

    func test_route_mixedCase_isCaseInsensitive() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: "IMAGE/PNG"), .image)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "Video/QuickTime"), .video)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "Audio/MPEG"), .audio)
        XCTAssertEqual(ComposerIngestRouter.route(mime: "APPLICATION/OCTET-STREAM"), .file)
    }

    func test_route_mimeWithSurroundingWhitespace_isNormalized() {
        XCTAssertEqual(ComposerIngestRouter.route(mime: " image/png "), .image)
    }
}
