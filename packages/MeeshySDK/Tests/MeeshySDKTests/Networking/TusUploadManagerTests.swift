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
            width: nil,
            height: nil,
            duration: 120
        )

        let attachment = result.toMessageAttachment(uploadedBy: "user456")

        XCTAssertEqual(attachment.originalName, "video.mp4")
        XCTAssertNil(attachment.thumbnailUrl)
        XCTAssertEqual(attachment.duration, 120)
    }
}
