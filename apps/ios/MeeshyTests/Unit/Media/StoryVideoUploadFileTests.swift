import XCTest
@testable import Meeshy

/// **Une vidéo de story ne part plus brute** (#9871).
///
/// Les deux chemins d'envoi d'une story — la publication et l'édition —
/// téléversaient `loadedVideoURLs[obj.id]` tel quel, sous le type `video/mp4`
/// écrit en dur, même pour un `.mov` sorti de la caméra. Tant que le
/// transcodage serveur est coupé, le fichier envoyé est le fichier servi : ni
/// réduit au budget story, ni réordonné `moov` en tête, le destinataire devait
/// tout télécharger avant la première image.
///
/// `StoryVideoUploadFile.prepared` est la loi : la vidéo passe par la
/// compression (qui fait du passthrough quand la source tient déjà dans le
/// budget), et le type se lit dans le CONTENEUR du fichier réellement envoyé.
final class StoryVideoUploadFileTests: XCTestCase {

    private actor Received {
        private(set) var urls: [URL] = []
        func append(_ url: URL) { urls.append(url) }
    }

    private struct CompressionRefused: Error {}

    private func makeURL(_ name: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(name)
    }

    func test_prepared_sendsTheSourceThroughCompression_andUploadsItsOutput() async {
        let source = makeURL("story_take.mov")
        let compressed = makeURL("compressed_story.mp4")
        let received = Received()

        let file = await StoryVideoUploadFile.prepared(from: source) { url in
            await received.append(url)
            return compressed
        }

        let urls = await received.urls
        XCTAssertEqual(urls, [source], "La vidéo de story doit passer par la compression, une seule fois.")
        XCTAssertEqual(file.fileURL, compressed)
        XCTAssertEqual(file.mimeType, "video/mp4")
        XCTAssertTrue(file.isDerived, "Le fichier compressé est un temporaire que l'envoi doit effacer.")
    }

    func test_prepared_whenCompressionFails_uploadsTheOriginalUnderItsContainerType() async {
        let source = makeURL("story_take.mov")

        let file = await StoryVideoUploadFile.prepared(from: source) { _ in
            throw CompressionRefused()
        }

        XCTAssertEqual(file.fileURL, source)
        XCTAssertEqual(file.mimeType, "video/quicktime")
        XCTAssertFalse(file.isDerived, "L'original de l'auteur ne s'efface jamais après l'envoi.")
    }

    func test_prepared_whenCompressionReturnsTheSource_isNotDerived() async {
        let source = makeURL("story_take.mp4")

        let file = await StoryVideoUploadFile.prepared(from: source) { url in url }

        XCTAssertEqual(file.fileURL, source)
        XCTAssertFalse(file.isDerived)
    }

    func test_mimeType_mov_isQuicktime() {
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("take.mov")), "video/quicktime")
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("TAKE.MOV")), "video/quicktime")
    }

    func test_mimeType_mp4Family_isMp4() {
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("take.mp4")), "video/mp4")
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("take.m4v")), "video/mp4")
    }

    func test_mimeType_unknownContainer_fallsBackToMp4() {
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("take")), "video/mp4")
        XCTAssertEqual(StoryVideoUploadFile.mimeType(for: makeURL("take.bin")), "video/mp4")
    }

    // MARK: - Câblage (garde de source)

    private func publicationUploadSource() throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(
            contentsOf: racine.appendingPathComponent(
                "Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift"),
            encoding: .utf8)
    }

    func test_publicationUpload_neCodePlusLeTypeVideoEnDur() throws {
        let source = try publicationUploadSource()
        XCTAssertFalse(source.contains("mimeType: \"video/mp4\""),
            "Le type d'une vidéo de story se lit dans son conteneur (StoryVideoUploadFile), jamais en dur.")
    }

    func test_publicationUpload_compresseLaVideoDeStoryEnUnSeulSite() throws {
        let source = try publicationUploadSource()
        XCTAssertEqual(source.components(separatedBy: "StoryVideoUploadFile.prepared(").count - 1, 1,
            "Publication et édition partagent UN helper d'envoi vidéo, qui seul prépare le fichier.")
        XCTAssertTrue(source.contains("compressVideo(") && source.contains("context: .story"),
            "La vidéo de story passe par MediaCompressor.compressVideo(_, context: .story).")
        let appelsVideo = source.components(separatedBy: "uploadStoryVideo(").count - 1
        XCTAssertGreaterThanOrEqual(appelsVideo, 3,
            "Le helper est déclaré une fois et appelé par la publication ET par l'édition.")
        XCTAssertEqual(source.components(separatedBy: "fileURL: videoURL").count - 1, 0,
            "Aucun chemin n'envoie plus loadedVideoURLs[…] brut.")
    }
}
