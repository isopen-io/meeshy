import XCTest
import MeeshySDK
@testable import Meeshy

/// #17236 — LE chemin d'une image de profil, partagé par l'écran Profil et la
/// carte « Montre-toi » : l'image envoyée puis écrite sur la bonne colonne.
@MainActor
final class ProfileImageUploaderTests: XCTestCase {

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    func test_upload_avatar_writesTheUploadedURLOnTheAvatar() async throws {
        let users = MockUserService()
        users.uploadImageResult = .success("https://cdn/a.jpg")

        _ = try await ProfileImageUploader(users: users).upload(makeImage(), as: .avatar)

        XCTAssertEqual(users.uploadImageCallCount, 1)
        XCTAssertEqual(users.lastUpdateAvatarUrl, "https://cdn/a.jpg")
        XCTAssertEqual(users.updateBannerCallCount, 0)
    }

    func test_upload_banner_writesTheUploadedURLOnTheBanner() async throws {
        let users = MockUserService()
        users.uploadImageResult = .success("https://cdn/b.jpg")

        _ = try await ProfileImageUploader(users: users).upload(makeImage(), as: .banner)

        XCTAssertEqual(users.lastUpdateBannerUrl, "https://cdn/b.jpg")
        XCTAssertEqual(users.updateAvatarCallCount, 0)
    }

    func test_upload_whenTheFileUploadFails_writesNothingOnTheAccount() async {
        let users = MockUserService()
        users.uploadImageResult = .failure(URLError(.timedOut))

        do {
            _ = try await ProfileImageUploader(users: users).upload(makeImage(), as: .avatar)
            XCTFail("l'échec de l'envoi doit remonter")
        } catch {
            XCTAssertEqual(users.updateAvatarCallCount, 0)
        }
    }
}
