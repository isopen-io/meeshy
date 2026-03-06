import Foundation
import MeeshySDK
import XCTest

private let stubUser = MeeshyUser(id: "user-stub-id", username: "stubuser", displayName: "Stub User")

private let stubChangeEmailResponse: ChangeEmailResponse = JSONStub.decode("""
{"message":"Verification email sent","pendingEmail":"new@example.com"}
""")

private let stubVerifyEmailChangeResponse: VerifyEmailChangeResponse = JSONStub.decode("""
{"message":"Email changed successfully","newEmail":"new@example.com"}
""")

private let stubChangePhoneResponse: ChangePhoneResponse = JSONStub.decode("""
{"message":"Verification code sent","pendingPhoneNumber":"+15551234567"}
""")

private let stubVerifyPhoneChangeResponse: VerifyPhoneChangeResponse = JSONStub.decode("""
{"message":"Phone changed successfully","newPhoneNumber":"+15551234567"}
""")

private let emptySearchResponse: OffsetPaginatedAPIResponse<[UserSearchResult]> = JSONStub.decode("""
{"success":true,"data":[],"pagination":null,"error":null}
""")

@MainActor
final class MockUserService: UserServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var searchResult: Result<OffsetPaginatedAPIResponse<[UserSearchResult]>, Error> = .success(emptySearchResponse)
    var searchUsersResult: Result<[UserSearchResult], Error> = .success([])
    var updateProfileResult: Result<MeeshyUser, Error> = .success(stubUser)
    var updateAvatarResult: Result<MeeshyUser, Error> = .success(stubUser)
    var updateBannerResult: Result<MeeshyUser, Error> = .success(stubUser)
    var uploadImageResult: Result<String, Error> = .success("https://example.com/stub-image.jpg")
    var getProfileResult: Result<MeeshyUser, Error> = .success(stubUser)
    var getPublicProfileResult: Result<MeeshyUser, Error> = .success(stubUser)
    var getProfileByEmailResult: Result<MeeshyUser, Error> = .success(stubUser)
    var getProfileByIdResult: Result<MeeshyUser, Error> = .success(stubUser)
    var getProfileByPhoneResult: Result<MeeshyUser, Error> = .success(stubUser)
    var changeEmailResult: Result<ChangeEmailResponse, Error> = .success(stubChangeEmailResponse)
    var verifyEmailChangeResult: Result<VerifyEmailChangeResponse, Error> = .success(stubVerifyEmailChangeResponse)
    var resendEmailChangeVerificationResult: Result<ChangeEmailResponse, Error> = .success(stubChangeEmailResponse)
    var changePhoneResult: Result<ChangePhoneResponse, Error> = .success(stubChangePhoneResponse)
    var verifyPhoneChangeResult: Result<VerifyPhoneChangeResponse, Error> = .success(stubVerifyPhoneChangeResponse)
    var getUserStatsResult: Result<UserStats, Error> = .success(UserStats())

    // MARK: - Call Tracking

    var searchCallCount = 0
    var lastSearchQuery: String?

    var searchUsersCallCount = 0
    var lastSearchUsersQuery: String?

    var updateProfileCallCount = 0
    var lastUpdateProfileRequest: UpdateProfileRequest?

    var updateAvatarCallCount = 0
    var lastUpdateAvatarUrl: String?

    var updateBannerCallCount = 0
    var lastUpdateBannerUrl: String?

    var uploadImageCallCount = 0

    var getProfileCallCount = 0
    var lastGetProfileIdOrUsername: String?

    var getPublicProfileCallCount = 0
    var lastGetPublicProfileUsername: String?

    var getProfileByEmailCallCount = 0

    var getProfileByIdCallCount = 0

    var getProfileByPhoneCallCount = 0

    var changeEmailCallCount = 0
    var verifyEmailChangeCallCount = 0
    var resendEmailChangeVerificationCallCount = 0
    var changePhoneCallCount = 0
    var verifyPhoneChangeCallCount = 0

    var getUserStatsCallCount = 0
    var lastGetUserStatsUserId: String?

    // MARK: - Protocol Conformance

    func search(query: String, limit: Int, offset: Int) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]> {
        searchCallCount += 1
        lastSearchQuery = query
        return try searchResult.get()
    }

    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] {
        searchUsersCallCount += 1
        lastSearchUsersQuery = query
        return try searchUsersResult.get()
    }

    func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser {
        updateProfileCallCount += 1
        lastUpdateProfileRequest = request
        return try updateProfileResult.get()
    }

    func updateAvatar(url: String) async throws -> MeeshyUser {
        updateAvatarCallCount += 1
        lastUpdateAvatarUrl = url
        return try updateAvatarResult.get()
    }

    func updateBanner(url: String) async throws -> MeeshyUser {
        updateBannerCallCount += 1
        lastUpdateBannerUrl = url
        return try updateBannerResult.get()
    }

    func uploadImage(_ imageData: Data, filename: String) async throws -> String {
        uploadImageCallCount += 1
        return try uploadImageResult.get()
    }

    func getProfile(idOrUsername: String) async throws -> MeeshyUser {
        getProfileCallCount += 1
        lastGetProfileIdOrUsername = idOrUsername
        return try getProfileResult.get()
    }

    func getPublicProfile(username: String) async throws -> MeeshyUser {
        getPublicProfileCallCount += 1
        lastGetPublicProfileUsername = username
        return try getPublicProfileResult.get()
    }

    func getProfileByEmail(_ email: String) async throws -> MeeshyUser {
        getProfileByEmailCallCount += 1
        return try getProfileByEmailResult.get()
    }

    func getProfileById(_ id: String) async throws -> MeeshyUser {
        getProfileByIdCallCount += 1
        return try getProfileByIdResult.get()
    }

    func getProfileByPhone(_ phone: String) async throws -> MeeshyUser {
        getProfileByPhoneCallCount += 1
        return try getProfileByPhoneResult.get()
    }

    func changeEmail(_ request: ChangeEmailRequest) async throws -> ChangeEmailResponse {
        changeEmailCallCount += 1
        return try changeEmailResult.get()
    }

    func verifyEmailChange(_ request: VerifyEmailChangeRequest) async throws -> VerifyEmailChangeResponse {
        verifyEmailChangeCallCount += 1
        return try verifyEmailChangeResult.get()
    }

    func resendEmailChangeVerification() async throws -> ChangeEmailResponse {
        resendEmailChangeVerificationCallCount += 1
        return try resendEmailChangeVerificationResult.get()
    }

    func changePhone(_ request: ChangePhoneRequest) async throws -> ChangePhoneResponse {
        changePhoneCallCount += 1
        return try changePhoneResult.get()
    }

    func verifyPhoneChange(_ request: VerifyPhoneChangeRequest) async throws -> VerifyPhoneChangeResponse {
        verifyPhoneChangeCallCount += 1
        return try verifyPhoneChangeResult.get()
    }

    func getUserStats(userId: String) async throws -> UserStats {
        getUserStatsCallCount += 1
        lastGetUserStatsUserId = userId
        return try getUserStatsResult.get()
    }

    // MARK: - Reset

    func reset() {
        searchResult = .success(emptySearchResponse)
        searchCallCount = 0
        lastSearchQuery = nil

        searchUsersResult = .success([])
        searchUsersCallCount = 0
        lastSearchUsersQuery = nil

        updateProfileResult = .success(stubUser)
        updateProfileCallCount = 0
        lastUpdateProfileRequest = nil

        updateAvatarResult = .success(stubUser)
        updateAvatarCallCount = 0
        lastUpdateAvatarUrl = nil

        updateBannerResult = .success(stubUser)
        updateBannerCallCount = 0
        lastUpdateBannerUrl = nil

        uploadImageResult = .success("https://example.com/stub-image.jpg")
        uploadImageCallCount = 0

        getProfileResult = .success(stubUser)
        getProfileCallCount = 0
        lastGetProfileIdOrUsername = nil

        getPublicProfileResult = .success(stubUser)
        getPublicProfileCallCount = 0
        lastGetPublicProfileUsername = nil

        getProfileByEmailResult = .success(stubUser)
        getProfileByEmailCallCount = 0

        getProfileByIdResult = .success(stubUser)
        getProfileByIdCallCount = 0

        getProfileByPhoneResult = .success(stubUser)
        getProfileByPhoneCallCount = 0

        changeEmailResult = .success(stubChangeEmailResponse)
        changeEmailCallCount = 0

        verifyEmailChangeResult = .success(stubVerifyEmailChangeResponse)
        verifyEmailChangeCallCount = 0

        resendEmailChangeVerificationResult = .success(stubChangeEmailResponse)
        resendEmailChangeVerificationCallCount = 0

        changePhoneResult = .success(stubChangePhoneResponse)
        changePhoneCallCount = 0

        verifyPhoneChangeResult = .success(stubVerifyPhoneChangeResponse)
        verifyPhoneChangeCallCount = 0

        getUserStatsResult = .success(UserStats())
        getUserStatsCallCount = 0
        lastGetUserStatsUserId = nil
    }
}
