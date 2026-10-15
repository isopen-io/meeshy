import Foundation
import MeeshySDK

/// **Ce qu'un « Enregistrer » dit quand le média est DÉJÀ dans l'album** (#10370).
///
/// Les visionneuses du SDK n'ont pas le gestionnaire de toasts de l'app : elles
/// passent par le pont `meeshy.showToast`, que `FeedbackToastManager` écoute.
/// Le bouton, lui, se lit au registre dès le premier rendu — une coche, jamais
/// une flèche de téléchargement, sur un média déjà enregistré.
enum PhotoAlbumSaveFeedback {

    static var alreadyInAlbumMessage: String {
        String(localized: "media.save.alreadyInPhotos", defaultValue: "Déjà dans la photothèque", bundle: .module)
    }

    static func isInAlbum(attachmentId: String?) -> Bool {
        guard let attachmentId, !attachmentId.isEmpty else { return false }
        return PhotoLibraryManager.shared.isRecordedInAlbum(alias: attachmentId)
    }

    static func announceAlreadyInAlbum() {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"), object: nil,
            userInfo: ["message": alreadyInAlbumMessage, "isSuccess": true])
    }
}
