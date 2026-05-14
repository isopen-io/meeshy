import Foundation
@testable import Meeshy

final class MockAttachmentUploader: AttachmentUploading, @unchecked Sendable {
    var uploadAvatarResult: Result<URL, Error> =
        .success(URL(string: "https://cdn.meeshy.me/avatars/test.jpg")!)
    var uploadAvatarCallCount = 0
    var lastUploadAvatarData: Data?

    func uploadAvatar(_ data: Data) async throws -> URL {
        uploadAvatarCallCount += 1
        lastUploadAvatarData = data
        return try uploadAvatarResult.get()
    }

    func reset() {
        uploadAvatarResult = .success(URL(string: "https://cdn.meeshy.me/avatars/test.jpg")!)
        uploadAvatarCallCount = 0
        lastUploadAvatarData = nil
    }
}
