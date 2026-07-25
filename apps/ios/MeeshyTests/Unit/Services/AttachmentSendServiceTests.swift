import XCTest
@testable import MeeshySDK

// MARK: - UploadQueueProgress Tests
//
// (2026-07-21) AttachmentSendService.swift (and its AttachmentSendResult /
// PendingFileInfo / AttachmentSendError types) was deleted as confirmed dead
// code: 0 production call sites, only exercised here by tautological
// "stores the properties I gave it" tests that asserted nothing about the
// service's actual (buggy) upload logic. UploadQueueProgress is a real,
// still-used SDK type (TusUploadManager.swift) — its tests are kept.

@MainActor
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
