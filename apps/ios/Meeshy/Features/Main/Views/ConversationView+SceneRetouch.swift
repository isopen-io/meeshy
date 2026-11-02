import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ce que la scène rend au message** (#8416, #9123, #9124, #9126) — une pièce
// en attente se REMPLACE, une prise ou un média récent se POSE. Sorti de
// `ConversationView+Composer.swift`, qui montait quatre fermetures jumelles.
extension ConversationView {

    /// **Toucher une pièce en attente ouvre la retouche de la caméra** (#11133,
    /// porteur 2026-10-20 : « brancher cette édition sur les images et vidéos
    /// qu'on veut envoyer ») : mêmes outils, même chrome. Rien n'y oblige —
    /// une pièce non touchée part telle quelle. La série de scènes du composer
    /// (#9126) n'est plus une porte de la conversation (décision porteur
    /// 2026-10-20).
    func openPieceRetouch(_ id: String) {
        scrollState.pieceToRetouch = ComposerRetouchSeries.candidates(attachments: composerState.pendingAttachments,
                                                                      files: composerState.pendingMediaFiles)
            .first { $0.attachmentId == id }
    }

    /// Chaque pièce retouchée est remplacée À SA PLACE ; les autres restent
    /// telles quelles — jamais une seconde tuile, jamais un ré-encodage.
    func replacePendingWithRetouchedPieces(_ rendues: [ComposerRetouchedPiece]) {
        Task {
            for rendue in rendues { await replacePendingWithSceneMedia(id: rendue.attachmentId, rendue.media) }
        }
    }

    private func replacePendingWithSceneMedia(id: String, _ media: ComposerReturnedMedia) async {
        switch media {
        case .image(let image):
            // **Écriture SÛRE** (#8524) : l'ancien fichier ne part qu'une fois
            // le nouveau écrit et vérifié ; sinon la pièce d'origine reste
            // celle qui partira.
            guard let ecrit = await ConversationImageRetouche.writeEdited(image) else {
                FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
                return
            }
            guard let idx = composerState.pendingAttachments.firstIndex(where: { $0.id == id }) else {
                try? FileManager.default.removeItem(at: ecrit.url)
                return
            }
            let ancien = composerState.pendingMediaFiles[id]
            // Retouchée, une prise reste une prise : personne ne l'a vue (#9775).
            let captured = composerState.pendingAttachments[idx].capturedInApp
            composerState.pendingThumbnails[id] = image
            composerState.pendingMediaFiles[id] = ecrit.url
            composerState.pendingAttachments[idx] = MessageAttachment(
                id: id, fileName: ecrit.fileName, originalName: ecrit.fileName,
                mimeType: ecrit.mimeType, fileSize: ecrit.byteCount,
                fileUrl: ecrit.url.absoluteString, capturedInApp: captured,
                width: Int(image.size.width * image.scale),
                height: Int(image.size.height * image.scale),
                thumbnailColor: accentColor
            )
            if let ancien, ancien != ecrit.url { try? FileManager.default.removeItem(at: ancien) }
        case .video(let url):
            // La vidéo bakée remplace la pièce (#8443, #9124), par la même
            // règle que l'ancien éditeur vidéo.
            let rendu = VideoEditResult(url: url, didEdit: true, duration: 0, transcriptionText: nil,
                                        captions: [], captionLanguageCode: nil)
            if let staleURL = composerState.applyEditedVideo(attachmentId: id, result: rendu) {
                try? FileManager.default.removeItem(at: staleURL)
            }
        }
    }

    /// Un média de la bande des récents, retouché : il se pose par les mêmes
    /// chemins de préparation qu'un fichier choisi. Il vient de la galerie —
    /// ce n'est PAS une capture.
    func stageSceneMedia(_ media: ComposerReturnedMedia) {
        switch media {
        case .image(let image): handleCameraCapture(image)
        case .video(let url): handleCameraVideo(url)
        }
    }

    /// La prise du viseur de la barre (#9295) : elle se pose comme un média
    /// retouché, et se DÉCLARE capturée dans l'application (#9775) — c'est ce
    /// qui fera demander confirmation avant de la publier au-delà de la
    /// conversation (`PublicationTargetRule.needsCaptureConfirmation`).
    func stageCapture(_ capture: CameraResult) {
        switch capture {
        case .photo(let image, let data): handleCameraCapture(image, data: data, capturedInApp: true)
        case .video(let url): handleCameraVideo(url, capturedInApp: true)
        }
    }
}
