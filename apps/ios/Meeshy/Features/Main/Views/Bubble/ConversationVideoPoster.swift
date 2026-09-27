import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le visage d'une vidéo dans le fil : une image fixe, jamais un lecteur**
/// (#8231, directive porteur 2026-09-27 : « Supprime la lecture de vidéo
/// inline ! Au touché d'une vidéo/scène reçue, ouvrir en plein écran
/// DIRECTEMENT ! »).
///
/// Monté par les trois cellules vidéo du fil — tuile de grille et page de
/// carrousel des Bulles, tuile du mode Focal (que Script monte aussi). Aucun
/// `AVPlayer` n'est créé : l'image vient de `MeeshyVideoThumbnail` (SDK), qui
/// sert la vignette du serveur, sinon la première image extraite par un `GET`
/// partiel et persistée, et fait patienter sur le thumbHash.
///
/// **Le poster ne capte AUCUN toucher** (`.allowsHitTesting(false)`) : le geste
/// appartient à la cellule, qui ouvre le plein écran — la galerie lance la
/// lecture. Le badge play est DÉCORATIF ; en faire un bouton rouvrirait le
/// double déclenchement que ce lot retire (le bouton du lecteur inline jouait
/// dans la bulle pendant que le toucher de la tuile ouvrait la galerie).
struct ConversationVideoPoster: View {
    let attachment: MessageAttachment
    let accentHex: String
    /// Diamètre extérieur du badge play : 48 pour une vidéo seule, 36 en grille.
    var playBadgeDiameter: CGFloat = 36
    /// `true` dans une page de carrousel plus haute que la vidéo : l'image garde
    /// son rapport naturel, centrée, au lieu de remplir la page en la rognant.
    var keepsNaturalRatio: Bool = false

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

    @ViewBuilder
    private var poster: some View {
        let thumbnail = MeeshyVideoThumbnail(
            attachment: attachment,
            accentColor: accentHex,
            showPlayBadge: false,
            showDurationBadge: false
        )
        if keepsNaturalRatio {
            thumbnail
                .aspectRatio(attachment.videoAspectRatio ?? (16.0 / 9.0), contentMode: .fit)
                .clipped()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            thumbnail
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
        }
    }

    private var playBadge: some View {
        let inner = playBadgeDiameter - 6
        return ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: playBadgeDiameter, height: playBadgeDiameter)
            Circle()
                .fill(Color(hex: accentHex).opacity(0.85))
                .frame(width: inner, height: inner)
            Image(systemName: "play.fill")
                // Doctrine 86i : glyphe play dans un cercle de dimension fixe →
                // taille figée, proportionnée au cercle (ne doit pas déborder).
                .font(.system(size: playBadgeDiameter * 0.375, weight: .bold))
                .foregroundColor(.white)
                .offset(x: playBadgeDiameter / 24)
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
                        .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
                .padding(.trailing, 4)
                .padding(.bottom, 4)
            }
        }
    }
}
