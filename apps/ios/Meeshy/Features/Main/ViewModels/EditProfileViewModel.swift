import Foundation
import SwiftUI
import PhotosUI
import MeeshySDK
#if canImport(UIKit)
import UIKit
#endif

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
    private let toast: FeedbackToastSurfacing
    private let haptics: HapticSurfacing

    // MARK: - Init

    init(
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        attachmentUploader: AttachmentUploading = AttachmentUploader.shared,
        profileCache: ProfileCacheWriting = CacheCoordinator.shared,
        sleeper: Sleeping = SystemSleeper.shared,
        toast: FeedbackToastSurfacing = FeedbackToastManager.shared,
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

    // MARK: - Photo loading

    func loadSelectedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        selectedImageData = data
        if let uiImage = UIImage(data: data) {
            avatarPreviewImage = Image(uiImage: uiImage)
        }
    }

    // MARK: - Save

    func saveProfile(onDismiss: @escaping @MainActor () -> Void) async {
        guard hasChanges, !isSaving else { return }
        errorMessage = nil

        // 1. Avatar upload (online-only, sync before enqueue).
        var uploadedAvatarUrl: String?
        if let imageData = selectedImageData {
            saveState = .uploadingAvatar
            do {
                let url = try await attachmentUploader.uploadAvatar(imageData)
                uploadedAvatarUrl = url.absoluteString
            } catch {
                errorMessage = humanReadable(error)
                toast.showError(errorMessage ?? "")
                haptics.error()
                saveState = .failed
                return
            }
        }

        // 2. Build payload.
        let cmid = ClientMutationId.generate()
        let trimmedName = displayName.trimmingCharacters(in: .whitespaces)
        let trimmedBio = bio.trimmingCharacters(in: .whitespaces)
        // Distinguish "untouched" (nil — omitted from the PATCH body) from
        // "intentionally cleared" (empty string — sent verbatim). The gateway's
        // `bio` schema accepts an empty string; collapsing a genuine clear to
        // nil via `isEmpty ? nil : trimmedBio` silently dropped it from the
        // request AND from the optimistic apply below. Shares its comparison
        // rule with `ProfileView.saveProfile` via `ProfileView.changedOrNil`
        // rather than reimplementing the same semantics twice.
        let payload = UpdateProfilePayload(
            clientMutationId: cmid,
            displayName: trimmedName.isEmpty ? nil : trimmedName,
            bio: ProfileView.changedOrNil(trimmedBio, original: authManager.currentUser?.bio),
            avatarUrl: uploadedAvatarUrl
        )

        // 3. Optimistic apply local (publishes via @Published currentUser).
        let snapshot = authManager.applyLocalProfileChanges(
            displayName: payload.displayName,
            bio: payload.bio,
            avatarUrl: payload.avatarUrl
        )

        // 4. Observer — attached BEFORE enqueue to avoid race where the
        //    OutboxFlusher emits the outcome before the for-await is listed.
        observeOutcome(cmid: cmid, snapshot: snapshot)

        // 5. Enqueue.
        saveState = .enqueueing
        do {
            try await offlineQueue.enqueue(.updateProfile, payload: payload, conversationId: nil)
        } catch {
            authManager.restoreLocalProfileSnapshot(snapshot)
            errorMessage = "Echec de la mise a jour"
            toast.showError(errorMessage ?? "")
            haptics.error()
            saveState = .failed
            return
        }

        // 6. Persist optimistic in cache.
        if let user = authManager.currentUser {
            try? await profileCache.saveProfile(user, for: user.id)
        }

        // 7. UX feedback + dismiss.
        haptics.success()
        toast.showSuccess("Profil mis a jour")
        saveState = .success
        showSuccess = true
        await sleeper.sleep(milliseconds: 1500)
        onDismiss()
    }

    // MARK: - Outcome observer

    /// Subscribes to `OfflineQueue.outcomeStream(for: cmid)` and rolls back
    /// the optimistic mutation when the stream emits `.exhausted`.
    /// `.applied` is a no-op — the optimistic state is already correct.
    /// ⚠️ Le corps du Task ne retient PAS `self` (capture weak, pas de guard) :
    /// hors-ligne le stream peut ne jamais émettre, et une capture forte aurait
    /// retenu un VM dismissé indéfiniment. Même forme que `UserProfileViewModel`.
    private func observeOutcome(cmid: String, snapshot: ProfileSnapshot) {
        let queue = offlineQueue
        Task { @MainActor [weak self] in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    self?.authManager.restoreLocalProfileSnapshot(snapshot)
                    self?.toast.showError("Mise a jour du profil echouee")
                    self?.haptics.error()
                }
            }
        }
    }

    private func humanReadable(_ error: Error) -> String {
        if let e = error as? MeeshyError { return e.errorDescription ?? defaultFailureMessage() }
        if let e = error as? APIError    { return e.errorDescription ?? defaultFailureMessage() }
        return defaultFailureMessage()
    }

    private func defaultFailureMessage() -> String {
        "Echec de la mise a jour"
    }
}
