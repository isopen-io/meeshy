import Foundation
import SwiftUI
import PhotosUI
import MeeshySDK

@MainActor
final class EditProfileViewModel: ObservableObject {

    enum SaveState: Equatable {
        case idle, uploadingAvatar, enqueueing, success, failed
    }

    // MARK: - Bindings (inputs)

    @Published var displayName: String
    @Published var bio: String
    @Published var selectedImageData: Data?
    @Published var avatarPreviewImage: Image?

    // MARK: - State machine (outputs)

    @Published private(set) var saveState: SaveState = .idle
    @Published private(set) var errorMessage: String?
    @Published private(set) var showSuccess: Bool = false

    // MARK: - Dependencies

    private let authManager: AuthManaging
    private let offlineQueue: OfflineQueueing
    private let attachmentUploader: AttachmentUploading
    private let profileCache: ProfileCacheWriting
    private let sleeper: Sleeping
    private let toast: ToastSurfacing
    private let haptics: HapticSurfacing

    // MARK: - Init

    init(
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        attachmentUploader: AttachmentUploading = AttachmentUploader.shared,
        profileCache: ProfileCacheWriting = CacheCoordinator.shared,
        sleeper: Sleeping = SystemSleeper.shared,
        toast: ToastSurfacing = ToastManager.shared,
        haptics: HapticSurfacing = HapticBridge.shared
    ) {
        self.authManager = authManager
        self.offlineQueue = offlineQueue
        self.attachmentUploader = attachmentUploader
        self.profileCache = profileCache
        self.sleeper = sleeper
        self.toast = toast
        self.haptics = haptics
        let user = authManager.currentUser
        self.displayName = user?.displayName ?? user?.username ?? ""
        self.bio = user?.bio ?? ""
    }

    // MARK: - Computed

    var hasChanges: Bool {
        let user = authManager.currentUser
        let nameChanged = displayName != (user?.displayName ?? user?.username ?? "")
        let bioChanged = bio != (user?.bio ?? "")
        let avatarChanged = selectedImageData != nil
        return nameChanged || bioChanged || avatarChanged
    }

    var isSaving: Bool {
        switch saveState {
        case .uploadingAvatar, .enqueueing: return true
        default: return false
        }
    }

    var isUploadingAvatar: Bool { saveState == .uploadingAvatar }
    var bioMaxLength: Int { 300 }
}
