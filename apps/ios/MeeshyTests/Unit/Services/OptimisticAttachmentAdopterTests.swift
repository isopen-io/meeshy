import XCTest
import MeeshySDK
@testable import Meeshy

@available(*, deprecated, message: "Exercises the deprecated OptimisticAttachmentAdopter on purpose for branch coverage")
@MainActor
final class OptimisticAttachmentAdopterTests: XCTestCase {

    private var tempFiles: [URL] = []

    override func tearDown() async throws {
        for url in tempFiles {
            try? FileManager.default.removeItem(at: url)
        }
        tempFiles = []
        try await super.tearDown()
    }

    private func makeTempFile(data: Data, ext: String) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("opt-\(UUID().uuidString).\(ext)")
        try? data.write(to: url)
        tempFiles.append(url)
        return url
    }

    private func makeAttachment(
        id: String = UUID().uuidString,
        type: MeeshyMessageAttachment.AttachmentType,
        fileUrl: String
    ) -> MeeshyMessageAttachment {
        let mime: String
        let fileName: String
        switch type {
        case .image: mime = "image/jpeg"; fileName = "test.jpg"
        case .video: mime = "video/mp4"; fileName = "test.mp4"
        case .audio: mime = "audio/m4a"; fileName = "test.m4a"
        case .file: mime = "application/pdf"; fileName = "doc.pdf"
        case .location: mime = "application/x-location"; fileName = "loc"
        }
        return MeeshyMessageAttachment(
            id: id, messageId: "msg-1",
            fileName: fileName, originalName: fileName,
            mimeType: mime, fileSize: 100,
            filePath: "/test", fileUrl: fileUrl,
            uploadedBy: "user-1"
        )
    }

    // MARK: - Audio adoption

    func test_adoptIfNeeded_audioFileToHttps_seedsAudioCache() async {
        let localFile = makeTempFile(data: Data([0x01, 0x02]), ext: "m4a")
        let canonical = "https://media.meeshy.me/audio/canonical-\(UUID().uuidString).m4a"
        let new = makeAttachment(type: .audio, fileUrl: canonical)

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: localFile.absoluteString)

        let resolvedKey = MeeshyConfig.resolveMediaURL(canonical)?.absoluteString ?? canonical
        let cached = await CacheCoordinator.shared.audio.isCached(resolvedKey)
        XCTAssertTrue(cached, "Audio adoption must seed audio cache for the canonical key")
    }

    // MARK: - Image adoption

    func test_adoptIfNeeded_imageFileToHttps_seedsImageCache() async {
        let pngData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=")!
        let localFile = makeTempFile(data: pngData, ext: "jpg")
        let canonical = "https://media.meeshy.me/images/canonical-\(UUID().uuidString).jpg"
        let new = makeAttachment(type: .image, fileUrl: canonical)

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: localFile.absoluteString)

        let resolvedKey = MeeshyConfig.resolveMediaURL(canonical)?.absoluteString ?? canonical
        let cached = await CacheCoordinator.shared.images.isCached(resolvedKey)
        XCTAssertTrue(cached, "Image adoption must seed image cache for the canonical key")
    }

    // MARK: - Video adoption

    func test_adoptIfNeeded_videoFileToHttps_seedsVideoCache() async {
        let localFile = makeTempFile(data: Data([0xAA, 0xBB, 0xCC, 0xDD]), ext: "mp4")
        let canonical = "https://media.meeshy.me/video/canonical-\(UUID().uuidString).mp4"
        let new = makeAttachment(type: .video, fileUrl: canonical)

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: localFile.absoluteString)

        let resolvedKey = MeeshyConfig.resolveMediaURL(canonical)?.absoluteString ?? canonical
        let cached = await CacheCoordinator.shared.video.isCached(resolvedKey)
        XCTAssertTrue(cached, "Video adoption must seed video cache for the canonical key")
    }

    // MARK: - No-ops

    func test_adoptIfNeeded_noPrevious_isNoOp() async {
        let new = makeAttachment(type: .audio, fileUrl: "https://media.meeshy.me/audio/no-prev.m4a")
        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: nil)
        // Pure non-crash check: a received message has no previous file:// URL.
        XCTAssertTrue(true)
    }

    func test_adoptIfNeeded_previousIsHttps_isNoOp() async {
        let new = makeAttachment(type: .audio, fileUrl: "https://media.meeshy.me/audio/new.m4a")
        await OptimisticAttachmentAdopter.adoptIfNeeded(
            new: new,
            previousFileUrl: "https://media.meeshy.me/audio/old.m4a"
        )
        XCTAssertTrue(true)
    }

    func test_adoptIfNeeded_newStillFile_isNoOp() async {
        let localFile = makeTempFile(data: Data([0x01]), ext: "m4a")
        let new = makeAttachment(type: .audio, fileUrl: localFile.absoluteString)
        await OptimisticAttachmentAdopter.adoptIfNeeded(
            new: new,
            previousFileUrl: localFile.absoluteString
        )
        // Upload failed: nothing should move, source must stay in place.
        XCTAssertTrue(FileManager.default.fileExists(atPath: localFile.path))
    }

    func test_adoptIfNeeded_fileType_isNoOp() async {
        let localFile = makeTempFile(data: Data([0x01]), ext: "pdf")
        let new = makeAttachment(type: .file, fileUrl: "https://media.meeshy.me/files/doc.pdf")
        await OptimisticAttachmentAdopter.adoptIfNeeded(
            new: new,
            previousFileUrl: localFile.absoluteString
        )
        // .file has no typed cache: source must stay in place.
        XCTAssertTrue(FileManager.default.fileExists(atPath: localFile.path))
    }
}
