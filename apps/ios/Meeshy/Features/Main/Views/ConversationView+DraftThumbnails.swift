import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Les vignettes d'un brouillon RESTAURÉ, décodées hors du fil principal**
/// (#7006).
///
/// `UIImage(contentsOfFile:)` décode l'image ENTIÈRE, sur le MainActor, une
/// fois par pièce jointe — et il le faisait dans l'`onAppear` de la
/// conversation, c'est-à-dire pendant la première frame de l'écran. Trois
/// photos de 12 Mpx, ce sont ~140 Mo de bitmaps et plusieurs dizaines de
/// millisecondes arrachées à l'ouverture, pour remplir des tuiles de ~56 pt.
///
/// Le chemin NOMINAL — ajouter une photo — ne fait pas ça :
/// `AttachmentPreparationService.downsampledPreview` décode déjà par ImageIO à
/// 1 024 px. Seule la RESTAURATION décodait en plein. La vignette d'un
/// brouillon repris et celle d'un brouillon frais sont désormais la même image,
/// obtenue par le même chemin.
extension ConversationView {

    /// **1 024 px, la MÊME borne que le chemin nominal — et ce n'est pas un
    /// réglage de confort.** `composerState.pendingThumbnails` alimente aussi
    /// `MeeshyImageEditorView` (`ConversationView+Composer.swift`), dont la
    /// sortie est RÉENREGISTRÉE sur le fichier de la pièce jointe. Une vignette
    /// plus petite ici dégraderait l'image qu'on renvoie après édition : un
    /// brouillon repris s'éditerait moins bien qu'un brouillon frais. Les deux
    /// bornes doivent bouger ensemble ou pas du tout.
    static let draftThumbnailMaxPixelSize: CGFloat = 1024

    /// Régénère les vignettes du tray pour les images d'un brouillon restauré.
    ///
    /// Le décodage descend dans `SOTAImageThumbnail.thumbnailAsync`, qui est
    /// `nonisolated` et passe par une `Task.detached` : appelée depuis le
    /// MainActor, cette fonction n'y fait que les écritures d'état. Les
    /// vignettes sont posées UNE PAR UNE plutôt qu'en un lot final — une photo
    /// prête est une tuile peinte, et attendre la plus lente pour montrer la
    /// plus rapide serait la lenteur qu'on vient de retirer.
    @MainActor
    func restoreDraftThumbnails(
        attachments: [MessageAttachment],
        files: [String: URL]
    ) async {
        for attachment in attachments where attachment.kind == .image {
            guard let url = files[attachment.id] else { continue }
            guard let vignette = await SOTAImageThumbnail.thumbnailAsync(
                from: url,
                maxPixelSize: Self.draftThumbnailMaxPixelSize
            ) else { continue }
            composerState.pendingThumbnails[attachment.id] = vignette
        }
    }
}
