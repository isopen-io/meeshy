import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le bloc auteur / date / format du bas du cadre

// Extrait de `ConversationMediaGalleryView.swift` : le bloc ne lit que la pièce,
// l'info d'expéditeur, le moteur de lecture et le libellé VoiceOver déjà composé
// par la racine. Corps déplacé à l'identique.

struct GalleryMediaMetadataBlock: View {
    let att: MessageAttachment
    let info: ConversationViewModel.MediaSenderInfo?
    /// Une scène n'a ni format, ni dimensions, ni poids (#6709).
    let isScene: Bool
    let videoManager: SharedAVPlayerManager
    let currentAttachmentIsActiveTrack: Bool
    let metadataAccessibilityLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            // Rangée auteur : affichée seulement si l'info est fournie par le call
            // site — sinon on masque (pas d'avatar « ? » vide au-dessus des dimensions).
            if let info {
                // **Les actions ont quitté cette rangée** (#6161) : elles
                // sont une colonne verticale posée à droite du cadre
                // (`cadreActionColumn`). Ce qui reste ici est ce que le
                // porteur a explicitement gardé sous le voile — l'auteur, sa
                // date, la légende, la ligne format / dimensions / poids.
                FullscreenIdentityRow(
                    name: info.senderName,
                    subtitle: info.sentAt.formatted(.dateTime.day().month(.abbreviated).hour().minute())
                ) {
                    MeeshyAvatar(
                        name: info.senderName,
                        context: .messageBubble,
                        accentColor: info.senderColor,
                        avatarURL: info.senderAvatarURL,
                        presenceState: info.isMe ? nil : info.senderUserId.map { PresenceManager.shared.presenceState(for: $0) },
                        ring: info.senderRing
                    )
                }
            }
            // **Une scène n'a ni format, ni dimensions, ni poids** (#6709) : sa
            // pièce est synthétique, et la ligne n'y montrerait qu'un glyphe
            // « photo » qui ment sur ce qu'on regarde. L'auteur et sa date restent.
            if !isScene {
                // **`largeur × hauteur · poids · durée`** (#9577) — les
                // segments et leur point médian viennent de `MediaInfoLine` ;
                // la durée est la feuille qui observe le moteur : temps restant
                // pendant la lecture, durée totale à l'arrêt.
                HStack(spacing: MeeshySpacing.xs) {
                    // Glyphe de type média décoratif (apparié aux dimensions) —
                    // scale avec le texte mais masqué de VoiceOver.
                    Image(systemName: att.type == .video ? "video.fill" : "photo")
                        .accessibilityHidden(true)
                        .padding(.trailing, MeeshySpacing.xs)
                    let segments = MediaInfoLine.segments(
                        width: att.width, height: att.height,
                        fileSizeLabel: att.fileSize > 0 ? att.fileSizeFormatted : nil,
                        hasDuration: MediaGalleryStage.carriesDuration([att]))
                    ForEach(Array(segments.enumerated()), id: \.offset) { index, segment in
                        if index > 0 { Text(MediaInfoLine.separatorGlyph) }
                        switch segment {
                        case .dimensions(let texte), .fileSize(let texte):
                            Text(texte)
                        case .duration:
                            MediaPlaybackDurationText(
                                manager: videoManager,
                                declaredSeconds: Double(att.duration ?? 0) / 1000,
                                followsEngine: currentAttachmentIsActiveTrack)
                        }
                    }
                    Spacer()
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium, design: .monospaced))
                .foregroundColor(MeeshyColors.mediaChromeTertiary)
                // Regroupe dimensions + poids en un seul arrêt VoiceOver et
                // remplace le « × » (lu « multiplication ») par un « par » localisé.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(metadataAccessibilityLabel)
                .accessibilityHidden(metadataAccessibilityLabel.isEmpty)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.sm)
    }
}
