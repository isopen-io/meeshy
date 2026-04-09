import XCTest
@testable import MeeshySDK

final class ShareLinkServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: ShareLinkService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = ShareLinkService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeMyShareLink(id: String = "link1") -> MyShareLink {
        MyShareLink(
            id: id, linkId: "lk_abc", identifier: "my-link",
            name: "Test Link", isActive: true, currentUses: 5,
            maxUses: 100, expiresAt: nil, createdAt: Date(),
            conversationTitle: "General"
        )
    }

    // MARK: - listMyLinks

    func test_listMyLinks_callsCorrectEndpoint() async throws {
        let response = APIResponse<[MyShareLink]>(success: true, data: [], error: nil)
        mock.stub("/links?offset=0&limit=50", result: response)

        _ = try await service.listMyLinks()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/links?offset=0&limit=50")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_listMyLinks_returnsLinks() async throws {
        let links = [makeMyShareLink(id: "l1"), makeMyShareLink(id: "l2")]
        let response = APIResponse<[MyShareLink]>(success: true, data: links, error: nil)
        mock.stub("/links?offset=0&limit=50", result: response)

        let result = try await service.listMyLinks()

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].id, "l1")
        XCTAssertEqual(result[1].id, "l2")
    }

    // MARK: - fetchMyStats

    func test_fetchMyStats_callsCorrectEndpoint() async throws {
        let stats = MyShareLinkStats(totalLinks: 3, activeLinks: 2, totalUses: 50)
        let response = APIResponse<MyShareLinkStats>(success: true, data: stats, error: nil)
        mock.stub("/links/stats", result: response)

        let result = try await service.fetchMyStats()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/links/stats")
        XCTAssertEqual(result.totalLinks, 3)
        XCTAssertEqual(result.activeLinks, 2)
        XCTAssertEqual(result.totalUses, 50)
    }

    // MARK: - getLinkInfo

    func test_getLinkInfo_callsCorrectEndpoint() async throws {
        let info = ShareLinkInfo(
            id: "sl1", linkId: "lk1", name: "Test", description: nil,
            expiresAt: nil, maxUses: nil, currentUses: 0,
            maxConcurrentUsers: nil, currentConcurrentUsers: 0,
            requireAccount: false, requireNickname: false,
            requireEmail: false, requireBirthday: false,
            allowedLanguages: [],
            conversation: ShareLinkConversation(id: "c1", title: "Chat", description: nil, type: "GROUP", createdAt: Date()),
            creator: ShareLinkCreator(id: "u1", username: "alice", firstName: nil, lastName: nil, displayName: "Alice", avatar: nil),
            stats: ShareLinkStats(totalParticipants: 10, memberCount: 8, anonymousCount: 2, languageCount: 3, spokenLanguages: ["fr", "en", "es"])
        )
        let response = APIResponse<ShareLinkInfo>(success: true, data: info, error: nil)
        mock.stub("/anonymous/link/my-link", result: response)

        let result = try await service.getLinkInfo(identifier: "my-link")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/anonymous/link/my-link")
        XCTAssertEqual(result.id, "sl1")
        XCTAssertEqual(result.creator.username, "alice")
    }

    // MARK: - createShareLink

    func test_createShareLink_callsCorrectEndpoint() async throws {
        let rawResponse = CreateShareLinkResponse(
            linkId: "lk_new",
            conversationId: "conv1",
            shareLink: CreateShareLinkResponse.ShareLinkDetail(
                id: "sl_new", linkId: "lk_new", name: "New Link",
                description: nil, expiresAt: nil, isActive: true
            )
        )
        let response = APIResponse<CreateShareLinkResponse>(success: true, data: rawResponse, error: nil)
        mock.stub("/links", result: response)

        let request = CreateShareLinkRequest(conversationId: "conv1", name: "New Link")
        let result = try await service.createShareLink(request: request)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/links")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.linkId, "lk_new")
        XCTAssertEqual(result.name, "New Link")
        XCTAssertTrue(result.isActive)
    }

    // MARK: - toggleLink

    func test_toggleLink_callsCorrectEndpoint() async throws {
        let link = makeMyShareLink()
        let response = APIResponse<MyShareLink>(success: true, data: link, error: nil)
        mock.stub("/links/lk1", result: response)

        try await service.toggleLink(linkId: "lk1", isActive: false)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/links/lk1")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - deleteLink

    func test_deleteLink_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/links/lk1", result: response)

        try await service.deleteLink(linkId: "lk1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/links/lk1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - Error handling

    func test_listMyLinks_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.listMyLinks()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_createShareLink_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 422, message: "Validation error")

        do {
            let request = CreateShareLinkRequest(conversationId: "conv1")
            _ = try await service.createShareLink(request: request)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 422)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
