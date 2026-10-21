import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que la conversation présente ou ouvre en édition
//
// Enveloppes `Identifiable` des présentations de `ConversationView`, extraites
// de `ConversationView.swift` (cohésion) sans changer de forme.

/// Lot 3.2 — enveloppe `Identifiable` d'une URL de fichier pour la
/// `ShareSheet` de la rangée plate (même patron que `BubbleFullscreenPlace`).
struct FocalShareFileItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
    /// La pièce citée que le lecteur commun JOUE (vidéo ou son), reconstruite
    /// depuis la citation. `nil` pour une image, ouverte par son adresse.
    var attachment: MessageAttachment? = nil
    /// La lecture se rapporte-t-elle au serveur ? Seule une vidéo ancrée le
    /// peut (`ReplyReference.quotedPlaybackReportsConsumption`).
    var reportsConsumption: Bool = false
}

/// **L'aperçu plein écran d'une vidéo ou d'un son cité par la réponse en cours
/// de composition** (#9890) — le lecteur COMMUN, pas un lecteur nu.
///
/// Il remplace `VideoFullscreenPlayer` (`AVPlayer(url:)`, débit posé avant le
/// montage, aucune session audio), qui jouait de surcroît la VIGNETTE de la
/// citation. Même montage que le plein écran d'une bulle : la disponibilité
/// passe par `VideoAvailabilityResolver` (le moteur partagé ne lit que le cache
/// vidéo), et le jeu de contrôles n'offre aucune sortie — ni enregistrer, ni
/// partager (`.fullscreenPreview`).
struct ComposerQuotedPlaybackFullscreen: View {
    let media: PreviewMedia
    let accentColor: String
    let onClose: () -> Void

    var body: some View {
        if let attachment = media.attachment {
            VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .fullscreen,
                    controls: .fullscreenPreview,
                    accentColor: accentColor,
                    frame: .flat,
                    availability: availability,
                    performance: .fullscreen,
                    reportsConsumption: media.reportsConsumption,
                    poster: media.type == "video" ? VideoPosterResolver.poster(for: attachment) : nil,
                    onDownload: onDownload,
                    onClose: onClose
                )
            }
        } else {
            Color.black.onAppear(perform: onClose)
        }
    }
}

/// A pending audio attachment opened for editing — carries the attachment id
/// so the editor can replace that exact tray chip on confirm (never append).
struct PendingAudioEdit: Identifiable, Equatable {
    /// The id of the `MessageAttachment` being edited.
    let id: String
    let url: URL
}
