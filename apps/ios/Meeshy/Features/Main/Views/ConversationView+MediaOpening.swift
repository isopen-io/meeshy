import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ouvrir un média de la conversation en plein écran

/// **Le toucher d'un média et la citation d'un média de la Rivière ouvrent le
/// MÊME plein écran** (#8283).
///
/// Le corps de `onMediaTap` vivait en ligne dans `ConversationView.body`, hors
/// budget de taille : la Rivière ne pouvait ni l'appeler ni l'y rejoindre sans
/// l'allonger. Il en sort ici, et `ConversationView.swift` y perd des lignes au
/// lieu d'en gagner.
extension ConversationView {

    /// Le plein écran d'un média de la conversation — galerie pour l'image et
    /// la vidéo, plein écran audio pour un vocal (`ConversationMediaGalleryLayer`,
    /// qui route selon le genre).
    func presentMediaFullscreen(_ attachment: MessageAttachment) {
        // #8009 — le relâcher d'un appui long n'ouvre rien : son menu est déjà là.
        guard !overlayState.showOverlayMenu else { return }
        // Préchauffe ce que le plein écran AFFICHE (variante élue, poster net).
        GalleryPrewarm.warm(attachment)
        // #7499 — une vue unique s'OUVRE au toucher et se consomme à la
        // FERMETURE. On arme ici, la galerie consomme en se refermant
        // (`ConversationView+MediaGallery`). C'est le seul endroit qui voie les
        // deux : la bulle sait qu'on ouvre, elle ne sait pas quand on sort.
        if attachment.isViewOnce {
            scrollState.pendingViewOnceConsumption.arm(attachment.messageId)
        }
        scrollState.galleryStartAttachment = attachment
    }

    /// La zone média d'une citation de la Rivière. La pièce et son verrou sont
    /// ceux du Fil (`QuotedMediaOpening`) ; `false` ⇒ rien d'honnête à ouvrir
    /// (média protégé, document, pièce introuvable), et la Rivière retombe sur
    /// son saut au message cité.
    func openQuotedMediaFromRiver(_ reference: ReplyReference) -> Bool {
        let quoted = viewModel.messages.first { $0.id == reference.messageId }
        guard let attachment = QuotedMediaOpening.attachment(for: reference, quoted: quoted) else { return false }
        presentMediaFullscreen(attachment)
        return true
    }
}
