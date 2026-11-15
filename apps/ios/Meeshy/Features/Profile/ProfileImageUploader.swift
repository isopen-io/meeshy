import UIKit
import MeeshySDK
import MeeshyUI

/// L'image de profil que l'on pose : la photo ronde ou la bannière.
enum ProfileImageSlot: Sendable, Hashable {
    case avatar
    case banner

    var maxSizeKB: Int {
        switch self {
        case .avatar: return 500
        case .banner: return 800
        }
    }

    var filename: String {
        switch self {
        case .avatar: return "avatar.jpg"
        case .banner: return "banner.jpg"
        }
    }
}

/// LE chemin d'une image de profil vers la passerelle — compression, envoi,
/// puis écriture sur le compte — partagé par l'écran Profil et la carte
/// « Montre-toi » de l'onboarding (#17236) : deux uploaders divergeraient
/// (taille, nom de fichier, route) sans qu'aucun témoin ne rougisse.
/// Rend l'utilisateur SERVI ; la fusion sur l'utilisateur courant reste à
/// l'appelant (`mergingServerUser`), qui seul connaît l'état local.
protocol ProfileImageUploading: Sendable {
    func upload(_ image: UIImage, as slot: ProfileImageSlot) async throws -> MeeshyUser
}

struct ProfileImageUploader: ProfileImageUploading {
    private let users: any UserServiceProviding

    init(users: any UserServiceProviding = UserService.shared) {
        self.users = users
    }

    func upload(_ image: UIImage, as slot: ProfileImageSlot) async throws -> MeeshyUser {
        let compressed = await ImageCompressor.compressOffMain(image, maxSizeKB: slot.maxSizeKB)
        let uploadedURL = try await users.uploadImage(compressed, filename: slot.filename)
        switch slot {
        case .avatar: return try await users.updateAvatar(url: uploadedURL)
        case .banner: return try await users.updateBanner(url: uploadedURL)
        }
    }
}
