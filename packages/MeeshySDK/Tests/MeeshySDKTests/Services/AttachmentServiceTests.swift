import XCTest
@testable import MeeshySDK

final class AttachmentServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: AttachmentService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = AttachmentService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - requestTranscription

    func test_requestTranscription_callsCorrectEndpoint() async throws {
        let response = SimpleAPIResponse(success: true, message: "Transcription requested", error: nil)
        mock.stub("/attachments/att123/transcribe", result: response)

        try await service.requestTranscription(attachmentId: "att123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/attachments/att123/transcribe")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_requestTranscription_withDifferentId_callsCorrectEndpoint() async throws {
        let response = SimpleAPIResponse(success: true, message: "OK", error: nil)
        mock.stub("/attachments/xyz789/transcribe", result: response)

        try await service.requestTranscription(attachmentId: "xyz789")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/attachments/xyz789/transcribe")
    }

    func test_requestTranscription_propagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            try await service.requestTranscription(attachmentId: "att123")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_requestTranscription_propagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 404, message: "Attachment not found")

        do {
            try await service.requestTranscription(attachmentId: "missing")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 404)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    // MARK: - getStatusDetails

    func test_getStatusDetails_callsCorrectEndpoint() async throws {
        let response = OffsetPaginatedAPIResponse<[AttachmentStatusUser]>(
            success: true, data: [], pagination: nil, error: nil
        )
        mock.stub("/attachments/att123/status-details", result: response)

        let result = try await service.getStatusDetails(attachmentId: "att123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/attachments/att123/status-details")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertTrue(result.isEmpty)
    }

    func test_getStatusDetails_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.serverUnreachable)

        do {
            _ = try await service.getStatusDetails(attachmentId: "att123")
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }
}
