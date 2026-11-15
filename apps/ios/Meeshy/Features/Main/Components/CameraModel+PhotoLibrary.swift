import Foundation
import MeeshySDK

/// **Ce que la caméra enregistre en galerie, et le refus qui se dit.**
extension CameraModel {

    /// Enregistre une capture dans l'album Meeshy et **rend le refus visible**.
    /// `PhotoLibraryManager` demande `.addOnly` et renvoie `false` sur refus,
    /// mais les trois appels de la caméra jetaient ce booléen : une photo prise
    /// puis jamais retrouvée dans Photos, sans un mot. Le média part de toute
    /// façon dans le composer — l'échec de sauvegarde n'est donc pas bloquant.
    /// Le verdict est RENDU : la capture n'annonce « enregistré » que sur lui (#9351).
    @discardableResult
    nonisolated static func saveToPhotoLibrary(_ save: () async -> Bool) async -> Bool {
        guard await save() == false else { return true }
        await reportPhotoLibraryRefusal()
        return false
    }

    /// Le refus d'enregistrer dans Photos se DIT — et mène aux Réglages quand
    /// l'accès est refusé.
    nonisolated static func reportPhotoLibraryRefusal() async {
        let state = PhotoLibraryManager.shared.authorizationState
        await MainActor.run {
            guard state.needsSettingsRedirect else {
                FeedbackToastManager.shared.showError(
                    String(localized: "camera.save.failed",
                           defaultValue: "Impossible d'enregistrer dans Photos", bundle: .main)
                )
                return
            }
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .photoLibraryAdd)
            ) { MediaPermissionCoordinator.openSettings() }
        }
    }
}
