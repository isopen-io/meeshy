import UIKit
import MeeshySDK
@testable import Meeshy

final class MockProfileImageUploader: ProfileImageUploading, @unchecked Sendable {
    var uploadResult: Result<MeeshyUser, Error> = .success(MeeshyUser(id: "me", username: "aicha"))
    /// Joué PENDANT l'envoi, avant sa réponse : le témoin y lit l'état optimiste.
    var duringUpload: (@MainActor () -> Void)?

    private(set) var uploadCallCount = 0
    private(set) var uploadedSlots: [ProfileImageSlot] = []

    func upload(_ image: UIImage, as slot: ProfileImageSlot) async throws -> MeeshyUser {
        uploadCallCount += 1
        uploadedSlots.append(slot)
        if let duringUpload { await duringUpload() }
        return try uploadResult.get()
    }

    func reset() {
        uploadResult = .success(MeeshyUser(id: "me", username: "aicha"))
        duringUpload = nil
        uploadCallCount = 0
        uploadedSlots = []
    }
}
