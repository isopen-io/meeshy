import XCTest
@testable import MeeshySDK

final class ReactionServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: ReactionService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = ReactionService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - add

    func testAddPostsReactionToEndpoint() async throws {
        let response = APIResponse<[String: String]>(success: true, data: [:], error: nil)
        mock.stub("/reactions", result: response)

        try await service.add(messageId: "msg001", emoji: "thumbsup")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/reactions")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testAddWithDifferentEmoji() async throws {
        let response = APIResponse<[String: String]>(success: true, data: [:], error: nil)
        mock.stub("/reactions", result: response)

        try await service.add(messageId: "msg002", emoji: "heart")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/reactions")
    }

    // MARK: - remove

    func testRemoveCallsDeleteWithEncodedEmoji() async throws {
        let response = APIResponse<[String: String]>(success: true, data: [:], error: nil)
        mock.stub("/reactions/msg001/thumbsup", result: response)

        try await service.remove(messageId: "msg001", emoji: "thumbsup")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/reactions/msg001/thumbsup")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func testRemoveWithUnicodeEmoji() async throws {
        let emoji = "\u{1F44D}"
        let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
        let response = APIResponse<[String: String]>(success: true, data: [:], error: nil)
        mock.stub("/reactions/msg001/\(encoded)", result: response)

        try await service.remove(messageId: "msg001", emoji: emoji)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/reactions/msg001/\(encoded)")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - fetchDetails

    func testFetchDetailsReturnsReactionSyncResponse() async throws {
        let userDetail = ReactionUserDetail(userId: "u1", username: "alice", avatar: nil)
        let group = ReactionGroup(emoji: "heart", count: 2, users: [userDetail])
        let syncResponse = ReactionSyncResponse(
            messageId: "msg001",
            reactions: [group],
            totalCount: 2,
            userReactions: ["heart"]
        )
        let response = APIResponse<ReactionSyncResponse>(success: true, data: syncResponse, error: nil)
        mock.stub("/reactions/msg001", result: response)

        let result = try await service.fetchDetails(messageId: "msg001")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/reactions/msg001")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.messageId, "msg001")
        XCTAssertEqual(result.reactions.count, 1)
        XCTAssertEqual(result.reactions[0].emoji, "heart")
        XCTAssertEqual(result.reactions[0].count, 2)
        XCTAssertEqual(result.reactions[0].users[0].username, "alice")
        XCTAssertEqual(result.totalCount, 2)
        XCTAssertEqual(result.userReactions, ["heart"])
    }

    func testFetchDetailsWithEmptyReactions() async throws {
        let syncResponse = ReactionSyncResponse(
            messageId: "msg002",
            reactions: [],
            totalCount: 0,
            userReactions: []
        )
        let response = APIResponse<ReactionSyncResponse>(success: true, data: syncResponse, error: nil)
        mock.stub("/reactions/msg002", result: response)

        let result = try await service.fetchDetails(messageId: "msg002")

        XCTAssertEqual(result.messageId, "msg002")
        XCTAssertTrue(result.reactions.isEmpty)
        XCTAssertEqual(result.totalCount, 0)
        XCTAssertTrue(result.userReactions.isEmpty)
    }

    // MARK: - Error handling

    func testAddPropagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            try await service.add(messageId: "msg001", emoji: "fire")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testFetchDetailsPropagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal Server Error")

        do {
            _ = try await service.fetchDetails(messageId: "msg001")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, let message) = error {
                XCTAssertEqual(code, 500)
                XCTAssertEqual(message, "Internal Server Error")
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
