import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Mocks

private final class MockMediaSaveResolver: MediaSaveSourceResolving, @unchecked Sendable {
    var result: Result<URL, Error> = .failure(MediaSaveError.sourceUnavailable)
    private(set) var callCount = 0
    private(set) var lastRequest: MediaSaveRequest?

    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL {
        callCount += 1
        lastRequest = request
        return try result.get()
    }
}

private final class MockPhotoLibrarySaver: PhotoLibrarySaving, @unchecked Sendable {
    var shouldThrow: Error?
    private(set) var savedImageData: [Data] = []
    private(set) var savedVideoURLs: [URL] = []

    func saveImage(_ data: Data) async throws {
        if let error = shouldThrow { throw error }
        savedImageData.append(data)
    }

    func saveVideo(at url: URL) async throws {
        if let error = shouldThrow { throw error }
        savedVideoURLs.append(url)
    }
}

private final class MockDownloadReporter: MediaSaveDownloadReporting, @unchecked Sendable {
    private(set) var reportedAttachmentIds: [String] = []

    func reportDownloaded(attachmentId: String) async {
        reportedAttachmentIds.append(attachmentId)
    }
}

// MARK: - Tests

@MainActor
final class MediaSaveCoordinatorTests: XCTestCase {

    private func makeSUT() -> (sut: MediaSaveCoordinator, resolver: MockMediaSaveResolver, photos: MockPhotoLibrarySaver, reporter: MockDownloadReporter) {
        let resolver = MockMediaSaveResolver()
        let photos = MockPhotoLibrarySaver()
        let reporter = MockDownloadReporter()
        let sut = MediaSaveCoordinator(resolver: resolver, photoSaver: photos, downloadReporter: reporter)
        return (sut, resolver, photos, reporter)
    }

