import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le visage d'une vidéo du fil qui ne se LIT PAS dans sa tuile** (#8231) :
/// la tuile de débordement (« +N », dont le toucher ouvre le carrousel) et la
/// vidéo protégée (vue unique, flou), dont le toucher suit son chemin de
/// révélation. Partout ailleurs, la vidéo se lit inline à trois contrôles.
///
/// Aucun `AVPlayer` n'est créé : l'image vient de `MeeshyVideoThumbnail`
/// (SDK), qui sert la vignette du serveur, sinon la première image extraite
/// par un `GET` partiel et persistée, et fait patienter sur le thumbHash.
///
/// **Le poster ne capte AUCUN toucher** (`.allowsHitTesting(false)`) : le geste
/// appartient à la cellule. Le badge play est DÉCORATIF ; en faire un bouton
/// donnerait deux déclencheurs à un seul toucher.
struct ConversationVideoPoster: View {
    let attachment: MessageAttachment
    let accentHex: String
    /// Diamètre extérieur du badge play : 64 pour une vidéo seule, 44 en grille
    /// — les cotes du bouton du lecteur inline de la tuile, que la loi de la
    /// Lentille (web, `curve-media-grid.mjs`) relit sur la grille.
    var playButtonDiameter: CGFloat = 44

    var body: some View {
        ZStack {
            poster
            playBadge
            durationBadge
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MediaKindLabel.attachmentLabel(for: attachment))
        .accessibilityValue(attachment.durationFormatted ?? "")
    }

    private var poster: some View {
        MeeshyVideoThumbnail(
            attachment: attachment,
            accentColor: accentHex,
            showPlayBadge: false,
            showDurationBadge: false
        )
        .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        .clipped()
    }

    private var playBadge: some View {
        let inner = playButtonDiameter - 6
        return ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: playButtonDiameter, height: playButtonDiameter)
            Circle()
                .fill(Color(hex: accentHex).opacity(0.85))
                .frame(width: inner, height: inner)
            // Doctrine 86i : le glyphe vit dans un cercle de dimension fixe — il
            // se dimensionne par ce cercle, pas par une police qui scalerait.
            Image(systemName: "play.fill")
                .resizable()
                .scaledToFit()
                .frame(width: playButtonDiameter * 0.3, height: playButtonDiameter * 0.3)
                .foregroundColor(.white)
                .offset(x: playButtonDiameter / 24)
        }
        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
    }

    @ViewBuilder
    private var durationBadge: some View {
        if let formatted = attachment.durationFormatted {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Text(formatted)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, MeeshySpacing.xxs)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
                .padding(.trailing, MeeshySpacing.xs)
                .padding(.bottom, MeeshySpacing.xs)
            }
        }
    }
}
