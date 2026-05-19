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

    func test_requestTranscription_withForce_sendsForceTrueInBody() async throws {
        let response = SimpleAPIResponse(success: true, message: "ok", error: nil)
        mock.stub("/attachments/att_1/transcribe", result: response)

        try await service.requestTranscription(attachmentId: "att_1", force: true)

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["force"] as? Bool, true)
    }

    func test_requestTranscription_defaultForce_sendsForceFalse() async throws {
        let response = SimpleAPIResponse(success: true, message: "ok", error: nil)
        mock.stub("/attachments/att_1/transcribe", result: response)

        try await service.requestTranscription(attachmentId: "att_1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["force"] as? Bool, false)
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

    // Regression: the gateway keys attachment status rows by `participantId`,
    // not `userId`. A prior version of `AttachmentStatusUser` required
    // `userId`, which caused JSONDecoder to throw `keyNotFound` against the
    // real payload — surfacing as silently empty "Écouté" / "Vu" tabs in the
    // long-press detail sheet even when stats existed in MongoDB.
    func test_attachmentStatusUser_decodesGatewayPayload() throws {
        let json = """
        {
          "participantId": "p-123",
          "username": "alice",
          "avatar": "https://cdn/a.jpg",
          "viewedAt": null,
          "downloadedAt": null,
          "listenedAt": "2026-05-11T08:00:00.000Z",
          "watchedAt": null,
          "listenCount": 3,
          "watchCount": 0,
          "listenedComplete": true,
          "watchedComplete": false,
          "lastPlayPositionMs": 42000,
          "lastWatchPositionMs": null
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        // Mirror APIClient's production strategy: ISO8601 with fractional
        // seconds, falling back to whole-second ISO8601. The gateway sends
        // millisecond precision (e.g. "2026-05-11T08:00:00.000Z"), which the
        // plain .iso8601 strategy rejects.
        let isoFractional = ISO8601DateFormatter()
        isoFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = isoFractional.date(from: dateStr) { return date }
            if let date = isoBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }

        let user = try decoder.decode(AttachmentStatusUser.self, from: json)

        XCTAssertEqual(user.participantId, "p-123")
        XCTAssertEqual(user.id, "p-123")
        XCTAssertEqual(user.username, "alice")
        XCTAssertEqual(user.listenCount, 3)
        XCTAssertEqual(user.listenedComplete, true)
        XCTAssertEqual(user.lastPlayPositionMs, 42000)
        XCTAssertNil(user.watchedAt)
        XCTAssertNil(user.lastWatchPositionMs)
    }
}
