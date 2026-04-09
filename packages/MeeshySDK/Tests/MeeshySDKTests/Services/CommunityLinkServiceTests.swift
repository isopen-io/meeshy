import XCTest
@testable import MeeshySDK

final class CommunityLinkServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: CommunityLinkService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = CommunityLinkService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeMiniCommunity(id: String = "c1", name: String = "My Community",
                                    identifier: String = "my-community",
                                    memberCount: Int? = 42, isActive: Bool = true) -> APICommunityMini {
        APICommunityMini(
            id: id, name: name, identifier: identifier,
            isActive: isActive, memberCount: memberCount, createdAt: Date()
        )
    }

    private func makeLink(id: String = "c1", name: String = "My Community",
                           memberCount: Int = 42, isActive: Bool = true) -> CommunityLink {
        CommunityLink(
            id: id, name: name, identifier: "my-community",
            baseUrl: "https://meeshy.me", memberCount: memberCount,
            isActive: isActive, createdAt: Date()
        )
    }

    // MARK: - listCommunityLinks

    func test_listCommunityLinks_callsCorrectEndpoint() async throws {
        let communities = [makeMiniCommunity()]
        let response = APIResponse<[APICommunityMini]>(success: true, data: communities, error: nil)
        mock.stub("/communities/mine?role=admin,moderator", result: response)

        let result = try await service.listCommunityLinks()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/mine?role=admin,moderator")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].name, "My Community")
    }

    func test_listCommunityLinks_mapsFieldsCorrectly() async throws {
        let communities = [makeMiniCommunity(id: "c42", name: "Mapped", identifier: "mapped-id", memberCount: 10, isActive: false)]
        let response = APIResponse<[APICommunityMini]>(success: true, data: communities, error: nil)
        mock.stub("/communities/mine?role=admin,moderator", result: response)

        let result = try await service.listCommunityLinks()

        XCTAssertEqual(result[0].id, "c42")
        XCTAssertEqual(result[0].name, "Mapped")
        XCTAssertEqual(result[0].memberCount, 10)
        XCTAssertFalse(result[0].isActive)
        XCTAssertTrue(result[0].joinUrl.contains("mapped-id"))
    }

    func test_listCommunityLinks_nilMemberCountDefaultsToZero() async throws {
        let communities = [makeMiniCommunity(memberCount: nil)]
        let response = APIResponse<[APICommunityMini]>(success: true, data: communities, error: nil)
        mock.stub("/communities/mine?role=admin,moderator", result: response)

        let result = try await service.listCommunityLinks()

        XCTAssertEqual(result[0].memberCount, 0)
    }

    func test_listCommunityLinks_returnsEmptyArray() async throws {
        let response = APIResponse<[APICommunityMini]>(success: true, data: [], error: nil)
        mock.stub("/communities/mine?role=admin,moderator", result: response)

        let result = try await service.listCommunityLinks()

        XCTAssertTrue(result.isEmpty)
    }

    func test_listCommunityLinks_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.listCommunityLinks()
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }

    // MARK: - stats

    func test_stats_computesCorrectTotals() {
        let links = [
            makeLink(id: "c1", memberCount: 10, isActive: true),
            makeLink(id: "c2", memberCount: 20, isActive: true),
            makeLink(id: "c3", memberCount: 5, isActive: false),
        ]

        let result = service.stats(links: links)

        XCTAssertEqual(result.totalCommunities, 3)
        XCTAssertEqual(result.totalMembers, 35)
        XCTAssertEqual(result.activeCommunities, 2)
    }

    func test_stats_emptyLinksReturnsZeros() {
        let result = service.stats(links: [])

        XCTAssertEqual(result.totalCommunities, 0)
        XCTAssertEqual(result.totalMembers, 0)
        XCTAssertEqual(result.activeCommunities, 0)
    }

    func test_stats_allInactiveReturnsZeroActive() {
        let links = [
            makeLink(id: "c1", memberCount: 10, isActive: false),
            makeLink(id: "c2", memberCount: 20, isActive: false),
        ]

        let result = service.stats(links: links)

        XCTAssertEqual(result.totalCommunities, 2)
        XCTAssertEqual(result.totalMembers, 30)
        XCTAssertEqual(result.activeCommunities, 0)
    }
}
