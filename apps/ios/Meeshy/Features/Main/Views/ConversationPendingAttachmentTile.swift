import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La tuile d'une pièce en attente, dans la conversation

/// La tuile d'une pièce en attente du composeur de conversation : la tuile du
/// produit (`ComposerAttachmentTile`, #9736), son menu d'appui long, et pour un
/// vocal sa commande de lecture (#7171). Elle reçoit des valeurs et des
/// fermetures ; la racine de conversation ne porte plus que ce qu'elle seule
/// sait (son plateau, ses gestes).
struct ConversationPendingAttachmentTile: View {
    let attachment: MessageAttachment
    let thumbnail: UIImage?
    let fileURL: URL?
    /// Le lecteur du composeur, POSSÉDÉ par la racine : cette tuile le remet
    /// aux deux seules vues qui l'observent, l'onde et la commande (#6226).
    let player: AudioPlaybackManager
    let onTap: () -> Void
    let onRemove: () -> Void
    let onToggleAudio: () -> Void

    private var label: String { MediaKindLabel.attachmentLabel(for: attachment) }
    private var isAudio: Bool { attachment.type == .audio }

    private var removeLabel: String {
        String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(label)", bundle: .main)
    }

    var body: some View {
        ComposerAttachmentTile(
            thumbnail: thumbnail,
            art: art,
            tint: attachment.thumbnailColor,
            typeGlyph: attachment.type.composerGlyph,
            centerGlyph: isAudio ? nil : ComposerPendingTileGlyph.center(for: attachment.type, mimeType: attachment.mimeType),
            label: label,
            tapAccessibilityLabel: tapAccessibilityLabel,
            removeAccessibilityLabel: removeLabel,
            onTap: onTap,
            onRemove: onRemove
        ) {
            if isAudio {
                PendingAudioPlayControl(attachmentId: attachment.id, player: player, onToggle: onToggleAudio)
            }
        }
        // Appui long → aperçu plein cadre (image agrandie, vidéo en lecture),
        // le même motif que la bande des médias récents. Le fichier est déjà
        // sur l'appareil : aucune résolution PHAsset.
        .contextMenu {
            Button(role: .destructive, action: onRemove) {
                Label(removeLabel, systemImage: "trash")
            }
        } preview: {
            if attachment.type == .image || attachment.type == .video {
                AttachmentQuickLookPreview(
                    kind: attachment.type == .video ? .video : .image,
                    fileURL: fileURL,
                    thumbnail: thumbnail
                )
            }
        }
    }

    /// Le dessin d'une pièce sans vignette : l'onde d'un son (qui suit le
    /// lecteur du composeur), l'épingle d'un lieu.
    private var art: AnyView? {
        switch attachment.type {
        case .audio: return AnyView(PendingAudioTile(attachment: attachment, player: player))
        case .location: return AnyView(ComposerLocationTileArt())
        default: return nil
        }
    }

    /// « Éditer » quand toucher édite (le vocal l'édite toujours, sa commande
    /// de lecture ayant pris la place du crayon), « Aperçu » sinon.
    private var tapAccessibilityLabel: String {
        guard ComposerPendingTileGlyph.center(for: attachment.type, mimeType: attachment.mimeType) != nil else {
            return String(localized: "conversation.composer.attachment.preview", defaultValue: "Aperçu \(label)", bundle: .main)
        }
        return String(localized: "conversation.composer.attachment.edit", defaultValue: "Éditer \(label)", bundle: .main)
    }
}

// MARK: - Tuile d'un audio en attente

/// Seul abonné du lecteur du composeur avec sa commande : cette tuile DESSINE
/// « lecture » ou « pause », elle a donc besoin de se re-rendre à chaque
/// bascule. La racine, elle, POSSÈDE le lecteur sans l'observer — il publie sa
/// progression toutes les 100 ms, et des milliers de lignes n'ont pas à se
/// réévaluer pour une onde (#6226).
///
/// Même dispositif que `ComposerAudioHost` pour le vumètre, et que
/// `ComposerTextHost` pour le texte (#4105) : la racine possède, l'hôte
/// observe.
struct PendingAudioTile: View {
    let attachment: MessageAttachment
    @ObservedObject var player: AudioPlaybackManager

    var body: some View {
        ComposerAudioTileArt(
            tint: attachment.thumbnailColor,
            isPlaying: player.isPlaying && player.attachmentId == attachment.id
        )
    }
}

/// La commande de lecture d'un vocal en attente (#7171) : le bouton rond du
/// kit (K02), posé sur la tuile en sœur du toucher qui édite. Second
/// observateur du lecteur avec la tuile — il dessine « lecture » ou « pause »
/// pour CE vocal, et bascule en tenue active tant qu'il joue.
struct PendingAudioPlayControl: View {
    let attachmentId: String
    @ObservedObject var player: AudioPlaybackManager
    let onToggle: () -> Void

    private var isPlayingThis: Bool {
        player.isPlaying && player.attachmentId == attachmentId
    }

    var body: some View {
        MeeshyGlassButton(
            systemImage: isPlayingThis ? "pause.fill" : "play.fill",
            label: isPlayingThis
                ? String(localized: "conversation.composer.audio.pause", defaultValue: "Mettre le vocal en pause", bundle: .main)
                : String(localized: "conversation.composer.audio.play", defaultValue: "Lire le vocal", bundle: .main),
            size: .s36,
            activation: .toggle(isPlayingThis),
            tone: .deep,
            action: onToggle
        )
    }
}
