import XCTest
import Combine
@testable import MeeshySDK

final class TusUploadManagerTests: XCTestCase {

    // MARK: - Init

    func test_init_withBaseURL_createsInstance() async {
        let url = URL(string: "https://example.com")!
        let manager = TusUploadManager(baseURL: url)
        XCTAssertNotNil(manager)
    }

    // MARK: - Annulation

    /// L'annulation de l'appelant atteint l'envoi : une tâche déjà annulée ne lance rien et rend la main avec
    /// `CancellationError`. Avant, l'envoi partait dans une tâche détachée que l'annulation n'atteignait jamais.
    func test_uploadFile_fromACancelledTask_throwsCancellation_withoutUploading() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("tus-cancel-\(UUID().uuidString).bin")
        try Data(repeating: 7, count: 64).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let manager = TusUploadManager(baseURL: URL(string: "https://127.0.0.1:9")!)
        let credential = MeeshyRequestCredential(header: "Authorization", value: "Bearer test")

        let upload = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await manager.uploadFile(fileURL: file, mimeType: "application/octet-stream", credential: credential)
        }
        do {
            _ = try await upload.value
            XCTFail("un envoi annulé ne rend pas de résultat")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu CancellationError, reçu \(error)")
        }
    }

    // MARK: - Progress Publisher

    func test_progressPublisher_exists_andCanSubscribe() async {
        let manager = TusUploadManager(baseURL: URL(string: "https://example.com")!)
        var cancellable: AnyCancellable?

        let expectation = XCTestExpectation(description: "publisher accessible")
        expectation.isInverted = true

        cancellable = manager.progressPublisher.sink { _ in
            expectation.fulfill()
        }

        await fulfillment(of: [expectation], timeout: 0.1)
        cancellable?.cancel()
    }

    // MARK: - UploadFileStatus

    func test_uploadFileStatus_allCases_haveRawValues() {
        XCTAssertEqual(UploadFileStatus.queued.rawValue, "queued")
        XCTAssertEqual(UploadFileStatus.uploading.rawValue, "uploading")
        XCTAssertEqual(UploadFileStatus.complete.rawValue, "complete")
        XCTAssertEqual(UploadFileStatus.error.rawValue, "error")
        XCTAssertEqual(UploadFileStatus.paused.rawValue, "paused")
    }

    // MARK: - FileUploadProgress

    func test_fileUploadProgress_init_setsAllProperties() {
        let progress = FileUploadProgress(
            fileId: "f1",
            fileName: "test.jpg",
            fileSize: 1024,
            status: .uploading,
            percentage: 50.0,
            bytesUploaded: 512,
            error: nil,
            attachmentId: nil
        )

        XCTAssertEqual(progress.fileId, "f1")
        XCTAssertEqual(progress.fileName, "test.jpg")
        XCTAssertEqual(progress.fileSize, 1024)
        XCTAssertEqual(progress.status, .uploading)
        XCTAssertEqual(progress.percentage, 50.0)
        XCTAssertEqual(progress.bytesUploaded, 512)
        XCTAssertNil(progress.error)
        XCTAssertNil(progress.attachmentId)
    }

    func test_fileUploadProgress_withError_storesErrorMessage() {
        let progress = FileUploadProgress(
            fileId: "f2",
            fileName: "broken.mp4",
            fileSize: 2048,
            status: .error,
            percentage: 25.0,
            bytesUploaded: 512,
            error: "Upload interrupted",
            attachmentId: nil
        )

        XCTAssertEqual(progress.error, "Upload interrupted")
        XCTAssertEqual(progress.status, .error)
    }

    // MARK: - UploadQueueProgress

    func test_uploadQueueProgress_init_setsAllProperties() {
        let file = FileUploadProgress(
            fileId: "f1", fileName: "a.jpg", fileSize: 100,
            status: .complete, percentage: 100, bytesUploaded: 100,
            error: nil, attachmentId: "att1"
        )

        let queueProgress = UploadQueueProgress(
            files: [file],
            totalFiles: 2,
            completedFiles: 1,
            totalBytes: 200,
            uploadedBytes: 100,
            globalPercentage: 50.0
        )

        XCTAssertEqual(queueProgress.totalFiles, 2)
        XCTAssertEqual(queueProgress.completedFiles, 1)
        XCTAssertEqual(queueProgress.totalBytes, 200)
        XCTAssertEqual(queueProgress.uploadedBytes, 100)
        XCTAssertEqual(queueProgress.globalPercentage, 50.0)
        XCTAssertEqual(queueProgress.files.count, 1)
    }

    // MARK: - computeQueueProgress (failed-file exclusion)

    /// A permanently-failed file must be excluded from the batch aggregates so a
    /// single failure can't freeze the progress bar's count/percentage below 100%
    /// forever — but it must remain in `files` (status `.error`) for the UI.
    func test_computeQueueProgress_excludesErrorFilesFromAggregates_butKeepsThemInList() {
        let ok = FileUploadProgress(
            fileId: "f1", fileName: "a.jpg", fileSize: 100,
            status: .complete, percentage: 100, bytesUploaded: 100,
            error: nil, attachmentId: nil)
        let failed = FileUploadProgress(
            fileId: "f2", fileName: "b.jpg", fileSize: 200,
            status: .error, percentage: 30, bytesUploaded: 60,
            error: "boom", attachmentId: nil)

        let progress = TusUploadManager.computeQueueProgress(from: [ok, failed])

        XCTAssertEqual(progress.totalFiles, 1, "error files must not inflate totalFiles")
        XCTAssertEqual(progress.completedFiles, 1)
        XCTAssertEqual(progress.totalBytes, 100, "error-file bytes excluded from totalBytes")
        XCTAssertEqual(progress.uploadedBytes, 100)
        XCTAssertEqual(progress.globalPercentage, 100,
                       "the successful file reaches 100% despite a sibling failure")
        XCTAssertEqual(progress.files.count, 2, "the failed file stays in files for the UI")
        XCTAssertTrue(progress.files.contains { $0.status == .error })
    }

    /// With no failed files the aggregate is unchanged from the naive sum
    /// (regression guard: the exclusion must not alter the happy path).
    func test_computeQueueProgress_withoutErrors_aggregatesAllFiles() {
        let f1 = FileUploadProgress(
            fileId: "f1", fileName: "a", fileSize: 100,
            status: .complete, percentage: 100, bytesUploaded: 100, error: nil, attachmentId: nil)
        let f2 = FileUploadProgress(
            fileId: "f2", fileName: "b", fileSize: 100,
            status: .uploading, percentage: 50, bytesUploaded: 50, error: nil, attachmentId: nil)

        let progress = TusUploadManager.computeQueueProgress(from: [f1, f2])

        XCTAssertEqual(progress.totalFiles, 2)
        XCTAssertEqual(progress.completedFiles, 1)
        XCTAssertEqual(progress.totalBytes, 200)
        XCTAssertEqual(progress.uploadedBytes, 150)
        XCTAssertEqual(progress.globalPercentage, 75)
    }

    /// A sequential multi-file send registers files one at a time, so when file 1
    /// completes the others aren't in progressMap yet. Without a declared batch
    /// the bar would read 100% then drop — so the caller-declared
    /// expectedTotal{Files,Bytes} act as FLOORS to keep the totals stable.
    func test_computeQueueProgress_expectedBatch_floorsTotals_noOscillationToHundred() {
        let f1 = FileUploadProgress(
            fileId: "f1", fileName: "a", fileSize: 100,
            status: .complete, percentage: 100, bytesUploaded: 100, error: nil, attachmentId: nil)

        let progress = TusUploadManager.computeQueueProgress(
            from: [f1], expectedTotalFiles: 3, expectedTotalBytes: 300)

        XCTAssertEqual(progress.totalFiles, 3, "the declared 3-file batch is the floor, not the 1 registered so far")
        XCTAssertEqual(progress.totalBytes, 300)
        XCTAssertEqual(progress.completedFiles, 1)
        XCTAssertEqual(progress.globalPercentage, 100.0 / 300.0 * 100, accuracy: 0.001,
                       "100 of 300 declared bytes = 33%, NOT a premature 100%")
    }

    /// The declared batch is only a floor: once the real progressMap exceeds it
    /// (e.g. a miscount), the actual values win so the bar never under-reports.
    func test_computeQueueProgress_expectedBatch_isFloorOnly_actualExceedsWins() {
        let f1 = FileUploadProgress(
            fileId: "f1", fileName: "a", fileSize: 100,
            status: .complete, percentage: 100, bytesUploaded: 100, error: nil, attachmentId: nil)
        let f2 = FileUploadProgress(
            fileId: "f2", fileName: "b", fileSize: 100,
            status: .uploading, percentage: 50, bytesUploaded: 50, error: nil, attachmentId: nil)

        let progress = TusUploadManager.computeQueueProgress(
            from: [f1, f2], expectedTotalFiles: 1, expectedTotalBytes: 50)

        XCTAssertEqual(progress.totalFiles, 2)
        XCTAssertEqual(progress.totalBytes, 200)
    }

    // MARK: - TusUploadResult

    func test_tusUploadResult_toMessageAttachment_mapsFieldsCorrectly() {
        let result = TusUploadResult(
            id: "att123",
            fileName: "photo.jpg",
            originalName: "original_photo.jpg",
            mimeType: "image/jpeg",
            fileSize: 4096,
            fileUrl: "https://cdn.example.com/photo.jpg",
            thumbnailUrl: "https://cdn.example.com/thumb.jpg",
            thumbHash: nil,
            width: 1920,
            height: 1080,
            duration: nil
        )

        let attachment = result.toMessageAttachment(uploadedBy: "user123")

        XCTAssertEqual(attachment.id, "att123")
        XCTAssertEqual(attachment.fileName, "photo.jpg")
        XCTAssertEqual(attachment.originalName, "original_photo.jpg")
        XCTAssertEqual(attachment.mimeType, "image/jpeg")
        XCTAssertEqual(attachment.fileSize, 4096)
        XCTAssertEqual(attachment.fileUrl, "https://cdn.example.com/photo.jpg")
        XCTAssertEqual(attachment.thumbnailUrl, "https://cdn.example.com/thumb.jpg")
        XCTAssertEqual(attachment.width, 1920)
        XCTAssertEqual(attachment.height, 1080)
        XCTAssertNil(attachment.duration)
        XCTAssertEqual(attachment.uploadedBy, "user123")
    }

    func test_tusUploadResult_toMessageAttachment_usesFileNameWhenOriginalNameNil() {
        let result = TusUploadResult(
            id: "att456",
            fileName: "video.mp4",
            originalName: nil,
            mimeType: "video/mp4",
            fileSize: 8192,
            fileUrl: "https://cdn.example.com/video.mp4",
            thumbnailUrl: nil,
            thumbHash: nil,
            width: nil,
            height: nil,
            duration: 120
        )

        let attachment = result.toMessageAttachment(uploadedBy: "user456")

        XCTAssertEqual(attachment.originalName, "video.mp4")
        XCTAssertNil(attachment.thumbnailUrl)
        XCTAssertEqual(attachment.duration, 120)
    }

    // MARK: - Provenance déclarée à la création (#9775)

    /// Décode `Upload-Metadata` comme le serveur TUS : paires `clé base64`.
    private func decodedMetadata(_ header: String) -> [String: String] {
        Dictionary(uniqueKeysWithValues: header.split(separator: ",").compactMap { pair in
            let parts = pair.split(separator: " ", maxSplits: 1).map(String.init)
            guard let key = parts.first else { return nil }
            let value = parts.count > 1 ? Data(base64Encoded: parts[1]).flatMap { String(data: $0, encoding: .utf8) } ?? "" : ""
            return (key, value)
        })
    }

    func test_creationMetadata_capture_declaresCapturedInAppTrue() {
        let header = TusUploadManager.creationMetadata(
            fileName: "prise.jpg", mimeType: "image/jpeg", uploadContext: nil,
            thumbHash: nil, transcription: nil, capturedInApp: true
        )

        let metadata = decodedMetadata(header)
        XCTAssertEqual(metadata["capturedinapp"], "true")
        XCTAssertEqual(metadata["filename"], "prise.jpg")
        XCTAssertEqual(metadata["filetype"], "image/jpeg")
    }

    func test_creationMetadata_notACapture_carriesNoCaptureKey() {
        let header = TusUploadManager.creationMetadata(
            fileName: "galerie.jpg", mimeType: "image/jpeg", uploadContext: "post",
            thumbHash: "abc", transcription: nil, capturedInApp: false
        )

        let metadata = decodedMetadata(header)
        XCTAssertNil(metadata["capturedinapp"])
        XCTAssertEqual(metadata["uploadcontext"], "post")
        XCTAssertEqual(metadata["thumbhash"], "abc")
    }

    /// #10789 — un blob chiffré de bout en bout ne déclare RIEN de ce que son
    /// chiffré cache : ni nom, ni type, ni ThumbHash, ni transcription, ni
    /// provenance. Seuls le contexte et le condensat du blob partent.
    func test_creationMetadata_endToEndBlob_declaresOnlyItsContextAndDigest() {
        let header = TusUploadManager.creationMetadata(
            fileName: "IMG_0042.HEIC", mimeType: "image/heic", uploadContext: TusUploadManager.endToEndBlobContext,
            thumbHash: "abc", transcription: TusUploadTranscriptionMetadata(text: "secret", language: "fr", confidence: nil, durationMs: nil, segments: nil), capturedInApp: true,
            blobDigest: "q83vEjRWeJA="
        )

        XCTAssertEqual(decodedMetadata(header), [
            "uploadcontext": "e2ee-attachment",
            "digest": "q83vEjRWeJA=",
            "filetype": "application/octet-stream",
            "filename": "blob",
        ])
    }

    func test_blobDigest_isTheBase64OfTheFileSHA256() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("blob-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("abc".utf8).write(to: file)

        XCTAssertEqual(try TusUploadManager.blobDigest(of: file), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=")
    }
}
