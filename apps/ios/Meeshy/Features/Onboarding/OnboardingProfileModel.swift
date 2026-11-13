import UIKit
import MeeshySDK
import os

/// Où en est l'envoi d'une image de la carte « Montre-toi » (#17236).
enum OnboardingProfileUploadPhase: Equatable {
    case idle
    case uploading
    case uploaded
    /// L'envoi a échoué : l'image d'avant est revenue, « Réessayer » renvoie
    /// celle qui a échoué.
    case failed
}

/// Une image de profil côté carte : ce qui est AFFICHÉ (l'image choisie, dès
/// le choix — optimiste), ce que le serveur a CONFIRMÉ, et ce qu'un
/// « Réessayer » renverrait.
struct OnboardingProfileImage {
    private(set) var shown: UIImage?
    private(set) var phase: OnboardingProfileUploadPhase = .idle
    fileprivate var confirmed: UIImage?
    fileprivate var retryImage: UIImage?

    var isUploading: Bool { phase == .uploading }

    fileprivate mutating func begin(_ image: UIImage) {
        shown = image
        phase = .uploading
        retryImage = nil
    }

    fileprivate mutating func confirm(_ image: UIImage) {
        confirmed = image
        shown = image
        phase = .uploaded
    }

    fileprivate mutating func rollBack(failed image: UIImage) {
        shown = confirmed
        phase = .failed
        retryImage = image
    }
}

/// La carte « Montre-toi » : choisir un avatar et une bannière, les voir
/// aussitôt, et les envoyer par LE chemin de l'écran Profil
/// (`ProfileImageUploading`). Un échec rend l'image d'avant et garde celle qui
/// a échoué pour « Réessayer » ; il ne bloque jamais le parcours.
final class OnboardingProfileModel: ObservableObject {
    nonisolated deinit {}

    private static let logger = MeeshyLog.logger(.onboarding)

    @Published private(set) var avatar = OnboardingProfileImage()
    @Published private(set) var banner = OnboardingProfileImage()

    private let uploader: any ProfileImageUploading
    private let currentUser: () -> MeeshyUser?
    private let applyUser: (MeeshyUser) -> Void

    init(
        uploader: any ProfileImageUploading,
        currentUser: (() -> MeeshyUser?)? = nil,
        applyUser: @escaping (MeeshyUser) -> Void
    ) {
        self.uploader = uploader
        self.currentUser = currentUser ?? { AuthManager.shared.currentUser }
        self.applyUser = applyUser
    }

    /// Une image confirmée OU en vol : l'utilisateur s'est montré. L'envoi en
    /// cours n'attend pas « Continuer » pour aboutir.
    var hasChosenImage: Bool {
        [avatar, banner].contains { $0.confirmed != nil || $0.isUploading }
    }

    var failedSlots: [ProfileImageSlot] {
        [ProfileImageSlot.avatar, .banner].filter { image(for: $0).phase == .failed }
    }

    func image(for slot: ProfileImageSlot) -> OnboardingProfileImage {
        switch slot {
        case .avatar: return avatar
        case .banner: return banner
        }
    }

    func choose(_ image: UIImage, for slot: ProfileImageSlot) async {
        guard !self.image(for: slot).isUploading else { return }
        update(slot) { $0.begin(image) }
        do {
            let served = try await uploader.upload(image, as: slot)
            applyUser(ProfileView.mergingServerUser(served, onto: currentUser()))
            update(slot) { $0.confirm(image) }
            HapticFeedback.success()
        } catch {
            Self.logger.error("onboarding profile upload failed: \(error.localizedDescription, privacy: .public)")
            update(slot) { $0.rollBack(failed: image) }
            HapticFeedback.error()
        }
    }

    /// « Réessayer » : renvoie chaque image qui a échoué, telle quelle.
    func retryFailed() async {
        for slot in failedSlots {
            guard let image = image(for: slot).retryImage else { continue }
            await choose(image, for: slot)
        }
    }

    private func update(_ slot: ProfileImageSlot, _ change: (inout OnboardingProfileImage) -> Void) {
        switch slot {
        case .avatar: change(&avatar)
        case .banner: change(&banner)
        }
    }
}
