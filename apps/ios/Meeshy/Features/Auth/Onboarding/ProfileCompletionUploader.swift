import Foundation
import UIKit
import MeeshySDK

/// Résultat de l'envoi des assets de profil choisis pendant l'inscription.
struct ProfileCompletionUploadOutcome: Sendable, Equatable {
    var avatarUploaded = false
    var bannerUploaded = false
    var bioSaved = false
}

protocol ProfileCompletionUploading: Sendable {
    /// Best-effort : envoie avatar, bannière et bio après la création du compte.
    /// Chaque asset échoue indépendamment sans bloquer les autres — l'inscription
    /// est déjà réussie, l'utilisateur pourra compléter depuis son profil.
    func uploadPostRegistrationAssets(
        profileImageData: Data?,
        bannerImageData: Data?,
        bio: String
    ) async -> ProfileCompletionUploadOutcome
}

final class ProfileCompletionUploader: ProfileCompletionUploading {
    static let shared = ProfileCompletionUploader()

    private let attachmentUploader: AttachmentUploading
    private let userService: UserServiceProviding
    private let bannerMaxSizeKB: Int

    init(
        attachmentUploader: AttachmentUploading = AttachmentUploader.shared,
        userService: UserServiceProviding = UserService.shared,
        bannerMaxSizeKB: Int = 800
    ) {
        self.attachmentUploader = attachmentUploader
        self.userService = userService
        self.bannerMaxSizeKB = bannerMaxSizeKB
    }

    func uploadPostRegistrationAssets(
        profileImageData: Data?,
        bannerImageData: Data?,
        bio: String
    ) async -> ProfileCompletionUploadOutcome {
        var outcome = ProfileCompletionUploadOutcome()
        var latestUser: MeeshyUser?

        if let profileImageData {
            do {
                let avatarURL = try await attachmentUploader.uploadAvatar(profileImageData)
                latestUser = try await userService.updateAvatar(url: avatarURL.absoluteString)
                outcome.avatarUploaded = true
            } catch {
                // Best-effort : l'avatar reste éditable depuis le profil.
            }
        }

        if let bannerImageData {
            do {
                let compressed = AttachmentUploader.compress(bannerImageData, maxSizeKB: bannerMaxSizeKB)
                let bannerURL = try await userService.uploadImage(compressed, filename: "banner.jpg")
                latestUser = try await userService.updateBanner(url: bannerURL)
                outcome.bannerUploaded = true
            } catch {
            }
        }

        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedBio.isEmpty {
            do {
                latestUser = try await userService.updateProfile(UpdateProfileRequest(bio: trimmedBio))
                outcome.bioSaved = true
            } catch {
            }
        }

        if let user = latestUser {
            await MainActor.run { AuthManager.shared.currentUser = user }
        }

        return outcome
    }
}
