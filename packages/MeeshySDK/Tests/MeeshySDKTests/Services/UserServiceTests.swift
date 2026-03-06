import XCTest
@testable import MeeshySDK

final class UserServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: UserService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = UserService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeMeeshyUser(id: String = "user123", username: String = "testuser") -> MeeshyUser {
        MeeshyUser(id: id, username: username, displayName: "Test User", bio: "Hello")
    }

    private func makeSearchResult(id: String = "u1", username: String = "found") -> UserSearchResult {
        UserSearchResult(id: id, username: username, displayName: "Found User", avatar: nil, isOnline: true)
    }

    // MARK: - search (offset-paginated)

    func testSearchCallsOffsetPaginatedEndpoint() async throws {
        let results = [makeSearchResult()]
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0)
        let response = OffsetPaginatedAPIResponse<[UserSearchResult]>(
            success: true, data: results, pagination: pagination, error: nil
        )
        mock.stub("/users/search", result: response)

        let result = try await service.search(query: "test", limit: 20, offset: 0)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/search")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].username, "found")
    }

    // MARK: - searchUsers

    func testSearchUsersReturnsDataArray() async throws {
        let results = [makeSearchResult(id: "u1"), makeSearchResult(id: "u2", username: "another")]
        let response = APIResponse<[UserSearchResult]>(success: true, data: results, error: nil)
        mock.stub("/users/search", result: response)

        let users = try await service.searchUsers(query: "test", limit: 10, offset: 0)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/search")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(users.count, 2)
        XCTAssertEqual(users[0].id, "u1")
        XCTAssertEqual(users[1].username, "another")
    }

    // MARK: - updateProfile

    func testUpdateProfileCallsPutOnUsersMe() async throws {
        let user = makeMeeshyUser()
        let updateResponse = UpdateProfileResponse(user: user)
        let response = APIResponse<UpdateProfileResponse>(success: true, data: updateResponse, error: nil)
        mock.stub("/users/me", result: response)

        let request = UpdateProfileRequest(displayName: "New Name")
        let result = try await service.updateProfile(request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
        XCTAssertEqual(result.id, "user123")
        XCTAssertEqual(result.username, "testuser")
    }

    // MARK: - updateAvatar

    func testUpdateAvatarCallsPatchOnAvatarEndpoint() async throws {
        let user = makeMeeshyUser()
        let updateResponse = UpdateProfileResponse(user: user)
        let response = APIResponse<UpdateProfileResponse>(success: true, data: updateResponse, error: nil)
        mock.stub("/users/me/avatar", result: response)

        let result = try await service.updateAvatar(url: "https://cdn.meeshy.me/avatar.jpg")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/avatar")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(result.username, "testuser")
    }

    // MARK: - updateBanner

    func testUpdateBannerCallsPatchOnBannerEndpoint() async throws {
        let user = makeMeeshyUser()
        let updateResponse = UpdateProfileResponse(user: user)
        let response = APIResponse<UpdateProfileResponse>(success: true, data: updateResponse, error: nil)
        mock.stub("/users/me/banner", result: response)

        let result = try await service.updateBanner(url: "https://cdn.meeshy.me/banner.jpg")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/banner")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(result.id, "user123")
    }

    // MARK: - getProfile

    func testGetProfileByIdOrUsername() async throws {
        let user = makeMeeshyUser()
        let response = APIResponse<MeeshyUser>(success: true, data: user, error: nil)
        mock.stub("/users/testuser", result: response)

        let result = try await service.getProfile(idOrUsername: "testuser")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/testuser")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.id, "user123")
    }

    // MARK: - getPublicProfile

    func testGetPublicProfileCallsPublicEndpoint() async throws {
        let user = makeMeeshyUser(username: "publicuser")
        let response = APIResponse<MeeshyUser>(success: true, data: user, error: nil)
        mock.stub("/u/publicuser", result: response)

        let result = try await service.getPublicProfile(username: "publicuser")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/u/publicuser")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.username, "publicuser")
    }

    // MARK: - getProfileById

    func testGetProfileByIdCallsIdEndpoint() async throws {
        let user = makeMeeshyUser(id: "abc123")
        let response = APIResponse<MeeshyUser>(success: true, data: user, error: nil)
        mock.stub("/users/id/abc123", result: response)

        let result = try await service.getProfileById("abc123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/id/abc123")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.id, "abc123")
    }

    // MARK: - getProfileByEmail

    func testGetProfileByEmailCallsEmailEndpoint() async throws {
        let user = makeMeeshyUser()
        let response = APIResponse<MeeshyUser>(success: true, data: user, error: nil)
        mock.stub("/users/email/test@meeshy.me", result: response)

        let result = try await service.getProfileByEmail("test@meeshy.me")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/email/test@meeshy.me")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.id, "user123")
    }

    // MARK: - getProfileByPhone

    func testGetProfileByPhoneStripsPlus() async throws {
        let user = makeMeeshyUser()
        let response = APIResponse<MeeshyUser>(success: true, data: user, error: nil)
        mock.stub("/users/phone/33612345678", result: response)

        let result = try await service.getProfileByPhone("+33612345678")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/phone/33612345678")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.username, "testuser")
    }

    // MARK: - changeEmail

    func testChangeEmailCallsPostOnChangeEmailEndpoint() async throws {
        let emailResponse = ChangeEmailResponse(message: "Verification email sent", pendingEmail: "new@meeshy.me")
        let response = APIResponse<ChangeEmailResponse>(success: true, data: emailResponse, error: nil)
        mock.stub("/users/me/change-email", result: response)

        let request = ChangeEmailRequest(newEmail: "new@meeshy.me")
        let result = try await service.changeEmail(request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/change-email")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.pendingEmail, "new@meeshy.me")
        XCTAssertEqual(result.message, "Verification email sent")
    }

    // MARK: - changePhone

    func testChangePhoneCallsPostOnChangePhoneEndpoint() async throws {
        let phoneResponse = ChangePhoneResponse(message: "Code sent", pendingPhoneNumber: "+33699999999")
        let response = APIResponse<ChangePhoneResponse>(success: true, data: phoneResponse, error: nil)
        mock.stub("/users/me/change-phone", result: response)

        let request = ChangePhoneRequest(newPhoneNumber: "+33699999999")
        let result = try await service.changePhone(request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/change-phone")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.pendingPhoneNumber, "+33699999999")
    }

    // MARK: - getUserStats

    func testGetUserStatsReturnsStats() async throws {
        let stats = UserStats(
            totalMessages: 150, totalConversations: 10,
            totalTranslations: 50, friendRequestsReceived: 5,
            languagesUsed: 3, memberDays: 30,
            languages: ["fr", "en", "es"], achievements: []
        )
        let response = APIResponse<UserStats>(success: true, data: stats, error: nil)
        mock.stub("/users/user123/stats", result: response)

        let result = try await service.getUserStats(userId: "user123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/user123/stats")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.totalMessages, 150)
        XCTAssertEqual(result.totalConversations, 10)
        XCTAssertEqual(result.languagesUsed, 3)
        XCTAssertEqual(result.languages, ["fr", "en", "es"])
    }

    // MARK: - Error handling

    func testServicePropagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.getProfile(idOrUsername: "anyone")
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

    func testServicePropagatesAuthError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            _ = try await service.updateProfile(UpdateProfileRequest(displayName: "x"))
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
