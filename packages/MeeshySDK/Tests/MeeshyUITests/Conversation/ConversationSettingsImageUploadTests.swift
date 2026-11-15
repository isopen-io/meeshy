import XCTest
import MeeshySDK
@testable import MeeshyUI

private enum FakeUploaderError: Error { case unused, refused }

private struct FakeImageUploader: UserServiceProviding {
    let uploadResult: Result<String, Error>

    func uploadImage(_ imageData: Data, filename: String) async throws -> String {
        try uploadResult.get()
    }

    func search(query: String, limit: Int, offset: Int) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]> { throw FakeUploaderError.unused }
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] { throw FakeUploaderError.unused }
    func searchPeople(query: String, limit: Int, offset: Int) async throws -> UserSearchPage { throw FakeUploaderError.unused }
    func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func updateAvatar(url: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func updateBanner(url: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func getProfile(handle: String, expand: Set<ProfileExpansion>) async throws -> PublicProfile { throw FakeUploaderError.unused }
    func getProfile(idOrUsername: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func getProfileByEmail(_ email: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func getProfileById(_ id: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func getProfileByPhone(_ phone: String) async throws -> MeeshyUser { throw FakeUploaderError.unused }
    func changeEmail(_ request: ChangeEmailRequest) async throws -> ChangeEmailResponse { throw FakeUploaderError.unused }
    func verifyEmailChange(_ request: VerifyEmailChangeRequest) async throws -> VerifyEmailChangeResponse { throw FakeUploaderError.unused }
    func resendEmailChangeVerification() async throws -> ChangeEmailResponse { throw FakeUploaderError.unused }
    func changePhone(_ request: ChangePhoneRequest) async throws -> ChangePhoneResponse { throw FakeUploaderError.unused }
    func verifyPhoneChange(_ request: VerifyPhoneChangeRequest) async throws -> VerifyPhoneChangeResponse { throw FakeUploaderError.unused }
    func getUserStats(userId: String) async throws -> UserStats { throw FakeUploaderError.unused }
}

@MainActor
final class ConversationSettingsImageUploadTests: XCTestCase {

    private func makeSUT(uploadResult: Result<String, Error>) -> ConversationSettingsViewModel {
        ConversationSettingsViewModel(
            conversation: MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .group),
            imageUploader: FakeImageUploader(uploadResult: uploadResult)
        )
    }

    func test_uploadCompressedAvatar_success_setsTheUploadedUrl() async {
        let sut = makeSUT(uploadResult: .success("https://cdn.example.com/a.jpg"))

        await sut.uploadCompressedAvatar(Data([1, 2, 3]))

        XCTAssertEqual(sut.avatarUrl, "https://cdn.example.com/a.jpg")
        XCTAssertFalse(sut.showError)
    }

    func test_uploadCompressedAvatar_failure_keepsUrlAndShowsError() async {
        let sut = makeSUT(uploadResult: .failure(FakeUploaderError.refused))
        let before = sut.avatarUrl

        await sut.uploadCompressedAvatar(Data([1, 2, 3]))

        XCTAssertEqual(sut.avatarUrl, before)
        XCTAssertTrue(sut.showError)
        XCTAssertNotNil(sut.errorMessage)
        XCTAssertFalse(sut.isUploadingAvatar)
    }

    func test_uploadCompressedBanner_success_setsTheUploadedUrl() async {
        let sut = makeSUT(uploadResult: .success("https://cdn.example.com/b.jpg"))

        await sut.uploadCompressedBanner(Data([1]))

        XCTAssertEqual(sut.bannerUrl, "https://cdn.example.com/b.jpg")
    }
}
