import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationMediaGalleryView.swift` (#16901), corps déplacés à l'identique : changement de page, fermeture, préchauffage.
extension ConversationMediaGalleryView {
    func handlePageChange(from oldID: String?, to newID: String?) {
        guard let newID, let newIndex = indexByID[newID] else { return }

        // **Le repli se REMET à chaque média.** Feuilleter présente une
        // AUTRE légende ; la garder dépliée ouvrirait en grand un texte que
        // personne n'a demandé à lire, par-dessus le média qu'on vient
        // d'atteindre. C'est l'inverse du volet de description du composer, qui
        // est une préférence d'écran parce qu'il commente TOUTE la publication.
        if oldID != newID, captionExpanded { captionExpanded = false }

        // **La rangée d'émojis appartient à la pièce qu'on REGARDAIT** (#6084,
        // révision porteur). La laisser ouverte la ferait surgir sur un média que
        // personne n'a demandé à commenter, et un émoji tapé par réflexe
        // atterrirait sur la mauvaise pièce — le pire des deux, parce qu'il
        // aurait l'air d'avoir marché. Même contrat que le repli de légende juste
        // au-dessus, et pour la même raison.
        if oldID != newID, reactionBarOpen { reactionBarOpen = false }

        // **Une scène atteinte au glissement se LIT** : la commande se
        // relève à chaque page, comme une vidéo active part d'elle-même
        // (`GalleryVideoPage`). La pause posée sur la scène précédente ne suit pas
        // le lecteur sur la suivante.
        if oldID != newID, !scenePlaying { scenePlaying = true }

        if let oldID, oldID != newID, let oldIndex = indexByID[oldID] {
            let oldAtt = allAttachments[oldIndex]
            if oldAtt.type == .video && videoManager.activeURL == oldAtt.fileUrl {
                // BUG B (round 4) — `release(urlString:)` (URL-gated) clears
                // `activeURL` so the underlying conversation bubble's footer
                // reappears once the gallery closes. Bare `pause()` left
                // `activeURL` set → `hasPlayingInlineVideo` stayed true.
                videoManager.release(urlString: oldAtt.fileUrl)
            }
        }

        if oldID != newID { trackImageOpen(leaving: oldID, entering: newID) }

        prefetchNeighbors(around: newIndex)
    }

    func dismissGallery() {
        stopActiveVideoAudio()
        dismiss()
    }

    /// Stops the gallery's video audio when the gallery is dismissed via a path
    /// that is NOT the swipe-down-to-PIP gesture (X button, image vertical
    /// dismiss). `SharedAVPlayerManager` is process-wide, so without this the
    /// AVPlayer keeps emitting audio with no visible player after the gallery is
    /// gone. The PIP swipe path deliberately calls `startPip()` instead and must
    /// never reach here — keeping the player alive for picture-in-picture.
    func stopActiveVideoAudio() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        guard att.type == .video, videoManager.activeURL == att.fileUrl else { return }
        // BUG B (round 4) — `release(urlString:)` (URL-gated, safe no-op if
        // another bubble took over) clears `activeURL` so the conversation
        // bubble's footer (timestamp/delivery) reappears after the gallery
        // closes via X-close or image vertical-dismiss. Bare `pause()` left
        // `activeURL` set, keeping `hasPlayingInlineVideo` true and the footer
        // hidden until re-mount. The swipe-down PIP path is unaffected: it
        // calls `startPip()` and never reaches here.
        videoManager.release(urlString: att.fileUrl)
    }

    func cacheAttachment(_ attachment: MessageAttachment?) {
        guard let attachment else { return }
        GalleryPrewarm.warm(attachment)
    }

    /// Préchauffe STRICTEMENT la fenêtre de rendu. L'ancienne valeur (±2)
    /// décodait cinq images plein format par page traversée alors que trois
    /// seulement peuvent s'afficher. Règle et bornes : `GalleryRenderWindow`.
    func prefetchNeighbors(around index: Int) {
        guard let range = GalleryRenderWindow.prefetchRange(around: index, count: allAttachments.count)
        else { return }
        range.forEach { cacheAttachment(allAttachments[$0]) }
    }
}