    /// Attend (poll) qu'une condition devienne vraie — pour les reports
    /// fire-and-forget (`reportExportCompleted` lance un Task).
    private func waitUntil(timeout: TimeInterval = 1.0, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func makeTempSourceFile(named name: String = "source.bin",
                                    contents: Data = Data("meeshy-media".utf8)) throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("media-save-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        try contents.write(to: url)
        return url
    }

    private func makeRequest(kind: AttachmentKind = .image,
                             url: String = "https://gate.meeshy.me/media/photo.jpg",
                             suggestedName: String? = "Vacances.jpg") -> MediaSaveRequest {
        MediaSaveRequest(kind: kind, remoteURLString: url, suggestedFileName: suggestedName)
    }

    // MARK: Présentation

    func test_requestSave_publishesPendingRequestWithDestinations() {
        let (sut, _, _, _) = makeSUT()

        sut.requestSave(makeRequest(kind: .image))

        XCTAssertEqual(sut.pendingRequest?.destinations, [.photoLibrary, .files, .share])
        XCTAssertNil(sut.lastOutcome)
    }

    func test_requestSave_documentKind_neverOffersPhotoLibrary() {
        let (sut, _, _, _) = makeSUT()

        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/doc.pdf", suggestedName: "Contrat.pdf"))

        XCTAssertEqual(sut.pendingRequest?.destinations, [.files, .share])
    }

    func test_cancel_clearsPendingRequest_andInvokesNothing() async {
        let (sut, resolver, photos, _) = makeSUT()
        sut.requestSave(makeRequest())

        sut.cancel()
        await sut.pick(.photoLibrary)

        XCTAssertNil(sut.pendingRequest)
        XCTAssertEqual(resolver.callCount, 0)
        XCTAssertTrue(photos.savedImageData.isEmpty)
        XCTAssertNil(sut.lastOutcome)
    }

    func test_requestSave_resetsPreviousOutcome() async throws {
        let (sut, resolver, _, _) = makeSUT()
        resolver.result = .success(try makeTempSourceFile())
        sut.requestSave(makeRequest())
        await sut.pick(.photoLibrary)
        XCTAssertNotNil(sut.lastOutcome)

        sut.requestSave(makeRequest())

        XCTAssertNil(sut.lastOutcome)
    }

    // MARK: Photothèque

    func test_pick_photoLibrary_image_savesImageDataAndReportsSuccess() async throws {
        let (sut, resolver, photos, _) = makeSUT()
        let payload = Data("jpeg-bytes".utf8)
        resolver.result = .success(try makeTempSourceFile(named: "p.jpg", contents: payload))
        sut.requestSave(makeRequest(kind: .image))

        await sut.pick(.photoLibrary)

        XCTAssertEqual(photos.savedImageData, [payload])
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertEqual(sut.lastOutcome, .saved(.photoLibrary))
        XCTAssertNil(sut.pendingRequest)
    }

    func test_pick_photoLibrary_video_savesVideoFileURL() async throws {
        let (sut, resolver, photos, _) = makeSUT()
        let source = try makeTempSourceFile(named: "clip.mp4")
        resolver.result = .success(source)
        sut.requestSave(makeRequest(kind: .video, url: "https://x/clip.mp4", suggestedName: nil))

        await sut.pick(.photoLibrary)

        XCTAssertEqual(photos.savedVideoURLs, [source])
        XCTAssertTrue(photos.savedImageData.isEmpty)
        XCTAssertEqual(sut.lastOutcome, .saved(.photoLibrary))
    }

    func test_pick_photoLibrary_onAudio_isRefusedWithoutResolving() async {
        let (sut, resolver, _, _) = makeSUT()
        sut.requestSave(makeRequest(kind: .audio, url: "https://x/note.m4a", suggestedName: nil))

        await sut.pick(.photoLibrary)

        XCTAssertEqual(resolver.callCount, 0)
        XCTAssertEqual(sut.lastOutcome, .failed(MediaSaveError.destinationUnsupported.localizedDescription))
    }

    func test_pick_photoLibrary_permissionDenied_surfacesFailure() async throws {
        let (sut, resolver, photos, _) = makeSUT()
        resolver.result = .success(try makeTempSourceFile(named: "p.jpg"))
        photos.shouldThrow = MediaSaveError.photoLibraryDenied
        sut.requestSave(makeRequest(kind: .image))

        await sut.pick(.photoLibrary)

        XCTAssertEqual(sut.lastOutcome, .failed(MediaSaveError.photoLibraryDenied.localizedDescription))
    }

    // MARK: Fichiers / Partager (staging)

    func test_pick_files_stagesCopyUnderReadableName() async throws {
        let (sut, resolver, _, _) = makeSUT()
        let payload = Data("pdf-bytes".utf8)
        resolver.result = .success(try makeTempSourceFile(named: "0a1b2c3d", contents: payload))
        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/contrat.pdf", suggestedName: "Contrat 2026.pdf"))

        await sut.pick(.files)

        let staged = try XCTUnwrap(sut.exportURL)
        XCTAssertEqual(staged.lastPathComponent, "Contrat 2026.pdf")
        XCTAssertEqual(try Data(contentsOf: staged), payload)
        XCTAssertNil(sut.lastOutcome, "l'issue Fichiers n'est acquise qu'au retour du picker")
    }

    func test_pick_share_stagesCopyForShareSheet() async throws {
        let (sut, resolver, _, _) = makeSUT()
        let payload = Data("audio-bytes".utf8)
        resolver.result = .success(try makeTempSourceFile(named: "cachehash", contents: payload))
        sut.requestSave(makeRequest(kind: .audio, url: "https://x/note.m4a", suggestedName: "Note vocale.m4a"))

        await sut.pick(.share)

        let staged = try XCTUnwrap(sut.shareURL)
        XCTAssertEqual(staged.lastPathComponent, "Note vocale.m4a")
        XCTAssertEqual(try Data(contentsOf: staged), payload)
    }

    func test_pick_files_twoRequests_stageInDistinctDirectories() async throws {
        let (sut, resolver, _, _) = makeSUT()
        resolver.result = .success(try makeTempSourceFile(named: "a"))
        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/a.pdf", suggestedName: "Doc.pdf"))
        await sut.pick(.files)
        let first = try XCTUnwrap(sut.exportURL)

        resolver.result = .success(try makeTempSourceFile(named: "b"))
        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/b.pdf", suggestedName: "Doc.pdf"))
        await sut.pick(.files)
        let second = try XCTUnwrap(sut.exportURL)

        XCTAssertNotEqual(first.deletingLastPathComponent(), second.deletingLastPathComponent(),
                          "chaque staging vit dans son dossier unique — jamais d'écrasement")
    }

    func test_reportExportCompleted_reportsFilesSuccessAndClearsExportURL() async throws {
        let (sut, resolver, _, _) = makeSUT()
        resolver.result = .success(try makeTempSourceFile())
        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/a.pdf", suggestedName: "Doc.pdf"))
        await sut.pick(.files)

        sut.reportExportCompleted()

        XCTAssertNil(sut.exportURL)
        XCTAssertEqual(sut.lastOutcome, .saved(.files))
    }

    func test_reportExportCancelled_clearsExportURLWithoutOutcome() async throws {
        let (sut, resolver, _, _) = makeSUT()
        resolver.result = .success(try makeTempSourceFile())
        sut.requestSave(makeRequest(kind: .pdf, url: "https://x/a.pdf", suggestedName: "Doc.pdf"))
        await sut.pick(.files)

        sut.reportExportCancelled()

        XCTAssertNil(sut.exportURL)
        XCTAssertNil(sut.lastOutcome)
    }

    // MARK: Échecs de résolution

    func test_pick_resolverFailure_surfacesFailure_withoutSaverCalls() async {
        let (sut, resolver, photos, _) = makeSUT()
        resolver.result = .failure(MediaSaveError.sourceUnavailable)
        sut.requestSave(makeRequest(kind: .image))

        await sut.pick(.photoLibrary)

        XCTAssertEqual(sut.lastOutcome, .failed(MediaSaveError.sourceUnavailable.localizedDescription))
        XCTAssertTrue(photos.savedImageData.isEmpty)
        XCTAssertNil(sut.exportURL)
        XCTAssertNil(sut.shareURL)
    }

    func test_pick_withoutPendingRequest_isNoOp() async {
        let (sut, resolver, _, _) = makeSUT()

        await sut.pick(.files)

        XCTAssertEqual(resolver.callCount, 0)
        XCTAssertNil(sut.lastOutcome)
    }

    // MARK: exportFileName (règle pure)

    func test_exportFileName_keepsSuggestedNameWithExtension() {
        let request = makeRequest(kind: .pdf, url: "https://x/y.pdf", suggestedName: "Rapport final.pdf")
        XCTAssertEqual(MediaSaveCoordinator.exportFileName(for: request), "Rapport final.pdf")
    }

    func test_exportFileName_appendsRemoteExtension_whenSuggestedHasNone() {
        let request = makeRequest(kind: .audio, url: "https://x/note.m4a", suggestedName: "Note vocale")
        XCTAssertEqual(MediaSaveCoordinator.exportFileName(for: request), "Note vocale.m4a")
    }

    func test_exportFileName_fallsBackToRemoteLastPathComponent() {
        let request = makeRequest(kind: .image, url: "https://x/media/photo-42.jpg", suggestedName: nil)
        XCTAssertEqual(MediaSaveCoordinator.exportFileName(for: request), "photo-42.jpg")
    }

    func test_exportFileName_sanitizesPathSeparators() {
        let request = makeRequest(kind: .pdf, url: "https://x/y.pdf", suggestedName: "a/b:c.pdf")
        XCTAssertEqual(MediaSaveCoordinator.exportFileName(for: request), "a-b-c.pdf")
    }

    func test_exportFileName_defaultsToKindName_whenNothingUsable() {
        let request = makeRequest(kind: .other, url: "https://x/", suggestedName: "   ")
        XCTAssertEqual(MediaSaveCoordinator.exportFileName(for: request), "Meeshy-other")
    }

    // MARK: Report « downloaded » (parité P7-9)

    private func makeRequestWithAttachment(kind: AttachmentKind = .image,
                                           attachmentId: String? = "att-42") -> MediaSaveRequest {
        MediaSaveRequest(kind: kind,
                         remoteURLString: "https://gate.meeshy.me/media/photo.jpg",
                         suggestedFileName: "Photo.jpg",
                         attachmentId: attachmentId)
    }

    func test_pick_photoLibrary_success_reportsDownloadedOnce() async throws {
        let (sut, resolver, _, reporter) = makeSUT()
        resolver.result = .success(try makeTempSourceFile(named: "p.jpg"))
        sut.requestSave(makeRequestWithAttachment())

        await sut.pick(.photoLibrary)

        XCTAssertEqual(reporter.reportedAttachmentIds, ["att-42"])
    }

    func test_pick_photoLibrary_failure_doesNotReport() async throws {
        let (sut, resolver, photos, reporter) = makeSUT()
        resolver.result = .success(try makeTempSourceFile(named: "p.jpg"))
        photos.shouldThrow = MediaSaveError.photoLibraryDenied
        sut.requestSave(makeRequestWithAttachment())

        await sut.pick(.photoLibrary)

        XCTAssertTrue(reporter.reportedAttachmentIds.isEmpty)
    }

    func test_pick_withoutAttachmentId_doesNotReport() async throws {
        let (sut, resolver, _, reporter) = makeSUT()
        resolver.result = .success(try makeTempSourceFile(named: "p.jpg"))
        sut.requestSave(makeRequestWithAttachment(attachmentId: nil))

        await sut.pick(.photoLibrary)

        XCTAssertTrue(reporter.reportedAttachmentIds.isEmpty)
    }

    func test_reportExportCompleted_reportsDownloadedOnce() async throws {
        let (sut, resolver, _, reporter) = makeSUT()
        resolver.result = .success(try makeTempSourceFile())
        sut.requestSave(makeRequestWithAttachment(kind: .pdf))
        await sut.pick(.files)

        sut.reportExportCompleted()

        await waitUntil { !reporter.reportedAttachmentIds.isEmpty }
        XCTAssertEqual(reporter.reportedAttachmentIds, ["att-42"])
    }

    func test_reportExportCancelled_doesNotReport() async throws {
        let (sut, resolver, _, reporter) = makeSUT()
        resolver.result = .success(try makeTempSourceFile())
        sut.requestSave(makeRequestWithAttachment(kind: .pdf))
        await sut.pick(.files)

        sut.reportExportCancelled()

        try? await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertTrue(reporter.reportedAttachmentIds.isEmpty)
    }
}
