import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - AttachmentSendResult Tests

final class AttachmentSendResultTests: XCTestCase {

    func test_init_storesProperties() {
        let result = AttachmentSendResult(
            uploadedIds: ["id1", "id2"],
            localAttachments: [],
            sendSuccess: true
        )
        XCTAssertEqual(result.uploadedIds, ["id1", "id2"])
        XCTAssertTrue(result.sendSuccess)
        XCTAssertTrue(result.localAttachments.isEmpty)
    }

    func test_sendSuccess_false() {
        let result = AttachmentSendResult(uploadedIds: [], localAttachments: [], sendSuccess: false)
        XCTAssertFalse(result.sendSuccess)
    }
}

// MARK: - PendingFileInfo Tests

final class PendingFileInfoTests: XCTestCase {

    func test_init_storesProperties() {
        let url = URL(fileURLWithPath: "/tmp/test.jpg")
        let info = PendingFileInfo(
            attachmentId: "att123",
            fileURL: url,
            mimeType: "image/jpeg",
            thumbnailImage: nil
        )
        XCTAssertEqual(info.attachmentId, "att123")
        XCTAssertEqual(info.fileURL, url)
        XCTAssertEqual(info.mimeType, "image/jpeg")
        XCTAssertNil(info.thumbnailImage)
    }
}

// MARK: - AttachmentSendError Tests

final class AttachmentSendErrorTests: XCTestCase {

    func test_missingConfiguration_hasDescription() {
        let error = AttachmentSendError.missingConfiguration
        XCTAssertNotNil(error.errorDescription)
    }
}

// MARK: - UploadQueueProgress Tests

final class UploadQueueProgressTests: XCTestCase {

    func test_emptyQueue_zeroProgress() {
        let progress = UploadQueueProgress(
            files: [],
            totalFiles: 0,
            completedFiles: 0,
            totalBytes: 0,
            uploadedBytes: 0,
            globalPercentage: 0
        )
        XCTAssertEqual(progress.totalFiles, 0)
        XCTAssertEqual(progress.globalPercentage, 0)
    }

    func test_partialUpload_tracksProgress() {
        let progress = UploadQueueProgress(
            files: [],
            totalFiles: 3,
            completedFiles: 1,
            totalBytes: 3000,
            uploadedBytes: 1500,
            globalPercentage: 50.0
        )
        XCTAssertEqual(progress.completedFiles, 1)
        XCTAssertEqual(progress.totalFiles, 3)
        XCTAssertEqual(progress.uploadedBytes, 1500)
        XCTAssertEqual(progress.globalPercentage, 50.0)
    }
}
